#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';
import { nowIsoSeconds } from './lib/clock.mjs';
import {
  assertNoGeneratedStalePhaseResidue,
  assertProjectionHasActiveLog,
} from './lib/harness-state-invariants.mjs';

const DEFAULT_RETRIEVAL_BUDGET = 'stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output';
const DEFAULT_VALIDATION_PROFILE = 'workflow_core';
const DEFAULT_PHASE_REPLAY_POLICY = 'preserve assistant phase commentary/final_answer when replaying; never add phase to user items';

function writableTempRoot() {
  const candidates = [
    process.env.CODEX_TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    process.platform === 'win32' ? 'C:\\tmp' : '/tmp',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return process.cwd();
}

function defaultEffortEscalationReason(profile) {
  return ['deep', 'max'].includes(String(profile || '').trim()) ? '' : 'none';
}

function findSection(lines, heading) {
  let start = null;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === heading) {
      start = index;
      for (let probe = index + 1; probe < lines.length; probe += 1) {
        if (lines[probe].startsWith('## ')) {
          end = probe;
          break;
        }
      }
      break;
    }
  }

  return { start, end };
}

function replaceOrAppendSection(lines, heading, bodyLines) {
  const { start, end } = findSection(lines, heading);
  const replacement = [heading, ...bodyLines];
  if (start === null) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }
    return [...nextLines, ...replacement];
  }
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)];
}

function appendToSection(lines, heading, bodyLines) {
  const nextLines = [...lines];
  const { start, end } = findSection(nextLines, heading);
  if (start === null) {
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }
    return [...nextLines, heading, ...bodyLines];
  }
  const prefix = nextLines.slice(0, end);
  const suffix = nextLines.slice(end);
  if (prefix.length > 0 && prefix.at(-1) !== '' && bodyLines[0] !== '') {
    prefix.push('');
  }
  return [...prefix, ...bodyLines, ...suffix];
}

function hasFreshPassedVerification(lines) {
  let verdictPassed = false;
  let runtimePassed = false;
  let freshConfirmed = false;
  for (const line of lines) {
    const stripped = line.trim().toLowerCase();
    if (stripped === '- status: passed' || stripped === '- verdict: done') {
      verdictPassed = true;
    }
    if (stripped === '- verification verdict: passed') {
      runtimePassed = true;
    }
    if (stripped === '- fresh evidence confirmed: yes') {
      freshConfirmed = true;
    }
  }
  return runtimePassed || (verdictPassed && freshConfirmed);
}

function ensureTaskLevelStatus(lines, status) {
  const desiredLine = `- Current task status: ${status}`;
  const { start, end } = findSection(lines, '## Task-Level Status Adapter');
  if (start === null) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }
    return [
      ...nextLines,
      '## Task-Level Status Adapter',
      '- Status: FULL | PARTIAL | NO',
      desiredLine,
      '- Partial threshold: 60',
      '',
      '| Status | Rule |',
      '|--------|------|',
      '| FULL | Target score met, unmet checklist items = 0, blocking defects = 0, and required verification evidence exists |',
      '| PARTIAL | Core build/verification is preserved, but some REQ/SCN/UAT coverage remains incomplete |',
      '| NO | Blocking defect, verification hard gate failure, critical regression, or score below partial threshold |',
    ];
  }

  const nextLines = [...lines];
  let currentStatusIndex = -1;
  let statusLegendIndex = -1;
  for (let index = start + 1; index < end; index += 1) {
    if (nextLines[index].trim().startsWith('- Current task status:')) {
      currentStatusIndex = index;
      break;
    }
    if (nextLines[index].trim().startsWith('- Status:')) {
      statusLegendIndex = index;
    }
  }

  if (currentStatusIndex >= 0) {
    nextLines[currentStatusIndex] = desiredLine;
    return nextLines;
  }

  nextLines.splice(statusLegendIndex >= 0 ? statusLegendIndex + 1 : start + 1, 0, desiredLine);
  return nextLines;
}

function findVerdictArtifactPath(completionArtifacts, qaReportPath) {
  const qaAbsolute = qaReportPath ? path.resolve(qaReportPath) : '';
  for (const rawLine of String(completionArtifacts || '').split(/\r?\n/)) {
    const candidate = rawLine.trim();
    if (!candidate) {
      continue;
    }
    const resolved = path.resolve(candidate);
    if (qaAbsolute && resolved === qaAbsolute) {
      continue;
    }
    if (fs.existsSync(resolved) && path.extname(resolved) === '.json') {
      return resolved;
    }
  }
  return '';
}

function extractWorkflowSection(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = {};
  let inSection = false;
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped === '## Workflow Execution') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (!inSection) {
      continue;
    }
    if (stripped.startsWith('- Selected bundles:')) {
      result.selected = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Applied skills:')) {
      result.applied = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Skipped skills:')) {
      result.skipped = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected harness components:')) {
      result.selectedHarnessComponents = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Skipped harness components:')) {
      result.skippedHarnessComponents = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selection reason:')) {
      result.selectionReason = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Runtime isolation:')) {
      result.runtimeIsolation = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Model effort profile:')) {
      result.modelEffortProfile = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Effort escalation reason:')) {
      result.effortEscalationReason = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected model provider:')) {
      result.selectedModelProvider = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected model:')) {
      result.selectedModel = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected model effort:')) {
      result.selectedModelEffort = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Model selection reason:')) {
      result.modelSelectionReason = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Retrieval budget:')) {
      result.retrievalBudget = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Validation profile:')) {
      result.validationProfile = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Phase replay policy:')) {
      result.phaseReplayPolicy = stripped.split(':', 2)[1]?.trim() ?? '';
    }
  }
  return result;
}

function parseListString(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function extractBulletValue(text, heading, label) {
  const lines = String(text || '').split(/\r?\n/);
  let inSection = false;
  const prefix = `- ${label}:`;
  for (const line of lines) {
    if (line.trim() === heading) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (inSection && line.trim().startsWith(prefix)) {
      return line.trim().split(':', 2)[1]?.trim() ?? '';
    }
  }
  return '';
}

function ensureFinishBundle(lines) {
  const { start, end } = findSection(lines, '## Workflow Execution');
  if (start === null) {
    return lines;
  }

  for (let index = start + 1; index < end; index += 1) {
    if (lines[index].startsWith('- Selected bundles:')) {
      const selected = lines[index].split(':', 2)[1]?.trim() ?? '';
      const bundles = selected.split(',').map((item) => item.trim()).filter(Boolean);
      if (!bundles.includes('finish-bundle')) {
        bundles.push('finish-bundle');
      }
      lines[index] = `- Selected bundles: ${bundles.join(', ')}`;
      return lines;
    }
  }

  lines.splice(
    start + 1,
    0,
    '- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle',
  );
  return lines;
}

function enforceVerdictRules(lines) {
  const { start, end } = findSection(lines, '## Verdict');
  if (start === null) {
    return lines;
  }

  let nextPath = 'retry_loop';
  let closeoutReason = 'verification_failed';
  let nextIndex = -1;
  let closeoutIndex = -1;

  for (let index = start + 1; index < end; index += 1) {
    if (lines[index].startsWith('- Next path:')) {
      nextPath = lines[index].split(':', 2)[1]?.trim().toLowerCase() ?? 'retry_loop';
      nextIndex = index;
    } else if (lines[index].startsWith('- Closeout reason:')) {
      closeoutReason = lines[index].split(':', 2)[1]?.trim().toLowerCase() ?? 'verification_failed';
      closeoutIndex = index;
    }
  }

  const allowedNext = new Set(['clean_finish', 'retry_loop', 'resume_later_handoff']);
  const allowedCloseout = new Set(['scope_complete', 'verification_failed', 'blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification']);

  if (!allowedNext.has(nextPath)) {
    nextPath = 'retry_loop';
  }

  if (nextPath === 'retry_loop') {
    closeoutReason = 'verification_failed';
  } else if (nextPath === 'clean_finish') {
    if (closeoutReason !== 'scope_complete') {
      closeoutReason = 'scope_complete';
    }
  } else if (nextPath === 'resume_later_handoff') {
    if (!new Set(['blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification']).has(closeoutReason)) {
      closeoutReason = 'blocked';
    }
  }

  if (!allowedCloseout.has(closeoutReason)) {
    closeoutReason = 'verification_failed';
  }

  if (nextIndex === -1) {
    lines.splice(start + 1, 0, `- Next path: ${nextPath}`, `- Closeout reason: ${closeoutReason}`);
    return lines;
  }

  lines[nextIndex] = `- Next path: ${nextPath}`;
  if (closeoutIndex === -1) {
    lines.splice(nextIndex + 1, 0, `- Closeout reason: ${closeoutReason}`);
  } else {
    lines[closeoutIndex] = `- Closeout reason: ${closeoutReason}`;
  }

  return lines;
}

function normalizeQaReportWorkflowFields(qaReportPath) {
  if (!fs.existsSync(qaReportPath)) {
    return;
  }

  let lines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
  if (lines.length > 0 && lines.at(-1) === '') {
    lines = lines.slice(0, -1);
  }

  lines = ensureFinishBundle(lines);
  lines = enforceVerdictRules(lines);

  fs.writeFileSync(qaReportPath, `${lines.join('\n')}\n`, 'utf8');
}

function normalizeScorecardCloseoutFields(scorecardPath, { currentScore, targetScore, unmetItems, blockingDefects, verdict, taskStatus }) {
  if (!scorecardPath || !fs.existsSync(scorecardPath)) {
    return;
  }

  let lines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
  if (lines.length > 0 && lines.at(-1) === '') {
    lines = lines.slice(0, -1);
  }

  lines = lines.map((line) => {
    if (line.trim().startsWith('- Current score:')) {
      return `- Current score: ${currentScore}`;
    }
    if (line.trim().startsWith('- Target score:')) {
      return `- Target score: ${targetScore}`;
    }
    if (line.trim().startsWith('- Unmet checklist items:')) {
      return `- Unmet checklist items: ${unmetItems}`;
    }
    if (line.trim().startsWith('- Blocking defects:')) {
      return `- Blocking defects: ${blockingDefects}`;
    }
    if (line.trim().startsWith('- Verdict:')) {
      return `- Verdict: ${verdict}`;
    }
    return line;
  });

  lines = ensureTaskLevelStatus(lines, taskStatus);
  fs.writeFileSync(scorecardPath, `${lines.join('\n')}\n`, 'utf8');
}

function parseStructuredArtifactState(stateInput) {
  if (!stateInput) {
    return {};
  }

  const candidate = String(stateInput).trim();
  if (!candidate) {
    return {};
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
  }

  return JSON.parse(candidate);
}

function normalizeArrayInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return parseListString(value);
}

function normalizeStructuredEvidenceEntries(entries, idKey, defaultStatus, defaultEvidencePath) {
  if (Array.isArray(entries)) {
    return entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: String(entry.id || entry[idKey] || entry.code || '').trim(),
        status: String(entry.status || entry.verdict || defaultStatus || '').trim(),
        evidencePath: String(entry.evidencePath || entry.path || defaultEvidencePath || '').trim(),
      }))
      .filter((entry) => entry.id);
  }
  if (entries && typeof entries === 'object') {
    return Object.entries(entries)
      .map(([id, entry]) => ({
        id: String(id || '').trim(),
        status: String(entry?.status || entry?.verdict || defaultStatus || '').trim(),
        evidencePath: String(entry?.evidencePath || entry?.path || defaultEvidencePath || '').trim(),
      }))
      .filter((entry) => entry.id);
  }
  return [];
}

