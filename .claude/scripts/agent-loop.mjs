#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assignExecutionArtifactPaths, buildPhasePrompt } from './agent-loop-phase-plan-lib.mjs';
import { noiseSummaryPath } from './lib/waste-ledger.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeCliPath = path.join(scriptDir, 'runtime-cli.mjs');
const phasePlanPath = path.join(scriptDir, 'agent-loop-phase-plan.mjs');
const phaseStatePath = path.join(scriptDir, 'agent-loop-phase-state.mjs');
const phaseRunnerPath = path.join(scriptDir, 'agent-loop-phase-runner.mjs');
const phaseParallelPlannerPath = path.join(scriptDir, 'phase-parallel-planner.mjs');
const phaseWaveCoordinatorPath = path.join(scriptDir, 'phase-wave-coordinator.mjs');
const phaseCheckpointCommitPath = path.join(scriptDir, 'phase-checkpoint-commit.mjs');
const artifactsPath = path.join(scriptDir, 'agent-loop-phase-artifacts.mjs');
const runtimeStatePath = path.join(scriptDir, 'runtime-state.mjs');
const logDir = '.claude/logs/agent-loop';
const decisionLog = path.join(logDir, 'decisions.md');
const summaryReport = path.join(logDir, 'summary.md');
const liveSummaryReport = path.join(logDir, 'summary.current.md');
const debugLog = path.join(logDir, 'debug.jsonl');
const currentRunState = '.claude/logs/workflow-enforcement/current-run.json';

const state = {
  planDir: '',
  statusFile: '.claude/docs/phase-status.yaml',
  executionRoot: '',
  runtime: 'auto',
  verificationRuntimes: 'auto',
  maxPhases: 0,
  delaySeconds: 3,
  dryRun: false,
  parallelWorktrees: Number.parseInt(process.env.PHASE_PARALLEL_WORKTREES ?? '1', 10) || 1,
  worktreeBase: process.env.PHASE_WORKTREE_BASE || 'HEAD',
  worktreeRoot: process.env.PHASE_WORKTREE_ROOT || '.tmp/harness-worktrees/phase-runs',
};

