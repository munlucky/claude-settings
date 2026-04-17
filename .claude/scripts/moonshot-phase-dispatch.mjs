#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

import { runCommand } from './lib/process-utils.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const runtimeCliPath = path.join(SCRIPT_DIR, 'runtime-cli.mjs');
const phaseRunLeasePath = path.join(SCRIPT_DIR, 'phase-run-lease.mjs');
const PHASE_COORDINATOR_CONTRACT_TEMPLATE = path.join(SCRIPT_DIR, '..', 'templates', 'execution', 'PHASE_COORDINATOR_CONTRACT.md');
const DISPATCH_HEARTBEAT_INTERVAL_MS = Number.parseInt(process.env.PHASE_RUN_LEASE_HEARTBEAT_MS ?? '60000', 10) || 60000;

const state = {
  planDir: '',
  executionMode: 'auto',
  statusFile: '.claude/docs/phase-status.yaml',
  executionRoot: '',
  runtime: 'auto',
  maxAttempts: 3,
  stopOnFailure: true,
  autonomous: false,
  dryRun: false,
  codexReasoningEffort: process.env.PHASE_DISPATCH_CODEX_REASONING_EFFORT ?? process.env.MOONSHOT_CODEX_REASONING_EFFORT ?? 'medium',
  allowInteractiveInSession: (process.env.PHASE_DISPATCH_ALLOW_INTERACTIVE_IN_SESSION ?? 'false') === 'true',
  killStale: (process.env.PHASE_DISPATCH_KILL_STALE ?? 'true') === 'true',
  runLeaseId: '',
};

const runtimeState = {
  finalized: false,
  leaseSyncIssue: '',
};

const MAX_PLAN_COMPLETION_RESTARTS = Number.parseInt(
  process.env.PHASE_DISPATCH_MAX_PLAN_COMPLETION_RESTARTS
    ?? process.env.PHASE_DISPATCH_MAX_DELEGATED_RESTARTS
    ?? '32',
  10,
) || 32;

function showHelp() {
  process.stdout.write(`Usage:
  ./moonshot-phase-dispatch.sh <plan-dir> [options]

Options:
  --execution-mode <mode>   auto|delegated-terminal|in-session-coordinator
  --status-file <path>      Default: .claude/docs/phase-status.yaml
  --execution-root <path>   Default: <plan-dir>/execution
  --runtime <runtime>       auto|claude|codex
  --run-lease-id <id>       Optional existing phase-run lease id
  --max-attempts <n>        Default: 3 (coordinator mode)
  --stop-on-failure         Stop when retry cap is reached (default)
  --continue-on-failure     Keep going after failure
  --autonomous              Reserved for compatibility (agent-loop is autonomous by default)
  --allow-interactive-in-session
                            Keep in-session-coordinator on Codex instead of falling back
  --dry-run                 Print resolved command without executing\n`);
}

function logInfo(message) {
  process.stdout.write(`INFO: ${message}\n`);
}

function logWarn(message) {
  process.stdout.write(`WARN: ${message}\n`);
}

function logError(message) {
  console.error(`ERROR: ${message}`);
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

function shellUnquote(value) {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed;
  }
  return trimmed.slice(1, -1).replace(/'\\''/g, "'");
}

function parseAssignments(output) {
  const assignments = {};
  for (const rawLine of (output ?? '').split(/\r?\n/)) {
    const separator = rawLine.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 1);
    assignments[key] = shellUnquote(value);
  }
  return assignments;
}

