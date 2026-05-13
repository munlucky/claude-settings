#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCommand } from './lib/process-utils.mjs';
import { archivePromptText, summarizeSpawnCommand } from './lib/prompt-redaction.mjs';
import { resolveEffortEscalationReason, resolveEffortProfile } from './lib/effort-profile.mjs';
import { createPhaseHarnessCaptureSession } from './lib/awtl-harness-capture.mjs';
import { appendWasteLedgerEntry } from './lib/waste-ledger.mjs';
import { resolveModelRoute } from './lib/model-routing-policy.mjs';
import { classifyFailure } from './lib/failure-classifier.mjs';
import { buildCompositeMonitorCursor } from './lib/phase-run-lease-status.mjs';
import { recordLifecycleTransition } from './lib/lifecycle-projection-writer.mjs';
import {
  evaluatePidLiveness,
  isPidAliveInCurrentNamespace,
} from './lib/phase-liveness-checker.mjs';
import {
  knownUnavailableSummary,
  recordUnavailableCapability,
} from './lib/runtime-unavailable-cache.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const runtimeCliPath = path.join(SCRIPT_DIR, 'runtime-cli.mjs');
const phasePlanPath = path.join(SCRIPT_DIR, 'agent-loop-phase-plan.mjs');
const phaseStatePath = path.join(SCRIPT_DIR, 'agent-loop-phase-state.mjs');
const phaseArtifactsPath = path.join(SCRIPT_DIR, 'agent-loop-phase-artifacts.mjs');
const phaseRunLeasePath = path.join(SCRIPT_DIR, 'phase-run-lease.mjs');
const runtimeStatePath = path.join(SCRIPT_DIR, 'runtime-state.mjs');
const finalGitCloseoutPath = path.join(SCRIPT_DIR, 'phase-final-git-closeout.mjs');
const phaseCloseoutReconcilerPath = path.join(SCRIPT_DIR, 'phase-closeout-reconciler.mjs');
const PHASE_COORDINATOR_CONTRACT_TEMPLATE = path.join(SCRIPT_DIR, '..', 'templates', 'execution', 'PHASE_COORDINATOR_CONTRACT.md');
const debugLog = path.join('.claude', 'logs', 'agent-loop', 'debug.jsonl');

const state = {
  planDir: '',
  executionMode: 'auto',
  statusFile: '.claude/docs/phase-status.yaml',
  executionRoot: '',
  runtime: 'auto',
  verificationRuntimes: 'auto',
  maxAttempts: 3,
  stopOnFailure: true,
  autonomous: false,
  dryRun: false,
  effortProfile: resolveEffortProfile(process.env.PHASE_DISPATCH_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE, 'standard'),
  effortEscalationReason: resolveEffortEscalationReason({
    profile: process.env.PHASE_DISPATCH_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE ?? 'standard',
    explicitReason: process.env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON
      ?? process.env.MOONSHOT_EFFORT_ESCALATION_REASON,
  }),
  allowInteractiveInSession: (process.env.PHASE_DISPATCH_ALLOW_INTERACTIVE_IN_SESSION ?? 'false') === 'true',
  killStale: (process.env.PHASE_DISPATCH_KILL_STALE ?? 'true') === 'true',
  parallelWorktrees: Number.parseInt(process.env.PHASE_PARALLEL_WORKTREES ?? '1', 10) || 1,
  worktreeBase: process.env.PHASE_WORKTREE_BASE || 'HEAD',
  worktreeRoot: process.env.PHASE_WORKTREE_ROOT || '.tmp/harness-worktrees/phase-runs',
  goalTimeBudgetSeconds: process.env.PHASE_GOAL_TIME_BUDGET_SECONDS || '',
  goalTokenBudget: process.env.PHASE_GOAL_TOKEN_BUDGET || '',
  finalGitCloseout: process.env.PHASE_FINAL_GIT_CLOSEOUT || 'strict',
  staleNoProgressSeconds: Number.parseInt(process.env.PHASE_DISPATCH_STALE_NO_PROGRESS_SECONDS ?? '3300', 10) || 0,
  resume: false,
};

const runtimeState = {
  runLeaseId: '',
  leaseActive: false,
  childPid: null,
  pidNamespace: 'node-parent',
  lastChildPid: null,
  lastChildExitAt: '',
  lastChildExitCode: null,
  lastChildExitSignal: '',
  childExitHandled: false,
  captureSession: null,
  launchProgressFingerprint: '',
  lastProgressFingerprint: '',
  lastProgressAtMs: 0,
  staleStopTriggered: false,
};
const protectedPids = new Set([process.pid]);
const strictMemoryGateEnabled = String(process.env.PHASE_STRICT_MEMORY_GATE ?? process.env.MEMORYGRAPH_STRICT_MODE ?? 'false').toLowerCase() === 'true';
const unavailableCapabilityCodes = new Set([
  'memorygraph_unavailable',
  'plugin_network_sync_failed',
  'path_update_denied',
  'mcp_cleanup_eperm',
]);

const MAX_DELEGATED_RESTARTS = Number.parseInt(process.env.PHASE_DISPATCH_MAX_DELEGATED_RESTARTS ?? '32', 10) || 32;
const MAX_COORDINATOR_RESTARTS = Number.parseInt(
  process.env.PHASE_DISPATCH_MAX_PLAN_COMPLETION_RESTARTS
    ?? process.env.PHASE_DISPATCH_MAX_DELEGATED_RESTARTS
    ?? '32',
  10,
) || 32;
const MAX_SIGNAL_RESTARTS = Number.parseInt(process.env.PHASE_DISPATCH_MAX_SIGNAL_RESTARTS ?? '4', 10) || 4;
const SIGNAL_LIKE_EXIT_CODES = new Set([129, 130, 131, 143]);
const LATEST_DISPATCH_STATUS_VALUES = new Set([
  'prepared',
  'running',
  'completed',
  'failed',
  'superseded',
  'superseded-by-local-fallback',
]);

function assertLatestDispatchStatus(status, lifecycleEvent = '') {
  if (!LATEST_DISPATCH_STATUS_VALUES.has(status)) {
    throw new TypeError(`unsupported latest-dispatch.status: ${status}`);
  }
  if (status === lifecycleEvent) {
    throw new TypeError('latest-dispatch.status must not store lifecycleEvent values');
  }
}

function withLatestDispatchLifecycle(payload = {}, {
  lifecycleEvent,
  dispatchStage,
  timestamp = utcTimestamp(),
  patch = {},
} = {}) {
  const status = patch.status || payload.status || 'prepared';
  const attemptId = patch.attemptId
    || patch.runLeaseId
    || payload.attemptId
    || payload.runLeaseId
    || payload.phaseRunLease?.attemptId
    || payload.phaseRunLease?.runLeaseId
    || runtimeState.runLeaseId
    || `dispatch-${String(lifecycleEvent || 'lifecycle').replace(/[^a-z0-9_-]/gi, '-')}`;
  assertLatestDispatchStatus(status, lifecycleEvent);
  return {
    ...payload,
    ...patch,
    status,
    attemptId,
    lifecycleEvent,
    dispatchStage,
    lastLifecycleEventAt: timestamp,
    updatedAt: timestamp,
    stateRunId: patch.stateRunId || payload.stateRunId || runtimeState.runLeaseId || '',
  };
}

