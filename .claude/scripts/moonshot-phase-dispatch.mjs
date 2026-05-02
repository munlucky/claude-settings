#!/usr/bin/env node

import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCommand } from './lib/process-utils.mjs';
import { resolveCodexReasoningEffort, resolveEffortProfile } from './lib/effort-profile.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const runtimeCliPath = path.join(SCRIPT_DIR, 'runtime-cli.mjs');
const phaseStatePath = path.join(SCRIPT_DIR, 'agent-loop-phase-state.mjs');
const phaseArtifactsPath = path.join(SCRIPT_DIR, 'agent-loop-phase-artifacts.mjs');
const phaseRunLeasePath = path.join(SCRIPT_DIR, 'phase-run-lease.mjs');
const runtimeStatePath = path.join(SCRIPT_DIR, 'runtime-state.mjs');
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
  effortProfile: resolveEffortProfile(process.env.PHASE_DISPATCH_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE, 'deep'),
  codexReasoningEffort: resolveCodexReasoningEffort({
    explicitEffort: process.env.PHASE_DISPATCH_CODEX_REASONING_EFFORT ?? process.env.MOONSHOT_CODEX_REASONING_EFFORT,
    profile: process.env.PHASE_DISPATCH_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE,
    defaultProfile: 'deep',
  }),
  allowInteractiveInSession: (process.env.PHASE_DISPATCH_ALLOW_INTERACTIVE_IN_SESSION ?? 'false') === 'true',
  killStale: (process.env.PHASE_DISPATCH_KILL_STALE ?? 'true') === 'true',
  parallelWorktrees: Number.parseInt(process.env.PHASE_PARALLEL_WORKTREES ?? '1', 10) || 1,
  worktreeBase: process.env.PHASE_WORKTREE_BASE || 'HEAD',
  worktreeRoot: process.env.PHASE_WORKTREE_ROOT || '.tmp/harness-worktrees/phase-runs',
  goalTimeBudgetSeconds: process.env.PHASE_GOAL_TIME_BUDGET_SECONDS || '',
  goalTokenBudget: process.env.PHASE_GOAL_TOKEN_BUDGET || '',
};

const runtimeState = {
  runLeaseId: '',
  leaseActive: false,
  childPid: null,
  childExitHandled: false,
};

const MAX_DELEGATED_RESTARTS = Number.parseInt(process.env.PHASE_DISPATCH_MAX_DELEGATED_RESTARTS ?? '32', 10) || 32;
const MAX_COORDINATOR_RESTARTS = Number.parseInt(
  process.env.PHASE_DISPATCH_MAX_PLAN_COMPLETION_RESTARTS
    ?? process.env.PHASE_DISPATCH_MAX_DELEGATED_RESTARTS
    ?? '32',
  10,
) || 32;
const MAX_SIGNAL_RESTARTS = Number.parseInt(process.env.PHASE_DISPATCH_MAX_SIGNAL_RESTARTS ?? '4', 10) || 4;
const SIGNAL_LIKE_EXIT_CODES = new Set([129, 130, 131, 143]);

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

