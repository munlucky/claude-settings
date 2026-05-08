#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHeadingAliases,
  scenarioEvidencePassed as normalizeScenarioEvidencePassed,
  sectionText as normalizeSectionText,
} from './artifact-normalizer.mjs';
import { evaluateDemoFirstGate } from './demo-first-gate-lib.mjs';
import { evaluatePathAuthority } from './lib/path-authority.mjs';
import {
  isRelevantVerificationVerdict,
  resolveGitTreeFingerprint,
} from './verification-verdict-state.mjs';

const PASS_WORDS = /\b(pass|passed|done|verified)\b/i;
const FAIL_WORDS = /\b(fail|failed|blocked|missing|todo|pending|retry)\b/i;
const EXTERNAL_BLOCKER_WORDS = /\b(external|account|credential|credentials|launch|domain|cloudflare|search console|adsense|manual|no-go)\b/i;
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5000;

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

function normalize(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

function readText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function sectionText(text, heading) {
  return normalizeSectionText(text, heading, getHeadingAliases(heading));
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

function resolvePath(rawPath, baseDir = process.cwd()) {
  const cleaned = stripQuotes(rawPath);
  if (!cleaned) {
    return '';
  }
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(baseDir, cleaned);
}

function parsePhaseStatusDocument(text) {
  const phases = [];
  const root = {};
  const lines = normalize(text).split('\n');
  let current = null;

  for (const line of lines) {
    const start = line.match(/^\s*-\s+number:\s*(\d+)/);
    if (start) {
      if (current) {
        phases.push(current);
      }
      current = { number: Number(start[1]) };
      continue;
    }

    if (current) {
      const field = line.match(/^ {4}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
      if (field) {
        current[field[1]] = stripQuotes(field[2]);
      }
      continue;
    }

    const rootField = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (rootField) {
      root[rootField[1]] = stripQuotes(rootField[2]);
    }
  }

  if (current) {
    phases.push(current);
  }

  return { root, phases };
}

function parseMasterChecklist(text) {
  const section = sectionText(text, 'Phase Completion Checklist');
  const result = new Map();

  for (const line of section.split('\n')) {
    const match = line.match(/^-\s+\[([ xX])\].*?Phase\s+0?(\d+)\b/);
    if (match) {
      result.set(Number(match[2]), match[1].toLowerCase() === 'x');
    }
  }

  return result;
}

function parseCriticalScenarios(text) {
  const section = sectionText(text, 'Critical Product Scenarios');
  const scenarios = [];
  const seen = new Set();
  const regex = /\b(SCN-[A-Za-z0-9_.-]+)\b/g;
  let match;

  while ((match = regex.exec(section)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      scenarios.push(id);
    }
  }

  return scenarios;
}

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

function hasConcreteSourceTargets(phaseText) {
  return extractPathTokens(sectionText(phaseText, 'Exact Execution Targets'))
    .some((token) => !token.endsWith('.md') && !token.endsWith('package.json'));
}

function scenarioEvidencePassed(scenarioId, evidenceText) {
  return normalizeScenarioEvidencePassed(scenarioId, evidenceText) || normalize(evidenceText).split('\n').some((line) => {
    const lowered = line.toLowerCase();
    return lowered.includes(scenarioId.toLowerCase()) && PASS_WORDS.test(line) && !FAIL_WORDS.test(line);
  });
}

function scorecardDone(scorecardText) {
  return /(?:Verdict|Score verdict):\s*done/i.test(scorecardText)
    || /Current task status:\s*FULL/i.test(scorecardText);
}

function buildVerdictIdentity({ phase = {}, statusRoot = {}, statusPath = '', planDir = '', masterPlan = '' } = {}) {
  return {
    runLeaseId: statusRoot.activeRunLeaseId || statusRoot.lastRunLeaseId || '',
    activePhaseDocPath: phase.plan || phase.phaseDocPath || phase.docPath || '',
    masterPlan: masterPlan ? path.resolve(masterPlan) : '',
    planDir: planDir ? path.resolve(planDir) : '',
    statusFile: statusPath ? path.resolve(statusPath) : '',
    gitTreeFingerprint: resolveGitTreeFingerprint(process.cwd()),
  };
}

function readVerdictForPhase(phaseNumber, context = {}) {
  const phaseId = String(phaseNumber).padStart(2, '0');
  const verdictPath = path.resolve(process.cwd(), `.claude/verification-verdict-phase${phaseId}-final.json`);
  if (!fs.existsSync(verdictPath)) {
    return { path: verdictPath, exists: false };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    const relevant = isRelevantVerificationVerdict(
      { payload: parsed, filePath: verdictPath },
      {
        activePhaseNumber: Number.parseInt(String(phaseNumber), 10),
        candidatePath: verdictPath,
        identity: buildVerdictIdentity(context),
        now: context.now || '',
      },
    );
    return {
      path: verdictPath,
      exists: true,
      parsed,
      relevant,
      staleReason: relevant ? '' : 'stale-or-mismatched-verdict',
    };
  } catch (error) {
    return { path: verdictPath, exists: true, parseError: error.message };
  }
}

function verdictPassed(verdict) {
  if (!verdict.exists || verdict.parseError) {
    return false;
  }
  if (verdict.relevant === false) {
    return false;
  }
  const parsed = verdict.parsed || {};
  if (!verdictInternallyConsistent(parsed)) {
    return false;
  }
  const scoreVerdict = parsed.score?.verdict;
  return parsed.verdict === 'passed'
    && parsed.evidenceFresh === true
    && parsed.blocking === false
    && (!scoreVerdict || scoreVerdict === 'done');
}

function verdictInternallyConsistent(parsed = {}) {
  const verdict = String(parsed.verdict || '').trim().toLowerCase();
  const scoreVerdict = String(parsed.score?.verdict || '').trim().toLowerCase();
  const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
  const environmentBlockers = Array.isArray(parsed.environmentBlockers) ? parsed.environmentBlockers : [];
  const allCommandsPassed = commands.length > 0
    && commands.every((command) => String(command.status || '').trim().toLowerCase() === 'passed');

  if (parsed.blocking === true && verdict === 'passed') {
    return false;
  }
  if (parsed.blocking === true && allCommandsPassed && scoreVerdict === 'done') {
    return false;
  }
  if (verdict === 'passed' && ['blocked', 'retry', 'failed'].includes(scoreVerdict)) {
    return false;
  }
  if (environmentBlockers.length > 0 && verdict === 'passed' && scoreVerdict === 'done') {
    return false;
  }
  return true;
}

function unresolvedLocalBlocker(text) {
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

function executionRootFromPhaseArtifact(phase) {
  const candidate = phase.qaReport || phase.sprintContract || phase.handoff || phase.scorecard || '';
  if (!candidate) {
    return '';
  }
  return path.dirname(path.dirname(resolvePath(candidate)));
}

function traceabilityArtifactValid(filePath, idPattern) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const text = readText(filePath);
  return idPattern.test(text) && /\b(implemented|verified|pass|passed|done)\b/i.test(text);
}

function parseWorksetsYaml(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, tasks: [] };
  }
  const tasks = [];
  let current = null;
  let currentList = '';

  for (const line of readText(filePath).split(/\r?\n/)) {
    const taskStart = line.match(/^\s+-\s+id:\s*(.+?)\s*$/);
    if (taskStart) {
      if (current) {
        tasks.push(current);
      }
      current = {
        id: stripQuotes(taskStart[1]),
        status: '',
        ownedPaths: [],
        verificationCommands: [],
        evidence: [],
      };
      currentList = '';
      continue;
    }
    if (!current) {
      continue;
    }

    const scalar = line.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/);
    if (scalar) {
      const key = scalar[1];
      const rawValue = stripQuotes(scalar[2]);
      currentList = ['ownedPaths', 'verificationCommands', 'evidence'].includes(key) ? key : '';
      if (key === 'status') {
        current.status = rawValue;
      } else if (currentList && rawValue && rawValue !== '[]') {
        current[currentList].push(rawValue);
      }
      continue;
    }

    const listItem = line.match(/^\s{6}-\s+(.+?)\s*$/);
    if (listItem && currentList) {
      current[currentList].push(stripQuotes(listItem[1]));
    }
  }

  if (current) {
    tasks.push(current);
  }
  return { exists: true, tasks };
}