function structuredEvidenceMetadataFromState(state, { qaReportPath, verdictRelPath, environmentBlockers }) {
  const explicit = state.evidenceMetadata || state.closeoutEvidence || state.structuredEvidence || {};
  const defaultEvidencePath = verdictRelPath || (qaReportPath ? path.relative(process.cwd(), qaReportPath).replace(/\\/g, '/') : '');
  const workset = state.workset || {};
  const acVerdict = String(workset.acVerdict || state.acVerdict || state.runtime?.verdict || '').trim();
  const defaultStatus = acVerdict === 'passed' || acVerdict === 'expected_blocker_passed' ? acVerdict : '';
  const requirementIds = normalizeArrayInput(workset.linkedRequirementIds || state.linkedRequirementIds || []);
  const scenarioIds = normalizeArrayInput(workset.linkedScenarioIds || state.linkedScenarioIds || state.scenarios || []);
  const explicitRequirements = normalizeStructuredEvidenceEntries(explicit.requirements, 'requirementId', defaultStatus, defaultEvidencePath);
  const explicitScenarios = normalizeStructuredEvidenceEntries(explicit.scenarios, 'scenarioId', defaultStatus, defaultEvidencePath);
  const requirements = explicitRequirements.length > 0
    ? explicitRequirements
    : requirementIds.map((id) => ({ id, status: defaultStatus || 'verified', evidencePath: defaultEvidencePath }));
  const scenarios = explicitScenarios.length > 0
    ? explicitScenarios
    : scenarioIds.map((id) => ({ id, status: defaultStatus || 'verified', evidencePath: defaultEvidencePath }));
  const blockers = Array.isArray(explicit.blockers)
    ? explicit.blockers
    : environmentBlockers.map((entry) => ({
      code: entry.code || entry.reason || entry.blockingReasonCode || 'environment_blocker',
      blockerClass: entry.blockerClass || entry.class || 'environment',
      status: entry.status || 'active',
      blocking: entry.blocking !== false,
    }));

  if (requirements.length === 0 && scenarios.length === 0 && blockers.length === 0 && !explicit.schemaVersion) {
    return null;
  }

  return {
    schemaVersion: String(explicit.schemaVersion || 'phase-closeout-evidence-v1'),
    requirements,
    scenarios,
    blockers,
    expectedBlockers: Array.isArray(explicit.expectedBlockers) ? explicit.expectedBlockers : [],
  };
}

function renderStructuredEvidenceMetadataLines(metadata) {
  if (!metadata) {
    return [];
  }
  return [
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
    '',
  ];
}

function updateWorkflowSectionFromState(qaText, lines, workflow = {}) {
  const current = extractWorkflowSection(qaText);
  const next = {
    selected: workflow.selectedBundles ?? current.selected ?? '',
    applied: workflow.appliedSkills ?? current.applied ?? '',
    skipped: workflow.skippedSkills ?? current.skipped ?? '',
    selectedHarnessComponents: workflow.selectedHarnessComponents ?? current.selectedHarnessComponents ?? '',
    skippedHarnessComponents: workflow.skippedHarnessComponents ?? current.skippedHarnessComponents ?? '',
    selectionReason: workflow.selectionReason ?? current.selectionReason ?? '',
    runtimeIsolation: workflow.runtimeIsolation ?? current.runtimeIsolation ?? '',
    modelEffortProfile: workflow.modelEffortProfile ?? current.modelEffortProfile ?? '',
    effortEscalationReason: workflow.effortEscalationReason ?? current.effortEscalationReason ?? '',
    selectedModelProvider: workflow.selectedModelProvider ?? current.selectedModelProvider ?? '',
    selectedModel: workflow.selectedModel ?? current.selectedModel ?? '',
    selectedModelEffort: workflow.selectedModelEffort ?? current.selectedModelEffort ?? '',
    modelSelectionReason: workflow.modelSelectionReason ?? current.modelSelectionReason ?? '',
    retrievalBudget: workflow.retrievalBudget ?? current.retrievalBudget ?? '',
    validationProfile: workflow.validationProfile ?? current.validationProfile ?? '',
    phaseReplayPolicy: workflow.phaseReplayPolicy ?? current.phaseReplayPolicy ?? '',
  };

  return replaceOrAppendSection(lines, '## Workflow Execution', [
    `- Selected bundles: ${next.selected || 'none'}`,
    `- Applied skills: ${next.applied || 'none'}`,
    `- Skipped skills: ${next.skipped || 'none'}`,
    `- Selected harness components: ${next.selectedHarnessComponents || 'none'}`,
    `- Skipped harness components: ${next.skippedHarnessComponents || 'none'}`,
    `- Selection reason: ${next.selectionReason || 'artifact sync'}`,
    `- Runtime isolation: ${next.runtimeIsolation || 'artifact-sync'}`,
    `- Model effort profile: ${next.modelEffortProfile || 'standard'}`,
    `- Effort escalation reason: ${next.effortEscalationReason || defaultEffortEscalationReason(next.modelEffortProfile || 'standard')}`,
    `- Selected model provider: ${next.selectedModelProvider || 'runtime-default'}`,
    `- Selected model: ${next.selectedModel || 'runtime-default'}`,
    `- Selected model effort: ${next.selectedModelEffort || 'runtime-default'}`,
    `- Model selection reason: ${next.modelSelectionReason || 'artifact sync'}`,
    `- Retrieval budget: ${next.retrievalBudget || DEFAULT_RETRIEVAL_BUDGET}`,
    `- Validation profile: ${next.validationProfile || DEFAULT_VALIDATION_PROFILE}`,
    `- Phase replay policy: ${next.phaseReplayPolicy || DEFAULT_PHASE_REPLAY_POLICY}`,
    '',
  ]);
}

function updateObjectiveChecklist(lines, objectives = []) {
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return lines;
  }

  const objectiveMap = new Map();
  for (const objective of objectives) {
    const id = String(objective?.id || objective?.code || '').trim();
    if (!id) {
      continue;
    }
    objectiveMap.set(id, {
      status: String(objective?.status || 'pending').trim() || 'pending',
      evidence: String(objective?.evidence || '').trim(),
      notes: String(objective?.notes || '').trim(),
      weight: String(objective?.weight || '').trim(),
      category: String(objective?.category || '').trim(),
    });
  }

  if (objectiveMap.size === 0) {
    return lines;
  }

  return lines.map((line) => {
    const match = line.match(/^\| (OBJ-[^|]+) \|/);
    if (!match) {
      return line;
    }
    const objective = objectiveMap.get(match[1]);
    if (!objective) {
      return line;
    }
    const parts = line.split('|');
    if (parts.length < 7) {
      return line;
    }
    parts[4] = ` ${objective.status} `;
    if (objective.evidence) {
      parts[5] = ` ${objective.evidence} `;
    }
    if (objective.notes) {
      parts[6] = ` ${objective.notes} `;
    }
    return parts.join('|');
  });
}

