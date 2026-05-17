#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { activeWorkspaceContract } from './lib/runtime-platform.mjs';
import { buildFailurePreventionBriefSection } from './lib/awtl-failure-prevention-brief.mjs';
import { loadVerificationContractContext } from './lib/verification-contract.mjs';
import { resolveEffortEscalationReason, resolveEffortProfile } from './lib/effort-profile.mjs';
import { resolveModelRoute } from './lib/model-routing-policy.mjs';

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

export function sanitizeSlug(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function assignExecutionArtifactPaths(phaseNum, phaseTitle, executionRoot) {
  const phasePrefix = String(phaseNum).padStart(2, '0');
  let phaseSlug = sanitizeSlug(phaseTitle);
  if (!phaseSlug) {
    phaseSlug = `phase-${phasePrefix}`;
  }

  const phaseExecutionDir = `${executionRoot}/${phasePrefix}-${phaseSlug}`;
  return {
    phasePrefix,
    phaseSlug,
    phaseExecutionDir,
    phaseGoalContract: `${phaseExecutionDir}/GOAL_CONTRACT.yaml`,
    phaseSprintContract: `${phaseExecutionDir}/SPRINT_CONTRACT.md`,
    phaseQaReport: `${phaseExecutionDir}/QA_REPORT.md`,
    phaseHandoff: `${phaseExecutionDir}/HANDOFF.md`,
    phaseScorecard: `${phaseExecutionDir}/SCORECARD.md`,
    phaseWorksets: `${phaseExecutionDir}/WORKSETS.yaml`,
  };
}

function extractMarkdownSection(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match && match[2].trim().toLowerCase() === heading.toLowerCase()) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) {
    return '- Not found in source phase doc.';
  }
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).map((line) => line.trimEnd()).join('\n').trim()
    || '- Empty in source phase doc.';
}

function yamlScalar(value) {
  const stringValue = String(value || '').trim();
  if (!stringValue) {
    return '""';
  }
  return `"${stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function extractInlineCodeValues(text) {
  const values = [];
  for (const match of String(text || '').matchAll(/`([^`\n]+)`/g)) {
    values.push(match[1].trim());
  }
  return values;
}

function looksLikeOwnedPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').trim();
  if (!normalized || /\s/.test(normalized)) {
    return false;
  }
  return /^(?:\.claude|\.codex|docs|src|test|tests|scripts|workflow|packages|apps|lib|bin|config|public|content)\//i.test(normalized)
    || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$/.test(normalized)
    || /^[A-Za-z0-9_.-]+\.(?:mjs|cjs|js|ts|tsx|jsx|json|yaml|yml|md|py|sh|ps1|css|scss|html)$/i.test(normalized);
}

function looksLikeVerificationCommand(value) {
  return /^(?:node|npm|pnpm|yarn|bash|pwsh|powershell|python|pytest|git|npx|tsc)\b/i.test(String(value || '').trim());
}

function extractPhaseOwnedPaths(sourceText) {
  const sections = [
    extractMarkdownSection(sourceText, 'Exact Execution Targets'),
    extractMarkdownSection(sourceText, 'Files To Create'),
    extractMarkdownSection(sourceText, 'Files To Modify'),
    extractMarkdownSection(sourceText, 'Files To Test'),
    extractMarkdownSection(sourceText, 'Owned Paths'),
  ];
  return uniqueValues(sections.flatMap(extractInlineCodeValues).filter(looksLikeOwnedPath));
}

function extractPhaseVerificationCommands(sourceText) {
  const sections = [
    extractMarkdownSection(sourceText, 'Exact Execution Targets'),
    extractMarkdownSection(sourceText, 'Validation'),
    extractMarkdownSection(sourceText, 'Verification'),
    extractMarkdownSection(sourceText, 'Verification Commands'),
    extractMarkdownSection(sourceText, 'Test Plan'),
    extractMarkdownSection(sourceText, 'Commands'),
  ];
  return uniqueValues(sections.flatMap(extractInlineCodeValues).filter(looksLikeVerificationCommand));
}

const UNVERIFIABLE_ADJECTIVES = [
  'beautiful',
  'delightful',
  'fast',
  'intuitive',
  'nice',
  'polished',
  'robust',
  'scalable',
  'seamless',
  'simple',
  'user-friendly',
];

function sectionExists(text, heading) {
  const section = extractMarkdownSection(text, heading);
  return !/^-\s+(?:not found|empty) in source phase doc\./i.test(section.trim());
}

function extractChecklistItems(text, heading) {
  return extractMarkdownSection(text, heading)
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^[-*]\s+\[[ xX]\]\s+(.+)$/)?.[1])
    .filter(Boolean);
}

function extractAcceptanceCriteriaFromSource(sourceText) {
  const candidates = [
    ...extractChecklistItems(sourceText, 'Phase Completion Checklist')
      .map((statement) => ({ statement, source: 'Phase Completion Checklist' })),
    ...extractChecklistItems(sourceText, 'Validation Plan')
      .map((statement) => ({ statement, source: 'Validation Plan' })),
  ];
  const uniqueStatements = new Set();
  return candidates
    .filter((candidate) => {
      const key = candidate.statement.toLowerCase();
      if (uniqueStatements.has(key)) {
        return false;
      }
      uniqueStatements.add(key);
      return true;
    })
    .map((candidate, index) => ({
      id: `AC-${String(index + 1).padStart(3, '0')}`,
      ...candidate,
    }));
}

function extractLinkedRequirementIdsFromSource(sourceText) {
  const ids = [];
  for (const match of String(sourceText || '').matchAll(/\b[A-Z][A-Z0-9]+-\d{3,}\b/g)) {
    ids.push(match[0]);
  }
  return uniqueValues(ids);
}

function buildTaskAcceptanceLink(taskIndex, acceptanceCriteria) {
  if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
    return null;
  }
  return acceptanceCriteria[Math.min(taskIndex, acceptanceCriteria.length - 1)] || null;
}