function evaluateCompletedWorksets(phaseExecutionDir) {
  const worksetsPath = phaseExecutionDir ? path.join(phaseExecutionDir, 'WORKSETS.yaml') : '';
  const ledger = parseWorksetsYaml(worksetsPath);
  if (!ledger.exists) {
    return { ok: true, reason: 'missing-ledger-allowed', detail: '' };
  }
  if (ledger.tasks.length === 0) {
    return { ok: false, reason: 'atomic-ledger-empty', detail: `${path.relative(process.cwd(), worksetsPath)} has no atomicTasks.` };
  }
  for (const task of ledger.tasks) {
    if (task.status !== 'completed') {
      return { ok: false, reason: 'atomic-tasks-incomplete', detail: `${task.id || 'atomic task'} status is ${task.status || 'missing'}.` };
    }
    if (task.ownedPaths.length === 0 || task.verificationCommands.length === 0 || task.evidence.length === 0) {
      return { ok: false, reason: 'atomic-task-evidence-missing', detail: `${task.id || 'atomic task'} lacks ownedPaths, verificationCommands, or evidence.` };
    }
  }
  return { ok: true, reason: 'ok', detail: '' };
}

function addViolation(violations, code, message, phaseNumber = null) {
  violations.push({ code, message, phaseNumber });
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

function workflowStateViolationCode(basename) {
  switch (basename) {
    case 'current-run.json':
      return 'current-run-failed-phase-completed';
    case 'active-phase-run.json':
      return 'active-phase-run-failed-phase-completed';
    case 'latest-dispatch.json':
      return 'latest-dispatch-failed-phase-completed';
    default:
      return 'workflow-state-contradiction';
  }
}

function isSupersededByLocalFallback(payload = {}) {
  return payload.status === 'superseded-by-local-fallback'
    || payload.completionStatus === 'completed-via-local-fallback'
    || payload.localFallbackCompletion?.completionStatus === 'completed-via-local-fallback';
}

function isFailedWorkflowState(payload = {}) {
  if (!payload || isSupersededByLocalFallback(payload)) {
    return false;
  }
  const fields = [
    payload.status,
    payload.completionStatus,
    payload.activeExecutionStatus,
    payload.failureClass,
    payload.stopReasonCode,
    payload.phaseRunLease?.status,
    payload.phaseRunLease?.completionStatus,
    payload.phaseRunLease?.stopReasonCode,
  ].map((value) => String(value || '').toLowerCase());
  return fields.some((value) => value.includes('failed') || value.includes('failure'));
}

function runningWorkflowStateViolationCode(basename) {
  switch (basename) {
    case 'current-run.json':
      return 'current-run-running-phase-completed';
    case 'active-phase-run.json':
      return 'active-phase-run-running-phase-completed';
    case 'latest-dispatch.json':
      return 'latest-dispatch-running-phase-completed';
    default:
      return 'workflow-state-running-phase-completed';
  }
}

function isRunningWorkflowState(payload = {}) {
  if (!payload || isSupersededByLocalFallback(payload)) {
    return false;
  }
  const fields = [
    payload.status,
    payload.completionStatus,
    payload.activeExecutionStatus,
    payload.phaseRunLease?.status,
    payload.phaseRunLease?.completionStatus,
  ].map((value) => String(value || '').toLowerCase());
  return fields.some((value) => ['running', 'active', 'in_progress'].includes(value));
}

function isCompletedLocalFallback(payload = {}) {
  if (!payload) {
    return false;
  }
  return payload.status === 'completed'
    || payload.completionStatus === 'completed-via-local-fallback'
    || payload.completionBoundary === 'phase_only';
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
}) {
  const completedPhases = phases.filter((phase) => phase.status === 'completed');

  const repoRoot = path.dirname(path.dirname(path.dirname(statusPath)));
  const workflowDir = configuredWorkflowDir || path.join(repoRoot, '.claude', 'logs', 'workflow-enforcement');
  const workflowStates = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']
    .map((basename) => ({
      basename,
      payload: readJsonIfExists(path.join(workflowDir, basename)),
    }))
    .filter((entry) => entry.payload);
  const failedWorkflowStates = workflowStates.filter((entry) => isFailedWorkflowState(entry.payload));
  const runningWorkflowStates = workflowStates.filter((entry) => isRunningWorkflowState(entry.payload));

  for (const key of ['updatedAt', 'activeExecutionHeartbeatAt', 'lastExecutionHeartbeatAt']) {
    addFutureTimestampViolation(violations, `phase-status ${key}`, statusRoot[key], now);
  }

  for (const { basename, payload } of workflowStates) {
    for (const key of ['updatedAt', 'lastHeartbeatAt']) {
      addFutureTimestampViolation(violations, `${basename} ${key}`, payload[key], now);
    }
    for (const key of ['updatedAt', 'lastHeartbeatAt']) {
      addFutureTimestampViolation(violations, `${basename} phaseRunLease.${key}`, payload.phaseRunLease?.[key], now);
    }
  }

  for (const { basename, payload } of failedWorkflowStates) {
    const fallbackRunId = payload.fallbackRunId || payload.localFallbackCompletion?.runId || '';
    const fallbackRun = fallbackRunId ? readJsonIfExists(path.join(workflowDir, `${fallbackRunId}.json`)) : null;
    if (fallbackRun && isCompletedLocalFallback(fallbackRun)) {
      addViolation(violations, 'delegated-failed-local-fallback-completed', `${basename} is failed and points at completed local fallback ${fallbackRunId}, but it was not superseded.`);
      continue;
    }
    addViolation(violations, workflowStateViolationCode(basename), `${basename} is failed while phase-status contains completed phase state.`);
  }

  if (completedPhases.length > 0) {
    for (const { basename } of runningWorkflowStates) {
      addViolation(violations, runningWorkflowStateViolationCode(basename), `${basename} is still running while phase-status contains completed phase state.`);
    }
  }

  const activeRunLeaseId = statusRoot.activeRunLeaseId || '';
  for (const phase of completedPhases) {
    if (activeRunLeaseId || phase.activeRunLeaseId) {
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
  }));

  const statusText = fs.existsSync(statusPath) ? readText(statusPath) : '';
  const statusDocument = statusText ? parsePhaseStatusDocument(statusText) : { root: {}, phases: [] };
  const phases = statusDocument.phases;
  const checklist = fs.existsSync(masterPath) ? parseMasterChecklist(readText(masterPath)) : new Map();

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

    if (phaseDocText && scenarios.length === 0 && hasConcreteSourceTargets(phaseDocText)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} has implementation targets but no Critical Product Scenarios.`, phaseNumber);
    }

    for (const scenarioId of scenarios) {
      if (!scenarioEvidencePassed(scenarioId, evidenceText)) {
        addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} lacks passing evidence for ${scenarioId}.`, phaseNumber);
      }
    }

    const verdict = readVerdictForPhase(phaseNumber, {
      phase,
      statusRoot: statusDocument.root,
      statusPath,
      planDir,
      masterPlan: masterPath,
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

    if (unresolvedLocalBlocker(evidenceText)) {
      addViolation(violations, 'unresolved-local-blocker', `Completed phase ${phaseNumber} still contains a local blocker.`, phaseNumber);
    }

    const executionRoot = executionRootFromPhaseArtifact(phase);
    const requirementsPath = executionRoot ? path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md') : '';
    const scenarioPath = executionRoot ? path.join(executionRoot, 'SCENARIO_MATRIX.md') : '';
    if (!traceabilityArtifactValid(requirementsPath, /\bREQ-[A-Za-z0-9_.-]+\b/)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), requirementsPath || 'REQUIREMENTS_TRACEABILITY.md')} with verified REQ-* coverage.`, phaseNumber);
    }
    if (!traceabilityArtifactValid(scenarioPath, /\bSCN-[A-Za-z0-9_.-]+\b/)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), scenarioPath || 'SCENARIO_MATRIX.md')} with verified SCN-* coverage.`, phaseNumber);
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