function extractTaskScalar(block, key) {
  const pattern = new RegExp(`^ {4}${key}:\\s*(.*)$`);
  for (const line of block) {
    const match = line.match(pattern);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

function renderInlineYamlArray(values) {
  return `[${values.map((value) => yamlQuote(value)).join(', ')}]`;
}

function renderDeterministicAtomicTaskBlock(block, {
  taskStatus,
  runtimeStatus,
  acceptanceCriterionId,
  parentAcceptanceCriterionId,
  linkedRequirementIds,
  acVerdict,
  verificationEvidenceEntries,
  semanticEvaluation,
  changedFiles,
  verificationCommands,
  evidence,
  completedAt,
  timestamp,
}) {
  const id = extractTaskScalar(block, 'id') || 'AT-01';
  const title = extractTaskScalar(block, 'title');
  const nextStatus = taskStatus || (runtimeStatus === 'in_progress' ? 'in_progress' : 'completed');
  const nextCompletedAt = nextStatus === 'completed' || runtimeStatus === 'completed'
    ? (completedAt || timestamp || nowIsoSeconds())
    : completedAt;
  const semanticStatus = semanticEvaluation.status || 'not_run';
  const semanticReason = semanticEvaluation.reason || 'not_applicable_to_current_phase';
  const nextBlock = [`  - id: ${id}`];
  if (title) {
    nextBlock.push(`    title: ${yamlQuote(title)}`);
  }
  nextBlock.push(`    status: ${nextStatus}`);
  nextBlock.push(`    taskStatus: ${yamlQuote(nextStatus)}`);
  if (acceptanceCriterionId) {
    nextBlock.push(`    acceptanceCriterionId: ${yamlQuote(acceptanceCriterionId)}`);
  }
  if (parentAcceptanceCriterionId) {
    nextBlock.push(`    parentAcceptanceCriterionId: ${yamlQuote(parentAcceptanceCriterionId)}`);
  }
  nextBlock.push(`    linkedRequirementIds: ${renderInlineYamlArray(linkedRequirementIds)}`);
  nextBlock.push(`    acVerdict: ${yamlQuote(acVerdict || 'pending')}`);
  nextBlock.push(`    verificationEvidence: ${renderInlineYamlArray(verificationEvidenceEntries)}`);
  nextBlock.push('    semanticEvaluation:');
  nextBlock.push(`      status: ${yamlQuote(semanticStatus)}`);
  nextBlock.push(`      reason: ${yamlQuote(semanticReason)}`);
  nextBlock.push(`    ownedPaths: ${renderInlineYamlArray(changedFiles)}`);
  nextBlock.push(`    verificationCommands: ${renderInlineYamlArray(verificationCommands)}`);
  nextBlock.push(`    evidence: ${renderInlineYamlArray(evidence)}`);
  nextBlock.push(`    completedAt: ${nextCompletedAt ? yamlQuote(nextCompletedAt) : 'null'}`);
  return nextBlock;
}

function updateWorksetsFromStructuredState(worksetsPath, state = {}) {
  if (!worksetsPath || !fs.existsSync(worksetsPath)) {
    return;
  }

  let text = fs.readFileSync(worksetsPath, 'utf8');
  const changedFiles = normalizeArrayInput(state.changedFiles ?? state.workset?.ownedPaths ?? []);
  const verificationCommands = normalizeArrayInput(state.commands ?? state.workset?.verificationCommands ?? []);
  const activeAtomicTask = String(state.activeAtomicTask || state.workset?.activeAtomicTask || '').trim();
  const taskStatus = String(state.workset?.status || state.workset?.taskStatus || '').trim();
  const evidenceEntries = normalizeArrayInput(state.workset?.evidence ?? []);
  const linkedRequirementIds = normalizeArrayInput(state.workset?.linkedRequirementIds ?? []);
  const verificationEvidenceEntries = normalizeArrayInput(state.workset?.verificationEvidence ?? evidenceEntries);
  const acceptanceCriterionId = String(state.workset?.acceptanceCriterionId || state.acceptanceCriterionId || '').trim();
  const parentAcceptanceCriterionId = String(state.workset?.parentAcceptanceCriterionId || state.parentAcceptanceCriterionId || '').trim();
  const runtimeVerdict = String(state.runtime?.verdict || '').trim();
  const derivedAcVerdict = runtimeVerdict === 'passed' || state.verdict === 'passed' ? 'passed' : '';
  const acVerdict = String(state.workset?.acVerdict || state.acVerdict || derivedAcVerdict).trim();
  const semanticEvaluation = state.workset?.semanticEvaluation || state.semanticEvaluation || {};
  const completedAt = state.workset?.completedAt || state.completedAt || '';
  const timestamp = state.timestamp || state.runtime?.timestamp || nowIsoSeconds();
  const logFile = String(state.logFile || state.runtime?.logFile || '').trim();
  const verdictPath = String(state.verdictPath || state.runtime?.verdictPath || '').trim();
  const runtimeStage = String(state.runtime?.stage || state.stage || '').trim();
  const runtimeStatus = String(state.runtime?.status || state.status || '').trim();
  const activePhaseNumber = state.phase?.number || state.phaseNum || state.phaseNumber || '';

  assertNoGeneratedStalePhaseResidue({
    activePhaseNumber,
    fields: {
      'workset.semanticEvaluation.reason': semanticEvaluation.reason || '',
      'workset.evidence': evidenceEntries,
      'workset.verificationEvidence': verificationEvidenceEntries,
    },
  });

  if (activeAtomicTask) {
    text = text.replace(/^activeAtomicTask:\s*.*$/m, `activeAtomicTask: ${activeAtomicTask}`);
  }

  const taskIds = activeAtomicTask ? [activeAtomicTask] : [];
  const lines = text.split(/\r?\n/);
  let taskStart = -1;
  let taskEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('- id:')) {
      const currentId = trimmed.split(':', 2)[1]?.trim() || '';
      if (taskIds.length === 0 || taskIds.includes(currentId)) {
        taskStart = index;
        for (let probe = index + 1; probe < lines.length; probe += 1) {
          const probeTrimmed = lines[probe].trim();
          if (probeTrimmed.startsWith('- id:') || /^[A-Za-z][A-Za-z0-9]*:\s*/.test(lines[probe])) {
            taskEnd = probe;
            break;
          }
        }
        break;
      }
    }
  }

  if (taskStart >= 0) {
    const block = lines.slice(taskStart, taskEnd);
    const evidence = [
      verdictPath ? `Structured verdict: ${path.relative(process.cwd(), verdictPath).replace(/\\/g, '/')}` : '',
      logFile ? `Runner log: ${logFile}` : '',
      runtimeStage ? `Stage: ${runtimeStage}` : '',
      runtimeStatus ? `Status: ${runtimeStatus}` : '',
      ...evidenceEntries,
    ].filter(Boolean);
    const nextBlock = renderDeterministicAtomicTaskBlock(block, {
      taskStatus,
      runtimeStatus,
      acceptanceCriterionId,
      parentAcceptanceCriterionId,
      linkedRequirementIds,
      acVerdict,
      verificationEvidenceEntries,
      semanticEvaluation,
      changedFiles,
      verificationCommands,
      evidence,
      completedAt,
      timestamp,
    });

    lines.splice(taskStart, taskEnd - taskStart, ...nextBlock);
    text = lines.join('\n');
  }

  fs.writeFileSync(worksetsPath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

export function syncPhaseArtifacts(input = {}) {
  const {
  qaReportPath = '',
  scorecardPath = '',
  handoffPath = '',
  worksetsPath = '',
  phaseTitle = '',
  phaseNum = '',
  targetCompletionScore = '100',
  state: nestedState = {},
  ...topLevelState
  } = input;
  const state = Object.keys(nestedState || {}).length > 0 ? nestedState : topLevelState;
  const runtime = state.runtime || {};
  const review = state.review || {};
  const finish = state.finish || {};
  const score = state.score || {};
  const workflow = state.workflow || {};
  const verdictPath = String(state.verdictPath || runtime.verdictPath || '').trim();
  const verdictRelPath = verdictPath ? path.relative(process.cwd(), verdictPath).replace(/\\/g, '/') : '';
  const runtimeStage = String(runtime.stage || state.stage || 'ready/isolate').trim();
  const runtimeStatus = String(runtime.status || state.status || 'in_progress').trim();
  const runtimeName = String(runtime.runtime || state.runtimeName || 'artifact-sync').trim();
  const logFile = String(runtime.logFile || state.logFile || '').trim();
  const detail = String(runtime.detail || state.detail || '').trim();
  const timestamp = String(state.timestamp || runtime.timestamp || nowIsoSeconds()).trim();
  const normalizedRunVerdict = String(state.normalizedRunVerdict || runtime.normalizedRunVerdict || '').trim();
  const environmentBlockers = Array.isArray(state.environmentBlockers)
    ? state.environmentBlockers
    : (Array.isArray(runtime.environmentBlockers) ? runtime.environmentBlockers : []);
  const structuredEvidenceMetadata = structuredEvidenceMetadataFromState(state, {
    qaReportPath,
    verdictRelPath,
    environmentBlockers,
  });

  assertProjectionHasActiveLog({
    logFile,
    finish,
    runtime,
    status: runtimeStatus,
  });
  assertNoGeneratedStalePhaseResidue({
    activePhaseNumber: phaseNum || state.phase?.number || state.phaseNumber || '',
    fields: {
      detail,
      normalizedRunVerdict,
      'finish.summary': finish.summary || '',
      'runtime.detail': runtime.detail || '',
      'runtime.evidenceDepth': runtime.evidenceDepth || '',
    },
  });

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }

    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      `- Status: ${String(finish.status || (finish.nextPath === 'clean_finish' ? 'passed' : 'in_progress')).trim() || 'in_progress'}`,
      `- Summary: ${finish.summary || `${phaseTitle || 'Active phase'} artifact sync updated structured review, finish, and workset state.`}`,
      `- Scope status: ${finish.scopeStatus || (finish.nextPath === 'clean_finish' ? 'complete' : 'partial')}`,
      `- Next path: ${finish.nextPath || (finish.status === 'passed' ? 'clean_finish' : 'retry_loop')}`,
      `- Closeout reason: ${finish.closeoutReason || (finish.nextPath === 'clean_finish' ? 'scope_complete' : 'verification_failed')}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Review Checkpoint', [
      `- Review completed: ${review.completed === false ? 'no' : 'yes'}`,
      `- Review owners: ${review.owners || 'codex-review-code'}`,
      `- Review-driven code changes: ${review.codeChanges || 'structured artifact sync only'}`,
      `- Review closeout detail: ${review.detail || detail || 'structured artifact sync applied'}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Contract Review Evidence', [
      `- Contract reviewed by evaluator: ${review.contractReviewedByEvaluator === false ? 'no' : 'yes'}`,
      `- Verification owner: ${review.verificationOwner || 'completion-verifier'}`,
      `- Runtime evidence plan: ${review.runtimeEvidencePlan || 'structured artifact sync with deterministic writer updates and idempotence rerun'}`,
      `- Round fail conditions: ${review.roundFailConditions || 'stale verification, failed review, failed plan conformance, or missing runtime evidence blocks clean finish'}`,
      `- Contract revision required: ${review.contractRevisionRequired === true ? 'yes' : 'no'}`,
      '',
    ]);

    qaLines = updateWorkflowSectionFromState(fs.readFileSync(qaReportPath, 'utf8'), qaLines, workflow);

    qaLines = replaceOrAppendSection(qaLines, '## Runtime Updates', [
      `- ${timestamp.replace('T', ' ').slice(0, 19)} | Stage: ${runtimeStage} | Status: ${runtimeStatus} | Runtime: ${runtimeName}`,
      logFile ? `- Log: ${logFile}` : '- Log: none',
      detail ? `- Detail: ${detail}` : '- Detail: structured artifact sync',
      verdictRelPath ? `- Verification verdict file: ${verdictRelPath}` : '- Verification verdict file: .claude/verification-verdict-*.json',
      `- Verification verdict: ${String(runtime.verdict || score.verdict || 'pending').trim() || 'pending'}`,
      `- Normalized run verdict: ${normalizedRunVerdict || 'pending'}`,
      `- Environment blockers: ${environmentBlockers.length > 0 ? JSON.stringify(environmentBlockers) : 'none'}`,
      `- Runtime evidence depth: ${runtime.evidenceDepth || 'pending'}`,
      `- Critical scenario smoke-only warnings: ${runtime.smokeWarnings || 'none'}`,
      '',
    ]);

    if (structuredEvidenceMetadata) {
      qaLines = replaceOrAppendSection(
        qaLines,
        '## Structured Evidence Metadata',
        renderStructuredEvidenceMetadataLines(structuredEvidenceMetadata),
      );
    }

    qaLines = replaceOrAppendSection(qaLines, '## Score Summary', [
      `- Current score: ${score.current ?? 0}`,
      `- Target score: ${score.target ?? targetCompletionScore}`,
      `- Unmet checklist items: ${score.unmetItems ?? 0}`,
      `- Blocking defects: ${score.blockingDefects ?? 0}`,
      `- Verdict: ${score.verdict || 'retry'}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      `- Fresh evidence confirmed: ${finish.freshEvidence === false ? 'no' : 'yes'}`,
      `- Why this round may stop now: ${finish.whyStop || (finish.nextPath === 'clean_finish' ? 'clean-finish conditions are satisfied and recorded.' : 'structured artifact sync preserved the active phase state.')}`,
      `- Remaining in-scope work: ${finish.remainingWork || (finish.nextPath === 'clean_finish' ? 'none' : 'continue the active phase from the current structured state.')}`,
      `- Remaining blockers before closeout: ${finish.remainingBlockers || (finish.nextPath === 'clean_finish' ? 'none' : 'verification has not completed yet.')}`,
      `- Checks to rerun if code changes again: ${finish.checksToRerun || 'use the active phase sprint contract'}`,
      '',
    ]);

    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }

    scoreLines = updateObjectiveChecklist(scoreLines, score.objectives || score.objectiveChecklist || []);
    scoreLines = scoreLines.map((line) => {
      if (line.trim().startsWith('- Current score:')) {
        return `- Current score: ${score.current ?? 0}`;
      }
      if (line.trim().startsWith('- Target score:')) {
        return `- Target score: ${score.target ?? targetCompletionScore}`;
      }
      if (line.trim().startsWith('- Unmet checklist items:')) {
        return `- Unmet checklist items: ${score.unmetItems ?? 0}`;
      }
      if (line.trim().startsWith('- Blocking defects:')) {
        return `- Blocking defects: ${score.blockingDefects ?? 0}`;
      }
      if (line.trim().startsWith('- Verdict:')) {
        return `- Verdict: ${score.verdict || 'retry'}`;
      }
      return line;
    });
    scoreLines = ensureTaskLevelStatus(scoreLines, score.taskStatus || (score.verdict === 'done' ? 'FULL' : 'NO'));
    scoreLines = replaceOrAppendSection(scoreLines, '## Progress Checkpoints', [
      `- ${timestamp.replace('T', ' ').slice(0, 19)} | Stage: ${runtimeStage} | Status: ${runtimeStatus}`,
      detail ? `- Detail: ${detail}` : '- Detail: structured artifact sync',
      '',
    ]);

    if (structuredEvidenceMetadata) {
      scoreLines = replaceOrAppendSection(
        scoreLines,
        '## Structured Evidence Metadata',
        renderStructuredEvidenceMetadataLines(structuredEvidenceMetadata),
      );
    }

    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }

  if (handoffPath && fs.existsSync(handoffPath)) {
    const stopReason = String(finish.stopReason || runtime.stopReason || (finish.nextPath === 'clean_finish' ? 'phase_local_closeout_marker' : 'blocked')).trim();
    const normalizedReason = stopReason || 'blocked';
    const phaseDoc = state.phase?.docPath || state.phaseDoc || '';
    const phaseSprintContract = qaReportPath ? path.join(path.dirname(qaReportPath), 'SPRINT_CONTRACT.md') : '';
    const body = `# Phase ${String(phaseNum || state.phase?.number || '').padStart(2, '0')} Handoff

> Generated because the phase stopped without clean completion.

## Goal
- ${phaseTitle || state.phase?.title || ''}
- Current stage: Finish / Handoff

## Status
- Required: ${finish.nextPath === 'clean_finish' ? 'no' : 'pending'}
- Reason: ${finish.nextPath === 'clean_finish'
    ? 'the phase completed cleanly with fresh verification evidence, recorded review state, and no pending resume work.'
    : (finish.detail || detail || 'structured artifact sync recorded by writer')}

## Resume Trigger
- Why this handoff exists: ${finish.nextPath === 'clean_finish' ? 'clean-finish marker only' : 'the current attempt did not reach clean finish'}
- Stop reason: ${normalizedReason}
- Why this cannot continue in the current round: ${finish.nextPath === 'clean_finish'
    ? 'no additional in-scope work remains for this phase; this marker is phase-local and not a plan-level stop reason'
    : 'structured artifact sync recorded the active state; resume only after reviewing the latest blockers, interruption, or deferred verification state.'}
- Condition to resume: ${finish.nextPath === 'clean_finish'
    ? 'reopen only if a new change invalidates the current verification evidence'
    : 'review the latest contract and QA evidence, then continue only the active phase'}

## Checks To Rerun
- Review: ${finish.nextPath === 'clean_finish' ? 'rerun only if code changes again' : 'rerun review for any code changed in the next attempt'}
- Verification: ${finish.nextPath === 'clean_finish' ? 'rerun only if code changes again' : `rerun the required commands recorded in \`${phaseSprintContract}\``}
- Runtime flow: ${finish.nextPath === 'clean_finish' ? 'not required for the current clean finish' : 'rerun the active phase flow only after the blocker above is addressed'}

## Remaining Scope
- Remaining in-scope work: ${finish.nextPath === 'clean_finish' ? 'none' : (finish.remainingWork || 'resolve the current stop reason and finish the active phase with fresh verification evidence')}
- Next planned phase or slice: ${finish.nextPath === 'clean_finish' ? 'none in this handoff file' : `remain on the current phase until the scorecard reaches \`done\``}

## Evidence Paths
- Sprint contract: ${phaseSprintContract}
- QA report: ${qaReportPath}
- Phase doc: ${phaseDoc}
- Scorecard: ${scorecardPath}

## Workflow Logging
- session-logger: ${finish.nextPath === 'clean_finish' ? 'not required for this clean finish' : 'recorded via structured artifact sync'}
- Detail: ${detail || finish.detail || 'none provided'}
`;
    fs.writeFileSync(handoffPath, body, 'utf8');
  }

  if (worksetsPath && fs.existsSync(worksetsPath)) {
    updateWorksetsFromStructuredState(worksetsPath, {
      ...state,
      verdictPath,
      logFile,
      changedFiles: state.changedFiles || state.workset?.ownedPaths || [],
      commands: state.commands || state.workset?.verificationCommands || [],
      workset: {
        ...(state.workset || {}),
        status: state.workset?.status || (finish.nextPath === 'clean_finish' ? 'completed' : 'in_progress'),
        activeAtomicTask: state.workset?.activeAtomicTask || state.activeAtomicTask || '',
      },
      phaseNum,
    });
  }
}

function syncRetryCloseoutArtifacts({
  qaReportPath,
  scorecardPath,
  handoffPath,
  phaseTitle,
  phaseDoc,
  phaseNum,
  targetCompletionScore,
  logFile,
  detail,
}) {
  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }

    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      '- Status: fail',
      `- Summary: ${phaseTitle || 'Active phase'} remains open because closeout verification did not pass.`,
      '- Scope status: partial',
      '- Next path: retry_loop',
      '- Closeout reason: verification_failed',
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Score Summary', [
      '- Current score: 0',
      `- Target score: ${targetCompletionScore}`,
      '- Unmet checklist items: 1',
      '- Blocking defects: 0',
      '- Verdict: retry',
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      '- Fresh evidence confirmed: no',
      '- Why this round may stop now: verification failed and retry is required.',
      '- Remaining in-scope work: resolve the current verification failure and resync the closeout artifacts.',
      '- Remaining blockers before closeout: verification has not completed yet.',
      '- Checks to rerun if code changes again: use the active phase sprint contract.',
      '',
    ]);
    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  normalizeScorecardCloseoutFields(scorecardPath, {
    currentScore: 0,
    targetScore: targetCompletionScore,
    unmetItems: 1,
    blockingDefects: 0,
    verdict: 'retry',
    taskStatus: 'NO',
  });

  if (handoffPath && fs.existsSync(handoffPath)) {
    appendHandoffUpdate({
      reason: 'blocked',
      logFile,
      detail: detail || 'retry-loop closeout synchronization recorded by artifact writer',
      nextPhase: phaseNum,
      phaseTitle: phaseTitle || '',
      phaseSprintContract: qaReportPath ? path.join(path.dirname(qaReportPath), 'SPRINT_CONTRACT.md') : '',
      phaseQaReport: qaReportPath || '',
      phaseDoc: phaseDoc || '',
      phaseScorecard: scorecardPath || '',
      phaseHandoff: handoffPath,
    });
  }
}

function syncCloseoutArtifacts({
  qaReportPath,
  scorecardPath,
  handoffPath,
  phaseTitle,
  phaseDoc,
  phaseNum,
  targetCompletionScore,
  completionArtifacts,
  logFile,
  detail,
}) {
  let nextPath = '';
  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const text = fs.readFileSync(qaReportPath, 'utf8');
    nextPath = String(extractBulletValue(text, '## Verdict', 'Next path') || '').trim().toLowerCase();
  }

  if (nextPath === 'clean_finish') {
    syncCleanFinishArtifacts({
      completionArtifacts,
      qaReportPath,
      scorecardPath,
      phaseTitle,
      targetCompletionScore,
    });
    return;
  }

  if (nextPath === 'retry_loop') {
    syncRetryCloseoutArtifacts({
      qaReportPath,
      scorecardPath,
      handoffPath,
      phaseTitle,
      phaseDoc,
      phaseNum,
      targetCompletionScore,
      logFile,
      detail,
    });
    return;
  }

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    normalizeQaReportWorkflowFields(qaReportPath);
  }
}

function inferPhaseVerdictPath(qaReportPath) {
  const segments = String(qaReportPath || '').split(/[\\/]/).filter(Boolean);
  const phaseDir = [...segments].reverse().find((segment) => /^[0-9]{2}-/.test(segment));
  if (!phaseDir) {
    return '.claude/verification-verdict-phase-final.json';
  }

  const match = phaseDir.match(/^([0-9]{2})-/);
  const phasePrefix = match ? match[1] : 'phase';
  return `.claude/verification-verdict-phase${phasePrefix}-final.json`;
}

function appendQaRuntimeUpdate(status, logFile, detail, workflowLogDir, phaseQaReport, phaseScorecard) {
  const lines = [
    '',
    `### ${nowIsoSeconds().replace('T', ' ').slice(0, 19)}`,
    `- Runtime status: ${status}`,
    `- Log: ${logFile}`,
  ];
  if (detail) {
    lines.push(`- Detail: ${detail}`);
  }
  if (workflowLogDir && fs.existsSync(`${workflowLogDir}/latest-dispatch.json`)) {
    lines.push(`- Workflow evidence: ${workflowLogDir}/latest-dispatch.json`);
  }
  if (phaseScorecard && fs.existsSync(phaseScorecard)) {
    lines.push(`- Scorecard: ${phaseScorecard}`);
  }
  fs.appendFileSync(phaseQaReport, `${lines.join('\n')}\n`, 'utf8');
}