function runPhaseRunLease(command, args, { allowFailure = false } = {}) {
  const result = spawnSync('node', [phaseRunLeasePath, command, ...args], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 0) !== 0 && !allowFailure) {
    throw new Error(result.stderr || `phase-run-lease command failed: ${command}`);
  }
  return parseAssignments(result.stdout);
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function countActionablePhasesInStatus() {
  if (!fs.existsSync(state.statusFile)) {
    return 0;
  }

  const lines = fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/);
  const phases = [];
  let current = null;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        phases.push(current);
      }
      current = {
        status: '',
        planConfirmed: '',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const stripped = rawLine.trim();
    if (stripped.startsWith('status:')) {
      current.status = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.split(':', 2)[1].trim().toLowerCase();
    }
  }

  if (current) {
    phases.push(current);
  }

  return phases.filter((phase) => {
    if (phase.planConfirmed === 'false') {
      return false;
    }
    return phase.status === 'pending' || phase.status === 'in_progress' || phase.status === 'failed';
  }).length;
}

function upsertStatusRootKey(lines, key, value) {
  const prefix = `${key}:`;
  const rendered = `${prefix} ${value}`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) {
    lines[index] = rendered;
    return;
  }
  const insertAt = lines.findIndex((line) => line.startsWith('phases:'));
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, rendered);
    return;
  }
  lines.push(rendered);
}

function noteLeaseSyncIssue(operation, detail) {
  const message = `${operation}: ${detail}`;
  if (runtimeState.leaseSyncIssue === message) {
    return;
  }
  runtimeState.leaseSyncIssue = message;
  logWarn(`Phase run lease sync issue detected (${message})`);
}

function writeLeaseStatusFallback(returnBoundary, stopReasonCode, stopReasonDetail, completionStatus = 'failed') {
  if (!state.statusFile || !fs.existsSync(state.statusFile)) {
    return;
  }

  const now = utcTimestamp();
  const lines = fs.readFileSync(state.statusFile, 'utf8')
    .split(/\r?\n/)
    .filter((line, index, array) => !(index === array.length - 1 && line === ''));
  const actionable = countActionablePhasesInStatus();

  upsertStatusRootKey(lines, 'activeExecutionHeartbeatAt', `"${now}"`);
  upsertStatusRootKey(lines, 'activeExecutionStatus', '"finished"');
  upsertStatusRootKey(lines, 'activeCurrentStage', '"finish/handoff"');
  upsertStatusRootKey(lines, 'activeActionablePhasesRemaining', String(actionable));
  upsertStatusRootKey(lines, 'lastReturnBoundary', returnBoundary ? `"${returnBoundary}"` : 'null');
  upsertStatusRootKey(lines, 'lastStopReasonCode', stopReasonCode ? `"${stopReasonCode}"` : 'null');
  upsertStatusRootKey(lines, 'lastStopReasonDetail', stopReasonDetail ? `"${stopReasonDetail}"` : 'null');
  upsertStatusRootKey(lines, 'activeCompletionStatus', completionStatus ? `"${completionStatus}"` : 'null');

  fs.writeFileSync(state.statusFile, `${lines.join('\n')}\n`, 'utf8');
}

function finalizeDispatchLease(returnBoundary, stopReasonCode, stopReasonDetail, completionStatus = 'failed') {
  runtimeState.finalized = true;
  const payload = finishRunLease(returnBoundary, stopReasonCode, stopReasonDetail, completionStatus);
  if (!payload) {
    writeLeaseStatusFallback(returnBoundary, stopReasonCode, stopReasonDetail, completionStatus);
  }
  return payload;
}

function installCrashGuards() {
  process.on('uncaughtException', (error) => {
    const detail = error?.stack || error?.message || String(error);
    logError(`Unhandled exception in moonshot-phase-dispatch: ${detail}`);
    finalizeDispatchLease('dispatch_crash', 'dispatch-uncaught-exception', detail, 'failed');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const detail = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
    logError(`Unhandled rejection in moonshot-phase-dispatch: ${detail}`);
    finalizeDispatchLease('dispatch_crash', 'dispatch-unhandled-rejection', detail, 'failed');
    process.exit(1);
  });

  process.on('exit', (code) => {
    if (runtimeState.finalized || code === 0 || state.dryRun) {
      return;
    }
    writeLeaseStatusFallback(
      'dispatch_exit',
      'dispatch-exit-before-finish',
      `moonshot-phase-dispatch exited with code ${code} before lease closeout`,
      'failed',
    );
  });
}

