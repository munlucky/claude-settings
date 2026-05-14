import fs from 'node:fs';
import path from 'node:path';

import { detectSidecarMode } from './blocker-sidecar-state.mjs';

const FUTURE_TIMESTAMP_TOLERANCE_MS = 5000;
const WORKFLOW_STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];
const COMPLETED_PHASE_STATUSES = new Set(['completed']);
const BLOCKED_PHASE_STATUSES = new Set(['blocked', 'verification_blocked', 'runtime_unhealthy']);
const BLOCKED_ROOT_EXECUTION_STATUSES = new Set(['paused', 'blocked', 'verification_blocked', 'runtime_unhealthy']);
const GENERATED_STALE_PHASE_TOKEN = /\b(?:out_of_scope_for_phase_|phase_)(\d{1,3})\b/gi;
const ACTIVE_WORKFLOW_STATUSES = new Set(['prepared', 'running', 'active', 'in_progress']);
const TERMINAL_WORKFLOW_STATUSES = new Set([
  'completed',
  'superseded',
  'superseded-by-local-fallback',
  'failed',
  'blocked',
  'verification_blocked',
  'runtime_unhealthy',
  'stale',
]);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhaseNumber(value) {
  const parsed = Number.parseInt(String(value ?? '').replace(/^0+/, '') || '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function workflowStateClass(payload = {}) {
  const status = normalizeLower(
    payload.attemptOutcome
      || payload.phaseRunLease?.attemptOutcome
      || payload.completionStatus
      || payload.phaseRunLease?.completionStatus
      || payload.activeExecutionStatus
      || payload.status
      || payload.phaseRunLease?.status,
  );
  if (TERMINAL_WORKFLOW_STATUSES.has(status)) {
    return 'terminal';
  }
  if (ACTIVE_WORKFLOW_STATUSES.has(status)) {
    return 'active';
  }
  return 'unknown';
}

export function evaluateSidecarCanonicalInvariant(paths = {}, options = {}) {
  const mode = detectSidecarMode({ ...paths, fsImpl: options.fsImpl ?? fs });
  if (mode.mode === 'legacy_verifier' || mode.mode === 'sidecar_canonical') {
    return { ok: true, ...mode };
  }
  return {
    ok: false,
    ...mode,
    code: mode.mode,
    message: `Sidecar canonical mode is incomplete: ${mode.mode}`,
  };
}

function projectionNeedsActiveLog({ finish = {}, runtime = {}, status = '' } = {}) {
  const nextPath = normalizeLower(finish.nextPath);
  const finishStatus = normalizeLower(finish.status);
  const closeoutReason = normalizeLower(finish.closeoutReason);
  const runtimeStatus = normalizeLower(runtime.status || status);
  const normalizedRunVerdict = normalizeLower(runtime.normalizedRunVerdict);
  return nextPath === 'clean_finish'
    || finishStatus === 'passed'
    || closeoutReason === 'blocked'
    || runtimeStatus.includes('blocked')
    || normalizedRunVerdict === 'complete_with_environment_blocker';
}

export function assertProjectionHasActiveLog({ logFile = '', finish = {}, runtime = {}, status = '' } = {}) {
  if (!projectionNeedsActiveLog({ finish, runtime, status })) {
    return { ok: true };
  }
  if (normalizeText(logFile)) {
    return { ok: true };
  }
  const error = new Error('Artifact projection requires an active log path for final or blocked publish states.');
  error.code = 'artifact_projection_missing_active_log';
  throw error;
}

export function collectGeneratedStalePhaseTokens(value, activePhaseNumber, label = 'value') {
  const active = normalizePhaseNumber(activePhaseNumber);
  if (!active) {
    return [];
  }
  const text = String(value ?? '');
  const violations = [];
  for (const match of text.matchAll(GENERATED_STALE_PHASE_TOKEN)) {
    const tokenPhase = normalizePhaseNumber(match[1]);
    if (tokenPhase && tokenPhase !== active) {
      violations.push({
        label,
        token: match[0],
        tokenPhase,
        activePhaseNumber: active,
      });
    }
  }
  return violations;
}

export function assertNoGeneratedStalePhaseResidue({ activePhaseNumber, fields = {} } = {}) {
  const violations = [];
  for (const [label, value] of Object.entries(fields || {})) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        violations.push(...collectGeneratedStalePhaseTokens(entry, activePhaseNumber, `${label}[${index}]`));
      });
      continue;
    }
    violations.push(...collectGeneratedStalePhaseTokens(value, activePhaseNumber, label));
  }
  if (violations.length === 0) {
    return { ok: true, violations };
  }
  const rendered = violations.map((entry) => `${entry.label}:${entry.token}`).join(', ');
  const error = new Error(`Generated stale phase residue cannot be projected into current artifacts: ${rendered}`);
  error.code = 'artifact_projection_stale_phase_residue';
  error.violations = violations;
  throw error;
}