function recordPhaseProgressCheckpoint({
  qaReportPath,
  scorecardPath,
  stage,
  status,
  logFile,
  detail,
  runtimeName,
}) {
  const timestamp = nowIsoSeconds().replace('T', ' ').slice(0, 19);

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }
    const alreadyPassed = hasFreshPassedVerification(qaLines);

    if (!alreadyPassed) {
      qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
        '- Status: in_progress',
        `- Summary: Active phase attempt is running at stage \`${stage}\`; final verification is still pending.`,
        '- Scope status: partial',
        '- Next path: retry_loop',
        '- Closeout reason: verification_failed',
        '',
      ]);
    }

    const runtimeUpdates = [
      `- ${timestamp} | Stage: ${stage} | Status: ${status} | Runtime: ${runtimeName || 'unknown'}`,
    ];
    if (logFile) {
      runtimeUpdates.push(`- Log: ${logFile}`);
    }
    if (detail) {
      runtimeUpdates.push(`- Detail: ${detail}`);
    }
    runtimeUpdates.push(`- Verification verdict file: ${inferPhaseVerdictPath(qaReportPath)}`);
    runtimeUpdates.push(`- Attempt verification status: ${alreadyPassed ? 'preserved-passed' : 'pending'}`, '');
    qaLines = appendToSection(qaLines, '## Runtime Updates', runtimeUpdates);

    if (!alreadyPassed) {
      qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
        '- Fresh evidence confirmed: no',
        `- Why this round may stop now: the phase is still in progress at stage \`${stage}\`.`,
        '- Remaining in-scope work: execute the active phase and record fresh verification evidence.',
        '- Remaining blockers before closeout: verification has not completed yet.',
        '- Checks to rerun if code changes again: use the active phase sprint contract.',
        '',
      ]);
    }

    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }

    const checkpointLines = [`- ${timestamp} | Stage: ${stage} | Status: ${status}`];
    if (detail) {
      checkpointLines.push(`- Detail: ${detail}`);
    }
    checkpointLines.push('');

    scoreLines = scoreLines.map((line) => {
      if (line.trim().startsWith('- Verdict:') && !line.toLowerCase().includes('done')) {
        return '- Verdict: retry';
      }
      return line;
    });

    scoreLines = appendToSection(scoreLines, '## Progress Checkpoints', checkpointLines);
    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }
}

function csvWithToken(value, token) {
  const parts = parseListString(value).filter((item) => item !== token);
  parts.push(token);
  return parts.join(', ');
}

function csvWithoutToken(value, token) {
  const parts = parseListString(value).filter((item) => item !== token && !item.includes(token));
  return parts.length > 0 ? parts.join(', ') : 'none';
}

function ensureWorkflowReviewCloseout(lines) {
  const { start, end } = findSection(lines, '## Workflow Execution');
  if (start === null) {
    return replaceOrAppendSection(lines, '## Workflow Execution', [
      '- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle',
      '- Applied skills: implementation-runner, codex-review-code, completion-verifier',
      '- Skipped skills: none',
      '- Selected harness components: phase-runner, contract, implementation, review, verification, finish',
      '- Skipped harness components: none',
      '- Selection reason: review closeout remediation preserved fresh verification and filled missing review evidence',
      '',
    ]);
  }

  const nextLines = [...lines];
  let sawApplied = false;
  let sawSkipped = false;
  for (let index = start + 1; index < end; index += 1) {
    const stripped = nextLines[index].trim();
    if (stripped.startsWith('- Applied skills:')) {
      sawApplied = true;
      nextLines[index] = `- Applied skills: ${csvWithToken(stripped.split(':', 2)[1]?.trim() ?? '', 'codex-review-code')}`;
    } else if (stripped.startsWith('- Skipped skills:')) {
      sawSkipped = true;
      nextLines[index] = `- Skipped skills: ${csvWithoutToken(stripped.split(':', 2)[1]?.trim() ?? '', 'codex-review-code')}`;
    }
  }
  if (!sawApplied) {
    nextLines.splice(start + 1, 0, '- Applied skills: codex-review-code');
  }
  if (!sawSkipped) {
    const updated = findSection(nextLines, '## Workflow Execution');
    nextLines.splice(updated.start + 2, 0, '- Skipped skills: none');
  }
  return nextLines;
}

function yamlQuote(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function replaceInlineYamlArray(text, key, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return text;
  }
  const body = values.map((value) => `      - ${yamlQuote(value)}`).join('\n');
  const inlinePattern = new RegExp(`^(\\s*)${key}:\\s*\\[\\]\\s*$`, 'm');
  if (inlinePattern.test(text)) {
    return text.replace(inlinePattern, `$1${key}:\n${body}`);
  }
  return text;
}