export function assertProjectionStateRunId(previousPayload = {}, nextPayload = {}, targetFile = '') {
  const previousRunId = String(previousPayload?.stateRunId || '').trim();
  const nextRunId = String(nextPayload?.stateRunId || runtimeState.runLeaseId || '').trim();
  if (!previousRunId || !nextRunId || previousRunId === nextRunId) {
    return true;
  }
  const previousStatus = String(previousPayload.status || previousPayload.activeExecutionStatus || previousPayload.completionStatus || '').trim().toLowerCase();
  if (['active', 'running', 'blocked', 'in_progress'].includes(previousStatus)) {
    throw new Error(`stateRunId mismatch rejected before projection overwrite: ${targetFile || 'compatibility projection'} (${previousRunId} != ${nextRunId})`);
  }
  return true;
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function showHelp() {
  writeStdoutLine(`Usage:
  node .claude/scripts/moonshot-phase-dispatch.mjs <plan-dir> [options]

Compatibility wrapper:
  ./.claude/scripts/moonshot-phase-dispatch.sh <plan-dir> [options]

Options:
  --execution-mode <mode>   auto|delegated-terminal|in-session-coordinator
  --status-file <path>      Default: .claude/docs/phase-status.yaml
  --execution-root <path>   Default: <plan-dir>/execution
  --runtime <runtime>       auto|claude|codex
  --verification-runtimes <target>
                            auto|current|claude|codex|both
  --max-attempts <n>        Default: 3 (coordinator mode)
  --stop-on-failure         Stop when retry cap is reached (default)
  --continue-on-failure     Keep going after failure
  --autonomous              Reserved for compatibility (agent-loop is autonomous by default)
  --allow-interactive-in-session
                            Keep in-session-coordinator on Codex instead of falling back
  --parallel-worktrees <n>  Opt-in phase-internal workset parallelism (delegated-terminal only)
  --worktree-base <ref>     Base ref for workset worktrees. Default: HEAD
  --worktree-root <path>    Root for temporary workset worktrees
  --goal-time-budget-seconds <n>
                            Optional SQLite goal runtime time budget
  --goal-token-budget <n>   Optional SQLite goal runtime token budget
  --final-git-closeout <mode>
                            strict|warn|off. Default: strict
  --resume                  Explicitly resume an existing phase run board
  --dry-run                 Print resolved command without executing`);
}

function logInfo(message) {
  writeStdoutLine(`INFO: ${message}`);
}

function logWarn(message) {
  writeStdoutLine(`WARN: ${message}`);
}

function logError(message) {
  console.error(`ERROR: ${message}`);
}

function appendDebugLog(event, details = {}) {
  fs.mkdirSync(path.dirname(debugLog), { recursive: true });
  fs.appendFileSync(debugLog, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    source: 'moonshot-phase-dispatch',
    event,
    ...details,
  })}\n`, 'utf8');
}

function appendCaptureWarning(context, detail) {
  const detailText = String(detail || '');
  const classification = classifyFailure({
    message: detailText,
    detail: detailText,
    stderr: detailText,
    stdout: detailText,
    reason: context,
  });
  const cachedSummary = classification.code === 'unknown_failure' || strictMemoryGateEnabled
    ? ''
    : knownUnavailableSummary(state.statusFile, { code: classification.code });
  if (unavailableCapabilityCodes.has(classification.code)) {
    recordUnavailableCapability(state.statusFile, {
      code: classification.code,
      fingerprint: classification.fingerprint,
      source: context,
      evidencePath: debugLog,
      strict: strictMemoryGateEnabled ? 'true' : 'false',
    });
  }
  const record = appendWasteLedgerEntry({
    repoRoot: process.cwd(),
    kind: 'warning',
    phase: 'dispatch',
    phaseTitle: path.basename(state.planDir || ''),
    context,
    detail: cachedSummary || detailText,
    evidencePath: debugLog,
    action: 'capture_warning',
    source: 'moonshot-phase-dispatch',
    runtime: state.runtime || 'auto',
    stage: 'ready/isolate',
  });
  if (record.firstOccurrence) {
    appendDebugLog('awtl-capture-warning', {
      context,
      detail: cachedSummary || detailText,
      warningClass: record.entry.class,
    });
  }
}

function ensureCommand(name, errorMessage) {
  const result = runCommand(name, ['--help']);
  if (result.error && result.error.code === 'ENOENT') {
    logError(errorMessage);
    process.exit(1);
  }
}

function runtimeCli(args) {
  const result = spawnSync('node', [runtimeCliPath, ...args], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    return [];
  }

  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function phasePlan(command, ...args) {
  const result = runNodeScript(phasePlanPath, [command, ...args]);
  if ((result.status ?? 0) !== 0) {
    throw new Error(result.stderr || result.stdout || `phase-plan command failed: ${command}`);
  }
  return result.stdout.trim();
}

function readStatusMasterPlan() {
  if (!state.statusFile || !fs.existsSync(state.statusFile)) {
    return '';
  }
  for (const rawLine of fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/)) {
    const stripped = rawLine.trim();
    if (stripped === 'phases:') {
      return '';
    }
    const match = rawLine.match(/^masterPlan:\s*(.+)\s*$/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
  }
  return '';
}

function assertPlanStatusIdentity() {
  const masterPlan = readStatusMasterPlan();
  if (!masterPlan) {
    return;
  }
  const statusPlanDir = path.dirname(masterPlan);
  if (path.resolve(statusPlanDir) !== path.resolve(state.planDir)) {
    logError(`plan-status-mismatch: status masterPlan '${masterPlan}' belongs to '${statusPlanDir}', not '${state.planDir}'`);
    process.exit(1);
  }
}

function readCurrentNormalizedVerdict() {
  if (!state.statusFile || !fs.existsSync(state.statusFile)) {
    return '';
  }
  for (const line of fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped === 'phases:') {
      break;
    }
    if (stripped.startsWith('normalizedRunVerdict:')) {
      return stripped.slice('normalizedRunVerdict:'.length).trim().replace(/^"|"$/g, '');
    }
  }
  return '';
}

function setNormalizedRunVerdict(normalizedRunVerdict, stopReasonClass, stopReasonExplanation) {
  const current = readCurrentNormalizedVerdict();
  const priority = {
    success: 0,
    complete_with_environment_blocker: 1,
    success_with_warning: 1,
    paused: 2,
    blocked: 3,
    failed: 3,
    checkpoint_required: 4,
  };
  if (current && (priority[current] ?? -1) > (priority[normalizedRunVerdict] ?? -1)) {
    return;
  }
  const result = runNodeScript(phaseStatePath, [
    'set-root-run-verdict',
    state.statusFile,
    normalizedRunVerdict,
    stopReasonClass,
    stopReasonExplanation || '',
  ]);
  if ((result.status ?? 0) !== 0) {
    appendDebugLog('dispatch-normalized-verdict-write-failed', {
      normalizedRunVerdict,
      stopReasonClass,
      stderr: result.stderr || '',
    });
  }
}

function normalizeDispatchVerdict(exitCode, stopReasonCode, detail, completionStatus) {
  const reason = String(stopReasonCode || '').toLowerCase();
  const explanation = String(detail || stopReasonCode || '').trim();
  const environmentBlockedComplete = /\b(environment[-_ ]blocked|external[-_ ]smoke[-_ ]blocked|provider[-_ ]smoke[-_ ]blocked|credential[-_ ]blocked)\b/i.test(`${reason} ${explanation}`)
    && /\b(complete|completed|local[-_ ]implementation|implementation[-_ ]complete|phase[-_ ]only)\b/i.test(`${completionStatus || ''} ${explanation}`);
  if (environmentBlockedComplete) {
    return {
      normalizedRunVerdict: 'complete_with_environment_blocker',
      stopReasonClass: 'environment_blocker',
      stopReasonExplanation: explanation || 'implementation completed but external provider smoke is environment-blocked',
    };
  }
  if (exitCode === 0) {
    return {
      normalizedRunVerdict: 'success',
      stopReasonClass: 'clean_complete',
      stopReasonExplanation: explanation || 'plan directory completed',
    };
  }
  if (reason.includes('final-git-closeout') || reason.includes('checkpoint') || reason.includes('dirty')) {
    return {
      normalizedRunVerdict: 'checkpoint_required',
      stopReasonClass: reason.includes('dirty') ? 'dirty_worktree' : 'git_checkpoint_failed',
      stopReasonExplanation: explanation || 'final git checkpoint required',
    };
  }
  if (reason.includes('pause') || completionStatus === 'paused') {
    return {
      normalizedRunVerdict: 'paused',
      stopReasonClass: 'user_pause',
      stopReasonExplanation: explanation || 'dispatcher paused',
    };
  }
  if (reason.includes('user_validation_required') || reason.includes('user validation') || reason.includes('demo-approval') || reason.includes('approval')) {
    return {
      normalizedRunVerdict: 'blocked',
      stopReasonClass: 'user_validation_required',
      stopReasonExplanation: explanation || 'user demo approval is required before continuing',
    };
  }
  if (reason.includes('runtime') || reason.includes('signal') || reason.includes('delegated-terminal-exit')) {
    return {
      normalizedRunVerdict: 'blocked',
      stopReasonClass: 'runtime_unavailable',
      stopReasonExplanation: explanation || 'runtime unavailable',
    };
  }
  if (reason.includes('verification')) {
    return {
      normalizedRunVerdict: 'failed',
      stopReasonClass: 'verification_failed',
      stopReasonExplanation: explanation || 'verification failed',
    };
  }
  return {
    normalizedRunVerdict: 'failed',
    stopReasonClass: 'unknown',
    stopReasonExplanation: explanation || `dispatcher exited with code ${exitCode}`,
  };
}

function dispatchGitPreflight() {
  const repoProbe = spawnSync('git', ['-c', `safe.directory=${process.cwd()}`, '-c', 'core.editor=true', 'rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if ((repoProbe.status ?? 0) !== 0) {
    const detail = (repoProbe.stderr || repoProbe.stdout || repoProbe.error?.message || 'git rev-parse --show-toplevel failed').trim();
    const classification = classifyFailure({ name: 'git.dispatch-preflight', detail });
    appendDebugLog('dispatch-git-preflight-failed', {
      step: 'rev-parse',
      status: repoProbe.status ?? null,
      detail,
      failureClass: classification.code,
      fallbackHint: classification.fallbackHint,
    });
    return {
      ok: false,
      detail,
      failureClass: classification.code,
      fallbackHint: classification.fallbackHint || 'rerun from a valid git worktree or repair safe.directory permissions',
    };
  }

  const repoRoot = String(repoProbe.stdout || '').trim();
  const statusProbe = spawnSync('git', ['-c', `safe.directory=${repoRoot}`, '-c', 'core.editor=true', 'status', '--short', '--untracked-files=all'], {
    cwd: repoRoot || process.cwd(),
    encoding: 'utf8',
  });
  if ((statusProbe.status ?? 0) !== 0) {
    const detail = (statusProbe.stderr || statusProbe.stdout || statusProbe.error?.message || 'git status failed').trim();
    const classification = classifyFailure({ name: 'git.dispatch-preflight', detail });
    appendDebugLog('dispatch-git-preflight-failed', {
      step: 'status',
      repoRoot,
      status: statusProbe.status ?? null,
      detail,
      failureClass: classification.code,
      fallbackHint: classification.fallbackHint,
    });
    return {
      ok: false,
      detail,
      failureClass: classification.code,
      fallbackHint: classification.fallbackHint || 'repair git permissions, then rerun dispatch',
    };
  }

  appendDebugLog('dispatch-git-preflight-ok', {
    repoRoot,
    dirtyPathCount: String(statusProbe.stdout || '').split(/\r?\n/).filter(Boolean).length,
  });
  return { ok: true, repoRoot };
}

function closeLatestDispatchEvidence({ exitCode, detail, returnBoundary = '', stopReasonCode = '', completionStatus = '' } = {}) {
  const latestFile = path.join('.claude', 'logs', 'workflow-enforcement', 'latest-dispatch.json');
  if (!fs.existsSync(latestFile)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  } catch (error) {
    appendDebugLog('latest-dispatch-close-failed', {
      reason: 'json-parse-failed',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (payload.status === 'superseded-by-local-fallback') {
    return payload;
  }

  const recovered = String(completionStatus || '').toLowerCase().includes('completed-via-local-fallback')
    || String(stopReasonCode || '').toLowerCase().includes('local-fallback');
  const terminalStatus = recovered
    ? 'superseded-by-local-fallback'
    : ((exitCode ?? 0) === 0 ? 'completed' : 'failed');
  const now = utcTimestamp();
  const lifecycleEvent = recovered ? 'dispatch_superseded' : ((exitCode ?? 0) === 0 ? 'dispatch_completed' : 'dispatch_failed');
  const next = withLatestDispatchLifecycle(payload, {
    lifecycleEvent,
    dispatchStage: 'terminal',
    timestamp: now,
    patch: {
      status: terminalStatus,
      completionStatus: completionStatus || ((exitCode ?? 0) === 0 ? 'completed' : 'failed'),
      recoveryStatus: recovered ? 'recovered' : 'none',
      completionPath: recovered ? 'local-fallback' : ((exitCode ?? 0) === 0 ? 'clean-dispatch' : 'dispatch-stop'),
      returnBoundary,
      stopReasonCode: stopReasonCode || `exit-${exitCode ?? 0}`,
      rawStopReasonCode: payload.rawStopReasonCode || stopReasonCode || `exit-${exitCode ?? 0}`,
      blockingStopReasonCode: (exitCode ?? 0) === 0 || recovered ? '' : (stopReasonCode || `exit-${exitCode ?? 0}`),
      stopReasonDetail: detail || '',
      completedAt: (exitCode ?? 0) === 0 || recovered ? now : payload.completedAt,
      failedAt: (exitCode ?? 0) === 0 || recovered ? payload.failedAt : now,
    },
  });
  assertProjectionStateRunId(payload, next, latestFile);
  recordLifecycleTransition({
    source: 'moonshot-phase-dispatch',
    targetStateFiles: [latestFile],
    primaryTargetStateFile: latestFile,
    phaseNumber: next.phaseNumber || 0,
    phaseTitle: next.phaseTitle || 'moonshot-phase-dispatch',
    status: next.status,
    completionStatus: next.completionStatus,
    lifecycleEvent: next.lifecycleEvent,
    attemptId: next.attemptId || next.runLeaseId || runtimeState.runLeaseId,
    timestamp: now,
    pidNamespace: next.pidNamespace || (next.childPid || next.dispatcherPid ? 'node-parent' : undefined),
    payloadPatch: next,
    writeMode: 'replace',
  });
  appendDebugLog('latest-dispatch-closed', {
    status: next.status,
    completionStatus: next.completionStatus,
    stopReasonCode: next.stopReasonCode,
  });
  return next;
}

function parseAssignments(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    value = value.replace(/^'/, '').replace(/'$/, '').replace(/'\\''/g, "'");
    values[key] = value;
  }
  return values;
}

function generateRunLeaseId() {
  return `dispatch-${Date.now()}-${process.pid}`;
}

function leaseAssignments(command, ...args) {
  const result = runNodeScript(phaseRunLeasePath, [command, ...args]);
  if ((result.status ?? 0) !== 0) {
    throw new Error(result.stderr || `phase-run-lease failed: ${command}`);
  }
  return parseAssignments(result.stdout);
}

function cleanupPreviousDeadDispatchLease() {
  const activeRunFile = path.join('.claude', 'logs', 'workflow-enforcement', 'active-phase-run.json');
  if (!fs.existsSync(activeRunFile)) {
    return null;
  }
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(activeRunFile, 'utf8'));
  } catch (error) {
    appendDebugLog('phase-run-lease-previous-cleanup-skipped', {
      reason: 'active-run-json-parse-failed',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (!existing || existing.status !== 'active' || !existing.runLeaseId || !existing.dispatcherPid) {
    return null;
  }
  if (existing.planDir && path.resolve(existing.planDir) !== path.resolve(state.planDir)) {
    return null;
  }
  if (isPidAliveInCurrentNamespace(Number(existing.dispatcherPid))) {
    return null;
  }
  const values = leaseAssignments(
    'heartbeat',
    state.statusFile,
    existing.runLeaseId,
    'stale-preflight',
    existing.phase?.number || '',
    existing.phase?.title || '',
    existing.completionStatus || 'running',
  );
  appendDebugLog('phase-run-lease-previous-dead-dispatch-cleanup', {
    runLeaseId: existing.runLeaseId,
    dispatcherPid: existing.dispatcherPid,
    values,
  });
  return values;
}

function activePhaseContext() {
  const result = runNodeScript(phaseStatePath, ['get-active-phase-context', state.statusFile]);
  if ((result.status ?? 0) !== 0) {
    return {};
  }
  return parseAssignments(result.stdout);
}

function readGoalRuntimeStatus() {
  try {
    const result = spawnSync(process.execPath, [runtimeStatePath, 'goal-status', state.planDir], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS || '1',
      },
    });
    if (result.error || (result.status ?? 0) !== 0) {
      return null;
    }
    const payload = JSON.parse(result.stdout || '{}');
    return payload && payload.found ? payload : null;
  } catch (error) {
    appendDebugLog('goal-runtime-status-read-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function goalRuntimeControlledStop() {
  const payload = readGoalRuntimeStatus();
  const status = String(payload?.goal?.status || '').trim();
  if (status === 'paused') {
    return {
      code: 'goal-paused',
      detail: 'Goal runtime is paused; delegated loop must not restart while actionable phases remain.',
      completionStatus: 'paused',
    };
  }
  if (status === 'budget_limited') {
    return {
      code: 'goal-budget-limited',
      detail: 'Goal runtime reached its configured budget; delegated loop must stop before starting new work.',
      completionStatus: 'budget_limited',
    };
  }
  if (payload?.goal?.continuation_suppressed) {
    return {
      code: 'goal-continuation-suppressed',
      detail: 'Goal runtime suppressed automatic continuation after a no-effect turn.',
      completionStatus: 'paused',
    };
  }
  return null;
}

function readFileFingerprint(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return `missing:${path.resolve(String(filePath || ''))}`;
  }
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function progressCompositeFingerprint(compositeCursor) {
  const workflowLogs = (compositeCursor.workflowLogs || [])
    .filter((entry) => !String(entry.path || '').endsWith('latest-dispatch.json'));
  return crypto.createHash('sha256').update(JSON.stringify({
    currentIndex: compositeCursor.currentIndex || {},
    manifest: compositeCursor.manifest || {},
    workflowLogs,
    activeVerdicts: compositeCursor.activeVerdicts || [],
  })).digest('hex');
}

function currentPhaseProgressFingerprint(context = activePhaseContext()) {
  const compositeCursor = buildCompositeMonitorCursor({
    repoRoot: process.cwd(),
    statusFile: state.statusFile,
  });
  const trackedPaths = [
    context.activePhaseDoc,
    context.sprintContract,
    context.qaReport,
    context.handoff,
    context.scorecard,
  ].filter(Boolean);
  const values = [
    context.number || '',
    context.status || '',
    context.lastOutcome || '',
    context.lastUpdatedAt || '',
    context.currentStage || '',
    context.title || context.activePhaseTitle || '',
    `composite=${progressCompositeFingerprint(compositeCursor)}`,
  ];
  for (const filePath of trackedPaths) {
    values.push(`${path.resolve(String(filePath))}=${readFileFingerprint(filePath)}`);
  }
  return crypto.createHash('sha256').update(values.join('\n')).digest('hex');
}

function shouldSuppressRestartForNoProgress(context = activePhaseContext()) {
  if (!runtimeState.launchProgressFingerprint) {
    return false;
  }
  return currentPhaseProgressFingerprint(context) === runtimeState.launchProgressFingerprint;
}

function appendPhaseArtifact(command, args) {
  const result = runNodeScript(phaseArtifactsPath, [command, ...args]);
  if ((result.status ?? 0) !== 0) {
    throw new Error(result.stderr || `phase-artifacts failed: ${command}`);
  }
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function timestampFromCursorMtime(mtimeMs) {
  const numeric = Number(mtimeMs);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
}

function latestWorkflowLogTimestamp(compositeCursor) {
  const latest = (compositeCursor.workflowLogs || [])
    .filter((entry) => entry.exists && !String(entry.path || '').endsWith('latest-dispatch.json'))
    .map((entry) => Number(entry.mtimeMs || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left)[0];
  return timestampFromCursorMtime(latest);
}

function isPidAlive(pid) {
  return isPidAliveInCurrentNamespace(pid);
}

function classifyChildTimeoutState() {
  if (!runtimeState.childPid && !runtimeState.lastChildPid) {
    return 'child_exited_without_closeout';
  }
  const result = evaluatePidLiveness({
    pid: runtimeState.childPid || runtimeState.lastChildPid,
    pidNamespace: runtimeState.pidNamespace,
    checkerNamespace: 'node-parent',
    toolTimedOut: true,
    livenessChecker: isPidAlive,
  });
  return result.reason;
}

function updateLatestDispatchLiveness({ label = '', context = {}, compositeCursor = null, livenessReason = '' } = {}) {
  const latestFile = path.join('.claude', 'logs', 'workflow-enforcement', 'latest-dispatch.json');
  if (!fs.existsSync(latestFile)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  } catch {
    return null;
  }
  const cursor = compositeCursor || buildCompositeMonitorCursor({
    repoRoot: process.cwd(),
    statusFile: state.statusFile,
  });
  const nowMs = Date.now();
  const staleSeconds = runtimeState.lastProgressAtMs > 0
    ? Math.floor((nowMs - runtimeState.lastProgressAtMs) / 1000)
    : 0;
  const staleNoProgress = state.staleNoProgressSeconds > 0 && staleSeconds >= state.staleNoProgressSeconds;
  const livenessProbe = evaluatePidLiveness({
    pid: runtimeState.childPid,
    pidNamespace: payload.pidNamespace || runtimeState.pidNamespace,
    checkerNamespace: 'node-parent',
    staleNoProgress,
    livenessChecker: isPidAlive,
  });
  const effectiveLivenessReason = livenessProbe.degraded ? livenessProbe.reason : (livenessReason || livenessProbe.reason);
  const liveness = {
    label,
    childPid: runtimeState.childPid,
    lastChildPid: runtimeState.lastChildPid,
    pidNamespace: payload.pidNamespace || runtimeState.pidNamespace,
    checkerNamespace: 'node-parent',
    childAlive: livenessProbe.childAlive,
    degraded: livenessProbe.degraded,
    phaseNumber: context.number || payload.phaseNumber || '',
    phaseTitle: context.title || context.activePhaseTitle || payload.phaseTitle || '',
    currentStage: context.currentStage || mapLeaseStage(context),
    lastHeartbeatAt: cursor.lease?.lastHeartbeatAt || '',
    lastLogAt: latestWorkflowLogTimestamp(cursor),
    lastProgressAt: runtimeState.lastProgressAtMs ? new Date(runtimeState.lastProgressAtMs).toISOString().replace(/\.\d{3}Z$/, 'Z') : '',
    noProgressThresholdSeconds: state.staleNoProgressSeconds,
    staleNoProgressSeconds: state.staleNoProgressSeconds,
    staleSeconds,
    reason: effectiveLivenessReason,
    updatedAt: utcTimestamp(),
  };
  const activeChildPatch = liveness.childAlive
    ? {
      status: 'running',
      activeExecutionStatus: 'running',
      completionStatus: context.lastOutcome || 'running',
      completionPath: 'prepared-dispatch',
      returnBoundary: '',
      stopReasonCode: '',
      rawStopReasonCode: '',
      blockingStopReasonCode: '',
      stopReasonDetail: '',
      activePhaseNumber: liveness.phaseNumber,
      phaseRunLease: undefined,
      normalizedRunVerdict: undefined,
      historicalWarnings: undefined,
      failedAt: undefined,
      completedAt: undefined,
      finalVerdict: undefined,
    }
    : {};
  const next = withLatestDispatchLifecycle(payload, {
    lifecycleEvent: 'dispatch_heartbeat',
    dispatchStage: 'child_running',
    timestamp: liveness.updatedAt,
    patch: {
      ...activeChildPatch,
      childPid: liveness.childPid,
      pidNamespace: liveness.pidNamespace,
      phaseNumber: liveness.phaseNumber,
      lastHeartbeatAt: liveness.lastHeartbeatAt,
      lastLogAt: liveness.lastLogAt,
      liveness,
    },
  });
  assertProjectionStateRunId(payload, next, latestFile);
  recordLifecycleTransition({
    source: 'moonshot-phase-dispatch',
    targetStateFiles: [latestFile],
    primaryTargetStateFile: latestFile,
    phaseNumber: next.phaseNumber || 0,
    phaseTitle: next.phaseTitle || 'moonshot-phase-dispatch',
    status: next.status || 'prepared',
    lifecycleEvent: 'dispatch_heartbeat',
    attemptId: next.attemptId || next.runLeaseId || runtimeState.runLeaseId,
    timestamp: liveness.updatedAt,
    pidNamespace: next.childPid ? next.pidNamespace || 'node-parent' : undefined,
    payloadPatch: next,
    writeMode: 'replace',
  });
  return next;
}

function recordLatestDispatchLifecycle({ lifecycleEvent, dispatchStage, patch = {}, timestamp = utcTimestamp() } = {}) {
  const latestFile = path.join('.claude', 'logs', 'workflow-enforcement', 'latest-dispatch.json');
  if (!fs.existsSync(latestFile)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  } catch (error) {
    appendDebugLog('latest-dispatch-lifecycle-failed', {
      reason: 'json-parse-failed',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  const next = withLatestDispatchLifecycle(payload, {
    lifecycleEvent,
    dispatchStage,
    timestamp,
    patch,
  });
  assertProjectionStateRunId(payload, next, latestFile);
  recordLifecycleTransition({
    source: 'moonshot-phase-dispatch',
    targetStateFiles: [latestFile],
    primaryTargetStateFile: latestFile,
    phaseNumber: next.phaseNumber || 0,
    phaseTitle: next.phaseTitle || 'moonshot-phase-dispatch',
    status: next.status,
    completionStatus: next.completionStatus,
    lifecycleEvent: next.lifecycleEvent,
    attemptId: next.attemptId
      || next.runLeaseId
      || next.phaseRunLease?.attemptId
      || next.phaseRunLease?.runLeaseId
      || runtimeState.runLeaseId
      || `dispatch-${String(next.lifecycleEvent || 'lifecycle').replace(/[^a-z0-9_-]/gi, '-')}`,
    timestamp: next.lastLifecycleEventAt,
    pidNamespace: next.childPid || next.dispatcherPid ? 'node-parent' : undefined,
    payloadPatch: next,
    writeMode: 'replace',
  });
  return next;
}

function isSignalLikeExit(code, signal) {
  return Boolean(signal) || SIGNAL_LIKE_EXIT_CODES.has(code ?? 0);
}

function actionablePhaseExists() {
  const result = spawnSync('node', [phasePlanPath, 'get-next-phase', state.statusFile], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    return false;
  }

  return Boolean((result.stdout ?? '').trim());
}

function resolveStatusValue(key) {
  if (!fs.existsSync(state.statusFile)) {
    return '';
  }

  for (const rawLine of fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/)) {
    const match = rawLine.match(/^([^:#]+):\s*(.+)\s*$/);
    if (!match) {
      continue;
    }
    if (match[1].trim() === key) {
      return match[2].trim().replace(/^"/, '').replace(/"$/, '');
    }
  }

  return '';
}

function resolveExecutionMode() {
  if (state.executionMode !== 'auto') {
    return state.executionMode;
  }

  return resolveStatusValue('executionMode') || 'delegated-terminal';
}

function resolveExecutionRoot() {
  if (state.executionRoot) {
    return state.executionRoot;
  }

  return resolveStatusValue('executionRoot') || `${state.planDir.replace(/\/$/, '')}/execution`;
}

function resolveRuntime() {
  const result = runNodeScript(path.join(SCRIPT_DIR, 'agent-loop-phase-runtime.mjs'), [
    'resolve-runner-runtime',
    state.runtime,
  ]);
  if ((result.status ?? 0) !== 0) {
    const message = (result.stderr || result.stdout || 'failed to resolve runtime').trim();
    throw new Error(message);
  }
  return String(result.stdout || '').trim();
}

function resolveMasterPlan() {
  if (fs.existsSync(state.statusFile)) {
    for (const rawLine of fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/)) {
      const match = rawLine.match(/^masterPlan:\s*(.+)\s*$/);
      if (!match) {
        continue;
      }
      const candidate = match[1].trim().replace(/^"|"$/g, '');
      if (candidate && fs.existsSync(candidate) && path.resolve(path.dirname(candidate)) === path.resolve(state.planDir)) {
        return candidate;
      }
    }
  }

  const entries = fs.readdirSync(state.planDir, { withFileTypes: true });
  const match = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .find((name) => name.includes('master') || name.includes('00-'));
  return match ? path.join(state.planDir, match) : '';
}

function mapLeaseStage(context = {}) {
  const status = String(context.status || '').trim().toLowerCase();
  const outcome = String(context.lastOutcome || '').trim().toLowerCase();
  if (status === 'in_progress') {
    if (outcome === 'partial') {
      return 'finish/handoff';
    }
    return 'execute';
  }
  if (status === 'failed' || status === 'completed') {
    return 'finish/handoff';
  }
  return 'ready/isolate';
}

function leaseCompletionStatus(context = {}, actionable) {
  if (!actionable) {
    return 'completed';
  }
  const outcome = String(context.lastOutcome || '').trim().toLowerCase();
  if (outcome === 'partial') {
    return 'partial';
  }
  if (String(context.status || '').trim().toLowerCase() === 'failed') {
    return 'failed';
  }
  return 'running';
}

function startDispatchLease(resolvedMode, resolvedRoot, masterPlan, effectiveRuntime) {
  cleanupPreviousDeadDispatchLease();
  if (!runtimeState.runLeaseId) {
    runtimeState.runLeaseId = generateRunLeaseId();
  }
  runtimeState.captureSession = createPhaseHarnessCaptureSession({
    traceId: runtimeState.runLeaseId,
    runId: runtimeState.runLeaseId,
    taskId: path.basename(state.planDir || 'phase') || 'phase',
    sessionId: runtimeState.runLeaseId,
    stage: 'ready/isolate',
    source: 'moonshot-phase-dispatch',
  });
  runtimeState.captureSession.recordRunStarted({
    spanId: `run-${runtimeState.runLeaseId}`,
    phaseNum: state.planDir,
    phaseTitle: path.basename(state.planDir || ''),
    summary: 'run_started',
  }).then((result) => {
    if (!result.ok) {
      appendCaptureWarning('dispatch-run_started', result.error?.message || 'capture failed');
    }
  });
  const values = leaseAssignments(
    'start',
    state.statusFile,
    runtimeState.runLeaseId,
    resolvedMode,
    state.planDir,
    resolvedRoot,
    effectiveRuntime,
    masterPlan,
    String(process.pid),
    state.goalTimeBudgetSeconds,
    state.goalTokenBudget,
  );
  runtimeState.leaseActive = true;
  appendDebugLog('phase-run-lease-start', {
    runLeaseId: runtimeState.runLeaseId,
    values,
    executionMode: resolvedMode,
    runtime: effectiveRuntime,
    goalTimeBudgetSeconds: state.goalTimeBudgetSeconds,
    goalTokenBudget: state.goalTokenBudget,
  });
  recordLatestDispatchLifecycle({
    lifecycleEvent: 'dispatch_started',
    dispatchStage: 'child_running',
    patch: {
      runLeaseId: runtimeState.runLeaseId,
      activeRunLeaseId: runtimeState.runLeaseId,
      dispatcherPid: process.pid,
      status: 'running',
      activeExecutionStatus: 'running',
      completionStatus: 'running',
      completionPath: 'prepared-dispatch',
      returnBoundary: '',
      stopReasonCode: '',
      rawStopReasonCode: '',
      blockingStopReasonCode: '',
      stopReasonDetail: '',
      completedAt: undefined,
      failedAt: undefined,
      finalVerdict: undefined,
      phaseRunLease: undefined,
      normalizedRunVerdict: undefined,
      historicalWarnings: undefined,
      activePhaseNumber: undefined,
      liveness: undefined,
      stateRunId: runtimeState.runLeaseId,
    },
  });
  return values;
}

function heartbeatDispatchLease(context = {}) {
  if (!runtimeState.leaseActive || !runtimeState.runLeaseId) {
    return null;
  }
  const actionable = actionablePhaseExists();
  const values = leaseAssignments(
    'heartbeat',
    state.statusFile,
    runtimeState.runLeaseId,
    context.currentStage || mapLeaseStage(context),
    context.number || '',
    context.activePhaseTitle || context.phaseTitle || context.title || '',
    leaseCompletionStatus(context, actionable),
  );
  appendDebugLog('phase-run-lease-heartbeat', {
    runLeaseId: runtimeState.runLeaseId,
    actionable,
    context,
    values,
  });
  return values;
}

function finishDispatchLease(returnBoundary, stopReasonCode, stopReasonDetail, completionStatus = 'completed') {
  if (!runtimeState.leaseActive || !runtimeState.runLeaseId) {
    return null;
  }
  if (runtimeState.captureSession) {
    runtimeState.captureSession.recordRunCompleted({
      spanId: `run-${runtimeState.runLeaseId}`,
      spanName: 'run',
      completionStatus,
      summary: 'run_completed',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('dispatch-run_completed', result.error?.message || 'capture failed');
      }
    });
  }
  const values = leaseAssignments(
    'finish',
    state.statusFile,
    runtimeState.runLeaseId,
    returnBoundary,
    stopReasonCode,
    stopReasonDetail,
    completionStatus,
  );
  runtimeState.leaseActive = false;
  appendDebugLog('phase-run-lease-finish', {
    runLeaseId: runtimeState.runLeaseId,
    returnBoundary,
    stopReasonCode,
    stopReasonDetail,
    completionStatus,
    values,
  });
  return values;
}

function shouldRunLocalFallbackReconciler(stopReasonCode = '', completionStatus = '') {
  const marker = `${stopReasonCode} ${completionStatus}`.toLowerCase();
  return marker.includes('local-fallback') || marker.includes('completed-via-local-fallback');
}

function runLocalFallbackReconciler(stopReasonCode = '', completionStatus = '') {
  if (!shouldRunLocalFallbackReconciler(stopReasonCode, completionStatus)) {
    return null;
  }

  const args = [
    phaseCloseoutReconcilerPath,
    '--status-file', state.statusFile,
    '--workflow-dir', path.join('.claude', 'logs', 'workflow-enforcement'),
    '--fallback-run-id', runtimeState.runLeaseId || `dispatch-local-fallback-${Date.now()}`,
    '--reason', stopReasonCode || 'local-fallback-closeout',
    '--now', utcTimestamp(),
  ];
  const result = runNodeScript(args[0], args.slice(1));
  let summary = null;
  try {
    summary = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    summary = null;
  }
  appendDebugLog('phase-closeout-reconciler-dispatch', {
    status: result.status ?? 0,
    stopReasonCode,
    completionStatus,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    summary,
  });
  if ((result.status ?? 0) !== 0) {
    throw new Error(result.stderr || result.stdout || 'phase closeout reconciler failed');
  }
  return summary;
}

function assertReturnAllowedOrThrow() {
  if (!runtimeState.runLeaseId) {
    throw new Error('missing run lease id before success return');
  }
  const values = leaseAssignments(
    'assert-return-allowed',
    state.statusFile,
    runtimeState.runLeaseId,
    'true',
    'false',
  );
  appendDebugLog('phase-run-lease-assert-return-allowed', {
    runLeaseId: runtimeState.runLeaseId,
    values,
  });
  if (values.RETURN_ALLOWED !== 'true') {
    throw new Error(`phase-run lease denied success return (${values.RETURN_REASON || 'unknown'})`);
  }
  return values;
}

function runFinalGitCloseoutAudit() {
  const mode = String(state.finalGitCloseout || 'strict').trim().toLowerCase();
  if (mode === 'off' || mode === 'false' || mode === 'none') {
    return { allowed: true, detail: 'final git closeout audit disabled' };
  }
  const artifactPath = path.join('.claude', 'logs', 'agent-loop', `final-git-closeout-${Date.now()}-${process.pid}.json`);
  const args = [
    finalGitCloseoutPath,
    'preflight',
    '--plan-dir', state.planDir,
    '--status-file', state.statusFile,
    '--worktree-root', state.worktreeRoot || '.tmp/harness-worktrees/phase-runs',
    '--worktree-root', '.tmp/harness-worktrees/phase-waves',
    '--output', artifactPath,
  ];
  const result = runNodeScript(finalGitCloseoutPath, args.slice(1));
  const detail = [
    (result.stdout || result.stderr || '').trim(),
    `artifact=${artifactPath}`,
  ].filter(Boolean).join(' | ');
  appendDebugLog('final-git-closeout-audit', {
    mode,
    status: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    artifactPath,
  });
  if ((result.status ?? 0) === 0) {
    return { allowed: true, detail };
  }
  if (mode === 'warn' || mode === 'warning') {
    logWarn(`Final git closeout audit reported issues but is warning-only: ${detail}`);
    return { allowed: true, detail };
  }
  return { allowed: false, detail };
}

function startTrackingBridge(label) {
  if (state.dryRun) {
    return () => {};
  }
  const intervalMs = (Number.parseInt(process.env.PHASE_DISPATCH_TRACKING_SECONDS ?? '45', 10) || 45) * 1000;
  const refreshLiveness = () => {
    const context = activePhaseContext();
    heartbeatDispatchLease(context);
    const compositeCursor = buildCompositeMonitorCursor({
      repoRoot: process.cwd(),
      statusFile: state.statusFile,
    });
    const progressFingerprint = currentPhaseProgressFingerprint(context);
    if (!runtimeState.lastProgressFingerprint || runtimeState.lastProgressFingerprint !== progressFingerprint) {
      runtimeState.lastProgressFingerprint = progressFingerprint;
      runtimeState.lastProgressAtMs = Date.now();
    }
    updateLatestDispatchLiveness({ label, context, compositeCursor });
    return { context, compositeCursor };
  };
  try {
    refreshLiveness();
  } catch (error) {
    appendDebugLog('tracking-bridge-liveness-prime-failed', {
      label,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const timer = setInterval(() => {
    try {
      const { context, compositeCursor } = refreshLiveness();
      const staleSeconds = runtimeState.lastProgressAtMs > 0
        ? Math.floor((Date.now() - runtimeState.lastProgressAtMs) / 1000)
        : 0;
      const summaryParts = [
        label,
        `phase=${context.number || 'none'}`,
        `title=${context.title || context.activePhaseTitle || 'n/a'}`,
        `stage=${context.currentStage || mapLeaseStage(context)}`,
        `status=${context.status || 'idle'}`,
        `outcome=${context.lastOutcome || 'pending'}`,
        `pid=${runtimeState.childPid || 'none'}`,
        `stale=${staleSeconds}s`,
        `cursor=${compositeCursor.fingerprint.slice(0, 12)}`,
      ];
      logInfo(`Tracking heartbeat: ${summaryParts.join(' ')}`);
      appendDebugLog('tracking-bridge-composite-cursor', {
        label,
        phase: context.number || '',
        fingerprint: compositeCursor.fingerprint,
        currentCommitToken: compositeCursor.currentIndex.commitToken,
        manifestHash: compositeCursor.currentIndex.manifestHash,
        workflowLogCount: compositeCursor.workflowLogs.length,
        activeVerdictCount: compositeCursor.activeVerdicts.length,
        childPid: runtimeState.childPid,
        lastHeartbeatAt: compositeCursor.lease?.lastHeartbeatAt || '',
        lastLogAt: latestWorkflowLogTimestamp(compositeCursor),
        staleSeconds,
      });
      if (
        state.staleNoProgressSeconds > 0
        && runtimeState.childPid
        && !runtimeState.staleStopTriggered
        && staleSeconds >= state.staleNoProgressSeconds
      ) {
        runtimeState.staleStopTriggered = true;
        const detail = `delegated child made no observable progress for ${staleSeconds}s`;
        updateLatestDispatchLiveness({
          label,
          context,
          compositeCursor,
          livenessReason: 'stale_child_no_progress',
        });
        appendDebugLog('stale-child-no-progress-stop', {
          label,
          childPid: runtimeState.childPid,
          phaseNumber: context.number || '',
          staleSeconds,
          thresholdSeconds: state.staleNoProgressSeconds,
        });
        terminatePid(runtimeState.childPid);
        finalizeDispatchExit(1, detail, {
          returnBoundary: 'dispatch-stop',
          stopReasonCode: 'stale_child_no_progress',
          completionStatus: 'failed',
        });
      }
    } catch (error) {
      appendDebugLog('tracking-bridge-heartbeat-failed', {
        label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return () => clearInterval(timer);
}

function finalizeDispatchExit(exitCode, detail, { requireSuccessBoundary = false, returnBoundary = '', stopReasonCode = '', completionStatus = '' } = {}) {
  if (runtimeState.childExitHandled) {
    return;
  }
  runtimeState.childExitHandled = true;

  try {
    if (exitCode === 0 && requireSuccessBoundary) {
      const gitCloseout = runFinalGitCloseoutAudit();
      if (!gitCloseout.allowed) {
        logError(`Final git closeout audit failed: ${gitCloseout.detail}`);
        finishDispatchLease('dispatch-stop', 'phase-final-git-closeout-required', gitCloseout.detail, 'failed');
        setNormalizedRunVerdict('checkpoint_required', 'dirty_worktree', gitCloseout.detail);
        process.exit(2);
        return;
      }
      assertReturnAllowedOrThrow();
      runLocalFallbackReconciler(stopReasonCode || 'plan-directory-complete', completionStatus || 'completed');
      closeLatestDispatchEvidence({
        exitCode: 0,
        detail,
        returnBoundary: returnBoundary || 'success-return',
        stopReasonCode: stopReasonCode || 'plan-directory-complete',
        completionStatus: completionStatus || 'completed',
      });
      finishDispatchLease(returnBoundary || 'success-return', stopReasonCode || 'plan-directory-complete', detail, completionStatus || 'completed');
      setNormalizedRunVerdict('success', 'clean_complete', detail || 'plan directory completed');
      process.exit(0);
      return;
    }

    const normalized = normalizeDispatchVerdict(
      exitCode,
      stopReasonCode || `exit-${exitCode}`,
      detail,
      completionStatus || (exitCode === 0 ? 'completed' : 'failed'),
    );
    setNormalizedRunVerdict(
      normalized.normalizedRunVerdict,
      normalized.stopReasonClass,
      normalized.stopReasonExplanation,
    );
    runLocalFallbackReconciler(stopReasonCode || `exit-${exitCode}`, completionStatus || (exitCode === 0 ? 'completed' : 'failed'));
    closeLatestDispatchEvidence({
      exitCode,
      detail,
      returnBoundary: returnBoundary || 'dispatch-stop',
      stopReasonCode: stopReasonCode || `exit-${exitCode}`,
      completionStatus: completionStatus || (exitCode === 0 ? 'completed' : 'failed'),
    });
    finishDispatchLease(
      returnBoundary || 'dispatch-stop',
      stopReasonCode || `exit-${exitCode}`,
      detail,
      completionStatus || (exitCode === 0 ? 'completed' : 'failed'),
    );
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    appendDebugLog('dispatch-finalize-error', {
      exitCode,
      detail,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
    return;
  }

  process.exit(exitCode);
}

function installDispatchSignalHandlers() {
  const handleSignal = (signalName) => {
    const timeoutLikeSignal = signalName === 'SIGTERM' || signalName === 'SIGHUP';
    const childStopReason = timeoutLikeSignal ? classifyChildTimeoutState() : 'dispatcher-interrupted';
    appendDebugLog('dispatch-signal', {
      signal: signalName,
      childPid: runtimeState.childPid,
      childStopReason,
      leaseActive: runtimeState.leaseActive,
      runLeaseId: runtimeState.runLeaseId,
    });
    try {
      updateLatestDispatchLiveness({ livenessReason: childStopReason });
    } catch {
      // Best-effort signal evidence only.
    }
    if (runtimeState.childPid) {
      try {
        terminatePid(runtimeState.childPid);
      } catch (error) {
        appendDebugLog('dispatch-signal-terminate-failed', {
          signal: signalName,
          childPid: runtimeState.childPid,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    finalizeDispatchExit(1, `dispatcher interrupted by ${signalName}; ${childStopReason}`, {
      returnBoundary: 'dispatch-interrupted',
      stopReasonCode: childStopReason,
      completionStatus: 'failed',
    });
  };

  for (const signalName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signalName, () => handleSignal(signalName));
  }
}

function resolveActivePhaseArtifacts() {
  if (!fs.existsSync(state.statusFile)) {
    return {
      sprintContract: '',
      qaReport: '',
      handoff: '',
      scorecard: '',
    };
  }

  const lines = fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/);
  const phases = [];
  let current = null;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) phases.push(current);
      current = {
        status: '',
        planConfirmed: '',
        sprintContract: '',
        qaReport: '',
        handoff: '',
        scorecard: '',
      };
      continue;
    }

    if (!current) continue;

    const stripped = rawLine.trim();
    if (stripped.startsWith('status:')) {
      current.status = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.split(':', 2)[1].trim().toLowerCase();
    } else if (stripped.startsWith('sprintContract:')) {
      current.sprintContract = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('qaReport:')) {
      current.qaReport = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('handoff:')) {
      current.handoff = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('scorecard:')) {
      current.scorecard = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    }
  }
  if (current) phases.push(current);

  return phases.find((phase) => (phase.status === 'pending' || phase.status === 'in_progress') && phase.planConfirmed !== 'false') || {
    sprintContract: '',
    qaReport: '',
    handoff: '',
    scorecard: '',
  };
}

function renderPhaseCoordinatorContract(values) {
  if (!fs.existsSync(PHASE_COORDINATOR_CONTRACT_TEMPLATE)) {
    return '';
  }
  let template = fs.readFileSync(PHASE_COORDINATOR_CONTRACT_TEMPLATE, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return template.trimEnd();
}

function syncCompletedPhaseArchive() {
  const syncScript = path.join(SCRIPT_DIR, 'sync-phase-archive.py');
  if (!fs.existsSync(state.statusFile) || !fs.existsSync(state.planDir) || !fs.existsSync(syncScript)) {
    return;
  }

  const result = runCommand('python3', [syncScript, '--status-file', state.statusFile, '--plan-dir', state.planDir]);
  if (result.status !== 0) {
    return;
  }

  for (const line of result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    logInfo(line);
  }
}

function recordDispatchEvidence(resolvedMode, resolvedRoot, masterPlan, effectiveRuntime) {
  if (state.dryRun) {
    return;
  }

  spawnSync('bash', [
    path.join(SCRIPT_DIR, 'workflow-enforcement.sh'),
    'record-dispatch',
    '--plan-dir',
    state.planDir,
    '--execution-mode',
    resolvedMode,
    '--execution-root',
    resolvedRoot,
    '--runtime',
    effectiveRuntime,
    '--status-file',
    state.statusFile,
    '--master-plan',
    masterPlan,
  ], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PHASE_DISPATCH_EFFORT_PROFILE: state.effortProfile,
      PHASE_DISPATCH_EFFORT_ESCALATION_REASON: state.effortEscalationReason,
    },
  });
  recordLatestDispatchLifecycle({
    lifecycleEvent: 'preflight_passed',
    dispatchStage: 'preflight',
    patch: {
      status: 'prepared',
      dispatcherPid: process.pid,
    },
  });
  recordLatestDispatchLifecycle({
    lifecycleEvent: 'dispatch_prepared',
    dispatchStage: 'prepared',
    patch: {
      status: 'prepared',
      dispatcherPid: process.pid,
    },
  });
}

function terminatePid(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    const [pgid] = runtimeCli(['get-process-group-id', String(pid)]);
    const target = pgid && pgid === String(pid) ? -Math.abs(pid) : pid;
    process.kill(target, 'SIGTERM');
  } catch {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);

  try {
    const [pgid] = runtimeCli(['get-process-group-id', String(pid)]);
    const target = pgid && pgid === String(pid) ? -Math.abs(pid) : pid;
    process.kill(target, 'SIGKILL');
  } catch {
    // Ignore processes that already exited.
  }
}

function getProcessCommandLine(pid) {
  if (!pid) {
    return '';
  }
  if (process.platform === 'win32') {
    const psCommand = [
      '$pidValue=$args[0]',
      '$proc=Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq [int]$pidValue }',
      'if ($proc) { $proc.CommandLine }',
    ].join('; ');
    const result = runCommand('powershell.exe', ['-NoProfile', '-Command', psCommand, String(pid)]);
    return (result.stdout || '').trim();
  }
  const result = runCommand('ps', ['-p', String(pid), '-o', 'command=']);
  if (result.status !== 0 || result.error) {
    return '';
  }
  return (result.stdout || '').trim();
}

function getProcessGroupId(pid) {
  const [pgid] = runtimeCli(['get-process-group-id', String(pid)]);
  return pgid || '';
}

function isProtectedProcess(pid) {
  if (!Number.isFinite(pid) || pid === process.pid || protectedPids.has(pid) || pid === runtimeState.childPid) {
    return true;
  }
  const currentPgid = getProcessGroupId(process.pid);
  const targetPgid = getProcessGroupId(pid);
  return Boolean(currentPgid && targetPgid && currentPgid === targetPgid);
}

function commandBelongsToCurrentDispatch(commandLine) {
  const command = String(commandLine || '');
  if (!command) {
    return false;
  }
  const markers = [
    state.statusFile,
    state.planDir,
    state.executionRoot,
    runtimeState.runLeaseId,
  ].filter(Boolean).map((value) => path.resolve(String(value)));
  const rawMarkers = [
    state.statusFile,
    state.planDir,
    state.executionRoot,
    runtimeState.runLeaseId,
  ].filter(Boolean).map(String);
  return [...markers, ...rawMarkers].some((marker) => marker && command.includes(marker));
}

function terminateStaleWorkers() {
  if (!state.killStale) {
    return;
  }

  const patterns = [
    '[b]ash .claude/scripts/agent-loop.sh',
    '[b]ash .claude/scripts/agent-loop-shell-core.sh',
    '[n]ode .claude/scripts/agent-loop.mjs',
    '[n]ode .claude/scripts/agent-loop-phase-runner.mjs',
    '[c]laude --dangerously-skip-permissions --no-session-persistence -p /moonshot-in-session-coordinator',
    '[c]odex exec --sandbox workspace-write -C',
    '[b]ash .claude/scripts/moonshot-phase-dispatch.sh',
  ];

  for (const pattern of patterns) {
    const pids = runtimeCli(['find-pids-by-pattern', pattern]);
    for (const pidValue of pids) {
      const pid = Number.parseInt(pidValue, 10);
      if (!Number.isFinite(pid)) {
        continue;
      }
      const commandLine = getProcessCommandLine(pid);
      if (isProtectedProcess(pid) || !commandBelongsToCurrentDispatch(commandLine)) {
        appendDebugLog('terminate-stale-worker-skipped-protected', {
          pid,
          pattern,
          commandLine,
          runLeaseId: runtimeState.runLeaseId,
          planDir: state.planDir,
          statusFile: state.statusFile,
        });
        continue;
      }
      logWarn(`terminating stale phase worker (pid=${pid})`);
      appendDebugLog('terminate-stale-worker', {
        pid,
        pattern,
        commandLine,
      });
      terminatePid(pid);
    }
  }
}

function closeoutActivePhaseForSignal(signalName, exitCode = 0) {
  const context = activePhaseContext();
  if (!context.number || context.status !== 'in_progress' || context.lastOutcome === 'partial') {
    appendDebugLog('delegated-terminal-signal-no-closeout', {
      signalName,
      exitCode,
      context,
    });
    return false;
  }

  const phaseNum = context.number;
  const phaseDoc = context.activePhaseDoc || phasePlan('get-phase-doc', state.planDir, phaseNum) || '';
  const phaseTitle = phasePlan('get-phase-title', state.planDir, phaseNum) || `Phase ${phaseNum}`;
  const detail = `delegated-terminal child exited unexpectedly (${signalName || `exit=${exitCode}`}); dispatch marked the active phase as partial and will retry`;

  appendDebugLog('delegated-terminal-signal-closeout', {
    signalName,
    exitCode,
    phaseNum,
    phaseDoc,
    context,
  });

  if (context.qaReport) {
    appendPhaseArtifact('append-qa-runtime-update', [
      'dispatch-interrupted-restart',
      '',
      detail,
      '.claude/logs/workflow-enforcement',
      context.qaReport,
      context.scorecard || '',
    ]);
  }

  if (context.handoff) {
    appendPhaseArtifact('append-handoff-update', [
      'interrupted',
      '',
      detail,
      String(phaseNum),
      phaseTitle,
      context.sprintContract || '',
      context.qaReport || '',
      phaseDoc,
      context.scorecard || '',
      context.handoff,
    ]);
  }

  runNodeScript(phaseStatePath, [
    'update-phase-state',
    state.statusFile,
    String(phaseNum),
    'in_progress',
    utcTimestamp(),
    'partial',
    'false',
    phaseDoc,
    context.sprintContract || '',
    context.qaReport || '',
    context.handoff || '',
    context.scorecard || '',
  ]);
  return true;
}

function buildCodexCommand(prompt) {
  const args = runtimeCli(['codex-base-args', process.cwd()]);
  const route = resolveModelRoute({
    runtime: 'codex',
    stage: process.env.PHASE_MODEL_STAGE || 'phase_implementation',
    profile: state.effortProfile,
  });
  if (route.model) {
    args.push('-m', route.model);
  }
  if (route.effort) {
    args.push('-c', `model_reasoning_effort="${route.effort}"`);
  }
  appendCodexPromptArg(args, prompt);
  return args;
}

function appendCodexPromptArg(args, prompt) {
  const promptArchive = archivePromptText(prompt, process.cwd());
  if (process.platform === 'win32' && args.some((arg, index) => index === 0
    ? /(?:powershell|pwsh)\.exe$/i.test(String(arg))
    : /\.ps1$/i.test(String(arg)))) {
    args.push('--codex-prompt-file', path.resolve(process.cwd(), promptArchive.promptArchivePath));
    return;
  }
  args.push(prompt);
}

function runDelegatedTerminal(resolvedRoot, effectiveRuntime) {
  terminateStaleWorkers();
  const cmd = [
    'node', '.claude/scripts/agent-loop.mjs',
    state.planDir,
    '--status-file', state.statusFile,
    '--execution-root', resolvedRoot,
    '--runtime', effectiveRuntime,
    '--verification-runtimes', state.verificationRuntimes,
  ];
  if (state.resume) {
    cmd.push('--resume');
  }
  if (state.parallelWorktrees > 1) {
    cmd.push('--parallel-worktrees', String(state.parallelWorktrees));
    cmd.push('--worktree-base', state.worktreeBase || 'HEAD');
    cmd.push('--worktree-root', state.worktreeRoot || '.tmp/harness-worktrees/phase-runs');
  }

  if (state.dryRun) {
    writeStdoutLine(cmd.join(' '));
    return;
  }

  let restartCount = 0;
  let signalRestartCount = 0;
  const stopTracking = startTrackingBridge('delegated-terminal');

  const launch = () => {
    runtimeState.launchProgressFingerprint = currentPhaseProgressFingerprint();
    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: 'inherit',
      env: {
        ...process.env,
        AGENT_LOOP_EFFORT_PROFILE: state.effortProfile,
        PHASE_DISPATCH_EFFORT_PROFILE: state.effortProfile,
        PHASE_DISPATCH_EFFORT_ESCALATION_REASON: state.effortEscalationReason,
        PHASE_MODEL_STAGE: 'phase_implementation',
        PHASE_RUN_LEASE_ID: runtimeState.runLeaseId,
      },
    });
    runtimeState.childPid = child.pid ?? null;
    runtimeState.lastChildPid = child.pid ?? null;
    runtimeState.lastChildExitAt = '';
    runtimeState.lastChildExitCode = null;
    runtimeState.lastChildExitSignal = '';
    runtimeState.lastProgressFingerprint = runtimeState.launchProgressFingerprint;
    runtimeState.lastProgressAtMs = Date.now();
    if (runtimeState.childPid) {
      protectedPids.add(runtimeState.childPid);
    }
    appendDebugLog('delegated-terminal-launch', {
      pid: child.pid ?? null,
      command: cmd,
      planDir: state.planDir,
      executionRoot: resolvedRoot,
    });
    child.on('exit', (code, signal) => {
      if (child.pid) {
        protectedPids.delete(child.pid);
      }
      runtimeState.lastChildPid = child.pid ?? runtimeState.lastChildPid;
      runtimeState.lastChildExitAt = utcTimestamp();
      runtimeState.lastChildExitCode = code ?? 0;
      runtimeState.lastChildExitSignal = signal ?? '';
      runtimeState.childPid = null;
      appendDebugLog('delegated-terminal-exit', {
        pid: child.pid ?? null,
        code: code ?? 0,
        signal: signal ?? '',
      });
      if (isSignalLikeExit(code ?? 0, signal ?? '')) {
        let closeoutApplied = false;
        try {
          closeoutApplied = closeoutActivePhaseForSignal(signal ?? '', code ?? 0);
        } catch (error) {
          appendDebugLog('delegated-terminal-signal-closeout-failed', {
            signal: signal ?? '',
            code: code ?? 0,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack || '' : '',
          });
        }

        if (!closeoutApplied) {
          logWarn('Delegated-terminal exited with signal-like termination before closeout applied. Stopping instead of restarting.');
          appendDebugLog('delegated-terminal-signal-no-closeout-stop', {
            signal: signal ?? '',
            code: code ?? 0,
          });
          stopTracking();
          finalizeDispatchExit(1, `delegated-terminal signal-like exit without closeout (${signal || code || 'unknown'})`, {
            returnBoundary: 'dispatch-stop',
            stopReasonCode: 'delegated-terminal-signal-no-closeout',
            completionStatus: 'failed',
          });
          return;
        }

        let actionable = false;
        try {
          actionable = actionablePhaseExists();
        } catch (error) {
          logWarn(`Unable to inspect remaining phases after signal-like delegated-terminal exit: ${error.message}`);
          appendDebugLog('delegated-terminal-signal-actionable-check-failed', {
            message: error.message,
            stack: error.stack || '',
          });
        }

        if (actionable) {
          if (shouldSuppressRestartForNoProgress()) {
            logWarn('Delegated-terminal signal-like exit did not change phase status or artifacts. Stopping instead of restarting.');
            appendDebugLog('delegated-terminal-no-progress-restart-suppressed', {
              signal: signal ?? '',
              code: code ?? 0,
              fingerprint: runtimeState.launchProgressFingerprint,
            });
            stopTracking();
            finalizeDispatchExit(1, 'delegated-terminal signal-like exit without phase progress', {
              returnBoundary: 'dispatch-stop',
              stopReasonCode: 'delegated-terminal-no-progress-restart',
              completionStatus: 'failed',
            });
            return;
          }
          signalRestartCount += 1;
          if (signalRestartCount > MAX_SIGNAL_RESTARTS) {
            logError(`Delegated-terminal exited with signal-like termination ${MAX_SIGNAL_RESTARTS} times while actionable phases remained. Stopping.`);
            stopTracking();
            finalizeDispatchExit(1, `delegated-terminal exceeded signal-like restart cap with actionable phases remaining (${MAX_SIGNAL_RESTARTS})`, {
              returnBoundary: 'dispatch-stop',
              stopReasonCode: 'delegated-terminal-signal-restart-cap',
              completionStatus: 'failed',
            });
            return;
          }
          logWarn(`Delegated-terminal exited with signal-like termination. Restarting autonomous loop (${signalRestartCount}/${MAX_SIGNAL_RESTARTS}).`);
          appendDebugLog('delegated-terminal-signal-restart', {
            signal: signal ?? '',
            code: code ?? 0,
            signalRestartCount,
            maxSignalRestarts: MAX_SIGNAL_RESTARTS,
            closeoutApplied,
          });
          launch();
          return;
        }

        stopTracking();
        finalizeDispatchExit(code ?? 1, `delegated-terminal signal-like exit (${signal || code || 'unknown'})`, {
          returnBoundary: 'signal-exit',
          stopReasonCode: 'signal-like-exit',
          completionStatus: 'failed',
        });
        return;
      }

      const exitCode = code ?? 0;
      if (exitCode === 0) {
        let actionable = false;
        try {
          actionable = actionablePhaseExists();
        } catch (error) {
          logWarn(`Unable to inspect remaining phases after delegated-terminal exit: ${error.message}`);
          appendDebugLog('delegated-terminal-actionable-check-failed', {
            message: error.message,
            stack: error.stack || '',
          });
        }

        if (actionable) {
          const controlledStop = goalRuntimeControlledStop();
          if (controlledStop) {
            stopTracking();
            finalizeDispatchExit(0, controlledStop.detail, {
              returnBoundary: 'dispatch-paused',
              stopReasonCode: controlledStop.code,
              completionStatus: controlledStop.completionStatus,
            });
            return;
          }
          restartCount += 1;
          if (restartCount > MAX_DELEGATED_RESTARTS) {
            logError(`Delegated-terminal exited cleanly ${MAX_DELEGATED_RESTARTS} times while actionable phases remained. Stopping to avoid an infinite restart loop.`);
            stopTracking();
            finalizeDispatchExit(1, `delegated-terminal exceeded restart cap with actionable phases remaining (${MAX_DELEGATED_RESTARTS})`, {
              returnBoundary: 'dispatch-stop',
              stopReasonCode: 'delegated-terminal-restart-cap',
              completionStatus: 'failed',
            });
            return;
          }

          logWarn(`Delegated-terminal exited before the active plan directory was complete. Restarting autonomous loop (${restartCount}/${MAX_DELEGATED_RESTARTS}).`);
          appendDebugLog('delegated-terminal-restart', {
            restartCount,
            maxRestarts: MAX_DELEGATED_RESTARTS,
          });
          launch();
          return;
        }

        stopTracking();
        finalizeDispatchExit(0, 'delegated-terminal completed with no actionable phases remaining', {
          requireSuccessBoundary: true,
          returnBoundary: 'success-return',
          stopReasonCode: 'plan-directory-complete',
          completionStatus: 'completed',
        });
        return;
      }

      stopTracking();
      finalizeDispatchExit(exitCode, `delegated-terminal exited with code ${exitCode}`, {
        returnBoundary: 'dispatch-stop',
        stopReasonCode: `delegated-terminal-exit-${exitCode}`,
        completionStatus: 'failed',
      });
    });
  };

  launch();
}

function runInSessionCoordinator(resolvedRoot, masterPlan, effectiveRuntime) {
  terminateStaleWorkers();
  const stopLine = state.stopOnFailure ? '  stopOnFailure: true' : '  stopOnFailure: false';
  const activeArtifacts = resolveActivePhaseArtifacts();
  const coordinatorContract = renderPhaseCoordinatorContract({
    PHASE_STATUS_FILE: state.statusFile,
    PLAN_DIR: state.planDir,
    EXECUTION_ROOT: resolvedRoot,
    ACTIVE_SPRINT_CONTRACT: activeArtifacts.sprintContract || 'not-yet-resolved',
    ACTIVE_QA_REPORT: activeArtifacts.qaReport || 'not-yet-resolved',
    ACTIVE_HANDOFF: activeArtifacts.handoff || 'not-yet-resolved',
    ACTIVE_SCORECARD: activeArtifacts.scorecard || 'not-yet-resolved',
  });

  const prompt = `/moonshot-in-session-coordinator