function ensureRunLeaseId() {
  if (!state.runLeaseId) {
    state.runLeaseId = crypto.randomUUID();
  }
  return state.runLeaseId;
}

function startRunLease(executionBoundary, resolvedRoot, masterPlan, runtime) {
  if (state.dryRun) {
    return null;
  }
  try {
    const payload = runPhaseRunLease('start', [
      state.statusFile,
      ensureRunLeaseId(),
      executionBoundary,
      state.planDir,
      resolvedRoot,
      runtime,
      masterPlan,
      String(process.pid),
    ]);
    if (Object.keys(payload).length === 0) {
      noteLeaseSyncIssue('start', 'phase-run-lease returned no payload');
      return null;
    }
    return payload;
  } catch (error) {
    logWarn(`Unable to start phase run lease: ${error.message}`);
    noteLeaseSyncIssue('start', error.message);
    return null;
  }
}

function heartbeatRunLease(currentStage, phaseNum = '', phaseTitle = '', completionStatus = 'running') {
  if (state.dryRun || !state.runLeaseId) {
    return null;
  }
  try {
    const payload = runPhaseRunLease('heartbeat', [
      state.statusFile,
      state.runLeaseId,
      currentStage,
      String(phaseNum ?? ''),
      phaseTitle ?? '',
      completionStatus,
    ], { allowFailure: true });
    if (Object.keys(payload).length === 0) {
      noteLeaseSyncIssue('heartbeat', `no payload for runLeaseId=${state.runLeaseId}`);
      return null;
    }
    return payload;
  } catch (error) {
    logWarn(`Unable to heartbeat phase run lease: ${error.message}`);
    noteLeaseSyncIssue('heartbeat', error.message);
    return null;
  }
}

function finishRunLease(returnBoundary, stopReasonCode, stopReasonDetail, completionStatus = '') {
  if (state.dryRun || !state.runLeaseId) {
    return null;
  }
  try {
    const payload = runPhaseRunLease('finish', [
      state.statusFile,
      state.runLeaseId,
      returnBoundary,
      stopReasonCode,
      stopReasonDetail,
      completionStatus,
    ], { allowFailure: true });
    if (Object.keys(payload).length === 0) {
      noteLeaseSyncIssue('finish', `no payload for runLeaseId=${state.runLeaseId}`);
      return null;
    }
    return payload;
  } catch (error) {
    logWarn(`Unable to finish phase run lease: ${error.message}`);
    noteLeaseSyncIssue('finish', error.message);
    return null;
  }
}

function assertReturnAllowed() {
  if (state.dryRun) {
    return {
      RETURN_ALLOWED: 'true',
      RETURN_REASON: 'dry_run',
      ACTIONABLE_PHASES_REMAINING: '0',
    };
  }
  try {
    return runPhaseRunLease('assert-return-allowed', [
      state.statusFile,
      state.runLeaseId,
      'true',
      'false',
    ], { allowFailure: true });
  } catch (error) {
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: `assert-return-allowed-error:${error.message}`,
      ACTIONABLE_PHASES_REMAINING: '',
    };
  }
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
  if (state.runtime !== 'auto') {
    return state.runtime;
  }

  const codex = runCommand('codex', ['--help']);
  if (!codex.error) {
    return 'codex';
  }

  return 'claude';
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

function recordDispatchEvidence(resolvedMode, resolvedRoot, masterPlan) {
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
    state.runtime,
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
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);

  try {
    process.kill(pid, 'SIGKILL');
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
      terminatePid(pid);
    }
  }
}

function buildCodexCommand(prompt) {
  const args = runtimeCli(['codex-base-args', process.cwd()]);
  if (state.codexReasoningEffort) {
    args.push('-c', `model_reasoning_effort="${state.codexReasoningEffort}"`);
  }
  args.push(prompt);
  return args;
}