function replaceOrInsertTaskScalar(text, key, value, insertAfterKey = 'status') {
  const scalarPattern = new RegExp(`^(\\s*)${key}:\\s*.*$`, 'm');
  if (scalarPattern.test(text)) {
    return text.replace(scalarPattern, `$1${key}: ${yamlQuote(value)}`);
  }
  const anchorPattern = new RegExp(`^(\\s*)${insertAfterKey}:\\s*.*$`, 'm');
  if (anchorPattern.test(text)) {
    return text.replace(anchorPattern, `$&\n$1${key}: ${yamlQuote(value)}`);
  }
  return text;
}

function updateWorksetsFromVerdict(worksetsPath, verdictPayload, verdictPath, logFile) {
  if (!worksetsPath || !fs.existsSync(worksetsPath)) {
    return;
  }
  let text = fs.readFileSync(worksetsPath, 'utf8');
  text = text.replace(/status:\s*(in_progress|pending)\b/, 'status: completed');
  text = replaceOrInsertTaskScalar(text, 'taskStatus', 'completed');
  text = replaceOrInsertTaskScalar(text, 'acVerdict', 'passed', 'taskStatus');
  text = text.replace(/completedAt:\s*null\b/, `completedAt: ${yamlQuote(nowIsoSeconds())}`);

  const changedFiles = Array.isArray(verdictPayload.changedFiles) ? verdictPayload.changedFiles : [];
  const commands = Array.isArray(verdictPayload.commands)
    ? verdictPayload.commands.map((entry) => (entry && typeof entry.run === 'string' ? entry.run.trim() : '')).filter(Boolean)
    : [];
  const requiredPassed = verdictPayload.requiredChecks && Array.isArray(verdictPayload.requiredChecks.passed)
    ? verdictPayload.requiredChecks.passed.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  const verificationCommands = commands.length > 0 ? commands : requiredPassed;
  const evidence = [
    verdictPath ? `Structured verdict: ${path.relative(process.cwd(), verdictPath).replace(/\\/g, '/')}` : '',
    logFile ? `Runner log: ${logFile}` : '',
    ...verificationCommands.slice(0, 8).map((command) => `PASS: ${command}`),
  ].filter(Boolean);

  text = replaceInlineYamlArray(text, 'ownedPaths', changedFiles);
  text = replaceInlineYamlArray(text, 'verificationCommands', verificationCommands);
  text = replaceInlineYamlArray(text, 'evidence', evidence);
  text = replaceInlineYamlArray(text, 'verificationEvidence', evidence);
  fs.writeFileSync(worksetsPath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function completeReviewCloseoutFromVerdict({
  completionArtifacts,
  qaReportPath,
  scorecardPath,
  handoffPath,
  phaseTitle,
  targetCompletionScore,
  logFile,
  detail,
}) {
  const verdictPath = findVerdictArtifactPath(completionArtifacts, qaReportPath);
  if (!verdictPath) {
    throw new Error('review closeout remediation requires an existing structured verification verdict artifact');
  }
  let verdictPayload = {};
  try {
    verdictPayload = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
  } catch (error) {
    throw new Error(`unable to read verification verdict artifact: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (String(verdictPayload.verdict || '').trim().toLowerCase() !== 'passed' || verdictPayload.evidenceFresh !== true) {
    throw new Error('review closeout remediation requires fresh passed verification evidence');
  }

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }
    qaLines = ensureWorkflowReviewCloseout(qaLines);
    qaLines = replaceOrAppendSection(qaLines, '## Review Checkpoint', [
      '- Review completed: yes',
      '- Review owners: codex-review-code',
      '- Review-driven code changes: no blocking findings remained in artifact-only review remediation',
      detail ? `- Review closeout detail: ${detail}` : '- Review closeout detail: review evidence was missing while fresh verification had already passed',
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Contract Review Evidence', [
      '- Contract reviewed by evaluator: yes',
      '- Verification owner: completion-verifier',
      '- Runtime evidence plan: preserved fresh structured verification verdict; review closeout was filled without rerunning implementation',
      '- Round fail conditions: stale verification, failed review, failed plan conformance, or missing runtime evidence blocks clean finish',
      '- Contract revision required: no',
      '',
    ]);
    qaLines = appendToSection(qaLines, '## Runtime Updates', [
      '',
      `- ${nowIsoSeconds().replace('T', ' ').slice(0, 19)} | Stage: review | Status: review-closeout-remediated | Runtime: artifact-only`,
      `- Verification verdict file: ${path.relative(process.cwd(), verdictPath).replace(/\\/g, '/')}`,
      '- Verification verdict: passed',
      logFile ? `- Log: ${logFile}` : '',
      detail ? `- Detail: ${detail}` : '',
      '',
    ].filter((line) => line !== ''));
    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (qaReportPath) {
    updateWorksetsFromVerdict(path.join(path.dirname(qaReportPath), 'WORKSETS.yaml'), verdictPayload, verdictPath, logFile);
  }

  if (handoffPath) {
    writeCleanFinishHandoff({
      phaseNum: verdictPayload.phase?.number ?? '',
      phaseTitle: phaseTitle || verdictPayload.phase?.title || '',
      phaseDoc: verdictPayload.phase?.activePhaseDocPath ?? '',
      phaseSprintContract: qaReportPath ? path.join(path.dirname(qaReportPath), 'SPRINT_CONTRACT.md') : '',
      phaseQaReport: qaReportPath,
      phaseHandoff: handoffPath,
    });
  }

  syncCloseoutArtifacts({
    completionArtifacts,
    qaReportPath,
    scorecardPath,
    phaseTitle,
    targetCompletionScore,
    handoffPath,
    phaseDoc: verdictPayload.phase?.activePhaseDocPath ?? '',
    phaseNum: verdictPayload.phase?.number ?? '',
    logFile,
    detail,
  });
}

function syncCleanFinishArtifacts({
  completionArtifacts,
  qaReportPath,
  scorecardPath,
  handoffPath = '',
  phaseTitle,
  targetCompletionScore,
}) {
  const resolvedHandoffPath = handoffPath || (qaReportPath ? path.join(path.dirname(qaReportPath), 'HANDOFF.md') : '');
  const planConformance = evaluatePlanConformance({
    qaReportPath,
    scorecardPath,
    sprintContractPath: qaReportPath ? path.join(path.dirname(qaReportPath), 'SPRINT_CONTRACT.md') : '',
    handoffPath: resolvedHandoffPath,
  });
  if (!planConformance.allowed) {
    syncPlanConformanceFailureArtifacts({
      qaReportPath,
      scorecardPath,
      phaseTitle,
      targetCompletionScore,
      planConformance,
    });
    return;
  }

  const verdictPath = findVerdictArtifactPath(completionArtifacts, qaReportPath);
  let verdictPayload = {};

  if (verdictPath) {
    try {
      verdictPayload = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    } catch {
      verdictPayload = {};
    }
  }

  const score = verdictPayload.score && typeof verdictPayload.score === 'object' ? verdictPayload.score : {};
  const scoreTarget = Number.parseInt(score.target ?? targetCompletionScore, 10) || Number.parseInt(targetCompletionScore, 10) || 100;
  const currentScore = scoreTarget;
  const unmetItems = 0;
  const blockingDefects = 0;
  const scoreVerdict = 'done';
  const commands = Array.isArray(verdictPayload.commands) ? verdictPayload.commands : [];
  const commandRuns = commands
    .map((entry) => (entry && typeof entry.run === 'string' ? entry.run.trim() : ''))
    .filter(Boolean);
  const commandSummary = commandRuns.length > 0
    ? commandRuns.map((run) => `\`${run}\``).join(', ')
    : 'fresh contract-backed verification commands';
  const verdictRelPath = verdictPath ? path.relative(process.cwd(), verdictPath).replace(/\\/g, '/') : '';

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const qaText = fs.readFileSync(qaReportPath, 'utf8');
    let qaLines = qaText.split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }
    const workflowSection = extractWorkflowSection(qaText);
    const appliedSkills = parseListString(workflowSection.applied);
    const reviewApplied = appliedSkills.includes('codex-review-code');
    const reviewDrivenChanges = extractBulletValue(qaText, '## Review Checkpoint', 'Review-driven code changes') || 'none recorded in clean-finish sync';

    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      '- Status: passed',
      `- Summary: ${phaseTitle || 'Active phase'} completed cleanly with fresh verification evidence and final closeout synchronization.`,
      '- Scope status: complete',
      '- Next path: clean_finish',
      '- Closeout reason: scope_complete',
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Review Checkpoint', [
      `- Review completed: ${reviewApplied ? 'yes' : 'no'}`,
      '- Review owners: codex-review-code',
      `- Review-driven code changes: ${reviewDrivenChanges}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Contract Review Evidence', [
      '- Contract reviewed by evaluator: yes',
      '- Verification owner: completion-verifier',
      '- Runtime evidence plan: fresh structured verification verdict plus contract-backed closeout synchronization',
      '- Round fail conditions: stale verification, failed review, failed plan conformance, or missing runtime evidence blocks clean finish',
      '- Contract revision required: no',
      '',
    ]);

    const criteriaSection = findSection(qaLines, '## Criteria Review');
    if (criteriaSection.start !== null) {
      for (let index = criteriaSection.start + 1; index < criteriaSection.end; index += 1) {
        if (qaLines[index].startsWith('|') && /Required verification/i.test(qaLines[index])) {
          qaLines[index] = `| Required verification evidence | passed | ${commandSummary} passed and produced a structured verdict artifact. |`;
        }
      }
    }

    const runtimeSection = findSection(qaLines, '## Runtime Updates');
    if (runtimeSection.start !== null) {
      let sawVerdictFile = false;
      let sawVerdict = false;
      const body = [];
      for (let index = runtimeSection.start + 1; index < runtimeSection.end; index += 1) {
        const line = qaLines[index];
        const stripped = line.trim();
        if (stripped.startsWith('- Verification verdict file:')) {
          body.push(verdictRelPath ? `- Verification verdict file: ${verdictRelPath}` : line);
          sawVerdictFile = true;
        } else if (stripped.startsWith('- Verification verdict:')) {
          body.push('- Verification verdict: passed');
          sawVerdict = true;
        } else {
          body.push(line);
        }
      }
      if (verdictRelPath && !sawVerdictFile) {
        body.push(`- Verification verdict file: ${verdictRelPath}`);
      }
      if (!sawVerdict) {
        body.push('- Verification verdict: passed');
      }
      if (!body.some((line) => line.trim().startsWith('- Runtime evidence depth:'))) {
        body.push('- Runtime evidence depth: open-act-mutate-persist-recover');
      }
      if (!body.some((line) => line.trim().startsWith('- Critical scenario smoke-only warnings:'))) {
        body.push('- Critical scenario smoke-only warnings: none');
      }
      qaLines = [...qaLines.slice(0, runtimeSection.start), '## Runtime Updates', ...body, ...qaLines.slice(runtimeSection.end)];
    } else {
      qaLines = replaceOrAppendSection(qaLines, '## Runtime Updates', [
        verdictRelPath ? `- Verification verdict file: ${verdictRelPath}` : '- Verification verdict file: .claude/verification-verdict-*.json',
        '- Verification verdict: passed',
        '- Runtime evidence depth: open-act-mutate-persist-recover',
        '- Critical scenario smoke-only warnings: none',
        '',
      ]);
    }

    const workflowSectionRange = findSection(qaLines, '## Workflow Execution');
    if (workflowSectionRange.start !== null) {
      const body = [];
      let sawSelectedHarness = false;
      let sawSkippedHarness = false;
      let sawSelectionReason = false;
      let sawRuntimeIsolation = false;
      let sawModelEffortProfile = false;
      let sawEffortEscalationReason = false;
      let sawSelectedModelProvider = false;
      let sawSelectedModel = false;
      let sawSelectedModelEffort = false;
      let sawModelSelectionReason = false;
      let sawRetrievalBudget = false;
      let sawValidationProfile = false;
      let sawPhaseReplayPolicy = false;
      let modelEffortProfile = process.env.PHASE_DISPATCH_EFFORT_PROFILE || process.env.MOONSHOT_EFFORT_PROFILE || 'standard';
      const selectedModelProvider = process.env.PHASE_SELECTED_MODEL_PROVIDER || 'runtime-default';
      const selectedModel = process.env.PHASE_SELECTED_MODEL || 'runtime-default';
      const selectedModelEffort = process.env.PHASE_SELECTED_MODEL_EFFORT || 'runtime-default';
      const modelSelectionReason = process.env.PHASE_MODEL_SELECTION_REASON || 'runtime-default';
      for (let index = workflowSectionRange.start + 1; index < workflowSectionRange.end; index += 1) {
        const line = qaLines[index];
        const stripped = line.trim();
        if (stripped.startsWith('- Applied skills:')) {
          const skills = stripped.split(':', 2)[1]
            ?.split(',')
            .map((item) => item.trim())
            .filter(Boolean) ?? [];
          for (const skill of ['completion-verifier', 'implementation-runner']) {
            if (!skills.includes(skill)) {
              skills.push(skill);
            }
          }
          body.push(`- Applied skills: ${skills.join(', ')}`);
        } else if (stripped.startsWith('- Skipped skills:') && stripped.includes('completion-verifier')) {
          const parts = stripped.split(':', 2)[1]
            ?.split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .filter((item) => !item.includes('completion-verifier')) ?? [];
          body.push(parts.length > 0 ? `- Skipped skills: ${parts.join(', ')}` : '- Skipped skills: none');
        } else if (stripped.startsWith('- Selected harness components:')) {
          sawSelectedHarness = true;
          body.push(line);
        } else if (stripped.startsWith('- Skipped harness components:')) {
          sawSkippedHarness = true;
          body.push(line);
        } else if (stripped.startsWith('- Selection reason:')) {
          sawSelectionReason = true;
          body.push(line);
        } else if (stripped.startsWith('- Runtime isolation:')) {
          sawRuntimeIsolation = true;
          body.push(line);
        } else if (stripped.startsWith('- Model effort profile:')) {
          sawModelEffortProfile = true;
          modelEffortProfile = stripped.split(':', 2)[1]?.trim() || modelEffortProfile;
          body.push(line);
        } else if (stripped.startsWith('- Effort escalation reason:')) {
          sawEffortEscalationReason = true;
          body.push(line);
        } else if (stripped.startsWith('- Selected model provider:')) {
          sawSelectedModelProvider = true;
          body.push(line);
        } else if (stripped.startsWith('- Selected model:')) {
          sawSelectedModel = true;
          body.push(line);
        } else if (stripped.startsWith('- Selected model effort:')) {
          sawSelectedModelEffort = true;
          body.push(line);
        } else if (stripped.startsWith('- Model selection reason:')) {
          sawModelSelectionReason = true;
          body.push(line);
        } else if (stripped.startsWith('- Retrieval budget:')) {
          sawRetrievalBudget = true;
          body.push(line);
        } else if (stripped.startsWith('- Validation profile:')) {
          sawValidationProfile = true;
          body.push(line);
        } else if (stripped.startsWith('- Phase replay policy:')) {
          sawPhaseReplayPolicy = true;
          body.push(line);
        } else {
          body.push(line);
        }
      }
      if (!sawSelectedHarness) {
        body.push('- Selected harness components: phase-runner, contract, implementation, review, verification, finish');
      }
      if (!sawSkippedHarness) {
        body.push('- Skipped harness components: none');
      }
      if (!sawSelectionReason) {
        body.push('- Selection reason: phase work uses the full cross-runtime harness by default');
      }
      if (!sawRuntimeIsolation) {
        body.push('- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract');
      }
      if (!sawModelEffortProfile) {
        body.push(`- Model effort profile: ${modelEffortProfile}`);
      }
      if (!sawEffortEscalationReason) {
        body.push(`- Effort escalation reason: ${process.env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON || process.env.MOONSHOT_EFFORT_ESCALATION_REASON || defaultEffortEscalationReason(modelEffortProfile)}`);
      }
      if (!sawSelectedModelProvider) {
        body.push(`- Selected model provider: ${selectedModelProvider}`);
      }
      if (!sawSelectedModel) {
        body.push(`- Selected model: ${selectedModel}`);
      }
      if (!sawSelectedModelEffort) {
        body.push(`- Selected model effort: ${selectedModelEffort}`);
      }
      if (!sawModelSelectionReason) {
        body.push(`- Model selection reason: ${modelSelectionReason}`);
      }
      if (!sawRetrievalBudget) {
        body.push(`- Retrieval budget: ${process.env.PHASE_RETRIEVAL_BUDGET || process.env.MOONSHOT_RETRIEVAL_BUDGET || DEFAULT_RETRIEVAL_BUDGET}`);
      }
      if (!sawValidationProfile) {
        body.push(`- Validation profile: ${process.env.PHASE_VALIDATION_PROFILE || process.env.MOONSHOT_VALIDATION_PROFILE || DEFAULT_VALIDATION_PROFILE}`);
      }
      if (!sawPhaseReplayPolicy) {
        body.push(`- Phase replay policy: ${process.env.PHASE_REPLAY_POLICY || process.env.MOONSHOT_PHASE_REPLAY_POLICY || DEFAULT_PHASE_REPLAY_POLICY}`);
      }
      qaLines = [...qaLines.slice(0, workflowSectionRange.start), '## Workflow Execution', ...body, ...qaLines.slice(workflowSectionRange.end)];
    }

    qaLines = replaceOrAppendSection(qaLines, '## Score Summary', [
      `- Current score: ${currentScore}`,
      `- Target score: ${scoreTarget}`,
      `- Unmet checklist items: ${unmetItems}`,
      `- Blocking defects: ${blockingDefects}`,
      `- Verdict: ${scoreVerdict}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      '- Fresh evidence confirmed: yes',
      '- Why this round may stop now: clean-finish conditions are satisfied and recorded.',
      '- Remaining in-scope work: none',
      '- Remaining blockers before closeout: none',
      `- Checks to rerun if code changes again: ${commandSummary}`,
      '',
    ]);

    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }

    scoreLines = scoreLines.map((line) => {
      if (line.startsWith('| OBJ-')) {
        const parts = line.split('|');
        if (parts.length >= 6) {
          parts[4] = ' done ';
          return parts.join('|');
        }
      }
      if (line.trim().startsWith('- Current score:')) {
        return `- Current score: ${currentScore}`;
      }
      if (line.trim().startsWith('- Target score:')) {
        return `- Target score: ${scoreTarget}`;
      }
      if (line.trim().startsWith('- Unmet checklist items:')) {
        return `- Unmet checklist items: ${unmetItems}`;
      }
      if (line.trim().startsWith('- Blocking defects:')) {
        return `- Blocking defects: ${blockingDefects}`;
      }
      if (line.trim().startsWith('- Verdict:')) {
        return `- Verdict: ${scoreVerdict}`;
      }
      return line;
    });
    scoreLines = ensureTaskLevelStatus(scoreLines, 'FULL');

    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }

  if (resolvedHandoffPath && fs.existsSync(resolvedHandoffPath)) {
    writeCleanFinishHandoff({
      phaseNum: verdictPayload.phase?.number ?? '',
      phaseTitle: phaseTitle || verdictPayload.phase?.title || '',
      phaseDoc: verdictPayload.phase?.activePhaseDocPath ?? '',
      phaseSprintContract: qaReportPath ? path.join(path.dirname(qaReportPath), 'SPRINT_CONTRACT.md') : '',
      phaseQaReport: qaReportPath,
      phaseHandoff: resolvedHandoffPath,
    });
  }
}

