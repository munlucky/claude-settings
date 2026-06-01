import fs from 'node:fs';
import path from 'node:path';

import {
  scenarioEvidencePassed as normalizeScenarioEvidencePassed,
} from '../artifact-normalizer.mjs';
import {
  normalize,
  parseWorksetsYaml,
  readText,
  resolvePath,
  sectionText,
} from './phase-closeout-parsers.mjs';
import {
  hasRemediationPacketReference,
  isRemediationPacketPath,
} from './phase-remediation-packet.mjs';

const PASS_WORDS = /\b(pass|passed|done|verified)\b/i;
const FAIL_WORDS = /\b(fail|failed|blocked|missing|todo|pending|retry)\b/i;
const EXTERNAL_BLOCKER_WORDS = /\b(external|account|credential|credentials|launch|domain|cloudflare|search console|adsense|manual|no-go)\b/i;
const STRUCTURED_EVIDENCE_SCHEMA = 'phase-closeout-evidence-v1';
const PASS_STATUSES = new Set(['pass', 'passed', 'done', 'verified', 'implemented_verified', 'complete', 'completed', 'resolved', 'non_blocking', 'historical_warning', 'expected_blocker_passed']);
const FAIL_STATUSES = new Set(['fail', 'failed', 'blocked', 'missing', 'todo', 'pending', 'retry', 'unresolved', 'active']);

function extractPathTokens(text) {
  const result = new Set();
  const regex = /(?:^|[\s`"'(])([A-Za-z0-9_@./\\-]+\.(?:tsx|jsx|ts|js|mjs|cjs|json|yaml|yml|md|sh|py))(?:$|[\s`"',):;])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const token = match[1].replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    if (!token.includes('..')) {
      result.add(token);
    }
  }
  return [...result];
}

export function hasConcreteSourceTargets(phaseText) {
  return extractPathTokens(sectionText(phaseText, 'Exact Execution Targets'))
    .some((token) => !token.endsWith('.md') && !token.endsWith('package.json'));
}

export function scenarioEvidencePassed(scenarioId, evidenceText) {
  return normalizeScenarioEvidencePassed(scenarioId, evidenceText) || normalize(evidenceText).split('\n').some((line) => {
    const lowered = line.toLowerCase();
    return lowered.includes(scenarioId.toLowerCase())
      && PASS_WORDS.test(line)
      && !FAIL_WORDS.test(line)
      && !hasRemediationPacketReference(line);
  });
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function evidencePassedStatus(value) {
  const status = normalizeStatus(value);
  if (!status) {
    return null;
  }
  if (PASS_STATUSES.has(status)) {
    return true;
  }
  if (FAIL_STATUSES.has(status)) {
    return false;
  }
  return null;
}

function normalizeEvidenceEntries(value, idPattern) {
  const entries = [];
  const pushEntry = (id, entry = {}) => {
    const normalizedId = String(id || '').trim();
    if (!idPattern.test(normalizedId)) {
      return;
    }
    const candidate = entry && typeof entry === 'object' ? entry : { status: entry };
    const status = candidate.status ?? candidate.verdict ?? candidate.result ?? candidate.outcome ?? '';
    entries.push({
      id: normalizedId,
      status: normalizeStatus(status),
      passed: evidencePassedStatus(status),
      evidencePath: String(candidate.evidencePath || candidate.path || candidate.evidence || '').trim(),
      source: String(candidate.source || '').trim(),
    });
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      pushEntry(entry.id || entry.requirementId || entry.scenarioId || entry.code, entry);
    }
  } else if (value && typeof value === 'object') {
    for (const [id, entry] of Object.entries(value)) {
      pushEntry(id, entry);
    }
  }
  return entries;
}

function normalizeBlockers(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const status = entry.status ?? entry.verdict ?? entry.result ?? '';
      const blocking = entry.blocking === true || normalizeStatus(entry.active) === 'true';
      const passed = evidencePassedStatus(status);
      return {
        code: String(entry.code || entry.reasonCode || entry.blockingReasonCode || '').trim(),
        blockerClass: String(entry.blockerClass || entry.class || '').trim(),
        status: normalizeStatus(status),
        blocking,
        passed,
      };
    });
}