phaseRunnerResult:
  prepared: true
  executionMode: "in-session-coordinator"
  planDir: "${state.planDir}"
  masterPlan: "${masterPlan}"
  phaseStatusFile: "${state.statusFile}"
  executionRoot: "${resolvedRoot}"
  coordinatorPolicy: "fresh-fork-per-attempt"

options:
  maxAttemptsPerPhase: ${state.maxAttempts}
  verificationRuntimes: "${state.verificationRuntimes}"
  resume: ${state.resume ? 'true' : 'false'}
${stopLine}
${coordinatorContract ? `\n\n${coordinatorContract}` : ''}`;

  let cmd;

  switch (effectiveRuntime) {
    case 'claude': {
      const route = resolveModelRoute({
        runtime: 'claude',
        stage: 'phase_implementation',
        profile: state.effortProfile,
      });
      cmd = ['claude'];
      if (route.model) cmd.push('--model', route.model);
      if (route.effort) cmd.push('--effort', route.effort);
      cmd.push('--dangerously-skip-permissions', '--no-session-persistence', '-p', prompt);
      break;
    }
    case 'codex':
      cmd = buildCodexCommand(prompt);
      break;
    default:
      logError(`Unsupported runtime for in-session coordinator: ${effectiveRuntime}`);
      finalizeDispatchExit(1, `unsupported runtime for in-session coordinator: ${effectiveRuntime}`, {
        returnBoundary: 'dispatch-stop',
        stopReasonCode: 'unsupported-in-session-runtime',
        completionStatus: 'failed',
      });
      return;
  }

  if (state.dryRun) {
    writeStdoutLine(cmd.join(' '));
    return;
  }

  switch (effectiveRuntime) {
    case 'claude':
      ensureCommand('claude', 'Claude CLI not found');
      break;
    case 'codex':
      ensureCommand('codex', 'Codex CLI not found');
      break;
    default:
      break;
  }

  const forkUnavailablePattern = /collab spawn failed|parent thread rollout unavailable for fork/i;
  let restartCount = 0;
  let fallbackNoticeEmitted = false;
  const stopTracking = startTrackingBridge('in-session-coordinator');

  const launch = () => {
    runtimeState.launchProgressFingerprint = currentPhaseProgressFingerprint();
    let fallbackToDelegated = false;
    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGENT_LOOP_EFFORT_PROFILE: state.effortProfile,
        PHASE_DISPATCH_EFFORT_PROFILE: state.effortProfile,
        PHASE_DISPATCH_EFFORT_ESCALATION_REASON: state.effortEscalationReason,
        PHASE_RUN_LEASE_ID: runtimeState.runLeaseId,
      },
    });
    runtimeState.childPid = child.pid ?? null;
    runtimeState.lastChildPid = child.pid ?? null;
    runtimeState.lastChildExitAt = '';
    runtimeState.lastChildExitCode = null;
    runtimeState.lastChildExitSignal = '';
    runtimeState.lastProgressFingerprint = runtimeState.launchProgressFingerprint;
    runtimeState.lastProgressAtMs = Date.now();
    if (runtimeState.childPid) {
      protectedPids.add(runtimeState.childPid);
    }
    appendDebugLog('in-session-coordinator-launch', {
      pid: child.pid ?? null,
      ...summarizeSpawnCommand(cmd, process.cwd()),
      planDir: state.planDir,
      executionRoot: resolvedRoot,
    });

    const handleCoordinatorOutput = (chunk, targetStream) => {
      const text = String(chunk);
      targetStream.write(text);
      if (effectiveRuntime !== 'codex' || fallbackToDelegated) {
        return;
      }
      if (!forkUnavailablePattern.test(text)) {
        return;
      }
      fallbackToDelegated = true;
      if (!fallbackNoticeEmitted) {
        fallbackNoticeEmitted = true;
        logWarn('Codex in-session-coordinator could not fork a fresh attempt from this rollout. Falling back to delegated-terminal for uninterrupted execution.');
      }
      terminatePid(child.pid);
    };

    child.stdout.on('data', (chunk) => handleCoordinatorOutput(chunk, process.stdout));
    child.stderr.on('data', (chunk) => handleCoordinatorOutput(chunk, process.stderr));
    child.on('exit', (code, signal) => {
      if (child.pid) {
        protectedPids.delete(child.pid);
      }
      runtimeState.lastChildPid = child.pid ?? runtimeState.lastChildPid;
      runtimeState.lastChildExitAt = utcTimestamp();
      runtimeState.lastChildExitCode = code ?? 0;
      runtimeState.lastChildExitSignal = signal ?? '';
      runtimeState.childPid = null;
      appendDebugLog('in-session-coordinator-exit', {
        pid: child.pid ?? null,
        code: code ?? 0,
        signal: signal ?? '',
        fallbackToDelegated,
      });
      if (fallbackToDelegated) {
        recordDispatchEvidence('delegated-terminal', resolvedRoot, masterPlan, effectiveRuntime);
        stopTracking();
        runDelegatedTerminal(resolvedRoot, effectiveRuntime);
        return;
      }
      if (signal) {
        stopTracking();
        finalizeDispatchExit(1, `in-session-coordinator terminated by signal ${signal}`, {
          returnBoundary: 'signal-exit',
          stopReasonCode: 'signal-like-exit',
          completionStatus: 'failed',
        });
        return;
      }

      const exitCode = code ?? 0;
      if (exitCode === 0) {
        let actionable = false;
        try {
          actionable = actionablePhaseExists();
        } catch (error) {
          logWarn(`Unable to inspect remaining phases after in-session-coordinator exit: ${error.message}`);
          appendDebugLog('in-session-coordinator-actionable-check-failed', {
            message: error.message,
            stack: error.stack || '',
          });
        }

        if (actionable) {
          if (shouldSuppressRestartForNoProgress()) {
            logWarn('In-session-coordinator clean exit did not change phase status or artifacts. Stopping instead of restarting.');
            appendDebugLog('in-session-coordinator-no-progress-restart-suppressed', {
              restartCount,
              fingerprint: runtimeState.launchProgressFingerprint,
            });
            stopTracking();
            finalizeDispatchExit(1, 'in-session-coordinator clean exit without phase progress', {
              returnBoundary: 'dispatch-stop',
              stopReasonCode: 'in-session-coordinator-no-progress-restart',
              completionStatus: 'failed',
            });
            return;
          }
          const controlledStop = goalRuntimeControlledStop();
          if (controlledStop) {
            stopTracking();
            finalizeDispatchExit(0, controlledStop.detail, {
              returnBoundary: 'dispatch-paused',
              stopReasonCode: controlledStop.code,
              completionStatus: controlledStop.completionStatus,
            });
            return;
          }
          restartCount += 1;
          if (restartCount > MAX_COORDINATOR_RESTARTS) {
            logError(`In-session-coordinator exited cleanly ${MAX_COORDINATOR_RESTARTS} times while actionable phases remained. Stopping to avoid an infinite restart loop.`);
            stopTracking();
            finalizeDispatchExit(1, `in-session-coordinator exceeded restart cap with actionable phases remaining (${MAX_COORDINATOR_RESTARTS})`, {
              returnBoundary: 'dispatch-stop',
              stopReasonCode: 'in-session-coordinator-restart-cap',
              completionStatus: 'failed',
            });
            return;
          }

          logWarn(`In-session-coordinator exited before the active plan directory was complete. Restarting coordinator (${restartCount}/${MAX_COORDINATOR_RESTARTS}).`);
          appendDebugLog('in-session-coordinator-restart', {
            restartCount,
            maxRestarts: MAX_COORDINATOR_RESTARTS,
          });
          launch();
          return;
        }

        stopTracking();
        finalizeDispatchExit(0, 'in-session-coordinator completed with no actionable phases remaining', {
          requireSuccessBoundary: true,
          returnBoundary: 'success-return',
          stopReasonCode: 'plan-directory-complete',
          completionStatus: 'completed',
        });
        return;
      }

      stopTracking();
      finalizeDispatchExit(exitCode, `in-session-coordinator exited with code ${exitCode}`, {
        returnBoundary: 'dispatch-stop',
        stopReasonCode: `in-session-coordinator-exit-${exitCode}`,
        completionStatus: 'failed',
      });
    });
  };

  launch();
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length > 0 && !args[0].startsWith('--')) {
    state.planDir = args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--execution-mode':
        state.executionMode = args.shift() ?? '';
        break;
      case '--status-file':
        state.statusFile = args.shift() ?? '';
        break;
      case '--execution-root':
        state.executionRoot = args.shift() ?? '';
        break;
      case '--runtime':
        state.runtime = args.shift() ?? '';
        break;
      case '--verification-runtimes':
        state.verificationRuntimes = args.shift() ?? '';
        break;
      case '--max-attempts':
        state.maxAttempts = Number.parseInt(args.shift() ?? '3', 10);
        break;
      case '--stop-on-failure':
        state.stopOnFailure = true;
        break;
      case '--continue-on-failure':
        state.stopOnFailure = false;
        break;
      case '--autonomous':
        state.autonomous = true;
        break;
      case '--allow-interactive-in-session':
        state.allowInteractiveInSession = true;
        break;
      case '--parallel-worktrees':
        state.parallelWorktrees = Number.parseInt(args.shift() ?? '1', 10) || 1;
        break;
      case '--worktree-base':
        state.worktreeBase = args.shift() ?? 'HEAD';
        break;
      case '--worktree-root':
        state.worktreeRoot = args.shift() ?? '.tmp/harness-worktrees/phase-runs';
        break;
      case '--goal-time-budget-seconds':
        state.goalTimeBudgetSeconds = args.shift() ?? '';
        break;
      case '--goal-token-budget':
        state.goalTokenBudget = args.shift() ?? '';
        break;
      case '--final-git-closeout':
        state.finalGitCloseout = args.shift() ?? 'strict';
        break;
      case '--resume':
        state.resume = true;
        break;
      case '--dry-run':
        state.dryRun = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
      default:
        logError(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }
}

parseArgs(process.argv.slice(2));

if (!state.planDir) {
  logError('Plan directory not specified');
  showHelp();
  process.exit(1);
}

if (!fs.existsSync(state.planDir) || !fs.statSync(state.planDir).isDirectory()) {
  logError(`Plan directory not found: ${state.planDir}`);
  process.exit(1);
}

if (!['auto', 'claude', 'codex'].includes(state.runtime)) {
  logWarn(`Unsupported runtime '${state.runtime}'. Falling back to 'auto'.`);
  state.runtime = 'auto';
}

if (!['auto', 'current', 'claude', 'codex', 'both'].includes(state.verificationRuntimes)) {
  logWarn(`Unsupported verification runtime target '${state.verificationRuntimes}'. Falling back to 'auto'.`);
  state.verificationRuntimes = 'auto';
}

if (!['strict', 'warn', 'warning', 'off', 'false', 'none'].includes(String(state.finalGitCloseout || '').toLowerCase())) {
  logWarn(`Unsupported final git closeout mode '${state.finalGitCloseout}'. Falling back to 'strict'.`);
  state.finalGitCloseout = 'strict';
}

assertPlanStatusIdentity();
runtimeCli(['sync-wsl-codex-auth']);
syncCompletedPhaseArchive();
let resolvedMode = resolveExecutionMode();
const resolvedRoot = resolveExecutionRoot();
const masterPlan = resolveMasterPlan();
let effectiveRuntime = 'auto';
try {
  effectiveRuntime = resolveRuntime();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logError(`Runtime resolution failed: ${message}`);
  process.exit(1);
}

if (!masterPlan) {
  logError(`Master plan not found in: ${state.planDir}`);
  process.exit(1);
}

if (resolvedMode === 'in-session-coordinator' && effectiveRuntime === 'codex' && !state.allowInteractiveInSession) {
  logWarn('Codex in-session-coordinator is prompt-driven and can stop at handoff boundaries. Falling back to delegated-terminal for uninterrupted autonomous execution.');
  logWarn('Set PHASE_DISPATCH_ALLOW_INTERACTIVE_IN_SESSION=true or pass --allow-interactive-in-session to keep interactive coordinator mode.');
  resolvedMode = 'delegated-terminal';
}

fs.mkdirSync(resolvedRoot, { recursive: true });

logInfo(`Plan directory: ${state.planDir}`);
logInfo(`Execution mode: ${resolvedMode}`);
logInfo(`Execution root: ${resolvedRoot}`);
logInfo(`Runtime: ${effectiveRuntime}`);
logInfo(`Verification runtimes: ${state.verificationRuntimes}`);
logInfo(`Parallel worktrees: ${state.parallelWorktrees}`);
const gitPreflight = dispatchGitPreflight();
if (!gitPreflight.ok) {
  logError(`Git preflight failed before dispatch: ${gitPreflight.detail}`);
  logError(`Action: ${gitPreflight.fallbackHint}`);
  process.exit(1);
}
if (!runtimeState.runLeaseId) {
  runtimeState.runLeaseId = generateRunLeaseId();
}
recordDispatchEvidence(resolvedMode, resolvedRoot, masterPlan, effectiveRuntime);
if (!state.dryRun) {
  startDispatchLease(resolvedMode, resolvedRoot, masterPlan, effectiveRuntime);
  installDispatchSignalHandlers();
}
if (state.autonomous) {
  logInfo('Autonomous flag acknowledged (delegated terminal is autonomous by default)');
}

switch (resolvedMode) {
  case 'delegated-terminal':
    runDelegatedTerminal(resolvedRoot, effectiveRuntime);
    break;
  case 'in-session-coordinator':
    runInSessionCoordinator(resolvedRoot, masterPlan, effectiveRuntime);
    break;
  default:
    logError(`Unsupported execution mode: ${resolvedMode}`);
    process.exit(1);
}
