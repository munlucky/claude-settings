#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDemoFirstGate } from './demo-first-gate-lib.mjs';
import { evaluatePathAuthority } from './lib/path-authority.mjs';
import {
  classifyHarnessViolation,
  evaluateHarnessStateInvariants,
  isFailedWorkflowState,
} from './lib/harness-state-invariants.mjs';
import {
  evaluateCompletedWorksets,
  executionRootFromPhaseArtifact,
  hasConcreteSourceTargets,
  scenarioEvidencePassed,
  scorecardDone,
  mergeStructuredEvidenceMetadata,
  traceabilityArtifactValid,
  structuredEvidenceFromMarkdown,
  structuredEvidenceFromPayload,
  structuredLocalBlockerUnresolved,
  structuredScenarioEvidencePassed,
  structuredTraceabilityValid,
  unresolvedLocalBlocker,
} from './lib/phase-closeout-artifacts.mjs';
import {
  normalize,
  parseCriticalScenarios,
  parseMasterChecklist,
  parsePhaseStatusDocument,
  parseWorksetsYaml,
  readText,
  resolvePath,
  sectionText,
} from './lib/phase-closeout-parsers.mjs';
import {
  readVerdictForPhase,
  verdictInternallyConsistent,
  verdictPassed,
} from './lib/phase-closeout-verdict.mjs';
import {
  comparePhaseReplayToReadModel,
  defaultPhaseEventLedgerPath,
} from './lib/phase-event-ledger.mjs';

const FUTURE_TIMESTAMP_TOLERANCE_MS = 5000;
const SEMANTIC_TRIGGER_TERMS = [
  'ac ambiguity',
  'scope drift',
  'architecture risk',
  'security risk',
  'auth risk',
  'payment risk',
  'repeated failure',
  'user value unclear',
];
const CONSENSUS_TRIGGER_TERMS = [
  'contract reinterpretation',
  'high-risk security',
  'high-risk architecture',
  'evaluator disagreement',
];

function usage() {
  return [
    'Usage:',
    '  verify-phase-closeout.mjs self-test',
    '  verify-phase-closeout.mjs --plan-dir <path> --master-plan <path> --status-file <path> [--json]',
    '',
    'Options:',
    '  --plan-dir <path>      Active plan directory.',
    '  --master-plan <path>   Required master plan path; default fallback is disabled.',
    '  --status-file <path>   Phase status YAML path.',
    '  --json                 Print JSON result.',
    '  --help, -h             Show this help.',
  ].join('\n');
}