function extractEvidenceMetadataSource(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  for (const candidate of [
    payload.closeoutEvidence,
    payload.evidenceMetadata,
    payload.structuredEvidence,
    payload.metadata?.closeoutEvidence,
    payload.metadata?.evidence,
  ]) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function structuredEvidenceFromPayload(payload = {}) {
  const source = extractEvidenceMetadataSource(payload);
  if (!source) {
    return { hasMetadata: false, requirements: [], scenarios: [], blockers: [], blockersExplicit: false };
  }
  return {
    schemaVersion: String(source.schemaVersion || STRUCTURED_EVIDENCE_SCHEMA).trim(),
    hasMetadata: true,
    requirements: normalizeEvidenceEntries(source.requirements, /^REQ-[A-Za-z0-9_.-]+$/i),
    scenarios: normalizeEvidenceEntries(source.scenarios, /^SCN-[A-Za-z0-9_.-]+$/i),
    blockers: normalizeBlockers(source.blockers),
    blockersExplicit: Object.prototype.hasOwnProperty.call(source, 'blockers'),
  };
}

export function structuredEvidenceFromMarkdown(text = '') {
  const section = sectionText(text, 'Structured Evidence Metadata');
  if (!section) {
    return { hasMetadata: false, requirements: [], scenarios: [], blockers: [], blockersExplicit: false };
  }
  const fence = section.match(/```json\s*([\s\S]*?)```/i);
  const jsonText = fence ? fence[1] : section;
  try {
    return structuredEvidenceFromPayload({ evidenceMetadata: JSON.parse(jsonText) });
  } catch {
    return { hasMetadata: false, requirements: [], scenarios: [], blockers: [], blockersExplicit: false };
  }
}

export function mergeStructuredEvidenceMetadata(...metadataSources) {
  const merged = { hasMetadata: false, requirements: [], scenarios: [], blockers: [], blockersExplicit: false };
  for (const source of metadataSources) {
    if (!source?.hasMetadata) {
      continue;
    }
    merged.hasMetadata = true;
    merged.requirements.push(...source.requirements);
    merged.scenarios.push(...source.scenarios);
    merged.blockers.push(...source.blockers);
    merged.blockersExplicit = merged.blockersExplicit || source.blockersExplicit;
  }
  return merged;
}

export function structuredScenarioEvidencePassed(metadata, scenarioId) {
  const normalizedId = String(scenarioId || '').trim().toLowerCase();
  const entry = (metadata?.scenarios || []).find((candidate) => candidate.id.toLowerCase() === normalizedId);
  if (!entry) {
    return null;
  }
  if (entry.passed === true && isRemediationPacketPath(entry.evidencePath)) {
    return false;
  }
  return entry.passed === true;
}

export function structuredTraceabilityValid(metadata, kind) {
  const entries = kind === 'requirements' ? metadata?.requirements : metadata?.scenarios;
  if (!metadata?.hasMetadata || !Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  return entries.some((entry) => entry.passed === true);
}

export function structuredLocalBlockerUnresolved(metadata) {
  if (!metadata?.hasMetadata || !metadata.blockersExplicit) {
    return null;
  }
  return metadata.blockers.some((entry) => entry.blocking === true || entry.passed === false || entry.status === 'active' || entry.status === 'blocked');
}

export function scorecardDone(scorecardText) {
  return /(?:Verdict|Score verdict):\s*done/i.test(scorecardText)
    || /Current task status:\s*FULL/i.test(scorecardText);
}

export function unresolvedLocalBlocker(text) {
  return normalize(text).split('\n').some((line) => {
    const relevant =
      /Remaining blockers before closeout:/i.test(line)
      || /Stop reason:\s*(blocked|deferred_verification)/i.test(line)
      || /blocking defects\s*=\s*[1-9]/i.test(line);

    if (!relevant || /\bnone\b/i.test(line)) {
      return false;
    }

    if (/\b(no blocking|blocking defects\s*=\s*0|blocking:\s*false)\b/i.test(line)) {
      return false;
    }

    return !EXTERNAL_BLOCKER_WORDS.test(line);
  });
}

export function executionRootFromPhaseArtifact(phase) {
  const candidate = phase.qaReport || phase.sprintContract || phase.handoff || phase.scorecard || '';
  if (!candidate) {
    return '';
  }
  return path.dirname(path.dirname(resolvePath(candidate)));
}

export function traceabilityArtifactValid(filePath, idPattern) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const text = readText(filePath);
  return idPattern.test(text) && /\b(implemented|verified|pass|passed|done)\b/i.test(text);
}

export function evaluateCompletedWorksets(phaseExecutionDir) {
  const worksetsPath = phaseExecutionDir ? path.join(phaseExecutionDir, 'WORKSETS.yaml') : '';
  const ledger = parseWorksetsYaml(worksetsPath);
  if (!ledger.exists) {
    return { ok: true, reason: 'missing-ledger-allowed', detail: '' };
  }
  if (ledger.tasks.length === 0) {
    return { ok: false, reason: 'atomic-ledger-empty', detail: `${path.relative(process.cwd(), worksetsPath)} has no atomicTasks.` };
  }
  for (const task of ledger.tasks) {
    const taskStatus = task.taskStatus || task.status;
    const normalizedTaskStatus = normalizeAtomicTaskStatus(taskStatus);
    if (normalizedTaskStatus !== 'completed') {
      return { ok: false, reason: 'atomic-tasks-incomplete', detail: `${task.id || 'atomic task'} taskStatus is ${taskStatus || 'missing'}.` };
    }
    if (task.ownedPaths.length === 0 || task.verificationCommands.length === 0 || task.evidence.length === 0) {
      return { ok: false, reason: 'atomic-task-evidence-missing', detail: `${task.id || 'atomic task'} lacks ownedPaths, verificationCommands, or evidence.` };
    }
    const acVerdict = String(task.acVerdict || '').trim().toLowerCase();
    if (task.acceptanceCriterionId && ['fail', 'failed', 'blocked', 'rejected'].includes(acVerdict)) {
      return { ok: false, reason: 'atomic-task-ac-verdict-failed', detail: `${task.id || 'atomic task'} AC verdict is ${task.acVerdict || 'missing'}.` };
    }
    if (task.acceptanceCriterionId && !['pass', 'passed', 'verified', 'done', 'not_applicable'].includes(acVerdict)) {
      return { ok: false, reason: 'atomic-task-ac-verdict-incomplete', detail: `${task.id || 'atomic task'} AC verdict is ${task.acVerdict || 'missing'}.` };
    }
    if (task.acceptanceCriterionId && acVerdict !== 'not_applicable' && task.verificationEvidence.length === 0) {
      return { ok: false, reason: 'atomic-task-ac-evidence-missing', detail: `${task.id || 'atomic task'} lacks AC verificationEvidence.` };
    }
  }
  return { ok: true, reason: 'ok', detail: '' };
}

export function normalizeAtomicTaskStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  if (['completed', 'complete', 'done', 'pass', 'passed', 'verified', 'full'].includes(normalized)) {
    return 'completed';
  }
  return normalized;
}