function runNodeScript(scriptPath, args, options = {}) {
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function syncRuntimeEnvironment() {
  runNodeScript(runtimeCliPath, ['sync-wsl-codex-auth'], { stdio: 'ignore' });
}

function showHelp() {
  writeStdoutLine(`# Called from within Claude Code main session.
#
# Usage:
#   node .claude/scripts/agent-loop.mjs <plan-dir> [options]
#
# Compatibility wrapper:
#   ./.claude/scripts/agent-loop.sh <plan-dir> [options]
#
# Arguments:
#   plan-dir          Directory containing master plan and phase documents
#
# Options:
#   --status-file     Path to phase-status.yaml (default: .claude/docs/phase-status.yaml)
#   --execution-root  Directory for execution bridge artifacts (default: <plan-dir>/execution)
#   --runtime         Runner CLI: auto|claude|codex (default: auto)
#   --verification-runtimes
#                    Verification runtime target: auto|current|claude|codex|both (default: auto)
#   --max-phases N    Maximum phases to run (default: all)
#   --delay N         Delay between phases in seconds (default: 3)
#   --parallel-worktrees N
#                    Opt-in phase-internal workset parallelism (default: 1)
#   --worktree-base REF
#                    Base ref for workset worktrees (default: HEAD)
#   --worktree-root PATH
#                    Root for temporary workset worktrees
#   --dry-run         Print what would be executed without running
# =============================================================================`);
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length > 0 && !args[0].startsWith('--')) {
    state.planDir = args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
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
      case '--max-phases':
        state.maxPhases = Number.parseInt(args.shift() ?? '0', 10) || 0;
        break;
      case '--delay':
        state.delaySeconds = Number.parseInt(args.shift() ?? '3', 10) || 3;
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
      case '--dry-run':
        state.dryRun = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
      default:
        console.error(`ERROR: Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }
}

function assertEnvironment() {
  if (!state.planDir) {
    console.error('ERROR: Plan directory not specified');
    console.error('Usage: node .claude/scripts/agent-loop.mjs <plan-dir> [options]');
    process.exit(1);
  }

  if (!fs.existsSync(state.planDir) || !fs.statSync(state.planDir).isDirectory()) {
    console.error(`ERROR: Plan directory not found: ${state.planDir}`);
    process.exit(1);
  }

  if (!state.executionRoot) {
    state.executionRoot = `${state.planDir.replace(/\/$/, '')}/execution`;
  }
}

function resolveRunnerRuntime() {
  const result = runNodeScript(path.join(scriptDir, 'agent-loop-phase-runtime.mjs'), [
    'resolve-runner-runtime',
    state.runtime,
  ]);
  if (result.status !== 0) {
    console.error(result.stderr || 'ERROR: failed to resolve runtime');
    process.exit(result.status);
  }
  return result.stdout.trim();
}

function phasePlan(command, ...args) {
  const result = runNodeScript(phasePlanPath, [command, ...args], {
    env: {
      ...process.env,
      AGENT_LOOP_STALE_PHASE_SECONDS: process.env.AGENT_LOOP_STALE_PHASE_SECONDS ?? '1800',
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `phase-plan command failed: ${command}`);
  }
  return result.stdout.trim();
}

function assertPlanStatusIdentity() {
  const result = runNodeScript(phasePlanPath, ['assert-plan-status-match', state.planDir, state.statusFile]);
  if (result.status !== 0) {
    console.error((result.stderr || result.stdout || 'ERROR: plan-status-mismatch').trim());
    process.exit(1);
  }
}

function phaseState(command, ...args) {
  const result = runNodeScript(phaseStatePath, [command, ...args], {
    env: {
      ...process.env,
      AGENT_LOOP_STALE_PHASE_SECONDS: process.env.AGENT_LOOP_STALE_PHASE_SECONDS ?? '1800',
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `phase-state command failed: ${command}`);
  }
  return result.stdout.trim();
}

function artifactsCommand(command, ...args) {
  const result = runNodeScript(artifactsPath, [command, ...args]);
  if (result.status !== 0) {
    throw new Error(result.stderr || `phase-artifacts command failed: ${command}`);
  }
  return result.stdout.trim();
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

function readGoalRuntimeStatus() {
  try {
    const result = runNodeScript(runtimeStatePath, ['goal-status', state.planDir], {
      env: {
        ...process.env,
        NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS || '1',
      },
    });
    if (result.status !== 0) {
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

function stopReasonForGoalRuntime(payload) {
  const status = String(payload?.goal?.status || '').trim();
  if (status === 'paused') {
    return {
      reason: 'goal-paused',
      detail: 'Goal runtime is paused; resume with phase-goal-control resume <plan-dir>.',
    };
  }
  if (status === 'budget_limited') {
    return {
      reason: 'goal-budget-limited',
      detail: 'Goal runtime reached its budget limit; inspect status and resume only after raising/clearing the budget.',
    };
  }
  if (payload?.goal?.continuation_suppressed) {
    return {
      reason: 'goal-continuation-suppressed',
      detail: 'Goal runtime suppressed automatic continuation after a no-effect turn.',
    };
  }
  return null;
}

function activePhaseContext() {
  return parseAssignments(phaseState('get-active-phase-context', state.statusFile));
}

function gateAssignmentsIndicateStrongCompletion(gate) {
  if (!gate || typeof gate !== 'object') {
    return false;
  }
  const blockerCodes = String(gate.PHASE_COMPLETION_BLOCKER_CODES || '').trim();
  const scoreVerdict = String(gate.PHASE_COMPLETION_SCORE_VERDICT || '').trim().toLowerCase();
  const closeoutStatus = String(gate.PHASE_CLOSEOUT_STATUS || '').trim().toLowerCase();
  const cleanFinish = String(gate.PHASE_COMPLETION_CLEAN_FINISH || '').trim().toLowerCase() === 'true';
  return scoreVerdict === 'done'
    && cleanFinish
    && blockerCodes === ''
    && (closeoutStatus === 'complete' || closeoutStatus === 'clean_finish' || String(gate.PHASE_COMPLETION_ALLOWED || '') === 'true');
}

function completionGateForSignalContext(context) {
  if (!context?.qaReport) {
    return null;
  }
  const phaseExecutionDir = path.dirname(context.qaReport);
  return parseAssignments(phaseState(
    'evaluate-phase-completion-gate',
    '0',
    context.qaReport || '',
    context.scorecard || '',
    phaseExecutionDir,
    'true',
    process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
    context.handoff || '',
  ));
}

function phaseSummary(phaseNum) {
  const output = phaseState('get-phase-summary', state.statusFile, String(phaseNum));
  const values = {};
  for (const rawLine of output.split(/\r?\n/)) {
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

function firstBlockedPhase() {
  if (!fs.existsSync(state.statusFile)) {
    return null;
  }
  const blockedStatuses = new Set(['verification_blocked', 'runtime_unhealthy', 'blocked']);
  const lines = fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/);
  const phases = [];
  let current = null;
  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) phases.push(current);
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = { number: match ? match[1] : '', status: '', lastOutcome: '', title: '' };
      continue;
    }
    if (!current) continue;
    const stripped = rawLine.trim();
    if (stripped.startsWith('title:')) current.title = stripped.slice('title:'.length).trim().replace(/^"|"$/g, '');
    if (stripped.startsWith('status:')) current.status = stripped.slice('status:'.length).trim();
    if (stripped.startsWith('lastOutcome:')) current.lastOutcome = stripped.slice('lastOutcome:'.length).trim();
  }
  if (current) phases.push(current);
  return phases.find((phase) => blockedStatuses.has(phase.status)) || null;
}

function resolveMasterPlan(planDir) {
  if (fs.existsSync(state.statusFile)) {
    for (const rawLine of fs.readFileSync(state.statusFile, 'utf8').split(/\r?\n/)) {
      const match = rawLine.match(/^masterPlan:\s*(.+)\s*$/);
      if (!match) {
        continue;
      }
      const candidate = match[1].trim().replace(/^"|"$/g, '');
      if (candidate && fs.existsSync(candidate) && path.resolve(path.dirname(candidate)) === path.resolve(planDir)) {
        return candidate;
      }
    }
  }

  const entries = fs.readdirSync(planDir, { withFileTypes: true });
  const match = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .find((name) => name.includes('master') || name.includes('00-'));
  return match ? path.join(planDir, match) : '';
}

function renderDryRunPrompt({ nextPhase, phaseTitle, phaseDoc, runtime }) {
  const instructions = `Implement phase ${nextPhase} using the active phase doc as the only planning baseline.

Primary objective:
- Complete the scoped work for phase ${nextPhase}.
- Keep changes bounded to the active phase.
- Do not move to other phases in this run.
- If the phase artifacts declare an exact verification command, run that command exactly once instead of searching for alternative verifiers.
- Do not stop at implementation-complete or verification-complete checkpoints alone.
- Return control only after fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, and SCORECARD.md says \`Verdict: done\`.`;
  const paths = assignExecutionArtifactPaths(nextPhase, phaseTitle, state.executionRoot);
  return buildPhasePrompt({
    nextPhase,
    phaseTitle,
    planDir: state.planDir,
    phaseDoc,
    statusFile: state.statusFile,
    executionRoot: state.executionRoot,
    paths,
    runtime,
    targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
    extraInstructions: instructions,
    autonomousInstructions: `## 자율 실행 모드
- 사용자 확인 없이 최선의 판단으로 자율적으로 진행하세요
- 불확실한 경우 보수적이고 안전한 선택을 하세요
- 모든 결정사항은 간략히 기록해주세요
- 실패 시 대안을 시도한 후 진행하세요
- 절대로 사용자에게 질문하거나 확인을 요청하지 마세요`,
    workspaceRoot: process.cwd(),
  });
}

function runPhaseRunnerOnce(argv) {
  const result = spawnSync('node', [phaseRunnerPath, ...argv], {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`ERROR: failed to start agent-loop phase runner: ${result.error.message}`);
    process.exit(1);
  }

  return result.status ?? 0;
}

function runPhaseWaveCoordinator(argv) {
  const result = spawnSync('node', [phaseWaveCoordinatorPath, ...argv], {
    encoding: 'utf8',
  });

  if (result.error) {
    console.error(`ERROR: failed to start phase wave coordinator: ${result.error.message}`);
    process.exit(1);
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    artifactPath: (result.stdout || '').match(/^artifactPath=(.+)$/m)?.[1] || '',
    reason: (result.stdout || '').match(/^reason=(.+)$/m)?.[1] || '',
  };
}

function buildSinglePhaseArgs({ nextPhase, phaseTitle, phaseDoc, runtime }) {
  const args = [
    state.planDir,
    '--status-file', state.statusFile,
    '--execution-root', state.executionRoot,
    '--runtime', runtime || state.runtime,
    '--verification-runtimes', state.verificationRuntimes,
    '--phase-num', String(nextPhase),
    '--phase-title', phaseTitle,
    '--phase-doc', phaseDoc,
  ];

  if (state.delaySeconds !== 3) {
    args.push('--delay', String(state.delaySeconds));
  }
  if (state.parallelWorktrees > 1) {
    args.push('--parallel-worktrees', String(state.parallelWorktrees));
    args.push('--worktree-base', state.worktreeBase || 'HEAD');
    args.push('--worktree-root', state.worktreeRoot || '.tmp/harness-worktrees/phase-runs');
  }

  args.push('--max-phases', '1', '--single-phase');
  return args;
}

function writePhaseWavePlan(plan) {
  ensureLoopLogs();
  const filePath = path.join(logDir, 'phase-wave-plan.current.json');
  fs.writeFileSync(filePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return filePath;
}

function resolvePhaseParallelPlan() {
  if ((process.env.PHASE_PARALLEL_AUTO ?? 'true') === 'false') {
    return {
      executionPlan: 'sequential',
      fallbackReasons: ['parallel-auto-disabled'],
      parallelDisabled: true,
      disableReason: 'phase-level parallel disabled by PHASE_PARALLEL_AUTO=false',
      phases: [],
    };
  }
  if (state.maxPhases > 0) {
    return {
      executionPlan: 'sequential',
      fallbackReasons: ['max-phases-limit-active'],
      parallelDisabled: true,
      disableReason: 'phase-level parallel disabled because --max-phases is active',
      phases: [],
    };
  }
  const result = runNodeScript(phaseParallelPlannerPath, [
    '--plan-dir', state.planDir,
    '--status-file', state.statusFile,
    '--wave-cap', process.env.PHASE_PARALLEL_WAVE_CAP ?? '3',
  ]);
  if (result.status !== 0) {
    appendDebugLog('phase-parallel-planner-failed', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    return {
      executionPlan: 'sequential',
      fallbackReasons: ['planner-failed'],
      phases: [],
    };
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    appendDebugLog('phase-parallel-planner-json-failed', {
      message: error instanceof Error ? error.message : String(error),
      stdout: result.stdout,
    });
    return {
      executionPlan: 'sequential',
      fallbackReasons: ['planner-json-invalid'],
      phases: [],
    };
  }
}

function buildPhaseWaveArgs({ waveFile, runtime }) {
  return [
    state.planDir,
    '--status-file', state.statusFile,
    '--execution-root', state.executionRoot,
    '--runtime', runtime || state.runtime,
    '--verification-runtimes', state.verificationRuntimes,
    '--wave-file', waveFile,
    '--worktree-base', state.worktreeBase || 'HEAD',
    '--worktree-root', state.worktreeRoot || '.tmp/harness-worktrees/phase-waves',
  ];
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logInfo(message) {
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m ${message}`);
}

function logWarn(message) {
  writeStdoutLine(`\u001b[1;33m⚠️\u001b[0m ${message}`);
}

function logError(message) {
  console.error(`\u001b[0;31m❌\u001b[0m ${message}`);
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function localTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function ensureLoopLogs({ reset = false } = {}) {
  fs.mkdirSync(logDir, { recursive: true });
  if (reset || !fs.existsSync(decisionLog)) {
    fs.writeFileSync(decisionLog, `# Autonomous Decision Log\n\nGenerated: ${localTimestamp()}\n\n`, 'utf8');
  }
}

function appendDecisionLog(lines) {
  ensureLoopLogs();
  fs.appendFileSync(decisionLog, `${lines.join('\n')}\n`, 'utf8');
}

function appendDebugLog(event, details = {}) {
  ensureLoopLogs();
  fs.appendFileSync(debugLog, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    source: 'agent-loop',
    event,
    ...details,
  })}\n`, 'utf8');
}

function writeSummaryReport({ planDir, totalPhases, completed, failed, stoppedEarly, stopPhase, stopReason, stopDetail }) {
  ensureLoopLogs();
  const wasteSummary = readWasteSummary();
  const wasteTotals = wasteSummary?.totals || null;
  const body = [
    '# Agent Loop Summary Report',
    '',
    '## Execution Info',
    `- **Plan Directory**: ${planDir}`,
    `- **Total Phases**: ${totalPhases}`,
    `- **Completed**: ${completed}`,
    `- **Failed**: ${failed}`,
    `- **Completed At**: ${localTimestamp()}`,
    '',
    '## Loop Stop',
    `- Stopped Early: ${stoppedEarly ? 'true' : 'false'}`,
    `- Phase: ${stopPhase || 'n/a'}`,
    `- Reason: ${stopReason || 'n/a'}`,
    `- Detail: ${stopDetail || 'n/a'}`,
    '',
    ...(wasteTotals ? [
      '## Waste Ledger',
      `- Healthy retries: ${wasteTotals.healthyRetries || 0}`,
      `- Waste retries: ${wasteTotals.wasteRetries || 0}`,
      `- Warning entries: ${wasteTotals.warningEntries || 0}`,
      '',
    ] : []),
    '## Decision Log',
    `See: ${decisionLog}`,
    '',
    '## Logs',
    `See: ${logDir}`,
    `Live state: ${currentRunState}`,
    '',
  ].join('\n');
  fs.writeFileSync(summaryReport, body, 'utf8');
}

function writeLiveSummaryReport({ planDir, totalPhases, completed, failed, currentPhase = '', currentPhaseTitle = '', loopState = 'running', stopReason = '', stopDetail = '' }) {
  ensureLoopLogs();
  const wasteSummary = readWasteSummary();
  const wasteTotals = wasteSummary?.totals || null;
  const body = [
    '# Agent Loop Live Summary',
    '',
    '## Status',
    `- State: ${loopState}`,
    `- Current phase: ${currentPhase || 'n/a'}`,
    `- Current title: ${currentPhaseTitle || 'n/a'}`,
    `- Completed: ${completed}`,
    `- Failed: ${failed}`,
    `- Updated At: ${localTimestamp()}`,
    '',
    '## Context',
    `- Plan Directory: ${planDir}`,
    `- Total Phases: ${totalPhases}`,
    `- Current Run State: ${currentRunState}`,
    `- Historical Summary: ${summaryReport}`,
    '',
    ...(wasteTotals ? [
      '## Waste Ledger',
      `- Healthy retries: ${wasteTotals.healthyRetries || 0}`,
      `- Waste retries: ${wasteTotals.wasteRetries || 0}`,
      `- Warning entries: ${wasteTotals.warningEntries || 0}`,
      '',
    ] : []),
    '## Stop Signals',
    `- Reason: ${stopReason || 'n/a'}`,
    `- Detail: ${stopDetail || 'n/a'}`,
    '',
  ].join('\n');
  fs.writeFileSync(liveSummaryReport, body, 'utf8');
}

function stalePhaseSeconds() {
  return process.env.AGENT_LOOP_STALE_PHASE_SECONDS ?? '1800';
}

function handleStaleInProgressPhases() {
  const stalePhases = phaseState('list-stale-in-progress-phases', state.statusFile, stalePhaseSeconds())
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (stalePhases.length === 0) {
    return;
  }

  logWarn(`Stale in-progress phases detected, forcing failed state before reroute: ${stalePhases.join(', ')}`);
  for (const phaseNum of stalePhases) {
    phaseState(
      'update-phase-state',
      state.statusFile,
      phaseNum,
      'failed',
      utcTimestamp(),
      'stale-running-timeout',
      'false',
      '',
      '',
      '',
      '',
      '',
    );
    appendDecisionLog([
      `## Phase ${phaseNum} - Stale In-Progress Guard`,
      `- Reason: skipped stale in-progress state for > ${stalePhaseSeconds()}s`,
      '',
    ]);
  }
}

function reconcileCompletedPhasesFromArtifacts() {
  const reconciled = phaseState('reconcile-completed-phases', state.statusFile)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((line) => {
      const [phaseNum = '', fromStatus = '', reason = '', timestamp = ''] = line.split('|');
      return { phaseNum, fromStatus, reason, timestamp };
    });

  if (reconciled.length === 0) {
    return [];
  }

  appendDebugLog('phase-status-reconciled-from-artifacts', {
    reconciled,
    statusFile: state.statusFile,
  });
  appendDecisionLog([
    '## Phase State Reconciliation',
    ...reconciled.map((entry) => `- Phase ${entry.phaseNum}: ${entry.fromStatus} -> completed (${entry.reason})`),
    '',
  ]);
  logInfo(`Reconciled completed phases from clean-finish artifacts: ${reconciled.map((entry) => entry.phaseNum).join(', ')}`);
  return reconciled;
}

function parseJsonObject(text) {
  try {
    return JSON.parse(String(text || '').trim() || '{}');
  } catch {
    return {};
  }
}

function readWasteSummary(repoRoot = process.cwd()) {
  const filePath = noiseSummaryPath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runPhaseCheckpointCommit(phaseNum) {
  const summary = phaseSummary(phaseNum);
  if (summary.status !== 'completed') {
    return {
      ok: true,
      status: 'skipped_not_completed',
      reason: `phase ${phaseNum} is ${summary.status || 'unknown'}`,
    };
  }
  if (['committed', 'skipped_no_changes'].includes(summary.checkpointStatus || '')) {
    return {
      ok: true,
      status: summary.checkpointStatus,
      commit: summary.checkpointCommit || '',
      reason: summary.checkpointReason || 'already_checkpointed',
    };
  }

  const title = summary.title || phasePlan('get-phase-title', state.planDir, String(phaseNum), state.statusFile) || `Phase ${phaseNum}`;
  const result = runNodeScript(phaseCheckpointCommitPath, [
    'commit',
    '--plan-dir',
    state.planDir,
    '--status-file',
    state.statusFile,
    '--phase-num',
    String(phaseNum),
    '--phase-title',
    title,
    '--qa-report',
    summary.qaReport || '',
    '--scorecard',
    summary.scorecard || '',
    '--json',
  ]);
  const payload = parseJsonObject(result.stdout);
  const status = payload.status || (result.status === 0 ? 'unknown' : 'failed');
  const reason = payload.reason || result.stderr.trim() || 'checkpoint result unavailable';
  const committedAt = payload.committedAt || new Date().toISOString();
  const commit = payload.commit || '';

  phaseState(
    'set-phase-checkpoint',
    state.statusFile,
    String(phaseNum),
    status,
    commit,
    committedAt,
    reason,
  );
  appendDebugLog('phase-checkpoint-commit', {
    phaseNum,
    status,
    commit,
    reason,
    exitCode: result.status,
    memory: payload.memory || {},
    stageablePaths: payload.stageablePaths || [],
  });
  appendDecisionLog([
    `## Phase ${phaseNum} - Checkpoint`,
    `- Status: ${status}`,
    commit ? `- Commit: ${commit}` : '- Commit: n/a',
    `- Reason: ${reason}`,
    payload.memory?.status ? `- Memory refresh: ${payload.memory.status}` : '- Memory refresh: n/a',
    '',
  ]);

  return {
    ok: result.status === 0 && ['committed', 'skipped_no_changes'].includes(status),
    status,
    commit,
    reason,
    payload,
  };
}

function checkpointCompletedPhases(phaseNums) {
  for (const phaseNum of phaseNums) {
    const checkpoint = runPhaseCheckpointCommit(phaseNum);
    if (!checkpoint.ok) {
      return {
        ok: false,
        phaseNum,
        checkpoint,
      };
    }
  }
  return {
    ok: true,
  };
}

function normalizeRunVerdict({
  stoppedEarly,
  controlledStop,
  stopReason,
  stopDetail,
  checkpointRequired,
  reconciledNonzeroExit,
}) {
  const reason = String(stopReason || '').toLowerCase();
  const detail = String(stopDetail || '').trim();
  if (checkpointRequired || reason.includes('checkpoint')) {
    return {
      normalizedRunVerdict: 'checkpoint_required',
      stopReasonClass: 'git_checkpoint_failed',
      stopReasonExplanation: detail || stopReason || 'phase checkpoint commit failed',
    };
  }
  if (controlledStop || reason.includes('pause')) {
    return {
      normalizedRunVerdict: 'paused',
      stopReasonClass: 'user_pause',
      stopReasonExplanation: detail || stopReason || 'run paused by goal/runtime control',
    };
  }
  if (stoppedEarly) {
    if (reason.includes('user_validation_required') || reason.includes('user validation') || reason.includes('demo-approval') || reason.includes('approval')) {
      return {
        normalizedRunVerdict: 'blocked',
        stopReasonClass: 'user_validation_required',
        stopReasonExplanation: detail || stopReason || 'user demo approval is required before continuing',
      };
    }
    if (reason.includes('verification')) {
      return {
        normalizedRunVerdict: 'failed',
        stopReasonClass: 'verification_failed',
        stopReasonExplanation: detail || stopReason || 'verification failed',
      };
    }
    if (reason.includes('runtime') || reason.includes('signal') || reason.includes('spawn') || reason.includes('worker')) {
      return {
        normalizedRunVerdict: 'blocked',
        stopReasonClass: 'runtime_unavailable',
        stopReasonExplanation: detail || stopReason || 'runtime unavailable',
      };
    }
    if (reason.includes('blocked') || reason.includes('unhealthy')) {
      return {
        normalizedRunVerdict: 'blocked',
        stopReasonClass: 'verification_failed',
        stopReasonExplanation: detail || stopReason || 'phase blocked',
      };
    }
    return {
      normalizedRunVerdict: 'failed',
      stopReasonClass: 'unknown',
      stopReasonExplanation: detail || stopReason || 'agent loop stopped before clean completion',
    };
  }
  if (reconciledNonzeroExit) {
    return {
      normalizedRunVerdict: 'success_with_warning',
      stopReasonClass: 'reconciled_nonzero',
      stopReasonExplanation: 'all actionable phases completed after a non-zero phase runner exit was reconciled by clean-finish artifacts',
    };
  }
  return {
    normalizedRunVerdict: 'success',
    stopReasonClass: 'clean_complete',
    stopReasonExplanation: 'all actionable phases completed with phase checkpoint status recorded',
  };
}

function recordPhaseParallelSequentialDecision(plan) {
  if (!plan || plan.executionPlan === 'parallel_wave') {
    return;
  }
  const reasons = Array.isArray(plan.fallbackReasons) ? plan.fallbackReasons : [];
  if (reasons.length === 0 && !plan.disableReason) {
    return;
  }
  appendDecisionLog([
    '## Phase Parallel Planner',
    '- Status: sequential fallback',
    `- Detail: ${plan.disableReason || reasons.join(', ')}`,
    ...(Array.isArray(plan.overlapDetails) && plan.overlapDetails.length > 0
      ? ['- Overlaps:', ...plan.overlapDetails.map((detail) => `  - ${detail.reason}: phase ${detail.phase} vs ${detail.conflictsWith} paths=${JSON.stringify(detail.paths || [])}`)]
      : []),
    ...(Array.isArray(plan.blockedPhaseDetails) && plan.blockedPhaseDetails.length > 0
      ? ['- Blocked phases:', ...plan.blockedPhaseDetails.map((phase) => `  - Phase ${phase.number}: ${(phase.fallbackReasons || []).join(', ')}`)]
      : []),
    '',
  ]);
}

let loopSignalCloseoutHandled = false;

function closeoutActivePhaseForSignal(signalName, origin = 'agent-loop-signal') {
  if (loopSignalCloseoutHandled) {
    return;
  }
  loopSignalCloseoutHandled = true;

  try {
    const context = activePhaseContext();
    if (!context.number || context.status !== 'in_progress' || context.lastOutcome === 'partial') {
      appendDebugLog('agent-loop-signal-no-active-phase', {
        signalName,
        origin,
        context,
      });
      return;
    }

    let protectedGate = null;
    try {
      protectedGate = completionGateForSignalContext(context);
    } catch (error) {
      appendDebugLog('agent-loop-signal-completion-gate-failed', {
        signalName,
        origin,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (protectedGate && (protectedGate.PHASE_COMPLETION_ALLOWED === 'true' || gateAssignmentsIndicateStrongCompletion(protectedGate))) {
      const detail = `${origin}: received ${signalName} after clean-finish completion bookkeeping was already recorded`;
      appendDebugLog('agent-loop-signal-preserve-completed', {
        signalName,
        origin,
        context,
        gate: protectedGate,
      });
      if (context.qaReport) {
        artifactsCommand(
          'append-qa-runtime-update',
          'agent-loop-interrupted-after-completion',
          '',
          detail,
          '.claude/logs/workflow-enforcement',
          context.qaReport,
          context.scorecard || '',
        );
      }
      phaseState(
        'update-phase-state',
        state.statusFile,
        String(context.number),
        'completed',
        utcTimestamp(),
        'completed',
        'false',
        context.activePhaseDoc || '',
        context.sprintContract || '',
        context.qaReport || '',
        context.handoff || '',
        context.scorecard || '',
      );
      return;
    }

    const phaseNum = context.number;
    const phaseDoc = context.activePhaseDoc || phasePlan('get-phase-doc', state.planDir, phaseNum, state.statusFile) || '';
    const phaseTitle = phasePlan('get-phase-title', state.planDir, phaseNum, state.statusFile) || `Phase ${phaseNum}`;
    const detail = `${origin}: received ${signalName} while phase ${phaseNum} was still in progress`;

    appendDebugLog('agent-loop-signal-closeout', {
      signalName,
      origin,
      phaseNum,
      phaseDoc,
      context,
    });

    if (context.qaReport) {
      artifactsCommand(
        'append-qa-runtime-update',
        'agent-loop-interrupted',
        '',
        detail,
        '.claude/logs/workflow-enforcement',
        context.qaReport,
        context.scorecard || '',
      );
    }

    if (context.handoff) {
      artifactsCommand(
        'append-handoff-update',
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
      );
    }

    phaseState(
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
    );

    appendDecisionLog([
      `## Phase ${phaseNum} - Interrupted`,
      `- Reason: ${signalName}`,
      `- Detail: ${detail}`,
      '',
    ]);
  } catch (error) {
    appendDebugLog('agent-loop-signal-closeout-failed', {
      signalName,
      origin,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack || '' : '',
    });
  }
}

function printLoopHeader({ masterPlan, runtime, totalPhases }) {
  writeStdoutLine('');
  writeStdoutLine('\u001b[0;36m═══════════════════════════════════════════════════════════════\u001b[0m');
  writeStdoutLine('\u001b[0;36m  Agent Loop Started\u001b[0m');
  writeStdoutLine('\u001b[0;36m═══════════════════════════════════════════════════════════════\u001b[0m');
  writeStdoutLine('');
  logInfo(`Plan directory: ${state.planDir}`);
  logInfo(`Master plan: ${masterPlan}`);
  logInfo(`Status file: ${state.statusFile}`);
  logInfo(`Execution root: ${state.executionRoot}`);
  logInfo(`Runtime: ${runtime}`);
  logInfo(`Total phases: ${totalPhases}`);
  writeStdoutLine('');
}

function printLoopFooter({ completed, failed }) {
  writeStdoutLine('');
  writeStdoutLine('\u001b[0;36m═══════════════════════════════════════════════════════════════\u001b[0m');
  writeStdoutLine('\u001b[0;36m  Agent Loop Completed\u001b[0m');
  writeStdoutLine('\u001b[0;36m═══════════════════════════════════════════════════════════════\u001b[0m');
  writeStdoutLine('');
  logInfo(`Phases completed: ${completed}`);
  if (failed > 0) {
    logError(`Phases failed: ${failed}`);
  }
  writeStdoutLine('');
  logInfo(`Summary report: ${summaryReport}`);
  logInfo(`Decision log: ${decisionLog}`);
}

async function runNodeManagedLoop() {
  let masterPlan = '';
  let runtime = '';
  let totalPhases = '0';
  let executedPhases = 0;
  let failedPhases = 0;
  let stoppedEarly = false;
  let controlledStop = false;
  let checkpointRequired = false;
  let reconciledNonzeroExit = false;
  let stopPhase = '';
  let stopReason = '';
  let stopDetail = '';

  try {
    masterPlan = resolveMasterPlan(state.planDir);
    if (!masterPlan) {
      console.error(`ERROR: Master plan not found in: ${state.planDir}`);
      stoppedEarly = true;
      stopReason = 'master-plan-missing';
      stopDetail = `Master plan not found in: ${state.planDir}`;
      return 1;
    }

    runtime = resolveRunnerRuntime();
    totalPhases = phasePlan('count-total-phases', state.planDir, state.statusFile);
    ensureLoopLogs({ reset: true });
    writeLiveSummaryReport({
      planDir: state.planDir,
      totalPhases,
      completed: executedPhases,
      failed: failedPhases,
      loopState: 'running',
    });
    printLoopHeader({ masterPlan, runtime, totalPhases });

    while (true) {
      reconcileCompletedPhasesFromArtifacts();
      handleStaleInProgressPhases();

      const goalRuntimeStatus = readGoalRuntimeStatus();
      const goalRuntimeStop = stopReasonForGoalRuntime(goalRuntimeStatus);
      if (goalRuntimeStop) {
        stoppedEarly = true;
        controlledStop = true;
        stopPhase = goalRuntimeStatus?.activePhase?.phase_number
          ? String(goalRuntimeStatus.activePhase.phase_number)
          : '';
        stopReason = goalRuntimeStop.reason;
        stopDetail = goalRuntimeStop.detail;
        appendDebugLog('goal-runtime-controlled-stop', {
          stopReason,
          stopDetail,
          goalId: goalRuntimeStatus?.goal?.goal_id || '',
          goalStatus: goalRuntimeStatus?.goal?.status || '',
        });
        writeLiveSummaryReport({
          planDir: state.planDir,
          totalPhases,
          completed: executedPhases,
          failed: failedPhases,
          currentPhase: stopPhase,
          loopState: 'stopped',
          stopReason,
          stopDetail,
        });
        break;
      }

      const phaseParallelPlan = resolvePhaseParallelPlan();
      appendDebugLog('phase-parallel-plan-resolved', phaseParallelPlan);
      recordPhaseParallelSequentialDecision(phaseParallelPlan);
      if (phaseParallelPlan.executionPlan === 'parallel_wave' && Array.isArray(phaseParallelPlan.phases) && phaseParallelPlan.phases.length > 1) {
        const waveFile = writePhaseWavePlan(phaseParallelPlan);
        const waveLabel = phaseParallelPlan.phases.map((phase) => phase.number).join(', ');
        appendDecisionLog([
          `## Phase Wave - ${waveLabel}`,
          '- Status: starting',
          `- Planner confidence: ${phaseParallelPlan.confidence || 'unknown'}`,
          `- Wave file: ${waveFile}`,
          '',
        ]);
        writeLiveSummaryReport({
          planDir: state.planDir,
          totalPhases,
          completed: executedPhases,
          failed: failedPhases,
          currentPhase: waveLabel,
          currentPhaseTitle: 'parallel phase wave',
          loopState: 'parallel-wave',
        });
        const waveArgs = buildPhaseWaveArgs({ waveFile, runtime });
        appendDebugLog('phase-wave-coordinator-invoke', {
          phases: phaseParallelPlan.phases.map((phase) => phase.number),
          waveArgs,
        });
        const waveResult = runPhaseWaveCoordinator(waveArgs);
        appendDebugLog('phase-wave-coordinator-exit', {
          phases: phaseParallelPlan.phases.map((phase) => phase.number),
          exitCode: waveResult.exitCode,
          reason: waveResult.reason,
          artifactPath: waveResult.artifactPath,
        });
        if (waveResult.exitCode === 0) {
          reconcileCompletedPhasesFromArtifacts();
          const checkpointResult = checkpointCompletedPhases(phaseParallelPlan.phases.map((phase) => phase.number));
          if (!checkpointResult.ok) {
            failedPhases += 1;
            stoppedEarly = true;
            checkpointRequired = true;
            stopPhase = checkpointResult.phaseNum;
            stopReason = 'phase-checkpoint-commit-failed';
            stopDetail = checkpointResult.checkpoint?.reason || 'phase checkpoint commit failed';
            break;
          }
          executedPhases += phaseParallelPlan.phases.length;
          appendDecisionLog([
            `## Phase Wave - ${waveLabel}`,
            '- Status: completed',
            `- Artifact: ${waveResult.artifactPath || 'n/a'}`,
            '- Decision: continue plan-directory loop after parallel wave',
            '',
          ]);
          if (state.delaySeconds > 0) {
            await sleep(state.delaySeconds * 1000);
          }
          continue;
        }
        if (waveResult.exitCode !== 78) {
          failedPhases += 1;
          stoppedEarly = true;
          stopPhase = waveLabel;
          stopReason = 'phase-wave-coordinator-failed';
          stopDetail = `phase wave coordinator exited with code ${waveResult.exitCode}`;
          break;
        }
        appendDecisionLog([
          `## Phase Wave - ${waveLabel}`,
          '- Status: fallback',
          `- Reason: ${waveResult.reason || 'coordinator requested fallback'}`,
          `- Artifact: ${waveResult.artifactPath || 'n/a'}`,
          '- Decision: wave was not safe to merge; continue with sequential next phase',
          '',
        ]);
      }

      const nextPhase = phasePlan('get-next-phase', state.statusFile) || '';
      appendDebugLog('next-phase-resolved', {
        nextPhase,
        statusFile: state.statusFile,
      });
      if (!nextPhase) {
        const blockedPhase = firstBlockedPhase();
        if (blockedPhase) {
          failedPhases += 1;
          stoppedEarly = true;
          stopPhase = blockedPhase.number;
          stopReason = blockedPhase.status;
          stopDetail = `phase ${blockedPhase.number} is ${blockedPhase.status}; lastOutcome=${blockedPhase.lastOutcome || 'n/a'}`;
          writeLiveSummaryReport({
            planDir: state.planDir,
            totalPhases,
            completed: executedPhases,
            failed: failedPhases,
            currentPhase: blockedPhase.number,
            currentPhaseTitle: blockedPhase.title,
            loopState: 'blocked',
            stopReason,
            stopDetail,
          });
          break;
        }
        writeLiveSummaryReport({
          planDir: state.planDir,
          totalPhases,
          completed: executedPhases,
          failed: failedPhases,
          loopState: 'idle',
        });
        break;
      }

      if (state.maxPhases > 0 && executedPhases >= state.maxPhases) {
        logInfo(`Reached max phases limit (${state.maxPhases})`);
        break;
      }

      const phaseTitle = phasePlan('get-phase-title', state.planDir, nextPhase, state.statusFile);
      const phaseDoc = phasePlan('get-phase-doc', state.planDir, nextPhase, state.statusFile);
      writeLiveSummaryReport({
        planDir: state.planDir,
        totalPhases,
        completed: executedPhases,
        failed: failedPhases,
        currentPhase: nextPhase,
        currentPhaseTitle: phaseTitle,
        loopState: 'running',
      });
      const runnerArgs = buildSinglePhaseArgs({ nextPhase, phaseTitle, phaseDoc, runtime });
      appendDebugLog('phase-runner-invoke', {
        nextPhase,
        phaseTitle,
        phaseDoc,
        runnerArgs,
      });
      const exitCode = runPhaseRunnerOnce(runnerArgs);
      appendDebugLog('phase-runner-exit', {
        nextPhase,
        exitCode,
      });

      if (exitCode !== 0) {
        reconcileCompletedPhasesFromArtifacts();
        const phaseAfterFailure = phaseSummary(nextPhase);
        if (phaseAfterFailure.status !== 'completed') {
          failedPhases += 1;
          stoppedEarly = true;
          stopPhase = nextPhase;
          stopReason = 'phase-shell-core-failed';
          stopDetail = `single-phase shell core exited with code ${exitCode}`;
          break;
        }

        appendDebugLog('phase-runner-nonzero-exit-reconciled', {
          nextPhase,
          exitCode,
          phaseAfterFailure,
        });
        reconciledNonzeroExit = true;
      }

      let updatedNextPhase = '';
      try {
        reconcileCompletedPhasesFromArtifacts();
        const checkpointResult = checkpointCompletedPhases([nextPhase]);
        if (!checkpointResult.ok) {
          failedPhases += 1;
          stoppedEarly = true;
          checkpointRequired = true;
          stopPhase = checkpointResult.phaseNum;
          stopReason = 'phase-checkpoint-commit-failed';
          stopDetail = checkpointResult.checkpoint?.reason || 'phase checkpoint commit failed';
          break;
        }
        updatedNextPhase = phasePlan('get-next-phase', state.statusFile) || '';
      } catch (error) {
        failedPhases += 1;
        stoppedEarly = true;
        stopPhase = nextPhase;
        stopReason = 'post-phase-next-phase-read-failed';
        stopDetail = error instanceof Error ? error.message : String(error);
        appendDebugLog('post-phase-next-phase-read-failed', {
          nextPhase,
          message: stopDetail,
          stack: error instanceof Error ? error.stack || '' : '',
        });
        break;
      }

      appendDebugLog('post-phase-next-phase-resolved', {
        nextPhase,
        updatedNextPhase,
      });

      if (updatedNextPhase === nextPhase) {
        const currentPhase = phaseSummary(nextPhase);
        appendDebugLog('phase-did-not-advance', {
          nextPhase,
          currentPhase,
        });
        if (currentPhase.status === 'in_progress' && currentPhase.lastOutcome === 'partial') {
          appendDecisionLog([
            `## Phase ${nextPhase} - Partial Attempt`,
            '- Status: partial',
            '- Decision: keep the phase in progress and continue with a fresh attempt',
            '',
          ]);
          logInfo(`Phase ${nextPhase} remains in progress after a partial attempt; continuing with a fresh attempt`);
          writeLiveSummaryReport({
            planDir: state.planDir,
            totalPhases,
            completed: executedPhases,
            failed: failedPhases,
            currentPhase: nextPhase,
            currentPhaseTitle: phaseTitle,
            loopState: 'partial-retry',
          });
          if (state.delaySeconds > 0) {
            await sleep(state.delaySeconds * 1000);
          }
          continue;
        }

        failedPhases += 1;
        stoppedEarly = true;
        stopPhase = nextPhase;
        stopReason = 'phase-did-not-advance';
        stopDetail = `phase ${nextPhase} finished without advancing status`;
        break;
      }

      executedPhases += 1;

      if (state.delaySeconds > 0) {
        await sleep(state.delaySeconds * 1000);
      }
    }
  } catch (error) {
    failedPhases += 1;
    stoppedEarly = true;
    stopReason = 'agent-loop-exception';
    stopDetail = error instanceof Error ? error.message : String(error);
    appendDebugLog('agent-loop-exception', {
      message: stopDetail,
      stack: error instanceof Error ? error.stack || '' : '',
    });
  } finally {
    const normalized = normalizeRunVerdict({
      stoppedEarly,
      controlledStop,
      stopReason,
      stopDetail,
      checkpointRequired,
      reconciledNonzeroExit,
    });
    try {
      phaseState(
        'set-root-run-verdict',
        state.statusFile,
        normalized.normalizedRunVerdict,
        normalized.stopReasonClass,
        normalized.stopReasonExplanation,
      );
    } catch (error) {
      appendDebugLog('agent-loop-normalized-verdict-write-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    appendDebugLog('agent-loop-summary-write', {
      completed: executedPhases,
      failed: failedPhases,
      stoppedEarly,
      stopPhase,
      stopReason,
      stopDetail,
      normalized,
    });
    writeLiveSummaryReport({
      planDir: state.planDir,
      totalPhases,
      completed: executedPhases,
      failed: failedPhases,
      currentPhase: stopPhase,
      loopState: stoppedEarly ? 'stopped' : 'completed',
      stopReason,
      stopDetail,
    });
    writeSummaryReport({
      planDir: state.planDir,
      totalPhases,
      completed: executedPhases,
      failed: failedPhases,
      stoppedEarly,
      stopPhase,
      stopReason,
      stopDetail,
    });
    printLoopFooter({ completed: executedPhases, failed: failedPhases });
  }

  return stoppedEarly && !controlledStop ? 1 : 0;
}

parseArgs(process.argv.slice(2));
syncRuntimeEnvironment();
assertEnvironment();
assertPlanStatusIdentity();

for (const signalName of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signalName, () => {
    appendDebugLog('agent-loop-signal', {
      signalName,
      statusFile: state.statusFile,
      planDir: state.planDir,
    });
    closeoutActivePhaseForSignal(signalName, 'agent-loop-signal');
    const signalNumber = os.constants.signals?.[signalName] ?? 1;
    process.exit(128 + signalNumber);
  });
}

if (!state.dryRun) {
  runNodeManagedLoop().then((code) => {
    process.exit(code);
  });
} else {
  const masterPlan = resolveMasterPlan(state.planDir);
  if (!masterPlan) {
    console.error(`ERROR: Master plan not found in: ${state.planDir}`);
    process.exit(1);
  }

  const runtime = resolveRunnerRuntime();
  const totalPhases = phasePlan('count-total-phases', state.planDir, state.statusFile);
  const nextPhase = phasePlan('get-next-phase', state.statusFile) || '1';
  const phaseTitle = phasePlan('get-phase-title', state.planDir, nextPhase, state.statusFile);
  const phaseDoc = phasePlan('get-phase-doc', state.planDir, nextPhase, state.statusFile);

  writeStdoutLine('');
  writeStdoutLine('\u001b[0;36m═══════════════════════════════════════════════════════════════\u001b[0m');
  writeStdoutLine('\u001b[0;36m  Agent Loop Started\u001b[0m');
  writeStdoutLine('\u001b[0;36m═══════════════════════════════════════════════════════════════\u001b[0m');
  writeStdoutLine('');
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m Plan directory: ${state.planDir}`);
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m Master plan: ${masterPlan}`);
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m Status file: ${state.statusFile}`);
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m Execution root: ${state.executionRoot}`);
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m Runtime: ${runtime}`);
  writeStdoutLine(`\u001b[0;34mℹ️\u001b[0m Total phases: ${totalPhases}`);
  writeStdoutLine('');
  writeStdoutLine('\u001b[0;36m───────────────────────────────────────────────────────────────\u001b[0m');
  writeStdoutLine(`\u001b[0;36m📦\u001b[0m Phase ${nextPhase}: ${phaseTitle}`);
  writeStdoutLine(`\u001b[1;33m⚠️\u001b[0m [DRY-RUN] Would execute phase ${nextPhase}`);
  writeStdoutLine('');
  writeStdoutLine('----- Phase Attempt Prompt -----');
  const prompt = renderDryRunPrompt({ nextPhase, phaseTitle, phaseDoc, runtime });
  if (prompt) {
    writeStdoutLine(prompt);
  } else {
    writeStdoutLine(`Implement phase ${nextPhase} using the active phase doc at ${phaseDoc}.`);
  }
  writeStdoutLine('----- End Prompt -----');
}