function syncPlanConformanceFailureArtifacts({
  qaReportPath,
  scorecardPath,
  phaseTitle,
  targetCompletionScore,
  planConformance,
}) {
  const violationLines = planConformance.violations.length > 0
    ? planConformance.violations.map((item) => `| ${item.code} | fail | ${item.message.replace(/\|/g, '/')} | retry_loop |`)
    : ['| none | pass | Source plan conformance verified. | none |'];

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }
    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      '- Status: fail',
      `- Summary: ${phaseTitle || 'Active phase'} cannot close because source plan conformance failed.`,
      '- Scope status: partial',
      '- Next path: retry_loop',
      '- Closeout reason: verification_failed',
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Plan Conformance Review', [
      '| Plan Item | Required | Actual | Result | Required Action |',
      '|-----------|----------|--------|--------|-----------------|',
      ...violationLines.map((line) => {
        const parts = line.split('|').map((part) => part.trim());
        return `| ${parts[1] || 'plan-conformance'} | Source phase plan | ${parts[3] || 'failed'} | fail | ${parts[4] || 'retry_loop'} |`;
      }),
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      '- Fresh evidence confirmed: no',
      '- Why this round may stop now: source plan conformance failed; retry is required.',
      '- Remaining in-scope work: resolve source plan conformance violations or record a user-approved replan.',
      '- Remaining blockers before closeout: plan conformance gate failed.',
      '- Checks to rerun if code changes again: run `.claude/scripts/verify-plan-conformance.mjs` and required verification commands.',
      '',
    ]);
    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }
    let sawConform = false;
    scoreLines = scoreLines.map((line) => {
      if (line.startsWith('| OBJ-CONFORM |')) {
        sawConform = true;
        const parts = line.split('|');
        if (parts.length >= 6) {
          parts[4] = ' fail ';
          parts[5] = ` ${planConformance.reason} `;
          return parts.join('|');
        }
      }
      if (line.trim().startsWith('- Current score:')) return '- Current score: 0';
      if (line.trim().startsWith('- Target score:')) return `- Target score: ${targetCompletionScore || '100'}`;
      if (line.trim().startsWith('- Unmet checklist items:')) return '- Unmet checklist items: 1';
      if (line.trim().startsWith('- Blocking defects:')) return '- Blocking defects: 1';
      if (line.trim().startsWith('- Verdict:')) return '- Verdict: retry';
      return line;
    });
    if (!sawConform) {
      const section = findSection(scoreLines, '## Objective Checklist');
      if (section.start !== null) {
        scoreLines.splice(section.end, 0, `| OBJ-CONFORM | Source phase plan conformance | 20 | fail | ${qaReportPath || ''} | ${planConformance.reason} |`);
      }
    }
    scoreLines = ensureTaskLevelStatus(scoreLines, 'NO');
    scoreLines = replaceOrAppendSection(scoreLines, '## Plan Conformance Gate', [
      `- Status: fail`,
      `- Reason: ${planConformance.reason}`,
      `- Violations: ${planConformance.violations.length}`,
      '',
    ]);
    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }
}