function runDelegatedTerminal(resolvedRoot, masterPlan, runtime) {
  terminateStaleWorkers();
  const cmd = [
    'node',
    '.claude/scripts/agent-loop.mjs',
    state.planDir,
    '--status-file',
    state.statusFile,
    '--execution-root',
    resolvedRoot,
    '--runtime',
    state.runtime,
    '--run-lease-id',
    ensureRunLeaseId(),
  ];

  if (state.dryRun) {
    process.stdout.write(`${cmd.join(' ')}\n`);
    return;
  }

  let restartCount = 0;

  const launch = () => {
    heartbeatRunLease('dispatch/delegated-terminal-launch', '', '', 'running');
    const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });
    const heartbeatTimer = setInterval(() => {
      heartbeatRunLease('dispatch/delegated-terminal-running', '', '', 'running');
    }, DISPATCH_HEARTBEAT_INTERVAL_MS);
    child.on('exit', (code, signal) => {
      clearInterval(heartbeatTimer);
      if (signal) {
        finalizeDispatchLease('user_pause', `signal-${signal}`, `delegated-terminal received signal ${signal}`, 'interrupted');
        process.kill(process.pid, signal);
        return;
      }

      const exitCode = code ?? 0;
      if (exitCode === 0) {
        let actionable = false;
        try {
          actionable = actionablePhaseExists();
        } catch (error) {
          logWarn(`Unable to inspect remaining phases after delegated-terminal exit: ${error.message}`);
        }

        if (actionable) {
          restartCount += 1;
          if (restartCount > MAX_PLAN_COMPLETION_RESTARTS) {
            finalizeDispatchLease(
              'contract_violation',
              'restart-cap-exceeded',
              `delegated-terminal exited cleanly ${MAX_PLAN_COMPLETION_RESTARTS} times while actionable phases remained`,
              'failed',
            );
            logError(`Delegated-terminal exited cleanly ${MAX_PLAN_COMPLETION_RESTARTS} times while actionable phases remained. Stopping to avoid an infinite restart loop.`);
            process.exit(1);
            return;
          }

          heartbeatRunLease('dispatch/restart-pending', '', '', 'running');
          logWarn(`Delegated-terminal exited before the active plan directory was complete. Restarting autonomous loop (${restartCount}/${MAX_PLAN_COMPLETION_RESTARTS}).`);
          launch();
          return;
        }

        finalizeDispatchLease('loop_exit', 'plan-directory-complete', 'delegated-terminal loop exited after plan directory completion', 'completed');
        const returnGuard = assertReturnAllowed();
        if (returnGuard.RETURN_ALLOWED !== 'true') {
          logError(`Delegated-terminal tried to return before allowed boundary: ${returnGuard.RETURN_REASON}`);
          process.exit(1);
          return;
        }
      }

      if (exitCode !== 0) {
        finalizeDispatchLease('loop_exit', 'child-nonzero-exit', `delegated-terminal exited with code ${exitCode}`, 'failed');
      }
      process.exit(exitCode);
    });
  };

  launch();
}