function parseArgs(argv) {
  const result = {};
  const args = [...argv];
  if (args[0] === 'self-test') {
    return { selfTest: true };
  }
  if (args[0] === '--help' || args[0] === '-h') {
    return { help: true };
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--status-file':
        result.statusFile = args.shift() || '';
        break;
      case '--plan-dir':
        result.planDir = args.shift() || '';
        break;
      case '--master-plan':
        result.masterPlan = args.shift() || '';
        result.masterPlanProvided = true;
        break;
      case '--workflow-dir':
        result.workflowDir = args.shift() || '';
        break;
      case '--session-file':
        result.sessionFile = args.shift() || '';
        break;
      case '--session-dir':
        result.sessionDir = args.shift() || '';
        break;
      case '--now':
        result.now = args.shift() || '';
        break;
      case '--json':
        result.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function addViolation(violations, code, message, phaseNumber = null) {
  violations.push({ code, message, phaseNumber, failureClass: classifyHarnessViolation(code) });
}

function extractBulletValue(text, heading, label) {
  const lines = text.split(/\r?\n/);
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

function hasSection(text, heading) {
  return text.split(/\r?\n/).some((line) => line.trim() === heading);
}

function addEvaluationTriggerViolations(violations, text, phaseNumber) {
  const normalized = text.toLowerCase();
  const skippedMechanical = extractBulletValue(text, '## Evaluation Trigger Evidence', 'Skipped mechanical checks')
    || extractBulletValue(text, '## Runtime Updates', 'Skipped mechanical checks');
  const validationProfile = extractBulletValue(text, '## Workflow Execution', 'Validation profile').toLowerCase();
  const mechanicalFailed = /mechanical (checks?|gate|verification)\s*:\s*(failed|fail|blocked)/i.test(text);
  const semanticCleanPass = /semantic evaluation\s*:\s*(pass|passed|clean_pass|clean pass)/i.test(text);
  const consensusCleanPass = /consensus evaluation\s*:\s*(pass|passed|clean_pass|clean pass)/i.test(text);

  if (!hasSection(text, '## Evaluation Trigger Evidence')) {
    addViolation(violations, 'evaluation-trigger-evidence-missing', `Completed phase ${phaseNumber} is missing Evaluation Trigger Evidence.`, phaseNumber);
    return;
  }
  for (const term of SEMANTIC_TRIGGER_TERMS) {
    if (!normalized.includes(term)) {
      addViolation(violations, 'semantic-trigger-missing', `Completed phase ${phaseNumber} is missing semantic trigger '${term}'.`, phaseNumber);
    }
  }
  for (const term of CONSENSUS_TRIGGER_TERMS) {
    if (!normalized.includes(term)) {
      addViolation(violations, 'consensus-trigger-missing', `Completed phase ${phaseNumber} is missing consensus trigger '${term}'.`, phaseNumber);
    }
  }
  if (mechanicalFailed && (semanticCleanPass || consensusCleanPass)) {
    addViolation(violations, 'mechanical-first-gate-bypassed', `Completed phase ${phaseNumber} allows semantic/consensus pass to override mechanical failure.`, phaseNumber);
  }
  if (validationProfile && !['prompt_only', 'docs_only'].includes(validationProfile)) {
    const normalizedSkips = skippedMechanical.trim().toLowerCase();
    if (normalizedSkips && !['none', 'no', 'n/a', '[]'].includes(normalizedSkips)) {
      addViolation(violations, 'mechanical-skip-policy-blocking', `Completed phase ${phaseNumber} has skipped mechanical checks under ${validationProfile}.`, phaseNumber);
    }
  }
  if (/verification override\s*:\s*(unknown|untrusted|not_allowed|blocked)/i.test(text)) {
    addViolation(violations, 'verification-override-not-allowlisted', `Completed phase ${phaseNumber} has a non-allowlisted verification override.`, phaseNumber);
  }
  if (
    /qa backend matrix/i.test(text)
    && /(browser|a11y|visual|performance)[^\n]*\b(required|mandatory)\b[^\n]*\b(missing|unavailable|blocked)\b/i.test(text)
  ) {
    addViolation(violations, 'qa-backend-required-missing', `Completed phase ${phaseNumber} is missing required QA backend evidence.`, phaseNumber);
  }
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function hasEnvironmentBlockerPayload(statusText) {
  const text = normalize(statusText);
  return /^environmentBlockers:\s*$/m.test(text)
    && /^\s+-\s+check:\s*\S+/m.test(text)
    && /^\s+reason:\s*\S+/m.test(text)
    && /^\s+evidencePath:\s*\S+/m.test(text)
    && /^\s+observedAt:\s*\S+/m.test(text);
}

function normalizeCloseoutPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function isHarnessChangePath(filePath) {
  const normalized = normalizeCloseoutPath(filePath);
  return normalized.startsWith('.claude/scripts/')
    || normalized.startsWith('.claude/skills/')
    || normalized === '.claude/verification.contract.yaml';
}

function hasNonEmptyHarnessChangeLedger(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const section = sectionText(readText(filePath), 'Harness Change Ledger');
  if (!section) {
    return false;
  }
  return section.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^```/.test(trimmed)) {
      return false;
    }
    if (/^\|?\s*-{2,}/.test(trimmed) || /\|\s*Change Area\s*\|/i.test(trimmed)) {
      return false;
    }
    return /^\|.+\|$/.test(trimmed) || /^[-*]\s+\S/.test(trimmed);
  });
}

function harnessChangeLedgerPresent(planDir) {
  return [
    path.resolve(process.cwd(), 'QA_REPORT.md'),
    planDir ? path.join(planDir, 'QA_REPORT.md') : '',
  ].some((candidate) => hasNonEmptyHarnessChangeLedger(candidate));
}

function collectHarnessChangedPaths({ phaseExecutionDir, verdictPayload = {} } = {}) {
  const changed = new Set();
  const worksetsPath = phaseExecutionDir ? path.join(phaseExecutionDir, 'WORKSETS.yaml') : '';
  const worksets = parseWorksetsYaml(worksetsPath);
  for (const task of worksets.tasks || []) {
    for (const ownedPath of task.ownedPaths || []) {
      const normalized = normalizeCloseoutPath(ownedPath);
      if (isHarnessChangePath(normalized)) {
        changed.add(normalized);
      }
    }
  }
  for (const changedPath of Array.isArray(verdictPayload.changedFiles) ? verdictPayload.changedFiles : []) {
    const normalized = normalizeCloseoutPath(changedPath);
    if (isHarnessChangePath(normalized)) {
      changed.add(normalized);
    }
  }
  return [...changed].sort();
}

function currentPointerPhaseCompleted(phases = []) {
  return phases.some((phase) => (
    phase.status === 'completed'
    && (
      Number(phase.number) === 3
      || /staged publish manifest and current pointer/i.test(String(phase.title || ''))
    )
  ));
}

function currentArtifactsModeForCloseout(phases = [], explicitMode = '') {
  const normalized = String(explicitMode || '').trim().toLowerCase();
  if (normalized) {
    return normalized;
  }
  return currentPointerPhaseCompleted(phases) ? 'current' : 'legacy';
}

function collectSessionFiles({ sessionFile, sessionDir }) {
  if (sessionFile) {
    return fs.existsSync(sessionFile) ? [sessionFile] : [];
  }
  if (!sessionDir || !fs.existsSync(sessionDir)) {
    return [];
  }
  return fs.readdirSync(sessionDir)
    .filter((entry) => entry.endsWith('.jsonl'))
    .map((entry) => path.join(sessionDir, entry));
}

function sessionHasTaskComplete(filePath) {
  return /task_complete/i.test(readText(filePath));
}

function addFutureTimestampViolation(violations, label, value, now, phaseNumber = null) {
  if (!now || !value) {
    return;
  }
  const timestamp = new Date(value).getTime();
  const nowAt = new Date(now).getTime();
  if (Number.isFinite(timestamp) && Number.isFinite(nowAt) && timestamp > nowAt + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    addViolation(violations, 'future-timestamp', `${label} is more than 5 seconds later than verifier clock.`, phaseNumber);
  }
}

function inspectWorkflowCloseoutDrift({
  statusRoot,
  statusText,
  phases,
  statusPath,
  workflowDir: configuredWorkflowDir,
  sessionFile: configuredSessionFile,
  sessionDir: configuredSessionDir,
  now,
  violations,
  degradedEvidence,
}) {
  const completedPhases = phases.filter((phase) => phase.status === 'completed');
  const repoRoot = path.dirname(path.dirname(path.dirname(statusPath)));
  const workflowDir = configuredWorkflowDir || path.join(repoRoot, '.claude', 'logs', 'workflow-enforcement');
  const invariantResult = evaluateHarnessStateInvariants({
    statusRoot,
    phases,
    statusPath,
    workflowDir,
    now,
    strictMemory: String(process.env.PHASE_STRICT_MEMORY_GATE ?? process.env.MEMORYGRAPH_STRICT_MODE ?? 'false').toLowerCase() === 'true',
  });
  violations.push(...invariantResult.violations);
  degradedEvidence.push(...invariantResult.degradedEvidence);
  const failedWorkflowStates = invariantResult.workflowStates.filter((entry) => isFailedWorkflowState(entry.payload));

  const activeRunLeaseId = statusRoot.activeRunLeaseId || '';
  const activePhaseNumber = Number.parseInt(String(statusRoot.activePhaseNumber || ''), 10);
  for (const phase of completedPhases) {
    const rootLeaseBelongsToCompletedPhase = activeRunLeaseId
      && Number.isInteger(activePhaseNumber)
      && Number(phase.number) === activePhaseNumber;
    if (rootLeaseBelongsToCompletedPhase || phase.activeRunLeaseId) {
      addViolation(violations, 'stale-active-run-lease', `Completed phase ${phase.number} keeps active run lease state.`, phase.number);
    }
    addFutureTimestampViolation(violations, `Completed phase ${phase.number} completedAt`, phase.completedAt, now, phase.number);
    addFutureTimestampViolation(violations, `Completed phase ${phase.number} updatedAt`, phase.updatedAt, now, phase.number);
  }

  const sessionFiles = collectSessionFiles({
    sessionFile: configuredSessionFile,
    sessionDir: configuredSessionDir || path.join(repoRoot, '.claude', 'sessions'),
  });
  if (failedWorkflowStates.length > 0) {
    for (const filePath of sessionFiles) {
      if (sessionHasTaskComplete(filePath)) {
        addViolation(violations, 'session-task-complete-workflow-failed', `Session ${path.basename(filePath)} records task_complete while workflow state is failed.`);
      }
    }
  }

  const blockedSmoke = readJsonIfExists(path.join(workflowDir, 'environment-blocked-smoke.json'));
  if (
    blockedSmoke
    && String(blockedSmoke.status || '').toLowerCase() === 'blocked'
    && String(blockedSmoke.evidenceDepth || '').toLowerCase() === 'smoke_only'
    && String(blockedSmoke.planStatus || '').toLowerCase() === 'complete'
  ) {
    if (completedPhases.length > 0) {
      addViolation(violations, 'environment-blocked-smoke-plan-complete', 'Environment-blocked smoke evidence cannot justify completed phase status.');
    } else if (statusRoot.normalizedRunVerdict !== 'complete_with_environment_blocker' || !hasEnvironmentBlockerPayload(statusText)) {
      addViolation(violations, 'environment-blocked-smoke-plan-complete', 'Environment-blocked smoke evidence must be normalized as complete_with_environment_blocker with environmentBlockers payload.');
    }
  }
}

export function evaluatePhaseCloseout(rawConfig = {}) {
  const config = {
    statusFile: rawConfig.statusFile || '.claude/docs/phase-status.yaml',
    planDir: rawConfig.planDir || 'docs/implementation',
    masterPlan: rawConfig.masterPlan || '',
    masterPlanProvided: rawConfig.masterPlanProvided ?? Object.prototype.hasOwnProperty.call(rawConfig, 'masterPlan'),
    executionRoot: rawConfig.executionRoot || '',
    workflowDir: rawConfig.workflowDir || '',
    sessionFile: rawConfig.sessionFile || '',
    sessionDir: rawConfig.sessionDir || '',
    currentArtifactsMode: rawConfig.currentArtifactsMode || '',
    now: rawConfig.now || '',
  };
  const pathAuthority = evaluatePathAuthority({
    statusFile: config.statusFile,
    planDir: config.planDir,
    masterPlan: config.masterPlan,
    masterPlanProvided: config.masterPlanProvided,
    executionRoot: config.executionRoot,
  });
  const statusPath = pathAuthority.resolvedPaths.statusFile;
  const planDir = pathAuthority.resolvedPaths.planDir;
  const masterPath = pathAuthority.resolvedPaths.masterPlan;
  const violations = pathAuthority.issues.map((issue) => ({
    code: issue.code,
    message: issue.detail,
    phaseNumber: null,
    failureClass: classifyHarnessViolation(issue.code),
  }));
  const degradedEvidence = [];

  const statusText = fs.existsSync(statusPath) ? readText(statusPath) : '';
  const statusDocument = statusText ? parsePhaseStatusDocument(statusText) : { root: {}, phases: [] };
  const phases = statusDocument.phases;
  const checklist = fs.existsSync(masterPath) ? parseMasterChecklist(readText(masterPath)) : new Map();
  const currentArtifactsMode = currentArtifactsModeForCloseout(phases, config.currentArtifactsMode);

  for (const phase of phases) {
    const phaseNumber = phase.number;
    const completed = phase.status === 'completed';
    const checked = checklist.get(phaseNumber);

    if (completed && checked !== true) {
      addViolation(violations, 'master-checklist-not-checked', `Completed phase ${phaseNumber} is not checked in the master checklist.`, phaseNumber);
    }
    if (checked === true && !completed) {
      addViolation(violations, 'master-checklist-status-mismatch', `Master checklist marks phase ${phaseNumber} complete but phase-status is ${phase.status || 'missing'}.`, phaseNumber);
    }

    if (!completed) {
      continue;
    }

    const requiredArtifactFields = ['sprintContract', 'qaReport', 'handoff', 'scorecard'];
    const artifactTexts = [];
    for (const field of requiredArtifactFields) {
      const artifactPath = resolvePath(phase[field] || '');
      if (!artifactPath || !fs.existsSync(artifactPath)) {
        addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} is missing ${field}.`, phaseNumber);
      } else {
        artifactTexts.push(readText(artifactPath));
      }
    }

    const archivedPath = resolvePath(phase.archivedPhaseDoc || '');
    if (!archivedPath || !fs.existsSync(archivedPath)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} is missing a valid archivedPhaseDoc.`, phaseNumber);
    }

    const completedWorksets = evaluateCompletedWorksets(phase.qaReport ? path.dirname(resolvePath(phase.qaReport)) : '');
    if (!completedWorksets.ok) {
      addViolation(violations, completedWorksets.reason, `Completed phase ${phaseNumber} has incomplete WORKSETS: ${completedWorksets.detail}`, phaseNumber);
    }

    const phaseDocText = archivedPath && fs.existsSync(archivedPath) ? readText(archivedPath) : '';
    const scenarios = parseCriticalScenarios(phaseDocText);
    const evidenceText = artifactTexts.join('\n');
    const phaseDeclaresEvaluationPipeline = /Evaluation Trigger Pipeline/i.test(phase.title || '')
      || /(^|\n)#\s*Phase\s+\d+:\s*Evaluation Trigger Pipeline\b/i.test(phaseDocText)
      || /(^|\n)phaseCapability:\s*evaluation-trigger-pipeline\b/i.test(phaseDocText);

    if (phaseDocText && scenarios.length === 0 && hasConcreteSourceTargets(phaseDocText)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} has implementation targets but no Critical Product Scenarios.`, phaseNumber);
    }

    if (phaseDeclaresEvaluationPipeline) {
      addEvaluationTriggerViolations(violations, evidenceText, phaseNumber);
    }

    const verdict = readVerdictForPhase(phaseNumber, {
      phase,
      statusRoot: statusDocument.root,
      statusPath,
      planDir,
      masterPlan: masterPath,
      currentArtifactsMode,
      now: config.now || '',
    });
    if (verdict.exists && !verdict.parseError && !verdictInternallyConsistent(verdict.parsed || {})) {
      addViolation(violations, 'verification-verdict-inconsistent', `Completed phase ${phaseNumber} has contradictory verdict fields at ${path.relative(process.cwd(), verdict.path)}.`, phaseNumber);
    }
    if (verdict.exists && verdict.relevant === false) {
      addViolation(violations, 'verification-verdict-stale', `Completed phase ${phaseNumber} has stale or mismatched verdict identity at ${path.relative(process.cwd(), verdict.path)}.`, phaseNumber);
    }
    if (!verdictPassed(verdict)) {
      addViolation(violations, 'verification-verdict-not-passed', `Completed phase ${phaseNumber} does not have a passing fresh verdict at ${path.relative(process.cwd(), verdict.path)}.`, phaseNumber);
    }

    const harnessChangedPaths = collectHarnessChangedPaths({
      phaseExecutionDir: phase.qaReport ? path.dirname(resolvePath(phase.qaReport)) : '',
      verdictPayload: verdict.parsed || {},
    });
    if (harnessChangedPaths.length > 0 && !harnessChangeLedgerPresent(planDir)) {
      addViolation(
        violations,
        'harness-change-ledger-missing',
        `Completed phase ${phaseNumber} changes harness files but no non-empty Harness Change Ledger was found in QA_REPORT.md or ${path.relative(process.cwd(), path.join(planDir, 'QA_REPORT.md'))}: ${harnessChangedPaths.join(', ')}`,
        phaseNumber,
      );
    }

    const structuredEvidence = mergeStructuredEvidenceMetadata(
      structuredEvidenceFromPayload(verdict.parsed || {}),
      ...artifactTexts.map((artifactText) => structuredEvidenceFromMarkdown(artifactText)),
    );

    for (const scenarioId of scenarios) {
      const structuredScenarioPassed = structuredScenarioEvidencePassed(structuredEvidence, scenarioId);
      if (structuredScenarioPassed === false || (structuredScenarioPassed === null && !scenarioEvidencePassed(scenarioId, evidenceText))) {
        addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} lacks passing evidence for ${scenarioId}.`, phaseNumber);
      }
    }

    const scorecardText = artifactTexts[3] || '';
    if (!scorecardDone(scorecardText)) {
      addViolation(violations, 'scorecard-not-done', `Completed phase ${phaseNumber} scorecard is not done/FULL.`, phaseNumber);
    }

    const demoFirstGate = evaluateDemoFirstGate({
      phaseExecutionDir: phase.qaReport ? path.dirname(resolvePath(phase.qaReport)) : '',
      sprintContractPath: resolvePath(phase.sprintContract || ''),
      qaReportPath: resolvePath(phase.qaReport || ''),
      scorecardPath: resolvePath(phase.scorecard || ''),
      phaseDocPath: archivedPath,
    });
    if (!demoFirstGate.allowed) {
      addViolation(violations, demoFirstGate.reason, `Completed phase ${phaseNumber} violates demo-first MVP gate for maturity ${demoFirstGate.maturityTarget || 'unknown'}.`, phaseNumber);
    }

    const structuredBlockerUnresolved = structuredLocalBlockerUnresolved(structuredEvidence);
    if (structuredBlockerUnresolved === true || (structuredBlockerUnresolved === null && unresolvedLocalBlocker(evidenceText))) {
      addViolation(violations, 'unresolved-local-blocker', `Completed phase ${phaseNumber} still contains a local blocker.`, phaseNumber);
    }

    const executionRoot = executionRootFromPhaseArtifact(phase);
    const requirementsPath = executionRoot ? path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md') : '';
    const scenarioPath = executionRoot ? path.join(executionRoot, 'SCENARIO_MATRIX.md') : '';
    const structuredRequirementsValid = structuredTraceabilityValid(structuredEvidence, 'requirements');
    const structuredScenariosValid = structuredTraceabilityValid(structuredEvidence, 'scenarios');
    if (structuredRequirementsValid === false || (structuredRequirementsValid === null && !traceabilityArtifactValid(requirementsPath, /\bREQ-[A-Za-z0-9_.-]+\b/))) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), requirementsPath || 'REQUIREMENTS_TRACEABILITY.md')} with verified REQ-* coverage.`, phaseNumber);
    }
    if (structuredScenariosValid === false || (structuredScenariosValid === null && !traceabilityArtifactValid(scenarioPath, /\bSCN-[A-Za-z0-9_.-]+\b/))) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), scenarioPath || 'SCENARIO_MATRIX.md')} with verified SCN-* coverage.`, phaseNumber);
    }

    const replayCheck = comparePhaseReplayToReadModel({
      ledgerPath: defaultPhaseEventLedgerPath(statusPath),
      statusFile: statusPath,
      phaseNumber,
    });
    for (const violation of replayCheck.violations) {
      addViolation(violations, violation.code, violation.message, phaseNumber);
    }
  }

  inspectWorkflowCloseoutDrift({
    statusRoot: statusDocument.root,
    statusText,
    phases,
    statusPath,
    workflowDir: config.workflowDir ? resolvePath(config.workflowDir) : '',
    sessionFile: config.sessionFile ? resolvePath(config.sessionFile) : '',
    sessionDir: config.sessionDir ? resolvePath(config.sessionDir) : '',
    now: config.now,
    violations,
    degradedEvidence,
  });

  const allowed = violations.length === 0;
  return {
    allowed,
    status: allowed ? 'pass' : 'fail',
    reason: allowed ? 'ok' : violations[0].code,
    statusFile: statusPath,
    planDir,
    masterPlan: masterPath,
    completedPhases: phases.filter((phase) => phase.status === 'completed').map((phase) => phase.number),
    violations,
    degradedEvidence,
  };
}

function printHuman(result) {
  printLine('Phase Closeout Check');
  printLine(`Status: ${result.status}`);
  printLine(`Reason: ${result.reason}`);
  printLine(`Completed phases: ${result.completedPhases.join(', ') || 'none'}`);
  printLine(`Violations: ${result.violations.length}`);
  for (const violation of result.violations) {
    const phase = violation.phaseNumber ? `phase ${violation.phaseNumber}: ` : '';
    printLine(`- ${violation.code}: ${phase}${violation.message}`);
  }
}

function printLine(value) {
  process.stdout.write(`${value}\n`);
}

function writeFixtureFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeDemoFirstFixture(root, options = {}) {
  const approvalStatus = options.approvalStatus || 'approved';
  const approvalScope = options.approvalScope === false ? '' : `
  routes:
    - /dashboard
  flows:
    - create_project_success
  states:
    - success
  mockScenarios:
    - create_project_success`;
  const contractParity = options.contractParity || 'pass';
  const evidenceMode = options.evidenceMode || 'real_api';
  const mockOnly = options.mockOnly || 'no';

  writeFixtureFile(root, 'docs/implementation/00-master-plan-v1.md', `# Master