function detectSourceGaps(sourceText, verificationCommands, acceptanceCriteria) {
  const gaps = [];
  const lowerSource = String(sourceText || '').toLowerCase();
  const scopeText = extractMarkdownSection(sourceText, 'Scope').toLowerCase();
  const criteriaText = acceptanceCriteria.map((criterion) => criterion.statement).join('\n').toLowerCase();
  const vagueTerms = UNVERIFIABLE_ADJECTIVES.filter((term) => {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9-])${escapedTerm}($|[^A-Za-z0-9-])`, 'i').test(lowerSource);
  });

  if (!sectionExists(sourceText, 'Goal')) {
    gaps.push({ id: 'GAP-GOAL', severity: 'blocking', reason: 'missing explicit goal section' });
  }
  if (!sectionExists(sourceText, 'Scope') || !/in scope/i.test(scopeText)) {
    gaps.push({ id: 'GAP-SCOPE', severity: 'blocking', reason: 'missing in-scope boundary' });
  }
  if (!/out of scope|non-goals?|excluded scope/i.test(scopeText)) {
    gaps.push({ id: 'GAP-NON-GOALS', severity: 'assumption', reason: 'missing non-goal boundary' });
  }
  if (acceptanceCriteria.length === 0) {
    gaps.push({ id: 'GAP-AC', severity: 'blocking', reason: 'missing acceptance criteria' });
  }
  if (criteriaText && /\b(?:etc|and so on|as needed|tbd|reasonable|appropriate)\b/i.test(criteriaText)) {
    gaps.push({ id: 'GAP-AMBIGUOUS-AC', severity: 'assumption', reason: 'acceptance criteria include ambiguous terms' });
  }
  if (verificationCommands.length === 0) {
    gaps.push({ id: 'GAP-VERIFY', severity: 'blocking', reason: 'missing verification command' });
  }
  if (!sectionExists(sourceText, 'Phase Execution Metadata') && !sectionExists(sourceText, 'Preconditions and Inputs')) {
    gaps.push({ id: 'GAP-BROWNFIELD', severity: 'assumption', reason: 'missing brownfield readiness context' });
  }
  for (const term of vagueTerms) {
    gaps.push({ id: `GAP-ADJECTIVE-${sanitizeSlug(term).toUpperCase()}`, severity: 'assumption', reason: `unverifiable adjective '${term}' requires measurable evidence` });
  }

  return gaps;
}

function boundedScore(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function calculateReadinessAssessment(sourceText, verificationCommands, acceptanceCriteria) {
  const gaps = detectSourceGaps(sourceText, verificationCommands, acceptanceCriteria);
  const blockingGaps = gaps.filter((gap) => gap.severity === 'blocking').length;
  const assumptionGaps = gaps.filter((gap) => gap.severity === 'assumption').length;
  const scopeText = extractMarkdownSection(sourceText, 'Scope');
  const goalClarity = sectionExists(sourceText, 'Goal') ? 1 : 0;
  const scopeClarity = sectionExists(sourceText, 'Scope')
    ? (/out of scope|non-goals?|excluded scope/i.test(scopeText) ? 1 : 0.7)
    : 0;
  const acceptanceCriteriaClarity = acceptanceCriteria.length > 0
    ? (gaps.some((gap) => gap.id === 'GAP-AMBIGUOUS-AC') ? 0.7 : 1)
    : 0;
  const verificationClarity = verificationCommands.length > 0 ? 1 : 0;
  const clarityScore = boundedScore((goalClarity + scopeClarity + acceptanceCriteriaClarity + verificationClarity) / 4);
  const ambiguityScore = boundedScore(1 - clarityScore + (blockingGaps * 0.15) + (assumptionGaps * 0.05));
  const readinessDecision = ambiguityScore <= 0.20
    ? 'executable'
    : (ambiguityScore <= 0.35 ? 'constrained_with_assumptions' : 'blocked');

  return {
    goalClarity,
    scopeClarity,
    acceptanceCriteriaClarity,
    verificationClarity,
    clarityScore,
    ambiguityScore,
    readinessDecision,
    gaps,
  };
}

export function extractAtomicTasksFromPhaseDoc(phaseDoc) {
  const sourceText = phaseDoc && fs.existsSync(phaseDoc) ? fs.readFileSync(phaseDoc, 'utf8') : '';
  const detailedTasks = extractMarkdownSection(sourceText, 'Detailed Tasks');
  const defaultOwnedPaths = extractPhaseOwnedPaths(sourceText);
  const defaultVerificationCommands = extractPhaseVerificationCommands(sourceText);
  const acceptanceCriteria = extractAcceptanceCriteriaFromSource(sourceText);
  const linkedRequirementIds = extractLinkedRequirementIdsFromSource(sourceText);
  const tasks = [];
  let inCodeFence = false;

  for (const rawLine of detailedTasks.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || !line) {
      continue;
    }

    const checkbox = line.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
    const numbered = line.match(/^[0-9]+[.)]\s+(.+)$/);
    const match = checkbox || numbered;
    if (!match) {
      continue;
    }
    const title = match[1].replace(/\s+/g, ' ').trim();
    if (!title || title.toLowerCase().startsWith('not found') || title.toLowerCase().startsWith('empty')) {
      continue;
    }
    const acceptanceCriterion = buildTaskAcceptanceLink(tasks.length, acceptanceCriteria);
    tasks.push({
      id: `AT-${String(tasks.length + 1).padStart(2, '0')}`,
      title,
      status: 'pending',
      taskStatus: 'pending',
      acceptanceCriterionId: acceptanceCriterion?.id || '',
      parentAcceptanceCriterionId: '',
      linkedRequirementIds,
      acVerdict: acceptanceCriterion ? 'pending' : 'not_applicable',
      verificationEvidence: [],
      semanticEvaluation: {
        status: 'not_run',
        reason: 'out_of_scope_for_phase_03',
      },
      ownedPaths: defaultOwnedPaths,
      verificationCommands: defaultVerificationCommands,
      evidence: [],
      completedAt: null,
    });
  }

  if (tasks.length === 0) {
    const acceptanceCriterion = buildTaskAcceptanceLink(0, acceptanceCriteria);
    tasks.push({
      id: 'AT-01',
      title: 'Complete the source phase scope',
      status: 'pending',
      taskStatus: 'pending',
      acceptanceCriterionId: acceptanceCriterion?.id || '',
      parentAcceptanceCriterionId: '',
      linkedRequirementIds,
      acVerdict: acceptanceCriterion ? 'pending' : 'not_applicable',
      verificationEvidence: [],
      semanticEvaluation: {
        status: 'not_run',
        reason: 'out_of_scope_for_phase_03',
      },
      ownedPaths: defaultOwnedPaths,
      verificationCommands: defaultVerificationCommands,
      evidence: [],
      completedAt: null,
    });
  }

  return tasks;
}

export function renderAtomicWorksetsYaml(phasePrefix, phaseDoc) {
  const tasks = extractAtomicTasksFromPhaseDoc(phaseDoc);
  const lines = [
    `# Phase ${phasePrefix} atomic task ledger and optional worktree worksets.`,
    '# Execute only activeAtomicTask in each attempt. Keep worksets empty unless non-overlapping ownedPaths are explicitly defined.',
    'schemaVersion: 1',
    `activeAtomicTask: ${tasks[0]?.id || 'AT-01'}`,
    'atomicTasks:',
  ];

  for (const task of tasks) {
    const ownedPaths = task.ownedPaths || [];
    const verificationCommands = task.verificationCommands || [];
    const linkedRequirementIds = task.linkedRequirementIds || [];
    lines.push(
      `  - id: ${task.id}`,
      `    title: ${yamlScalar(task.title)}`,
      '    status: pending',
      `    taskStatus: ${yamlScalar(task.taskStatus || 'pending')}`,
    );
    if (task.acceptanceCriterionId) {
      lines.push(`    acceptanceCriterionId: ${yamlScalar(task.acceptanceCriterionId)}`);
    }
    if (task.parentAcceptanceCriterionId) {
      lines.push(`    parentAcceptanceCriterionId: ${yamlScalar(task.parentAcceptanceCriterionId)}`);
    }
    if (linkedRequirementIds.length > 0) {
      lines.push('    linkedRequirementIds:', ...linkedRequirementIds.map((id) => `      - ${yamlScalar(id)}`));
    } else {
      lines.push('    linkedRequirementIds: []');
    }
    lines.push(`    acVerdict: ${yamlScalar(task.acVerdict || 'not_applicable')}`);
    lines.push('    verificationEvidence: []');
    lines.push('    semanticEvaluation:');
    lines.push(`      status: ${yamlScalar(task.semanticEvaluation?.status || 'not_run')}`);
    lines.push(`      reason: ${yamlScalar(task.semanticEvaluation?.reason || 'out_of_scope_for_phase_03')}`);
    if (ownedPaths.length > 0) {
      lines.push('    ownedPaths:', ...ownedPaths.map((ownedPath) => `      - ${yamlScalar(ownedPath)}`));
    } else {
      lines.push('    ownedPaths: []');
    }
    if (verificationCommands.length > 0) {
      lines.push('    verificationCommands:', ...verificationCommands.map((command) => `      - ${yamlScalar(command)}`));
    } else {
      lines.push('    verificationCommands: []');
    }
    lines.push(
      '    evidence: []',
      '    completedAt: null',
    );
  }

  lines.push('worksets: []', '');
  return lines.join('\n');
}