function runInSessionCoordinator(resolvedRoot, masterPlan, runtime) {
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
${stopLine}
${coordinatorContract ? `\n\n${coordinatorContract}` : ''}`;

  const effectiveRuntime = state.runtime === 'auto' ? resolveRuntime() : state.runtime;
  let cmd;

  switch (effectiveRuntime) {
    case 'claude':
      ensureCommand('claude', 'Claude CLI not found');
      cmd = ['claude', '--dangerously-skip-permissions', '--no-session-persistence', '-p', prompt];
      break;
    case 'codex':
      ensureCommand('codex', 'Codex CLI not found');
      cmd = buildCodexCommand(prompt);
      break;
    default:
      logError(`Unsupported runtime for in-session coordinator: ${effectiveRuntime}`);
      process.exit(1);
  }

  if (state.dryRun) {
    process.stdout.write(`${cmd.join(' ')}\n`);
    return;
  }

  const forkUnavailablePattern = /collab spawn failed|parent thread rollout unavailable for fork/i;
  let restartCount = 0;
  let fallbackNoticeEmitted = false;

  const launch = () => {
    let fallbackToDelegated = false;
    heartbeatRunLease('dispatch/in-session-coordinator-launch', '', '', 'running');
    const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    const heartbeatTimer = setInterval(() => {
      heartbeatRunLease('dispatch/in-session-coordinator-running', '', '', 'running');
    }, DISPATCH_HEARTBEAT_INTERVAL_MS);

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
      clearInterval(heartbeatTimer);
      if (fallbackToDelegated) {
        recordDispatchEvidence('delegated-terminal', resolvedRoot, masterPlan);
        startRunLease('delegated-terminal', resolvedRoot, masterPlan, runtime);
        runDelegatedTerminal(resolvedRoot, masterPlan, runtime);
        return;
      }
      if (signal) {
        finalizeDispatchLease('user_pause', `signal-${signal}`, `in-session-coordinator received signal ${signal}`, 'interrupted');
        process.kill(process.pid, signal);
        return;
      }

      const exitCode = code ?? 0;
      if (exitCode === 0) {
        let actionable = false;
        try {
          actionable = actionablePhaseExists();
        } catch (error) {
          logWarn(`Unable to inspect remaining phases after in-session-coordinator exit: ${error.message}`);
        }

        if (actionable) {
          restartCount += 1;
          if (restartCount > MAX_PLAN_COMPLETION_RESTARTS) {
            finalizeDispatchLease(
              'contract_violation',
              'restart-cap-exceeded',
              `in-session-coordinator exited cleanly ${MAX_PLAN_COMPLETION_RESTARTS} times while actionable phases remained`,
              'failed',
            );
            logError(`In-session-coordinator exited cleanly ${MAX_PLAN_COMPLETION_RESTARTS} times while actionable phases remained. Stopping to avoid an infinite restart loop.`);
            process.exit(1);
            return;
          }

          heartbeatRunLease('dispatch/restart-pending', '', '', 'running');
          logWarn(`In-session-coordinator exited before the active plan directory was complete. Restarting coordinator (${restartCount}/${MAX_PLAN_COMPLETION_RESTARTS}).`);
          launch();
          return;
        }

        finalizeDispatchLease('loop_exit', 'plan-directory-complete', 'in-session-coordinator exited after plan directory completion', 'completed');
        const returnGuard = assertReturnAllowed();
        if (returnGuard.RETURN_ALLOWED !== 'true') {
          logError(`In-session-coordinator tried to return before allowed boundary: ${returnGuard.RETURN_REASON}`);
          process.exit(1);
          return;
        }
      }

      if (exitCode !== 0) {
        finalizeDispatchLease('loop_exit', 'child-nonzero-exit', `in-session-coordinator exited with code ${exitCode}`, 'failed');
      }
      process.exit(exitCode);
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
      case '--dry-run':
        state.dryRun = true;
        break;
      case '--run-lease-id':
        state.runLeaseId = args.shift() ?? '';
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
installCrashGuards();
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

syncCompletedPhaseArchive();
let resolvedMode = resolveExecutionMode();
const resolvedRoot = resolveExecutionRoot();
const masterPlan = resolveMasterPlan();
const effectiveRuntime = resolveRuntime();

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
logInfo(`Runtime: ${state.runtime}`);
recordDispatchEvidence(resolvedMode, resolvedRoot, masterPlan);
startRunLease(resolvedMode, resolvedRoot, masterPlan, effectiveRuntime);
if (state.autonomous) {
  logInfo('Autonomous flag acknowledged (delegated terminal is autonomous by default)');
}

switch (resolvedMode) {
  case 'delegated-terminal':
    runDelegatedTerminal(resolvedRoot, masterPlan, effectiveRuntime);
    break;
  case 'in-session-coordinator':
    runInSessionCoordinator(resolvedRoot, masterPlan, effectiveRuntime);
    break;
  default:
    logError(`Unsupported execution mode: ${resolvedMode}`);
    process.exit(1);
}