export function evaluateCloseoutInvariant({ phaseStatus = '', normalizedRunVerdict = '', environmentBlockers = [] } = {}) {
  const status = normalizeLower(phaseStatus);
  const verdict = normalizeLower(normalizedRunVerdict);
  const blockers = Array.isArray(environmentBlockers) ? environmentBlockers.filter(Boolean) : [];
  if (verdict === 'complete_with_environment_blocker') {
    return {
      ok: blockers.length > 0 && ['blocked', 'verification_blocked', 'in_progress'].includes(status),
      normalizedRunVerdict: verdict,
      completionState: 'blocked_by_environment',
      reason: blockers.length > 0
        ? 'environment blocker completion must remain blocked or in_progress'
        : 'complete_with_environment_blocker requires environmentBlockers evidence',
    };
  }
  if (status === 'completed' && ['complete', 'success', 'success_with_warning'].includes(verdict)) {
    return { ok: true, normalizedRunVerdict: verdict, completionState: 'completed', reason: 'clean completion' };
  }
  if (['blocked', 'verification_blocked'].includes(status)) {
    return { ok: true, normalizedRunVerdict: verdict || 'blocked', completionState: 'blocked', reason: 'blocked phase state' };
  }
  if (['failed', 'superseded', 'in_progress', 'pending'].includes(status)) {
    return { ok: true, normalizedRunVerdict: verdict || status, completionState: status, reason: `${status} phase state` };
  }
  return { ok: false, normalizedRunVerdict: verdict, completionState: status || 'unknown', reason: 'unknown phase closeout state' };
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

function hasCompletedFinalOutcome(payload = {}) {
  const finalVerdict = normalizeLower(payload.finalVerdict);
  const normalizedRunVerdict = normalizeLower(payload.normalizedRunVerdict);
  const activeExecutionStatus = normalizeLower(payload.activeExecutionStatus);
  const completionState = normalizeLower(payload.completion?.state);
  return ['complete', 'passed', 'success'].includes(finalVerdict)
    && ['complete', 'success', 'success_with_warning'].includes(normalizedRunVerdict)
    && (activeExecutionStatus === 'completed' || completionState === 'completed');
}

export function isFailedWorkflowState(payload = {}) {
  if (!payload || isSupersededByLocalFallback(payload)) {
    return false;
  }
  if (hasCompletedFinalOutcome(payload)) {
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
  return workflowStateClass(payload) === 'active';
}

function isPausedWorkflowState(payload = {}) {
  const fields = [
    payload.status,
    payload.completionStatus,
    payload.activeExecutionStatus,
    payload.attemptOutcome,
    payload.phaseRunLease?.status,
    payload.phaseRunLease?.completionStatus,
    payload.phaseRunLease?.activeExecutionStatus,
    payload.phaseRunLease?.attemptOutcome,
  ].map(normalizeLower);
  return fields.includes('paused');
}

function hasLiveChildEvidence(payload = {}) {
  return payload.childAlive === true
    || payload.liveness?.childAlive === true
    || payload.phaseRunLease?.childAlive === true
    || payload.phaseRunLease?.liveness?.childAlive === true;
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
    if (isPausedWorkflowState(payload) && hasLiveChildEvidence(payload)) {
      addViolation(
        violations,
        'paused-workflow-child-alive',
        `${basename} is paused but still reports a live child process.`,
        { failureClass: 'harness-state' },
      );
    }
  }
}

function statePhaseNumber(payload = {}) {
  return normalizeText(
    payload.phase?.number
      ?? payload.phaseRunLease?.phase?.number
      ?? payload.phaseNumber
      ?? payload.phaseRunLease?.activePhaseNumber
      ?? payload.activePhaseNumber
      ?? '',
  );
}

function statePhaseTitle(payload = {}) {
  return normalizeText(
    payload.phase?.title
      ?? payload.phaseRunLease?.phase?.title
      ?? payload.phaseTitle
      ?? payload.phaseRunLease?.activePhaseTitle
      ?? payload.activePhaseTitle
      ?? '',
  );
}

function workflowStateRunId(payload = {}) {
  return normalizeText(
    payload.runId
      ?? payload.phaseRunLease?.runId
      ?? payload.activeRunLeaseId
      ?? payload.phaseRunLease?.activeRunLeaseId
      ?? '',
  );
}

function activeBlockedPhaseForWorkflowState({ statusRoot = {}, phases = [], payload = {} } = {}) {
  const statePhase = Number.parseInt(statePhaseNumber(payload), 10);
  const activePhase = Number.parseInt(normalizeText(statusRoot.activePhaseNumber), 10);
  if (!Number.isInteger(statePhase) || !Number.isInteger(activePhase) || statePhase !== activePhase) {
    return null;
  }

  const matchingPhase = phases.find((phase) => Number(phase.number) === statePhase);
  if (!matchingPhase || !BLOCKED_PHASE_STATUSES.has(normalizeLower(matchingPhase.status))) {
    return null;
  }

  const rootExecutionStatus = normalizeLower(statusRoot.activeExecutionStatus || statusRoot.status);
  if (rootExecutionStatus && !BLOCKED_ROOT_EXECUTION_STATUSES.has(rootExecutionStatus)) {
    return null;
  }

  return matchingPhase;
}

function activeOpenPhaseForWorkflowState({ statusRoot = {}, phases = [], payload = {} } = {}) {
  const statePhase = Number.parseInt(statePhaseNumber(payload), 10);
  const activePhase = Number.parseInt(normalizeText(statusRoot.activePhaseNumber), 10);
  if (!Number.isInteger(statePhase) || !Number.isInteger(activePhase) || statePhase !== activePhase) {
    return null;
  }

  const matchingPhase = phases.find((phase) => Number(phase.number) === statePhase);
  if (!matchingPhase || COMPLETED_PHASE_STATUSES.has(normalizeLower(matchingPhase.status))) {
    return null;
  }

  return matchingPhase;
}

function blockedActiveWorkflowEvidence({ basename, payload, phase }) {
  return {
    code: 'active_phase_blocked_workflow_state',
    source: basename,
    phaseNumber: Number(phase.number),
    phaseStatus: phase.status,
    runId: workflowStateRunId(payload),
    failureClass: normalizeText(payload.failureClass || payload.phaseRunLease?.failureClass),
    status: normalizeText(payload.status || payload.completionStatus || payload.activeExecutionStatus),
  };
}

function inspectIdentityMismatch({ statusRoot, phases, workflowStates, statusPath, violations }) {
  const repoRoot = path.dirname(path.dirname(path.dirname(statusPath)));
  const statusPlanDir = resolveMaybePath(statusRoot.planDir || (statusRoot.masterPlan ? path.dirname(statusRoot.masterPlan) : ''), repoRoot);
  const statusExecutionRoot = resolveMaybePath(statusRoot.executionRoot, repoRoot);
  const phasesByNumber = new Map(phases.map((phase) => [String(Number(phase.number)), phase]));

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
    const matchingPhase = phaseNumber ? phasesByNumber.get(String(Number(phaseNumber))) : null;
    if (phaseNumber && !matchingPhase) {
      addViolation(
        violations,
        'harness-state-phase-id-mismatch',
        `${basename} points at phase ${phaseNumber}, but phase-status has no matching phase entry.`,
        { failureClass: 'harness-state' },
      );
    }

    const phaseTitle = statePhaseTitle(payload);
    if (matchingPhase && phaseTitle) {
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
  sidecarPaths = null,
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

  if (sidecarPaths) {
    const sidecarInvariant = evaluateSidecarCanonicalInvariant(sidecarPaths);
    if (!sidecarInvariant.ok) {
      addViolation(
        violations,
        sidecarInvariant.code,
        sidecarInvariant.message,
        { failureClass: 'harness-state' },
      );
    }
  }

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
    const blockedActivePhase = activeBlockedPhaseForWorkflowState({ statusRoot, phases, payload });
    if (blockedActivePhase) {
      degradedEvidence.push(blockedActiveWorkflowEvidence({ basename, payload, phase: blockedActivePhase }));
      continue;
    }

    if (activeOpenPhaseForWorkflowState({ statusRoot, phases, payload })) {
      continue;
    }

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
      const blockedActivePhase = activeBlockedPhaseForWorkflowState({ statusRoot, phases, payload });
      if (blockedActivePhase) {
        degradedEvidence.push(blockedActiveWorkflowEvidence({ basename, payload, phase: blockedActivePhase }));
        continue;
      }

      if (activeOpenPhaseForWorkflowState({ statusRoot, phases, payload })) {
        continue;
      }

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