function appendPhaseArtifact(command, args) {
  const result = runNodeScript(phaseArtifactsPath, [command, ...args]);
  if ((result.status ?? 0) !== 0) {
    throw new Error(result.stderr || `phase-artifacts failed: ${command}`);
  }
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isSignalLikeExit(code, signal) {
  return Boolean(signal) || SIGNAL_LIKE_EXIT_CODES.has(code ?? 0);
}

function actionablePhaseExists() {
  const result = spawnSync('node', [path.join(SCRIPT_DIR, 'agent-loop-phase-plan.mjs'), 'get-next-phase', state.statusFile], {
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
  runtimeState.runLeaseId = generateRunLeaseId();
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

function startTrackingBridge(label) {
  if (state.dryRun) {
    return () => {};
  }
  const intervalMs = (Number.parseInt(process.env.PHASE_DISPATCH_TRACKING_SECONDS ?? '45', 10) || 45) * 1000;
  const timer = setInterval(() => {
    try {
      const context = activePhaseContext();
      heartbeatDispatchLease(context);
      const summaryParts = [
        label,
        `phase=${context.number || 'none'}`,
        `title=${context.title || context.activePhaseTitle || 'n/a'}`,
        `stage=${context.currentStage || mapLeaseStage(context)}`,
        `status=${context.status || 'idle'}`,
        `outcome=${context.lastOutcome || 'pending'}`,
      ];
      logInfo(`Tracking heartbeat: ${summaryParts.join(' ')}`);
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
      assertReturnAllowedOrThrow();
      finishDispatchLease(returnBoundary || 'success-return', stopReasonCode || 'plan-directory-complete', detail, completionStatus || 'completed');
      process.exit(0);
      return;
    }

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
    appendDebugLog('dispatch-signal', {
      signal: signalName,
      childPid: runtimeState.childPid,
      leaseActive: runtimeState.leaseActive,
      runLeaseId: runtimeState.runLeaseId,
    });
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
    finalizeDispatchExit(1, `dispatcher interrupted by ${signalName}`, {
      returnBoundary: 'dispatch-interrupted',
      stopReasonCode: 'dispatcher-interrupted',
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
    '[c]odex exec --full-auto -C',
    '[b]ash .claude/scripts/moonshot-phase-dispatch.sh',
  ];

  for (const pattern of patterns) {
    const pids = runtimeCli(['find-pids-by-pattern', pattern]);
    for (const pidValue of pids) {
      const pid = Number.parseInt(pidValue, 10);
      if (!Number.isFinite(pid) || pid === process.pid) {
        continue;
      }
      logWarn(`terminating stale phase worker (pid=${pid})`);
      appendDebugLog('terminate-stale-worker', {
        pid,
        pattern,
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
  if (state.codexReasoningEffort) {
    args.push('-c', `model_reasoning_effort="${state.codexReasoningEffort}"`);
  }
  appendCodexPromptArg(args, prompt);
  return args;
}

function appendCodexPromptArg(args, prompt) {
  if (process.platform === 'win32' && args.some((arg, index) => index === 0
    ? /(?:powershell|pwsh)\.exe$/i.test(String(arg))
    : /\.ps1$/i.test(String(arg)))) {
    const promptDir = path.join('.claude', 'logs', 'agent-loop', 'prompts');
    fs.mkdirSync(promptDir, { recursive: true });
    const promptFile = path.resolve(promptDir, `dispatch-codex-prompt-${Date.now()}-${process.pid}.txt`);
    fs.writeFileSync(promptFile, prompt, 'utf8');
    args.push('--codex-prompt-file', promptFile);
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
    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: 'inherit',
      env: {
        ...process.env,
        PHASE_RUN_LEASE_ID: runtimeState.runLeaseId,
      },
    });
    runtimeState.childPid = child.pid ?? null;
    appendDebugLog('delegated-terminal-launch', {
      pid: child.pid ?? null,
      command: cmd,
      planDir: state.planDir,
      executionRoot: resolvedRoot,
    });
    child.on('exit', (code, signal) => {
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
${stopLine}
${coordinatorContract ? `\n\n${coordinatorContract}` : ''}`;

  let cmd;

  switch (effectiveRuntime) {
    case 'claude':
      cmd = ['claude', '--dangerously-skip-permissions', '--no-session-persistence', '-p', prompt];
      break;
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
    let fallbackToDelegated = false;
    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PHASE_RUN_LEASE_ID: runtimeState.runLeaseId,
      },
    });
    runtimeState.childPid = child.pid ?? null;
    appendDebugLog('in-session-coordinator-launch', {
      pid: child.pid ?? null,
      command: cmd,
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
runtimeCli(['sync-wsl-codex-auth']);

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