function indentBlock(text) {
  return String(text || '').split(/\r?\n/).map((line) => `  ${line}`).join('\n');
}

function renderSourcePlanSnapshot(phaseDoc) {
  const sourceText = phaseDoc && fs.existsSync(phaseDoc) ? fs.readFileSync(phaseDoc, 'utf8') : '';
  if (!sourceText) {
    return `- Source phase doc: ${phaseDoc || 'missing'}
- Snapshot status: missing source phase document; completion must remain blocked until this is resolved.`;
  }

  return `- Source phase doc: ${phaseDoc}
- Goal:
${indentBlock(extractMarkdownSection(sourceText, 'Goal'))}
- Expected outcome:
${indentBlock(extractMarkdownSection(sourceText, 'Expected Outcome'))}
- Scope:
${indentBlock(extractMarkdownSection(sourceText, 'Scope'))}
- Detailed tasks:
${indentBlock(extractMarkdownSection(sourceText, 'Detailed Tasks'))}
- Exact execution targets:
${indentBlock(extractMarkdownSection(sourceText, 'Exact Execution Targets'))}
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.`;
}

function renderGoalContract({ phasePrefix, phaseTitle, phaseDoc, masterPlan, executionRoot, phaseExecutionDir, phaseSlug }) {
  const sourceText = phaseDoc && fs.existsSync(phaseDoc) ? fs.readFileSync(phaseDoc, 'utf8') : '';
  const ownedPaths = extractPhaseOwnedPaths(sourceText);
  const goal = extractMarkdownSection(sourceText, 'Goal')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)[0] || phaseTitle;
  const scope = [];
  const nonGoals = [];
  let scopeMode = '';
  for (const rawLine of extractMarkdownSection(sourceText, 'Scope').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^-\s*In scope:/i.test(line)) {
      scopeMode = 'scope';
      continue;
    }
    if (/^-\s*Out of scope:/i.test(line)) {
      scopeMode = 'nonGoals';
      continue;
    }
    if (!line.startsWith('- ')) {
      continue;
    }
    if (scopeMode === 'scope') {
      scope.push(line.replace(/^-\s*/, ''));
    } else if (scopeMode === 'nonGoals') {
      nonGoals.push(line.replace(/^-\s*/, ''));
    }
  }
  const verificationCommands = extractPhaseVerificationCommands(sourceText);
  const acceptanceCriteria = extractAcceptanceCriteriaFromSource(sourceText);
  const readinessAssessment = calculateReadinessAssessment(sourceText, verificationCommands, acceptanceCriteria);
  const snapshotId = `goal-contract-${phasePrefix}-${phaseSlug || sanitizeSlug(phaseTitle) || 'phase'}`;
  const criteriaLines = acceptanceCriteria.length > 0
    ? acceptanceCriteria.flatMap((criterion) => [
      `  - id: ${yamlScalar(criterion.id)}`,
      `    statement: ${yamlScalar(criterion.statement)}`,
      `    source: ${yamlScalar(criterion.source)}`,
      '    evidence: "QA_REPORT.md and verifier output"',
    ])
    : [
      '  - id: "AC-001"',
      '    statement: "Goal Contract exists with snapshot id and provenance."',
      '    source: "fallback"',
      '    evidence: "GOAL_CONTRACT.yaml"',
    ];
  const gapLines = readinessAssessment.gaps.length > 0
    ? readinessAssessment.gaps.flatMap((gap) => [
      `  - id: ${yamlScalar(gap.id)}`,
      `    severity: ${yamlScalar(gap.severity)}`,
      `    reason: ${yamlScalar(gap.reason)}`,
    ])
    : ['  - id: "GAP-NONE"', '    severity: "none"', '    reason: "No PRD/SPEC readiness gaps detected."'];

  return [
    'schemaVersion: 1',
    `snapshotId: ${yamlScalar(snapshotId)}`,
    `objective: ${yamlScalar(goal)}`,
    'readinessAssessment:',
    `  goalClarity: ${readinessAssessment.goalClarity}`,
    `  scopeClarity: ${readinessAssessment.scopeClarity}`,
    `  acceptanceCriteriaClarity: ${readinessAssessment.acceptanceCriteriaClarity}`,
    `  verificationClarity: ${readinessAssessment.verificationClarity}`,
    `  clarityScore: ${readinessAssessment.clarityScore}`,
    `  ambiguityScore: ${readinessAssessment.ambiguityScore}`,
    `  readinessDecision: ${yamlScalar(readinessAssessment.readinessDecision)}`,
    '  thresholds:',
    '    executableMax: 0.20',
    '    constrainedMax: 0.35',
    '    blockedAbove: 0.35',
    '  assumptionRouting:',
    '    nonCriticalGapTarget: "ASSUMPTIONS.md or active phase assumptions ledger"',
    '    coreScopeGapTarget: "BLOCKERS.md or active phase blocker ledger"',
    '  reviewTriggers:',
    '    - "ambiguityScore > 0.35"',
    '    - "readinessDecision == blocked"',
    '    - "product value or brownfield readiness is unclear"',
    'sourceGaps:',
    ...gapLines,
    'scope:',
    ...(scope.length > 0 ? scope.map((item) => `  - ${yamlScalar(item)}`) : ['  - "Complete the in-scope source phase requirements."']),
    'nonGoals:',
    ...(nonGoals.length > 0 ? nonGoals.map((item) => `  - ${yamlScalar(item)}`) : [
      '  - "Full Ouroboros Pydantic Seed runtime"',
      '  - "New public slash commands, skills, or entrypoints"',
      '  - "Semantic evaluation or event ledger implementation"',
    ]),
    'constraints:',
    '  - "Preserve phase-attempt boundaries and stage order."',
    '  - "Keep source plan requirements authoritative unless a user-approved replan is recorded."',
    'acceptanceCriteria:',
    ...criteriaLines,
    'exitConditions:',
    '  - "Goal Contract schema/template/generation/enforcement evidence is verified."',
    '  - "Review, verification verdict, scorecard, and handoff fields agree before clean finish."',
    'brownfieldContext:',
    '  repositoryRoot: "."',
    `  sourcePlanPath: ${yamlScalar(masterPlan)}`,
    `  sourcePhaseDocPath: ${yamlScalar(phaseDoc)}`,
    `  executionRoot: ${yamlScalar(executionRoot)}`,
    '  ownedPaths:',
    ...(ownedPaths.length > 0 ? ownedPaths.map((ownedPath) => `    - ${yamlScalar(ownedPath)}`) : ['    - ".claude/templates/GOAL_CONTRACT.template.yaml"']),
    '  readOnlyPaths: []',
    'provenance:',
    `  createdAt: ${yamlScalar(new Date().toISOString())}`,
    '  createdBy: "moonshot-plan-writer"',
    `  sourceRequest: ${yamlScalar(phaseTitle)}`,
    '  sourceArtifacts:',
    `    - ${yamlScalar(masterPlan)}`,
    `    - ${yamlScalar(phaseDoc)}`,
    `  planPackage: ${yamlScalar(path.dirname(phaseExecutionDir))}`,
    'status: draft',
    '',
  ].join('\n');
}

function materializePhaseCommand(command, options = {}) {
  const planDir = options.planDir || (options.masterPlan ? path.dirname(options.masterPlan) : 'docs/implementation');
  const masterPlan = options.masterPlan || path.join(planDir, '00-master-plan-v1.md');
  const statusFile = options.statusFile || '.claude/docs/phase-status.yaml';

  return String(command || '')
    .replaceAll('${PHASE_STATUS_FILE:-.claude/docs/phase-status.yaml}', statusFile)
    .replaceAll('${PHASE_PLAN_DIR:-docs/implementation}', planDir)
    .replaceAll('${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}', masterPlan);
}