## Phase Completion Checklist
- [x] Phase 01 - Create First Project - Real Functional (\`docs/implementation/01-create-first-project-real-functional-v1.md\`)
`);
  writeFixtureFile(root, '.claude/docs/phase-status.yaml', `phases:
  - number: 1
    status: completed
    sprintContract: docs/implementation/execution/phase01/SPRINT_CONTRACT.md
    qaReport: docs/implementation/execution/phase01/QA_REPORT.md
    handoff: docs/implementation/execution/phase01/HANDOFF.md
    scorecard: docs/implementation/execution/phase01/SCORECARD.md
    archivedPhaseDoc: docs/implementation/01-create-first-project-real-functional-v1.md
`);
  writeFixtureFile(root, 'docs/implementation/01-create-first-project-real-functional-v1.md', `# Phase 01: Create First Project - Real Functional

## Phase Execution Metadata
\`\`\`yaml
mvpMethodology:
  profile: demo_first
  sliceId: create-first-project
  maturityTarget: real_functional
  demoGate:
    required: true
    mode: hard_stop
    approvalSource: "docs/implementation/USER_DEMO_APPROVAL.md"
    evidenceSource: "docs/implementation/DEMO_EVIDENCE.md"
    mockContractSource: "docs/implementation/MOCK_API_CONTRACT.md"
\`\`\`

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | User creates first project | \`npm test\` | pass | \`docs/implementation/execution/phase01/QA_REPORT.md\` |
`);
  writeFixtureFile(root, 'docs/implementation/execution/REQUIREMENTS_TRACEABILITY.md', 'REQ-01 | pass | verified\n');
  writeFixtureFile(root, 'docs/implementation/execution/SCENARIO_MATRIX.md', 'SCN-01-1 | pass | verified\n');
  writeFixtureFile(root, 'docs/implementation/execution/phase01/SPRINT_CONTRACT.md', `# Sprint

## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Slice ID: create-first-project
- Maturity target: real_functional
- Approval source: docs/implementation/USER_DEMO_APPROVAL.md
- Evidence source: docs/implementation/DEMO_EVIDENCE.md
- Mock contract source: docs/implementation/MOCK_API_CONTRACT.md
`);
  writeFixtureFile(root, 'docs/implementation/execution/phase01/QA_REPORT.md', `# QA

## Verdict
- Status: pass
- Next path: clean_finish
- Closeout reason: scope_complete

## Review Checkpoint
- Review completed: yes

## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Slice ID: create-first-project
- Maturity target: real_functional
- Demo run command: npm run dev
- Tested routes: /dashboard, /projects/new, /projects/project_1
- Tested flows: create_project_success
- Mock success path: pass
- Mock error path: pass
- Browser/user-flow evidence: pass
- Demo evidence source: docs/implementation/DEMO_EVIDENCE.md
- User approval source: docs/implementation/USER_DEMO_APPROVAL.md
- User approval status: ${approvalStatus}
- Approved scope present: ${approvalScope ? 'yes' : 'no'}
- Mock contract source: docs/implementation/MOCK_API_CONTRACT.md
- Contract parity: ${contractParity}
- Evidence mode: ${evidenceMode}
- Mock-only evidence: ${mockOnly}

SCN-01-1 | pass | docs/implementation/execution/phase01/QA_REPORT.md

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, codex-review-code, completion-verifier
- Skipped skills: none

## Finish Readiness
- Why this round may stop now: scope complete
- Remaining in-scope work: none
- Remaining blockers before closeout: none
`);
  writeFixtureFile(root, 'docs/implementation/execution/phase01/HANDOFF.md', '# Handoff\n\n- Stop reason: none\n');
  writeFixtureFile(root, 'docs/implementation/execution/phase01/SCORECARD.md', '# Scorecard\n\n- Verdict: done\n- Current task status: FULL\n');
  writeFixtureFile(root, 'docs/implementation/USER_DEMO_APPROVAL.md', `approval: ${approvalStatus}
approvedAt: "2026-05-06T00:00:00+09:00"
approvedBy: user
approvedScope:
  sliceId: create-first-project
  maturityTarget: mock_functional_demo${approvalScope}
knownIssues: []
blockedChanges:
  - approved_routes_change
requiresReapprovalIf:
  - route_structure_changes
`);
  writeFixtureFile(root, 'docs/implementation/DEMO_EVIDENCE.md', `# Demo Evidence

- Demo run command: npm run dev
- Tested routes: /dashboard, /projects/new, /projects/project_1
`);
  writeFixtureFile(root, 'docs/implementation/MOCK_API_CONTRACT.md', '# Mock API Contract\n\nPOST /api/projects\n');
  writeFixtureFile(root, '.claude/verification-verdict-phase01-final.json', JSON.stringify({
    verdict: 'passed',
    evidenceFresh: true,
    blocking: false,
    commands: [{ name: 'fixture', status: 'passed' }],
    score: { verdict: 'done' },
  }, null, 2));
}