function appendHandoffUpdate({
  reason,
  logFile,
  detail,
  nextPhase,
  phaseTitle,
  phaseSprintContract,
  phaseQaReport,
  phaseDoc,
  phaseScorecard,
  phaseHandoff,
}) {
  let normalizedReason;
  switch (reason) {
    case 'blocked':
    case 'context_limit':
    case 'user_pause':
    case 'deferred_verification':
    case 'interrupted':
      normalizedReason = reason;
      break;
    case 'verification-command-missing':
      normalizedReason = 'blocked';
      break;
    default:
      if (
        reason.startsWith('timeout-') ||
        reason.startsWith('phase-timeout-') ||
        reason === 'timeout-runtime-fallback' ||
        reason === 'timeout-restart-limit-exceeded'
      ) {
        normalizedReason = 'interrupted';
      } else if (
        reason === 'missing-fresh-verification-evidence' ||
        reason === 'verification-remediation-incomplete' ||
        reason === 'auto-fix-succeeded-without-fresh-verification'
      ) {
        normalizedReason = 'deferred_verification';
      } else {
        normalizedReason = 'blocked';
      }
  }

  const phasePrefix = String(nextPhase).padStart(2, '0');
  const body = `# Phase ${phasePrefix} Handoff

> Generated because the phase stopped without clean completion.

## Goal
- ${phaseTitle}
- Current stage: Finish / Handoff

## Current State
- Completed:
  - Latest sprint contract is at \`${phaseSprintContract}\`
  - Latest QA state is at \`${phaseQaReport}\`
- In progress:
  - No further work is active in this stopped attempt
- Blocked:
  - ${detail || 'Runtime stop recorded by agent-loop'}

## Resume Trigger
- Why this handoff exists: the current attempt did not reach clean finish
- Stop reason: ${normalizedReason}
- Why this cannot continue in the current round: runtime stop recorded by agent-loop; resume only after reviewing the active blockers, interruption, or deferred verification state.
- Condition to resume: review the latest contract and QA evidence, then continue only the active phase.

## Checks To Rerun
- Review: rerun review for any code changed in the next attempt
- Verification: rerun the required commands recorded in \`${phaseSprintContract}\`
- Runtime flow: rerun the active phase flow only after the blocker above is addressed

## Next Steps
1. Review ${phaseSprintContract}
2. Continue implementation or remediation for this phase only
3. Re-run verification and update ${phaseQaReport}

## Remaining Scope
- Remaining in-scope work: resolve the current stop reason and finish the active phase with fresh verification evidence
- Next planned phase or slice: remain on the current phase until the scorecard reaches \`done\`

## Evidence Paths
- Sprint contract: ${phaseSprintContract}
- QA report: ${phaseQaReport}
- Phase doc: ${phaseDoc}
- Scorecard: ${phaseScorecard}
- Log: ${logFile}

## Workflow Logging
- session-logger: recorded via agent-loop handoff update
- Detail: ${detail || 'none provided'}
`;
  fs.writeFileSync(phaseHandoff, body, 'utf8');
}