export function renderRequiredVerificationCommands(verificationContractFile, options = {}) {
  if (!verificationContractFile || !fs.existsSync(verificationContractFile)) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  const context = loadVerificationContractContext(verificationContractFile, options);
  if (context.requiredChecks.length === 0) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  return context.requiredChecks.map((check) => {
    const command = materializePhaseCommand(check.command, options);
    return command
      ? `- ${check.name}: \`${command}\``
      : `- ${check.name}: declare the command in ${verificationContractFile}`;
  }).join('\n');
}

const DEMO_FIRST_MATURITY_ORDER = [
  'demo_ready_ui',
  'mock_functional_demo',
  'demo_evidence_capture',
  'user_demo_approval',
  'real_functional',
  'real_functional_verification',
  'production_hardening',
];

function readFileIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function extractYamlScalar(text, key) {
  const match = String(text || '').match(new RegExp(`^\\s*${key}:\\s*["']?([^"'\n#]+)`, 'mi'));
  return match ? match[1].trim() : '';
}

function slugifySliceId(value) {
  return String(value || 'mvp-slice')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mvp-slice';
}

function inferMaturityTarget(phaseTitle, phaseDocText) {
  const explicit = extractYamlScalar(phaseDocText, 'maturityTarget');
  if (DEMO_FIRST_MATURITY_ORDER.includes(explicit)) {
    return explicit;
  }

  const lowered = `${phaseTitle}\n${phaseDocText}`.toLowerCase();
  if (lowered.includes('real functional verification')) return 'real_functional_verification';
  if (lowered.includes('mock functional demo')) return 'mock_functional_demo';
  if (lowered.includes('demo evidence capture')) return 'demo_evidence_capture';
  if (lowered.includes('user demo approval')) return 'user_demo_approval';
  if (lowered.includes('demo ready ui')) return 'demo_ready_ui';
  if (lowered.includes('real functional')) return 'real_functional';
  if (lowered.includes('production hardening')) return 'production_hardening';
  return '';
}