function runSelfTest() {
  const originalCwd = process.cwd();
  const tempRoots = [];
  const makeTempRoot = (prefix) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(tempRoot);
    return tempRoot;
  };
  const root = makeTempRoot('phase-closeout-demo-first-');
  try {
    writeDemoFirstFixture(root);
    process.chdir(root);
    const passing = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v1.md',
      masterPlanProvided: true,
    });
    if (!passing.allowed) {
      throw new Error(`expected passing demo-first fixture, got ${passing.reason}`);
    }

    const missingMasterPlan = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
    });
    if (missingMasterPlan.allowed || missingMasterPlan.reason !== 'master_plan_missing') {
      throw new Error(`expected master_plan_missing without explicit master plan, got ${missingMasterPlan.reason}`);
    }

    const failingRoot = makeTempRoot('phase-closeout-demo-first-fail-');
    writeDemoFirstFixture(failingRoot, { approvalStatus: 'pending' });
    process.chdir(failingRoot);
    const failing = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v1.md',
      masterPlanProvided: true,
    });
    if (failing.allowed || failing.reason !== 'user_validation_required') {
      throw new Error(`expected user_validation_required, got ${failing.reason}`);
    }

    const parityRoot = makeTempRoot('phase-closeout-demo-first-parity-');
    writeDemoFirstFixture(parityRoot, { contractParity: 'fail' });
    process.chdir(parityRoot);
    const parity = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v1.md',
      masterPlanProvided: true,
    });
    if (parity.allowed || parity.reason !== 'contract_parity_failed') {
      throw new Error(`expected contract_parity_failed, got ${parity.reason}`);
    }

    const mockRoot = makeTempRoot('phase-closeout-demo-first-mock-');
    writeFixtureFile(mockRoot, 'docs/implementation/execution/phase01/SPRINT_CONTRACT.md', `# Sprint

## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Maturity target: mock_functional_demo
`);
    writeFixtureFile(mockRoot, 'docs/implementation/execution/phase01/QA_REPORT.md', `# QA

## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Maturity target: mock_functional_demo
- Mock success path: pass
- Mock error path: pending
`);
    const mockGate = evaluateDemoFirstGate({
      baseDir: mockRoot,
      phaseExecutionDir: path.join(mockRoot, 'docs/implementation/execution/phase01'),
    });
    if (mockGate.allowed || mockGate.reason !== 'mock-functional-demo-evidence-missing') {
      throw new Error(`expected mock-functional-demo-evidence-missing, got ${mockGate.reason}`);
    }

    const evidenceRoot = makeTempRoot('phase-closeout-demo-first-evidence-');
    writeFixtureFile(evidenceRoot, 'docs/implementation/execution/phase01/SPRINT_CONTRACT.md', `# Sprint

## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Maturity target: demo_evidence_capture
`);
    writeFixtureFile(evidenceRoot, 'docs/implementation/execution/phase01/QA_REPORT.md', `# QA

## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Maturity target: demo_evidence_capture
- Demo run command:
- Tested routes:
`);
    const evidenceGate = evaluateDemoFirstGate({
      baseDir: evidenceRoot,
      phaseExecutionDir: path.join(evidenceRoot, 'docs/implementation/execution/phase01'),
    });
    if (evidenceGate.allowed || evidenceGate.reason !== 'demo-evidence-missing') {
      throw new Error(`expected demo-evidence-missing, got ${evidenceGate.reason}`);
    }

    printLine('verify-phase-closeout self-test passed');
  } finally {
    process.chdir(originalCwd);
    for (const tempRoot of tempRoots) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printLine(usage());
    return;
  }
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const result = evaluatePhaseCloseout(options);
  if (options.json) {
    printLine(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  process.exit(result.allowed ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(64);
  }
}