function writeCleanFinishHandoff({
  phaseNum,
  phaseTitle,
  phaseDoc,
  phaseSprintContract,
  phaseQaReport,
  phaseHandoff,
}) {
  const phasePrefix = String(phaseNum).padStart(2, '0');
  const body = `# Phase ${phasePrefix} Handoff

> Not required after clean completion. Retained only as a closeout marker.

## Goal
- ${phaseTitle}
- Current stage: Finish / Handoff

## Status
- Required: no
- Reason: the phase completed cleanly with fresh verification evidence, recorded review state, and no pending resume work.

## Resume Trigger
- Why this handoff exists: clean-finish marker only
- Stop reason: phase_local_closeout_marker
- Why this cannot continue in the current round: no additional in-scope work remains for this phase; this marker is phase-local and not a plan-level stop reason
- Condition to resume: reopen only if a new change invalidates the current verification evidence

## Checks To Rerun
- Review: rerun only if code changes again
- Verification: rerun only if code changes again
- Runtime flow: not required for the current clean finish

## Remaining Scope
- Remaining in-scope work: none
- Next planned phase or slice: none in this handoff file

## Evidence Paths
- Sprint contract: ${phaseSprintContract}
- QA report: ${phaseQaReport}
- Phase doc: ${phaseDoc}

## Workflow Logging
- session-logger: not required for this clean finish
- Closeout marker recorded at: ${nowIsoSeconds().replace('T', ' ').slice(0, 19)}
`;
  fs.writeFileSync(phaseHandoff, body, 'utf8');
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(writableTempRoot(), 'phase-artifacts-'));
  try {
    const phaseDoc = path.join(tempDir, 'phase.md');
    fs.writeFileSync(phaseDoc, '# Fixture phase\n', 'utf8');
    const qaReportPath = path.join(tempDir, 'QA_REPORT.md');
    const scorecardPath = path.join(tempDir, 'SCORECARD.md');
    const handoffPath = path.join(tempDir, 'HANDOFF.md');

    fs.writeFileSync(qaReportPath, [
      '# QA',
      '',
      '## Verdict',
      '- Status: fail',
      '- Summary: fixture',
      '- Scope status: partial',
      '- Next path: retry_loop',
      '- Closeout reason: verification_failed',
      '',
      '## Review Checkpoint',
      '- Review completed: yes',
      '- Review owners: codex-review-code',
      '- Review-driven code changes:',
      '',
      '## Finish Readiness',
      '- Fresh evidence confirmed: no',
      '- Why this round may stop now: fixture',
      '- Remaining in-scope work: fixture',
      '- Remaining blockers before closeout: fixture',
      '- Checks to rerun if code changes again: fixture',
      '',
      '## Score Summary',
      '- Current score: 0',
      '- Target score: 100',
      '- Unmet checklist items: 1',
      '- Blocking defects: 0',
      '- Verdict: retry',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(scorecardPath, [
      '# Scorecard',
      '',
      '## Score Summary',
      '- Current score: 0',
      '- Target score: 100',
      '- Unmet checklist items: 1',
      '- Blocking defects: 0',
      '- Verdict: retry',
      '',
      '## Task-Level Status Adapter',
      '- Status: FULL | PARTIAL | NO',
      '- Current task status: FULL',
      '- Partial threshold: 60',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(handoffPath, [
      '# Handoff',
      '',
      '## Status',
      '- Required: no',
      '- Reason: stale clean-finish marker',
      '',
      '## Resume Trigger',
      '- Why this handoff exists: stale clean-finish marker only',
      '- Stop reason: phase_local_closeout_marker',
      '- Why this cannot continue in the current round: stale marker',
      '- Condition to resume: none',
      '',
      '## Checks To Rerun',
      '- Review: fixture',
      '- Verification: fixture',
      '- Runtime flow: fixture',
      '',
      '## Remaining Scope',
      '- Remaining in-scope work: fixture',
      '- Next planned phase or slice: fixture',
      '',
      '## Workflow Logging',
      '- session-logger: recorded via agent-loop handoff update',
      '- Detail: fixture',
      '',
    ].join('\n'), 'utf8');

    syncCloseoutArtifacts({
      qaReportPath,
      scorecardPath,
      handoffPath,
      phaseTitle: 'Fixture Phase',
      phaseDoc,
      phaseNum: '1',
      targetCompletionScore: 100,
      completionArtifacts: '',
      logFile: 'fixture.log',
      detail: 'fixture closeout sync',
    });
    const firstPass = [
      fs.readFileSync(qaReportPath, 'utf8'),
      fs.readFileSync(scorecardPath, 'utf8'),
      fs.readFileSync(handoffPath, 'utf8'),
    ].join('\n--\n');

    syncCloseoutArtifacts({
      qaReportPath,
      scorecardPath,
      handoffPath,
      phaseTitle: 'Fixture Phase',
      phaseDoc,
      phaseNum: '1',
      targetCompletionScore: 100,
      completionArtifacts: '',
      logFile: 'fixture.log',
      detail: 'fixture closeout sync',
    });
    const secondPass = [
      fs.readFileSync(qaReportPath, 'utf8'),
      fs.readFileSync(scorecardPath, 'utf8'),
      fs.readFileSync(handoffPath, 'utf8'),
    ].join('\n--\n');

    if (firstPass !== secondPass) {
      throw new Error('closeout sync writer is not idempotent');
    }

    const worksetsPath = path.join(tempDir, 'WORKSETS.yaml');
    const verdictPath = path.join(tempDir, 'verdict.json');
    fs.writeFileSync(verdictPath, JSON.stringify({
      verdict: 'passed',
      evidenceFresh: true,
      phase: { number: 4, title: 'Fixture Phase', activePhaseDocPath: phaseDoc },
    }, null, 2), 'utf8');
    fs.writeFileSync(qaReportPath, [
      '# QA',
      '',
      '## Verdict',
      '- Status: in_progress',
      '- Summary: fixture',
      '- Scope status: partial',
      '- Next path: retry_loop',
      '- Closeout reason: verification_failed',
      '',
      '## Review Checkpoint',
      '- Review completed: no',
      '- Review owners: pending',
      '- Review-driven code changes: pending',
      '',
      '## Contract Review Evidence',
      '- Contract reviewed by evaluator: no',
      '- Verification owner: pending',
      '- Runtime evidence plan: pending',
      '- Round fail conditions: pending',
      '- Contract revision required: no',
      '',
      '## Workflow Execution',
      '- Selected bundles: none',
      '- Applied skills: none',
      '- Skipped skills: none',
      '- Selected harness components: none',
      '- Skipped harness components: none',
      '- Selection reason: pending',
      '- Runtime isolation: pending',
      '- Model effort profile: standard',
      '- Effort escalation reason: none',
      '- Selected model provider: pending',
      '- Selected model: pending',
      '- Selected model effort: pending',
      '- Model selection reason: pending',
      '- Retrieval budget: pending',
      '- Validation profile: pending',
      '- Phase replay policy: pending',
      '',
      '## Runtime Updates',
      '- Seeded at: 2026-05-07 05:07:23',
      '- Verification verdict file: pending',
      '- Verification verdict: pending',
      '- Runtime evidence depth: pending',
      '- Critical scenario smoke-only warnings: none',
      '',
      '## Score Summary',
      '- Current score: 0',
      '- Target score: 100',
      '- Unmet checklist items: 1',
      '- Blocking defects: 0',
      '- Verdict: retry',
      '',
      '## Finish Readiness',
      '- Fresh evidence confirmed: no',
      '- Why this round may stop now: fixture',
      '- Remaining in-scope work: fixture',
      '- Remaining blockers before closeout: fixture',
      '- Checks to rerun if code changes again: fixture',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(scorecardPath, [
      '# Scorecard',
      '',
      '## Objective Checklist',
      '| ID | Category | Weight | Status | Evidence | Notes |',
      '|----|----------|--------|--------|----------|-------|',
      '| OBJ-CONFORM | Source platform phase plan conformance verified | 20 | pending | fixture | fixture |',
      '',
      '## Score Summary',
      '- Current score: 0',
      '- Target score: 100',
      '- Unmet checklist items: 1',
      '- Blocking defects: 0',
      '- Verdict: retry',
      '',
      '## Task-Level Status Adapter',
      '- Status: FULL | PARTIAL | NO',
      '- Current task status: NO',
      '- Partial threshold: 60',
      '',
      '## Progress Checkpoints',
      '- previous checkpoint',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(handoffPath, [
      '# Handoff',
      '',
      '## Status',
      '- Required: pending',
      '- Reason: fixture',
      '',
      '## Resume Trigger',
      '- Why this handoff exists: fixture',
      '- Stop reason: blocked',
      '- Why this cannot continue in the current round: fixture',
      '- Condition to resume: fixture',
      '',
      '## Checks To Rerun',
      '- Review: fixture',
      '- Verification: fixture',
      '- Runtime flow: fixture',
      '',
      '## Remaining Scope',
      '- Remaining in-scope work: fixture',
      '- Next planned phase or slice: fixture',
      '',
      '## Evidence Paths',
      '- Sprint contract: fixture',
      '- QA report: fixture',
      '- Phase doc: fixture',
      '- Scorecard: fixture',
      '',
      '## Workflow Logging',
      '- session-logger: fixture',
      '- Detail: fixture',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(worksetsPath, [
      'schemaVersion: 1',
      'activeAtomicTask: AT-01',
      'atomicTasks:',
      '  - id: AT-01',
      '    title: "Complete the source phase scope"',
      '    status: in_progress',
      '    ownedPaths: []',
      '    verificationCommands: []',
      '    evidence: []',
      '    completedAt: null',
      'worksets: []',
    ].join('\n'), 'utf8');

    const structuredState = {
      qaReportPath,
      scorecardPath,
      handoffPath,
      worksetsPath,
      phaseTitle: 'Fixture Phase',
      phaseNum: '4',
      targetCompletionScore: 100,
      timestamp: '2026-05-07T05:07:23Z',
      verdictPath,
      runtime: {
        stage: 'verify',
        status: 'in_progress',
        runtime: 'codex',
        logFile: 'artifact-sync.log',
        detail: 'fixture structured sync',
        evidenceDepth: 'open-act-mutate-persist-recover',
        smokeWarnings: 'none',
        verdict: 'passed',
        timestamp: '2026-05-07T05:07:23Z',
      },
      review: {
        completed: true,
        owners: 'codex-review-code',
        codeChanges: 'structured sync fixture',
        detail: 'structured sync fixture',
        contractReviewedByEvaluator: true,
        verificationOwner: 'completion-verifier',
        runtimeEvidencePlan: 'fixture structured sync',
        contractRevisionRequired: false,
      },
      finish: {
        freshEvidence: true,
        summary: 'structured sync fixture',
        scopeStatus: 'complete',
        nextPath: 'clean_finish',
        closeoutReason: 'scope_complete',
        whyStop: 'clean-finish conditions are satisfied and recorded.',
        remainingWork: 'none',
        remainingBlockers: 'none',
        checksToRerun: 'fixture structured sync',
      },
      score: {
        current: 100,
        target: 100,
        unmetItems: 0,
        blockingDefects: 0,
        verdict: 'done',
        taskStatus: 'FULL',
        objectives: [
          {
            id: 'OBJ-CONFORM',
            status: 'pass',
            evidence: 'fixture structured sync',
            notes: 'structured sync fixture',
          },
        ],
      },
      workflow: {
        selectedBundles: 'ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle',
        appliedSkills: 'implementation-runner, codex-review-code, completion-verifier',
        skippedSkills: 'none',
        selectedHarnessComponents: 'phase-runner, contract, implementation, review, verification, finish',
        skippedHarnessComponents: 'none',
        selectionReason: 'fixture structured sync',
        runtimeIsolation: 'runtime-adapter',
        modelEffortProfile: 'standard',
        effortEscalationReason: 'none',
        selectedModelProvider: 'openai',
        selectedModel: 'gpt-5.4-mini',
        selectedModelEffort: 'medium',
        modelSelectionReason: 'fixture structured sync',
        retrievalBudget: DEFAULT_RETRIEVAL_BUDGET,
        validationProfile: DEFAULT_VALIDATION_PROFILE,
        phaseReplayPolicy: DEFAULT_PHASE_REPLAY_POLICY,
      },
      changedFiles: ['.claude/scripts/agent-loop-phase-artifacts.mjs', '.claude/scripts/agent-loop-phase-plan-lib.mjs'],
      commands: ['node .claude/scripts/agent-loop-phase-artifacts.mjs self-test'],
      activeAtomicTask: 'AT-01',
      workset: {
        activeAtomicTask: 'AT-01',
        status: 'completed',
        taskStatus: 'completed',
        acceptanceCriterionId: 'AC-001',
        linkedRequirementIds: ['REQ-001'],
        linkedScenarioIds: ['SCN-001'],
        acVerdict: 'passed',
        verificationEvidence: ['AC-001 verified by fixture self-test'],
        semanticEvaluation: {
          status: 'not_run',
          reason: 'fixture',
        },
        ownedPaths: ['.claude/scripts/agent-loop-phase-artifacts.mjs', '.claude/scripts/agent-loop-phase-plan-lib.mjs'],
        verificationCommands: ['node .claude/scripts/agent-loop-phase-artifacts.mjs self-test'],
        evidence: ['structured sync fixture'],
        completedAt: '2026-05-07T05:07:23Z',
      },
      phase: {
        number: '4',
        title: 'Fixture Phase',
        docPath: phaseDoc,
      },
      evidenceMetadata: {
        schemaVersion: 'phase-closeout-evidence-v1',
        requirements: {
          'REQ-001': { status: 'verified', evidencePath: 'QA_REPORT.md' },
        },
        scenarios: {
          'SCN-001': { status: 'passed', evidencePath: 'QA_REPORT.md' },
        },
        blockers: [],
      },
    };

    syncPhaseArtifacts(structuredState);
    const structuredFirstPassArtifacts = {
      qa: fs.readFileSync(qaReportPath, 'utf8'),
      scorecard: fs.readFileSync(scorecardPath, 'utf8'),
      handoff: fs.readFileSync(handoffPath, 'utf8'),
      worksets: fs.readFileSync(worksetsPath, 'utf8'),
    };

    syncPhaseArtifacts(structuredState);
    const structuredSecondPassArtifacts = {
      qa: fs.readFileSync(qaReportPath, 'utf8'),
      scorecard: fs.readFileSync(scorecardPath, 'utf8'),
      handoff: fs.readFileSync(handoffPath, 'utf8'),
      worksets: fs.readFileSync(worksetsPath, 'utf8'),
    };
    const changedArtifactNames = Object.keys(structuredFirstPassArtifacts)
      .filter((key) => structuredFirstPassArtifacts[key] !== structuredSecondPassArtifacts[key]);
    if (changedArtifactNames.length > 0) {
      if (changedArtifactNames.includes('worksets')) {
        const firstLines = structuredFirstPassArtifacts.worksets.split(/\r?\n/);
        const secondLines = structuredSecondPassArtifacts.worksets.split(/\r?\n/);
        const diffIndex = firstLines.findIndex((line, index) => line !== secondLines[index]);
        const firstLine = firstLines[diffIndex] || '';
        const secondLine = secondLines[diffIndex] || '';
        throw new Error(`structured artifact sync writer is not idempotent: worksets line ${diffIndex + 1}: ${firstLine} != ${secondLine}`);
      }
      throw new Error(`structured artifact sync writer is not idempotent: ${changedArtifactNames.join(', ')}`);
    }
    const syncedWorksets = fs.readFileSync(worksetsPath, 'utf8');
    if (
      !syncedWorksets.includes('acceptanceCriterionId: "AC-001"')
      || !syncedWorksets.includes('acVerdict: "passed"')
      || !syncedWorksets.includes('verificationEvidence: ["AC-001 verified by fixture self-test"]')
    ) {
      throw new Error('structured artifact sync did not project AC-linked WORKSETS fields');
    }
    if (
      !structuredFirstPassArtifacts.qa.includes('## Structured Evidence Metadata')
      || !structuredFirstPassArtifacts.qa.includes('"schemaVersion": "phase-closeout-evidence-v1"')
      || !structuredFirstPassArtifacts.scorecard.includes('## Structured Evidence Metadata')
      || !structuredFirstPassArtifacts.scorecard.includes('"SCN-001"')
    ) {
      throw new Error('structured artifact sync did not project closeout evidence metadata');
    }

    writeStdoutLine('agent-loop-phase-artifacts self-test passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-artifacts.mjs normalize-qa-report-workflow-fields <qa-report-path>',
    '  agent-loop-phase-artifacts.mjs append-qa-runtime-update <status> <log-file> [detail] <workflow-log-dir> <phase-qa-report> <phase-scorecard>',
    '  agent-loop-phase-artifacts.mjs record-phase-progress-checkpoint <qa-report> <scorecard> <stage> <status> <log-file> <detail> <runtime>',
    '  agent-loop-phase-artifacts.mjs sync-phase-artifacts <state-json-or-path>',
    '  agent-loop-phase-artifacts.mjs complete-review-closeout-from-verdict <completion-artifacts> <qa-report> <scorecard> <handoff> <phase-title> <target-score> <log-file> <detail>',
    '  agent-loop-phase-artifacts.mjs sync-closeout-artifacts <completion-artifacts> <qa-report> <scorecard> <handoff> <phase-title> <phase-num> <target-score> <log-file> <detail>',
    '  agent-loop-phase-artifacts.mjs sync-clean-finish-artifacts <completion-artifacts> <qa-report> <scorecard> <phase-title> <target-score>',
    '  agent-loop-phase-artifacts.mjs append-handoff-update <reason> <log-file> <detail> <next-phase> <phase-title> <sprint-contract> <qa-report> <phase-doc> <scorecard> <handoff>',
    '  agent-loop-phase-artifacts.mjs write-clean-finish-handoff <phase-num> <phase-title> <phase-doc> <sprint-contract> <qa-report> <handoff>',
    '  agent-loop-phase-artifacts.mjs self-test',
  ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  switch (command) {
    case 'normalize-qa-report-workflow-fields':
      if (!args[0]) {
        printUsage();
        process.exit(64);
      }
      normalizeQaReportWorkflowFields(args[0]);
      break;
    case 'append-qa-runtime-update':
      appendQaRuntimeUpdate(args[0], args[1], args[2] ?? '', args[3] ?? '', args[4] ?? '', args[5] ?? '');
      break;
    case 'record-phase-progress-checkpoint':
      recordPhaseProgressCheckpoint({
        qaReportPath: args[0] ?? '',
        scorecardPath: args[1] ?? '',
        stage: args[2] ?? 'execute',
        status: args[3] ?? 'in_progress',
        logFile: args[4] ?? '',
        detail: args[5] ?? '',
        runtimeName: args[6] ?? '',
      });
      break;
    case 'sync-phase-artifacts':
      syncPhaseArtifacts(parseStructuredArtifactState(args[0] ?? ''));
      break;
    case 'sync-clean-finish-artifacts':
      syncCleanFinishArtifacts({
        completionArtifacts: args[0] ?? '',
        qaReportPath: args[1] ?? '',
        scorecardPath: args[2] ?? '',
        phaseTitle: args[3] ?? '',
        targetCompletionScore: args[4] ?? '100',
      });
      break;
    case 'sync-closeout-artifacts':
      syncCloseoutArtifacts({
        completionArtifacts: args[0] ?? '',
        qaReportPath: args[1] ?? '',
        scorecardPath: args[2] ?? '',
        handoffPath: args[3] ?? '',
        phaseTitle: args[4] ?? '',
        phaseNum: args[5] ?? '',
        targetCompletionScore: args[6] ?? '100',
        logFile: args[7] ?? '',
        detail: args[8] ?? '',
      });
      break;
    case 'complete-review-closeout-from-verdict':
      completeReviewCloseoutFromVerdict({
        completionArtifacts: args[0] ?? '',
        qaReportPath: args[1] ?? '',
        scorecardPath: args[2] ?? '',
        handoffPath: args[3] ?? '',
        phaseTitle: args[4] ?? '',
        targetCompletionScore: args[5] ?? '100',
        logFile: args[6] ?? '',
        detail: args[7] ?? '',
      });
      break;
    case 'append-handoff-update':
      appendHandoffUpdate({
        reason: args[0] ?? '',
        logFile: args[1] ?? '',
        detail: args[2] ?? '',
        nextPhase: args[3] ?? '',
        phaseTitle: args[4] ?? '',
        phaseSprintContract: args[5] ?? '',
        phaseQaReport: args[6] ?? '',
        phaseDoc: args[7] ?? '',
        phaseScorecard: args[8] ?? '',
        phaseHandoff: args[9] ?? '',
      });
      break;
    case 'write-clean-finish-handoff':
      writeCleanFinishHandoff({
        phaseNum: args[0] ?? '',
        phaseTitle: args[1] ?? '',
        phaseDoc: args[2] ?? '',
        phaseSprintContract: args[3] ?? '',
        phaseQaReport: args[4] ?? '',
        phaseHandoff: args[5] ?? '',
      });
      break;
    case 'self-test':
      runSelfTest();
      break;
    default:
      printUsage();
      process.exit(64);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