function detectDemoFirstMethodology(phaseTitle, phaseDoc) {
  const phaseDocText = readFileIfExists(phaseDoc);
  const haystack = `${phaseTitle}\n${phaseDocText}`.toLowerCase();
  const enabled = /profile:\s*["']?demo_first["']?/i.test(phaseDocText)
    || haystack.includes('demo-first')
    || haystack.includes('user_demo_approval')
    || haystack.includes('mock functional demo');
  const maturityTarget = inferMaturityTarget(phaseTitle, phaseDocText);
  const sliceId = extractYamlScalar(phaseDocText, 'sliceId') || slugifySliceId(phaseTitle.replace(/\s+-\s+.*$/, ''));

  return {
    enabled,
    profile: enabled ? 'demo_first' : 'none',
    sliceId,
    maturityTarget: enabled ? (maturityTarget || 'demo_ready_ui') : 'none',
    approvalSource: extractYamlScalar(phaseDocText, 'approvalSource') || 'docs/implementation/USER_DEMO_APPROVAL.md',
    evidenceSource: extractYamlScalar(phaseDocText, 'evidenceSource') || 'docs/implementation/DEMO_EVIDENCE.md',
    mockContractSource: extractYamlScalar(phaseDocText, 'mockContractSource') || 'docs/implementation/MOCK_API_CONTRACT.md',
  };
}

function renderDemoFirstSprintSection(demoFirst) {
  if (!demoFirst.enabled) {
    return `## Demo-first MVP Gate
- Applies: no
`;
  }

  const productionAllowed = ['real_functional', 'real_functional_verification', 'production_hardening'].includes(demoFirst.maturityTarget)
    ? 'yes'
    : 'no';
  return `## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Slice ID: ${demoFirst.sliceId}
- Maturity target: ${demoFirst.maturityTarget}
- Approval source: ${demoFirst.approvalSource}
- Evidence source: ${demoFirst.evidenceSource}
- Mock contract source: ${demoFirst.mockContractSource}
- Demo gate mode: hard_stop
- Backend production code allowed: ${productionAllowed}

### Pre-approval allowed
- mock API contract
- typed request/response interface
- fixture schema
- mock handler
- in-memory state
- localStorage-based demo persistence
- browser/user-flow demo evidence

### Pre-approval blocked
- production DB migration
- irreversible schema decision
- real auth provider integration
- production background job
- production payment workflow
- real persistence closeout

### Approval contract
- Real Functional phases require \`${demoFirst.approvalSource}\` with \`approval: approved\` and non-empty approved scope.
- Approved route, primary CTA, flow order, mock response shape, or approved state removal requires \`UI_CHANGE_REQUEST.md\`, approval invalidation, refreshed demo evidence, and user reapproval.
`;
}

function renderDemoFirstQaSection(demoFirst) {
  if (!demoFirst.enabled) {
    return `## Demo-first MVP Evidence
- Applies: no
`;
  }

  return `## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Slice ID: ${demoFirst.sliceId}
- Maturity target: ${demoFirst.maturityTarget}
- Demo run command:
- Tested routes:
- Tested flows:
- Mock success path: pending
- Mock error path: pending
- Browser/user-flow evidence: pending
- Demo evidence source: ${demoFirst.evidenceSource}
- User approval source: ${demoFirst.approvalSource}
- User approval status: pending
- Approved scope present: no
- Mock contract source: ${demoFirst.mockContractSource}
- Contract parity: pending
- Evidence mode: pending
- Mock-only evidence: no
- UI change request source: docs/implementation/UI_CHANGE_REQUEST.md
- UI approval invalidated: no
`;
}

function renderScorecard({
  phasePrefix,
  phaseTitle,
  targetCompletionScore,
  phaseQaReport,
  phaseDoc,
  executionRoot,
  scorecardProfile,
}) {
  if (fs.existsSync('.claude/scripts/render-scorecard.py')) {
    const result = spawnSync('python3', [
      '.claude/scripts/render-scorecard.py',
      '--phase-prefix', phasePrefix,
      '--phase-title', phaseTitle,
      '--target-score', String(targetCompletionScore),
      '--qa-report', phaseQaReport,
      '--profile', scorecardProfile,
      '--phase-doc', phaseDoc,
      '--requirements-file', `${executionRoot}/REQUIREMENTS_TRACEABILITY.md`,
      '--scenario-file', `${executionRoot}/SCENARIO_MATRIX.md`,
    ], { encoding: 'utf8' });

    if (!result.error && (result.status ?? 0) === 0 && result.stdout) {
      return result.stdout;
    }
  }

  return `# Phase ${phasePrefix} Scorecard

> Objective completion score for phase ${phasePrefix}. Update after every meaningful implementation or verification round.
> Preset profile: generic (fallback)
> Profile selection: fallback:no-renderer
> Coverage rebalance: counts:absent

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-CONFORM | Source phase plan conformance verified | 20 | pending | ${phaseQaReport} | Source snapshot, exact targets, and approved deviations |
| OBJ-REQ | In-scope requirements covered | 25 | pending | ${phaseQaReport} | REQ-* coverage |
| OBJ-SCN | Critical scenarios evidenced | 25 | pending | ${phaseQaReport} | SCN-* runtime or E2E evidence |
| OBJ-VER | Required verification commands passed | 20 | pending | ${phaseQaReport} | Fresh contract-backed evidence |
| OBJ-CLOSE | Review and finish closeout recorded | 10 | pending | ${phaseQaReport} | Review + finish evidence present |

## Score Summary
- Current score: 0
- Target score: ${targetCompletionScore}
- Unmet checklist items: 5
- Blocking defects: 0
- Verdict: retry

## Loop Policy
- \`done\` requires Current score >= Target score
- \`done\` requires OBJ-CONFORM = pass
- \`done\` requires Unmet checklist items = 0
- \`done\` requires Blocking defects = 0
- \`blocked\` means environment, contract, or dependency prevents progress
- Blocking defects are phase-local only: the issue must prevent this phase's source-plan scope, required verifier, or active atomic tasks from completing.
- Future phases still pending, \`verify-phase-runner-boundary.sh\` actionable-phase output, or outer-loop continuation state is not a phase-local blocking defect.
- Repository-wide hygiene failures such as \`knowledge-repo-audit\` or \`workflow-enforcement verify\` are blocking defects only when this phase owns or worsened the failing surface; otherwise record them as carried-forward warnings in QA_REPORT.md/HANDOFF.md.
- \`retry\` means continue the active phase only
`;
}

export function ensureExecutionArtifacts(config) {
  const {
    phaseNum,
    phaseTitle,
    phaseDoc,
    masterPlan,
    executionRoot,
    verificationContractFile,
    targetCompletionScore,
    scorecardProfile,
    workspaceRoot = process.cwd(),
    requestedRuntime = 'auto',
    verificationRuntimes = 'auto',
    currentRuntime = '',
  } = config;
  const paths = assignExecutionArtifactPaths(phaseNum, phaseTitle, executionRoot);
  const requiredCommands = renderRequiredVerificationCommands(verificationContractFile, {
    requestedRuntime,
    verificationRuntimes,
    currentRuntime,
    planDir: path.dirname(masterPlan),
    masterPlan,
  });
  const modelEffortProfile = resolveEffortProfile(
    process.env.PHASE_DISPATCH_EFFORT_PROFILE,
    process.env.MOONSHOT_EFFORT_PROFILE,
    'standard',
  );
  const effortEscalationReason = resolveEffortEscalationReason({
    profile: modelEffortProfile,
    explicitReason: process.env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON
      ?? process.env.MOONSHOT_EFFORT_ESCALATION_REASON,
  });
  const retrievalBudget = 'stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output';
  const validationProfile = 'workflow_core';
  const phaseReplayPolicy = 'preserve assistant phase commentary/final_answer when replaying; never add phase to user items';
  const demoFirst = detectDemoFirstMethodology(phaseTitle, phaseDoc);
  const modelRoute = resolveModelRoute({
    runtime: currentRuntime || requestedRuntime || 'auto',
    stage: process.env.PHASE_MODEL_STAGE || 'phase_implementation',
    profile: modelEffortProfile,
  });

  fs.mkdirSync(paths.phaseExecutionDir, { recursive: true });

  if (!fs.existsSync(paths.phaseSprintContract)) {
    const sprint = `# Phase ${paths.phasePrefix} Sprint Contract

> Seeded automatically by \`agent-loop.mjs\`. Refresh before code changes.

## Slice
- Phase: ${phaseNum}
- Title: ${phaseTitle}
- Source plan: ${masterPlan}
- Source phase doc: ${phaseDoc}

## Goal
- Fill before code changes with the user-visible outcome for this round.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

${renderDemoFirstSprintSection(demoFirst)}

## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
${renderSourcePlanSnapshot(phaseDoc)}

## Goal Contract Baseline
- Goal contract path: ${paths.phaseGoalContract}
- Goal contract snapshot id: goal-contract-${paths.phasePrefix}-${paths.phaseSlug}
- Provenance source artifacts: ${masterPlan}, ${phaseDoc}

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Fill before code changes.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Harness Selection
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: phase work uses the full cross-runtime harness by default.
- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract.
- Model effort profile: ${modelEffortProfile}
- Effort escalation reason: ${effortEscalationReason}
- Selected model provider: ${modelRoute.provider}
- Selected model: ${modelRoute.model || 'runtime-default'}
- Selected model effort: ${modelRoute.effort || 'runtime-default'}
- Model selection reason: ${modelRoute.selectionReason}
- Retrieval budget: ${retrievalBudget}
- Validation profile: ${validationProfile}
- Phase replay policy: ${phaseReplayPolicy}

## Planned Changes
- Files/modules:
- Interfaces/contracts:

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Define before implementation. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: ${activeWorkspaceContract(workspaceRoot)}
- Verification contract: ${verificationContractFile}
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase ${paths.phasePrefix}, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: ${currentRuntime || requestedRuntime || 'auto'}
- Verification runtime target: ${verificationRuntimes || 'auto'}

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Evaluator Focus
- Core flow:
- Edge cases:
- Stub-only behavior to reject:

## Evidence
### Required Verification Commands
${requiredCommands}

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- Goal contract: ${paths.phaseGoalContract}
- QA report: ${paths.phaseQaReport}
- Handoff: ${paths.phaseHandoff}
- Scorecard: ${paths.phaseScorecard}
- Worksets: ${paths.phaseWorksets}

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run \`.claude/scripts/verify-plan-conformance.mjs\` before clean finish. Unapproved plan deviations force \`retry_loop\`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: ${targetCompletionScore}

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
`;
    fs.writeFileSync(paths.phaseSprintContract, `${sprint}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.phaseGoalContract)) {
    fs.writeFileSync(paths.phaseGoalContract, renderGoalContract({
      phasePrefix: paths.phasePrefix,
      phaseTitle,
      phaseDoc,
      masterPlan,
      executionRoot,
      phaseExecutionDir: paths.phaseExecutionDir,
      phaseSlug: paths.phaseSlug,
    }), 'utf8');
  }

  if (!fs.existsSync(paths.phaseQaReport)) {
    const qa = `# Phase ${paths.phasePrefix} QA Report

> Updated by verifier/runtime steps. Seeded automatically by \`agent-loop.mjs\`.

## Slice
- Phase: ${phaseNum}
- Title: ${phaseTitle}
- Contract: ${paths.phaseSprintContract}

## Verdict
- Status: pending
- Summary: Awaiting implementation and verification.
- Scope status: partial
- Next path: retry_loop
- Closeout reason: verification_failed

## Review Checkpoint
- Review completed: no
- Review owners: codex-review-code
- Review-driven code changes:

## Contract Review Evidence
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: pending
- Round fail conditions: missing contract review or runtime evidence plan keeps this phase in retry_loop
- Contract revision required: no

${renderDemoFirstQaSection(demoFirst)}

## Failure Loop
- Retry strategy: same_direction_refine
- Delta hypothesis: first attempt pending
- Repeated failure policy: if the same failure class repeats twice, choose partial_redesign or stop_and_handoff before another attempt

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
|  | pending |  |

## Plan Conformance Review
| Plan Item | Required | Actual | Result | Required Action |
|-----------|----------|--------|--------|-----------------|
| Source plan snapshot preserved | Source phase doc requirements remain authoritative in SPRINT_CONTRACT.md | pending | pending | Compare source phase doc before closeout |
| Exact execution targets satisfied | Required files, dependencies, and expected signals are implemented or user-approved replan exists | pending | pending | Run \`.claude/scripts/verify-plan-conformance.mjs\` |
| Spec deviation ledger clean | No unapproved delete/substitute/defer decisions | pending | pending | Record retry_loop or user-approved-replan |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Runtime Updates
- Seeded at: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
- Verification verdict file: .claude/verification-verdict-phase${paths.phasePrefix}-final.json
- Verification verdict: pending
- Runtime evidence depth: pending
- Critical scenario smoke-only warnings: none

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, completion-verifier
- Skipped skills: codex-review-code (review pending until the first meaningful implementation batch completes), code-simplifier (not evaluated yet), session-logger (clean completion path unless the phase stops without clean completion)
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: phase work uses the full cross-runtime harness by default
- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract
- Model effort profile: ${modelEffortProfile}
- Effort escalation reason: ${effortEscalationReason}
- Selected model provider: ${modelRoute.provider}
- Selected model: ${modelRoute.model || 'runtime-default'}
- Selected model effort: ${modelRoute.effort || 'runtime-default'}
- Model selection reason: ${modelRoute.selectionReason}
- Retrieval budget: ${retrievalBudget}
- Validation profile: ${validationProfile}
- Phase replay policy: ${phaseReplayPolicy}
- Enforcement note: replace defaults when actual execution diverges

## Score Summary
- Current score: 0
- Target score: ${targetCompletionScore}
- Unmet checklist items: 1
- Blocking defects: 0
- Verdict: retry

## Finish Readiness
- Fresh evidence confirmed: no
- Source plan conformance confirmed: no
- Why this round may stop now:
- Remaining in-scope work:
- Remaining blockers before closeout:
- Checks to rerun if code changes again:
`;
    fs.writeFileSync(paths.phaseQaReport, `${qa}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.phaseHandoff)) {
    const handoff = `# Phase ${paths.phasePrefix} Handoff

> Seeded automatically by \`agent-loop.mjs\`. Replace this placeholder when the phase stops or closes cleanly.

## Goal
- ${phaseTitle}
- Current stage: Finish / Handoff

## Status
- Required: pending
- Reason: placeholder handoff seeded before the first stop or clean-finish update

## Resume Trigger
- Why this handoff exists: the phase has not produced a stop-state handoff yet
- Stop reason: blocked
- Why this cannot continue in the current round: no stop-state detail has been recorded yet
- Condition to resume: continue the active phase and overwrite this placeholder with the latest runtime state when needed

## Checks To Rerun
- Review: update when the phase stops without clean completion
- Verification: update when the phase stops without clean completion
- Runtime flow: update when the phase stops without clean completion

## Remaining Scope
- Remaining in-scope work: active phase execution has not completed yet
- Next planned phase or slice: stay on the current phase until closeout is recorded

## Evidence Paths
- Sprint contract: ${paths.phaseSprintContract}
- QA report: ${paths.phaseQaReport}
- Phase doc: ${phaseDoc}
- Scorecard: ${paths.phaseScorecard}

## Workflow Logging
- session-logger: not recorded yet
- Detail: placeholder only
- Selected model provider: ${modelRoute.provider}
- Selected model: ${modelRoute.model || 'runtime-default'}
- Selected model effort: ${modelRoute.effort || 'runtime-default'}
- Model selection reason: ${modelRoute.selectionReason}
`;
    fs.writeFileSync(paths.phaseHandoff, `${handoff}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.phaseScorecard)) {
    fs.writeFileSync(paths.phaseScorecard, renderScorecard({
      phasePrefix: paths.phasePrefix,
      phaseTitle,
      targetCompletionScore,
      phaseQaReport: paths.phaseQaReport,
      phaseDoc,
      executionRoot,
      scorecardProfile: demoFirst.enabled ? 'demo_first' : scorecardProfile,
    }), 'utf8');
  }

  if (!fs.existsSync(paths.phaseWorksets)) {
    fs.writeFileSync(paths.phaseWorksets, renderAtomicWorksetsYaml(paths.phasePrefix, phaseDoc), 'utf8');
  }

  return paths;
}

export function buildPhasePrompt(config) {
  const {
    nextPhase,
    phaseTitle,
    planDir,
    phaseDoc,
    statusFile,
    executionRoot,
    paths,
    runtime,
    targetCompletionScore,
    extraInstructions = '',
    autonomousInstructions = '',
    workspaceRoot = process.cwd(),
    verificationRuntimes = 'auto',
  } = config;

  const demoFirst = detectDemoFirstMethodology(phaseTitle, phaseDoc);
  const failurePreventionBriefSection = buildFailurePreventionBriefSection(
    {
      scope: 'next-run recall',
      phaseNumber: String(nextPhase),
      phaseTitle,
      phaseDocPath: phaseDoc,
      planDir,
      stage: 'execute',
      artifactRefs: [
        phaseDoc,
        paths.phaseSprintContract,
        paths.phaseQaReport,
        paths.phaseHandoff,
        paths.phaseScorecard,
      ],
    },
    {
      cachePath: path.join(workspaceRoot, '.claude/cache/awtl/failed_turn_cases.jsonl'),
    },
  );
  const demoFirstPromptRules = demoFirst.enabled ? `
Demo-first MVP gate rules:
- This phase uses mvpMethodology.profile=demo_first, sliceId=${demoFirst.sliceId}, maturityTarget=${demoFirst.maturityTarget}.
- Read ${demoFirst.approvalSource}, ${demoFirst.evidenceSource}, and ${demoFirst.mockContractSource} when they are relevant to this maturity target.
- Before user demo approval, do not implement production backend, real persistence, auth integration, irreversible migrations, production background jobs, or production payment workflows.
- Mock API contracts, typed fixtures, mock handlers, in-memory state, and localStorage demo persistence are allowed before approval.
- If this maturity target is real_functional or later, require USER_DEMO_APPROVAL.md approval=approved with non-empty approved scope before code changes.
- If Real Functional needs approved route, CTA, flow order, state, or mock response shape changes, write UI_CHANGE_REQUEST.md, invalidate the approval, refresh demo evidence, and stop for reapproval.
- Do not mark Real Functional FULL/done/clean_finish with mock-only evidence. Record contract parity against ${demoFirst.mockContractSource}.
` : '';

  let promptHeader = '/moonshot-orchestrator';
  let codexDirectSteps = '';

  if (runtime === 'codex') {
    promptHeader = `Moonshot orchestrator phase-attempt fallback for Codex
Treat this prompt as the direct equivalent of a /moonshot-orchestrator phase attempt.`;
    codexDirectSteps = `
Codex direct execution checklist:
1. Read only the active phase doc and SPRINT_CONTRACT.md first.
2. Immediately write an attempt-started checkpoint to QA_REPORT.md and SCORECARD.md before broader inspection or long-running commands.
3. Refresh SPRINT_CONTRACT.md for this attempt without broad repo inspection.
4. Read WORKSETS.yaml and execute only activeAtomicTask. Do not execute a second atomic task in the same attempt.
5. Run review and verification in the phase contract order.
6. Use \`.claude/scripts/write-verification-verdict.py\` for structured \`.claude/verification-verdict-*.json\` output in the repository root instead of hand-authoring verdict JSON.
   Include model routing args when available: \`--selected-model-provider\`, \`--selected-model\`, \`--selected-model-effort\`, \`--model-selection-reason\`.
   기본 인자만 넣어도 동작합니다.
   예: \`python3 .claude/scripts/write-verification-verdict.py --output .claude/verification-verdict-phase02-final.json --run-id phase02-final --phase-number 2\`
7. Record the exact repository-root verdict path in QA_REPORT.md as \`- Verification verdict file: .claude/verification-verdict-...\`.
8. For artifact-only closeout changes, use \`.claude/scripts/agent-loop-phase-artifacts.mjs sync-phase-artifacts <structured-state-json-or-path>\` instead of hand-patching QA_REPORT.md, SCORECARD.md, HANDOFF.md, or WORKSETS.yaml.
9. Update QA_REPORT.md with runtime/mode, review state, and verification evidence.
10. Update SCORECARD.md with objective checklist status, score, unmet items, and verdict.
11. Stop only when source plan conformance passes, verification passed or is still fresh, review evidence is recorded, finish-stage closeout is concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`. If any of those are missing, keep the phase open and record the next remediation action instead of treating the checkpoint as a stop boundary.
12. Even when this phase reaches clean completion, do not phrase the result as plan completion or session completion. Return control to the outer loop only.

Do not spend time on extra planning, repo discovery, or alternative verifier selection before step 5.
Edit the artifact files directly with the runtime's file-edit tool. Do not use shell heredocs or inline apply_patch commands for these artifact updates.`;
  }

  return `${promptHeader}
phaseAttemptMode: true
phaseNumber: "${nextPhase}"
phaseTitle: "${phaseTitle}"
planDir: "${planDir}"
activePhaseDocPath: "${phaseDoc}"
phaseStatusFile: "${statusFile}"
executionRoot: "${executionRoot}"
executionArtifacts:
  sprintContractPath: "${paths.phaseSprintContract}"
  qaReportPath: "${paths.phaseQaReport}"
  handoffPath: "${paths.phaseHandoff}"
  scorecardPath: "${paths.phaseScorecard}"
  worksetsPath: "${paths.phaseWorksets}"
  verificationVerdictGlob: ".claude/verification-verdict-*.json"
${failurePreventionBriefSection ? `
${failurePreventionBriefSection.split('\n').map((line) => `  ${line}`).join('\n')}
` : ''}

Diagnostic search budget:
- For CRG/MCP diagnosis, check configured commands or known wrapper paths first, then use command lookup, then bounded \`--version\` or \`status --repo .\` probes.
- Do not recursively search global npm, npx, or user cache paths by default, including \`npm-cache/_npx\`.
- Broad CRG/MCP search is allowed only when \`CRG_DEBUG_BROAD_SEARCH=true\`; it must stay inside the active project root or the resolved CRG/MCP package root.
- Broad search caps: inspect at most 200 files total, stop after 10 seconds wall time, emit at most 80 output lines, then record \`broad_search_timeout\` and do not retry broad search in the same run.

Diff output budget:
- For git evidence, use \`git diff --stat\`, \`git diff --name-only\`, and \`git diff --check\` by default.
- Do not print an unbounded raw \`diff --git\` body into worker logs, retry prompts, QA reports, HANDOFF, or closeout summaries.
- Raw patch context is allowed only when path-limited, capped before model/log emission, and accompanied by a reason.
- Use \`.claude/scripts/token-safe-git.sh raw-diff -- <path>\` for capped raw patch context; it emits at most 200 lines.
- If a timeout log is dominated by raw \`diff --git\` output, classify it as \`raw_diff_output_timeout\` and retry with bounded diff summaries only.

Single isolated phase-attempt rules:
- Treat this run as one isolated phase attempt only.
- This attempt may finish the active phase, but phase completion is never run completion or session completion.
- Before code edits, read "${paths.phaseWorksets}" and resolve exactly one active atomic task:
  - Use activeAtomicTask when it points to a non-completed AT-* entry.
  - If activeAtomicTask is missing or already completed, select the first pending AT-* entry and update activeAtomicTask to that id.
  - Do not work on a second atomic task in the same attempt, even if the first one is small.
- Update the selected atomic task in WORKSETS.yaml:
  - Set status to in_progress when starting.
  - Set status to completed, completedAt, evidence, ownedPaths, and verificationCommands only when that task is actually verified.
  - If the selected atomic task is not complete, leave the phase in_progress and set the attempt outcome to partial or blocked with evidence.
- Phase completion is allowed only when every atomicTasks entry is completed and SCORECARD/QA/verification gates are done.
- If any atomic task remains pending or in_progress, keep phase status in_progress, record lastOutcome partial, and return control for the next attempt.
${demoFirstPromptRules}
- Set signals.phaseAttemptMode = true.
- Set artifacts.activePhaseDocPath = "${phaseDoc}".
- Reuse the provided execution artifact paths.
- Do not invoke moonshot-phase-runner again.
- Do not expand to other phases.
- Read the Policy Anchors section in SPRINT_CONTRACT.md first.
- Treat the Source Plan Requirements Snapshot as binding; do not replace, narrow, or defer source phase requirements without a user-approved replan recorded in Spec Deviation Ledger.
- Preserve the stage order \`ready/isolate -> execute -> review -> verify -> finish/handoff\`.
- Immediately after reading the active phase doc and SPRINT_CONTRACT.md, write an in-progress checkpoint to QA_REPORT.md and SCORECARD.md before broader inspection or long-running commands.
- Before code edits, refresh SPRINT_CONTRACT.md for this phase.
- Record review completion before claiming the verifier state is final.
- Generate fresh structured verification verdicts with \`.claude/scripts/write-verification-verdict.py\` and write them under \`.claude/verification-verdict-*.json\`; do not hand-author verdict JSON.
  Include model routing args when available: \`--selected-model-provider\`, \`--selected-model\`, \`--selected-model-effort\`, \`--model-selection-reason\`.
  기본 인자만 넣어도 동작하도록 스키마를 완화했습니다.
- If a required verifier is blocked by runtime/tool availability, write a blocked verification verdict instead of keeping the phase in blind retry.
- Respect the active verification runtime target: ${verificationRuntimes}.
- Record the exact repository-root verdict path in QA_REPORT.md so the completion gate can confirm the same file.
- Refresh QA_REPORT.md at stage transitions instead of batching every artifact update at the end.
- When verification runs, update QA_REPORT.md.
- Update SCORECARD.md on every meaningful round using objective checklist status, current score, unmet items, and verdict.
- Refresh SCORECARD.md again after verification or any remediation so progress is visible while the phase is still running.
- Refresh the default values in the "Workflow Execution", "Contract Review Evidence", and "Failure Loop" sections of QA_REPORT.md when actual execution diverges.
- Keep Effort escalation reason, selected model provider/model/effort/reason, Retrieval budget, Validation profile, and Phase replay policy current in QA_REPORT.md and analysis workflow evidence.
- If Model effort profile is \`deep\` or \`max\`, record a concrete Effort escalation reason; \`none\` is allowed only for \`economy\` or \`standard\`.
- Preserve assistant-item \`phase\` values when replaying assistant history: \`commentary\` for progress updates and \`final_answer\` only for completed answers. Never add phase metadata to user messages.
- For critical SCN-* scenarios, smoke-only evidence is a warning and cannot justify clean finish; record open -> act -> mutate -> persist -> recover evidence or keep the phase open.
- If the same failure class repeats twice, set Retry strategy to partial_redesign or stop_and_handoff before the next attempt.
- Before any clean-finish claim, run \`.claude/scripts/verify-plan-conformance.mjs\` against the active phase artifacts and record the result in QA_REPORT.md Plan Conformance Review and SCORECARD.md OBJ-CONFORM.
- If implementation differs from the source phase plan, use \`retry_loop\` unless the user explicitly approved a replan and the phase doc or Spec Deviation Ledger records that approval.
- In SCORECARD.md, treat Blocking defects as phase-local only: the defect must block this phase's source-plan scope, required verifier, or active atomic tasks.
- Do not count future phases still pending, \`verify-phase-runner-boundary.sh\` actionable-phase output, or outer-loop continuation state as a phase-local Blocking defect.
- Do not count repository-wide \`knowledge-repo-audit\` or \`workflow-enforcement verify\` failures as phase-local Blocking defects unless this phase owns or worsened the failing surface. Record carried-forward repo-wide hygiene as QA/HANDOFF warning context instead.
- If all phase-local objectives and required phase verifiers pass, SCORECARD.md should use \`Verdict: done\`, \`Current task status: FULL\`, and \`Blocking defects: 0\`; remaining future phases are for the outer loop after this phase closes.
- In QA_REPORT.md, use only these closeout reason codes: \`scope_complete\`, \`verification_failed\`, \`blocked\`, \`interrupted\`, \`context_limit\`, \`user_pause\`, \`deferred_verification\`.
- If QA_REPORT.md uses \`Next path: retry_loop\`, it must also use \`Closeout reason: verification_failed\`.
- In HANDOFF.md, use only these stop reason codes: \`blocked\`, \`interrupted\`, \`context_limit\`, \`user_pause\`, \`deferred_verification\`.
- Never use \`verification_failed\` as a HANDOFF.md stop reason; keep \`verification_failed\` only in QA_REPORT.md Closeout reason and use \`blocked\` or \`deferred_verification\` for the handoff stop reason.
- If meaningful code changed, record \`code-simplifier\` in Applied skills or Skipped skills with a reason.
- If the run stops without clean completion, update HANDOFF.md, include \`session-logger\` evidence, and list the checks to rerun.
- Do not mark the phase done while SCORECARD.md says \`Verdict: retry\` or \`blocked\`.
- Do not mark the phase done while source plan conformance is failing, OBJ-CONFORM is not \`pass\`, or unapproved deviation/deferred scope remains.
- Do not mark the phase done while Current score is below ${targetCompletionScore}, Unmet checklist items > 0, or Blocking defects > 0.
- Do not emit final-answer wording, closeout phrasing, or "all done" style language from this attempt. Return only updated artifacts, verification state, and an attempt-scoped summary.
- If this attempt reaches clean phase completion, return control to the outer loop with the phase marked complete and let the outer loop decide whether another actionable phase remains.

Runtime compatibility fallback:
- If /moonshot-orchestrator is unavailable in this runtime, execute the equivalent phase-attempt workflow directly instead of searching for missing slash skills.
- In fallback mode, use only the active phase doc, SPRINT_CONTRACT.md, QA_REPORT.md, HANDOFF.md, SCORECARD.md, ${activeWorkspaceContract(workspaceRoot)}, .claude/verification.contract.yaml, and .claude/docs/guidelines/long-running-harness.md unless the phase doc explicitly requires more.
- Do not inspect unrelated repository files once the required verification command and artifact updates are clear.
- Do not stop at implementation-complete or verification-complete checkpoints alone.
- Return control only after fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`.
- Return control only after source plan conformance passes, fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`. If any completion gate is still open, keep the active phase in retry with explicit remediation evidence instead of handing off early.${codexDirectSteps}
- Treat "phase complete" as an attempt-local result only. Never use it as proof that the whole plan or user session may end; that decision belongs to the outer loop after re-reading ${statusFile}.

Additional instructions:
${extraInstructions}

${autonomousInstructions}`.trimEnd();
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(writableTempRoot(), 'phase-plan-lib-'));
  try {
    const phaseDoc = path.join(tempDir, '01-fixture.md');
    fs.writeFileSync(phaseDoc, `# Fixture

## Detailed Tasks
- [ ] Define API contract
1. Add service implementation
2. Verify failure path

## Phase Completion Checklist
- [ ] Service contract is linked to acceptance evidence

## Exact Execution Targets
| ID | Files To Modify | Files To Test | Commands |
|----|-----------------|---------------|----------|
| P01-1 | \`src/service.ts\` | \`tests/service.test.ts\` | \`npm test\` |
`, 'utf8');
    const tasks = extractAtomicTasksFromPhaseDoc(phaseDoc);
    if (tasks.length !== 3 || tasks[0].id !== 'AT-01' || tasks[2].title !== 'Verify failure path') {
      throw new Error('failed to extract AT-* tasks from Detailed Tasks');
    }

    const emptyDoc = path.join(tempDir, '02-empty.md');
    fs.writeFileSync(emptyDoc, '# Empty\n\n## Detailed Tasks\nNo explicit list.\n', 'utf8');
    const fallbackTasks = extractAtomicTasksFromPhaseDoc(emptyDoc);
    if (fallbackTasks.length !== 1 || fallbackTasks[0].id !== 'AT-01') {
      throw new Error('failed to create fallback AT-01 task');
    }

    const rendered = renderAtomicWorksetsYaml('01', phaseDoc);
    if (!rendered.includes('schemaVersion: 1') || !rendered.includes('activeAtomicTask: AT-01') || !rendered.includes('id: AT-03')) {
      throw new Error('failed to render atomic WORKSETS.yaml');
    }
    if (!rendered.includes('- "src/service.ts"') || !rendered.includes('- "npm test"')) {
      throw new Error('failed to seed WORKSETS ownedPaths and verificationCommands from phase plan');
    }
    if (
      !rendered.includes('taskStatus: "pending"')
      || !rendered.includes('acVerdict: "pending"')
      || !rendered.includes('verificationEvidence: []')
      || !rendered.includes('semanticEvaluation:')
    ) {
      throw new Error('failed to seed AC-linked WORKSETS fields');
    }

    const clearPhaseDoc = path.join(tempDir, '03-clear.md');
    fs.writeFileSync(clearPhaseDoc, `# Clear

## Goal
- Build a bounded export flow.

## Scope
- In scope:
  - Export selected records.
- Out of scope:
  - Bulk archival.

## Phase Execution Metadata

\`\`\`yaml
phaseExecution:
  schemaVersion: 1
\`\`\`

## Phase Completion Checklist
- [ ] Export returns selected records.
- [ ] Invalid selection returns a validation error.

## Validation Plan
- [ ] \`node --check src/export.mjs\`

## Exact Execution Targets
| ID | Commands |
|----|----------|
| P01 | \`node --check src/export.mjs\` |
`, 'utf8');
    const clearGoalContract = renderGoalContract({
      phasePrefix: '03',
      phaseTitle: 'Clear',
      phaseDoc: clearPhaseDoc,
      masterPlan: path.join(tempDir, '00-master-plan-v1.md'),
      executionRoot: tempDir,
      phaseExecutionDir: path.join(tempDir, 'execution/03-clear'),
      phaseSlug: 'clear',
    });
    if (!clearGoalContract.includes('readinessAssessment:') || !clearGoalContract.includes('ambiguityScore: 0')) {
      throw new Error('failed to render executable readiness assessment');
    }
    if (!clearGoalContract.includes('id: "AC-001"') || !clearGoalContract.includes('source: "Phase Completion Checklist"')) {
      throw new Error('failed to render stable AC ids with source mapping');
    }

    const ambiguousPhaseDoc = path.join(tempDir, '04-ambiguous.md');
    fs.writeFileSync(ambiguousPhaseDoc, `# Ambiguous

## Goal
- Make the experience polished and intuitive.

## Scope
- In scope:
  - Improve it.
`, 'utf8');
    const ambiguousGoalContract = renderGoalContract({
      phasePrefix: '04',
      phaseTitle: 'Ambiguous',
      phaseDoc: ambiguousPhaseDoc,
      masterPlan: path.join(tempDir, '00-master-plan-v1.md'),
      executionRoot: tempDir,
      phaseExecutionDir: path.join(tempDir, 'execution/04-ambiguous'),
      phaseSlug: 'ambiguous',
    });
    if (!ambiguousGoalContract.includes('readinessDecision: "blocked"')) {
      throw new Error('failed to block ambiguous source docs');
    }
    if (!ambiguousGoalContract.includes('GAP-VERIFY') || !ambiguousGoalContract.includes('GAP-AC')) {
      throw new Error('failed to record PRD/SPEC gap detection evidence');
    }

    writeStdoutLine('agent-loop-phase-plan-lib self-test passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') {
    runSelfTest();
  } else {
    writeStdoutLine('Usage: agent-loop-phase-plan-lib.mjs self-test');
    process.exit(64);
  }
}
