import fs from 'node:fs';
import path from 'node:path';

const FUTURE_TIMESTAMP_TOLERANCE_MS = 5000;
const WORKFLOW_STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function stripQuotes(value) {
  return normalizeText(value).replace(/^["'`]+|["'`]+$/g, '');
}

function addViolation(violations, code, message, options = {}) {
  violations.push({
    code,
    message,
    phaseNumber: options.phaseNumber ?? null,
    failureClass: options.failureClass || classifyHarnessViolation(code),
  });
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function resolveMaybePath(value, baseDir) {
  const text = stripQuotes(value);
  if (!text) {
    return '';
  }
  return path.isAbsolute(text) ? path.resolve(text) : path.resolve(baseDir, text);
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function isSupersededByLocalFallback(payload = {}) {
  return payload.status === 'superseded-by-local-fallback'
    || payload.recoveryStatus === 'recovered'
    || payload.completionStatus === 'completed-via-local-fallback'
    || payload.localFallbackCompletion?.completionStatus === 'completed-via-local-fallback';
}

export function isFailedWorkflowState(payload = {}) {
  if (!payload || isSupersededByLocalFallback(payload)) {
    return false;
  }
  const fields = [
    payload.status,
    payload.completionStatus,
    payload.activeExecutionStatus,
    payload.failureClass,
    payload.blockingStopReasonCode,
    payload.stopReasonCode,
    payload.phaseRunLease?.status,
    payload.phaseRunLease?.completionStatus,
    payload.phaseRunLease?.blockingStopReasonCode,
    payload.phaseRunLease?.stopReasonCode,
  ].map(normalizeLower);
  return fields.some((value) => value.includes('failed') || value.includes('failure'));
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
  ].map(normalizeLower);
  return fields.some((value) => ['running', 'active', 'in_progress', 'prepared'].includes(value));
}

function isCompletedLocalFallback(payload = {}) {
  if (!payload) {
    return false;
  }
  return payload.status === 'completed'
    || payload.completionStatus === 'completed-via-local-fallback'
    || payload.completionBoundary === 'phase_only';
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

function addFutureTimestampViolation(violations, label, value, now, phaseNumber = null) {
  if (!now || !value) {
    return;
  }
  const timestamp = new Date(value).getTime();
  const nowAt = new Date(now).getTime();
  if (Number.isFinite(timestamp) && Number.isFinite(nowAt) && timestamp > nowAt + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    addViolation(
      violations,
      'future-timestamp',
      `${label} is more than 5 seconds later than verifier clock.`,
      { phaseNumber, failureClass: 'harness-state' },
    );
  }
}

function collectUnavailableCapabilities(payload = {}) {
  const direct = Array.isArray(payload.unavailableCapabilities) ? payload.unavailableCapabilities : [];
  const lease = Array.isArray(payload.phaseRunLease?.unavailableCapabilities) ? payload.phaseRunLease.unavailableCapabilities : [];
  return [...direct, ...lease].filter((entry) => entry && typeof entry === 'object');
}

function inspectMemoryGraphCapabilities({ workflowStates, strictMemory = false, violations, degradedEvidence }) {
  const seen = new Set();
  for (const { basename, payload } of workflowStates) {
    for (const entry of collectUnavailableCapabilities(payload)) {
      if (normalizeLower(entry.code) !== 'memorygraph_unavailable') {
        continue;
      }
      const strict = strictMemory || ['true', 'strict', 'blocking'].includes(normalizeLower(entry.strict));
      const key = `${basename}:${entry.code}:${entry.fingerprint || entry.source || ''}:${strict}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const evidence = {
        code: 'memorygraph_unavailable',
        source: entry.source || basename,
        evidencePath: entry.evidencePath || '',
        strict,
      };
      if (strict) {
        addViolation(
          violations,
          'memorygraph-unavailable-strict',
          `${basename} records strict MemoryGraph unavailability.`,
          { failureClass: 'environment-permission' },
        );
      } else {
        degradedEvidence.push(evidence);
      }
    }
  }
}

function statePhaseNumber(payload = {}) {
  return normalizeText(
    payload.activePhaseNumber
      ?? payload.phaseNumber
      ?? payload.phase?.number
      ?? payload.phaseRunLease?.phase?.number
      ?? payload.phaseRunLease?.activePhaseNumber
      ?? '',
  );
}

function statePhaseTitle(payload = {}) {
  return normalizeText(
    payload.activePhaseTitle
      ?? payload.phaseTitle
      ?? payload.phase?.title
      ?? payload.phaseRunLease?.phase?.title
      ?? payload.phaseRunLease?.activePhaseTitle
      ?? '',
  );
}

function inspectIdentityMismatch({ statusRoot, phases, workflowStates, statusPath, violations }) {
  const repoRoot = path.dirname(path.dirname(path.dirname(statusPath)));
  const statusPlanDir = resolveMaybePath(statusRoot.planDir || (statusRoot.masterPlan ? path.dirname(statusRoot.masterPlan) : ''), repoRoot);
  const statusExecutionRoot = resolveMaybePath(statusRoot.executionRoot, repoRoot);
  const completedPhaseNumbers = new Set(phases.filter((phase) => phase.status === 'completed').map((phase) => String(phase.number)));

  for (const { basename, payload } of workflowStates) {
    const statePlanDir = resolveMaybePath(payload.planDir || payload.phaseRunLease?.planDir, repoRoot);
    if (statusPlanDir && statePlanDir && statusPlanDir !== statePlanDir) {
      addViolation(
        violations,
        'harness-state-plan-dir-mismatch',
        `${basename} points at planDir ${relativePath(repoRoot, statePlanDir)} while phase-status points at ${relativePath(repoRoot, statusPlanDir)}.`,
        { failureClass: 'harness-state' },
      );
    }

    const stateExecutionRoot = resolveMaybePath(payload.executionRoot || payload.phaseRunLease?.executionRoot, repoRoot);
    if (statusExecutionRoot && stateExecutionRoot && statusExecutionRoot !== stateExecutionRoot) {
      addViolation(
        violations,
        'harness-state-execution-root-mismatch',
        `${basename} points at executionRoot ${relativePath(repoRoot, stateExecutionRoot)} while phase-status points at ${relativePath(repoRoot, statusExecutionRoot)}.`,
        { failureClass: 'harness-state' },
      );
    }

    const payloadStatusFile = resolveMaybePath(payload.statusFile || payload.phaseRunLease?.statusFile, repoRoot);
    if (payloadStatusFile && path.resolve(statusPath) !== payloadStatusFile) {
      addViolation(
        violations,
        'harness-state-status-file-mismatch',
        `${basename} points at a different phase-status file.`,
        { failureClass: 'harness-state' },
      );
    }

    const phaseNumber = statePhaseNumber(payload);
    if (phaseNumber && completedPhaseNumbers.size > 0 && !completedPhaseNumbers.has(String(Number(phaseNumber)))) {
      addViolation(
        violations,
        'harness-state-phase-id-mismatch',
        `${basename} points at phase ${phaseNumber}, but completed phase-status entries are ${[...completedPhaseNumbers].join(', ')}.`,
        { failureClass: 'harness-state' },
      );
    }

    const phaseTitle = statePhaseTitle(payload);
    if (phaseNumber && phaseTitle) {
      const matchingPhase = phases.find((phase) => String(phase.number) === String(Number(phaseNumber)));
      if (matchingPhase?.title && normalizeLower(matchingPhase.title) !== normalizeLower(phaseTitle)) {
        addViolation(
          violations,
          'harness-state-phase-title-mismatch',
          `${basename} phase title does not match phase-status.`,
          { failureClass: 'harness-state' },
        );
      }
    }
  }
}

export function classifyHarnessViolation(code = '') {
  const normalized = normalizeLower(code);
  if (normalized.includes('memorygraph') || normalized.includes('eperm') || normalized.includes('permission')) {
    return 'environment-permission';
  }
  if (normalized.includes('delegated') || normalized.includes('executor') || normalized.includes('terminal-exit')) {
    return 'executor-failure';
  }
  if (normalized.includes('stale') || normalized.includes('expectation')) {
    return 'test-expectation-stale';
  }
  if (
    normalized.includes('current-run')
    || normalized.includes('active-phase-run')
    || normalized.includes('latest-dispatch')
    || normalized.includes('lease')
    || normalized.includes('harness-state')
    || normalized.includes('future-timestamp')
  ) {
    return 'harness-state';
  }
  return 'product-regression';
}

export function readHarnessStateSnapshot({ root = process.cwd(), statusFile = '', workflowDir = '' } = {}) {
  const resolvedStatusFile = statusFile ? path.resolve(root, statusFile) : path.resolve(root, '.claude/docs/phase-status.yaml');
  const resolvedWorkflowDir = workflowDir ? path.resolve(root, workflowDir) : path.join(root, '.claude', 'logs', 'workflow-enforcement');
  const workflowStates = WORKFLOW_STATE_FILES
    .map((basename) => ({
      basename,
      path: path.join(resolvedWorkflowDir, basename),
      payload: readJsonIfExists(path.join(resolvedWorkflowDir, basename)),
    }))
    .filter((entry) => entry.payload);

  return {
    statusFile: resolvedStatusFile,
    workflowDir: resolvedWorkflowDir,
    workflowStates,
  };
}

export function evaluateHarnessStateInvariants({
  statusRoot = {},
  phases = [],
  statusPath = '',
  workflowDir = '',
  now = '',
  strictMemory = false,
} = {}) {
  const violations = [];
  const degradedEvidence = [];
  const repoRoot = statusPath ? path.dirname(path.dirname(path.dirname(statusPath))) : process.cwd();
  const resolvedWorkflowDir = workflowDir || path.join(repoRoot, '.claude', 'logs', 'workflow-enforcement');
  const workflowStates = WORKFLOW_STATE_FILES
    .map((basename) => ({
      basename,
      path: path.join(resolvedWorkflowDir, basename),
      payload: readJsonIfExists(path.join(resolvedWorkflowDir, basename)),
    }))
    .filter((entry) => entry.payload);

  const completedPhases = phases.filter((phase) => phase.status === 'completed');
  const failedWorkflowStates = workflowStates.filter((entry) => isFailedWorkflowState(entry.payload));
  const runningWorkflowStates = workflowStates.filter((entry) => isRunningWorkflowState(entry.payload));

  for (const key of ['updatedAt', 'activeExecutionHeartbeatAt', 'lastExecutionHeartbeatAt']) {
    addFutureTimestampViolation(violations, `phase-status ${key}`, statusRoot[key], now);
  }

  for (const { basename, payload } of workflowStates) {
    for (const key of ['updatedAt', 'lastHeartbeatAt', 'completedAt', 'failedAt']) {
      addFutureTimestampViolation(violations, `${basename} ${key}`, payload[key], now);
    }
    for (const key of ['updatedAt', 'lastHeartbeatAt', 'completedAt', 'failedAt']) {
      addFutureTimestampViolation(violations, `${basename} phaseRunLease.${key}`, payload.phaseRunLease?.[key], now);
    }
  }

  for (const { basename, payload } of failedWorkflowStates) {
    const fallbackRunId = payload.fallbackRunId || payload.localFallbackCompletion?.runId || '';
    const fallbackRun = fallbackRunId ? readJsonIfExists(path.join(resolvedWorkflowDir, `${fallbackRunId}.json`)) : null;
    if (fallbackRun && isCompletedLocalFallback(fallbackRun)) {
      addViolation(
        violations,
        'delegated-failed-local-fallback-completed',
        `${basename} is failed and points at completed local fallback ${fallbackRunId}, but it was not superseded.`,
        { failureClass: 'executor-failure' },
      );
      continue;
    }
    addViolation(
      violations,
      workflowStateViolationCode(basename),
      `${basename} is failed while phase-status contains completed phase state.`,
      { failureClass: classifyHarnessViolation(workflowStateViolationCode(basename)) },
    );
  }

  if (completedPhases.length > 0) {
    for (const { basename, payload } of runningWorkflowStates) {
      const preparedDispatch = basename === 'latest-dispatch.json' && normalizeLower(payload.status || payload.completionStatus) === 'prepared';
      addViolation(
        violations,
        preparedDispatch ? 'latest-dispatch-stale-after-completion' : runningWorkflowStateViolationCode(basename),
        preparedDispatch
          ? 'latest-dispatch.json is still prepared after phase-status contains completed phase state.'
          : `${basename} is still running while phase-status contains completed phase state.`,
        { failureClass: 'harness-state' },
      );
    }
  }

  inspectIdentityMismatch({ statusRoot, phases, workflowStates, statusPath, violations });
  inspectMemoryGraphCapabilities({ workflowStates, strictMemory, violations, degradedEvidence });

  return {
    violations,
    degradedEvidence,
    workflowStates,
  };
}
