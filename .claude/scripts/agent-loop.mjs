#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { assignExecutionArtifactPaths, buildPhasePrompt } from './agent-loop-phase-plan-lib.mjs';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const runtimeCliPath = path.join(scriptDir, 'runtime-cli.mjs');
const phasePlanPath = path.join(scriptDir, 'agent-loop-phase-plan.mjs');
const phaseStatePath = path.join(scriptDir, 'agent-loop-phase-state.mjs');
const phaseRunnerPath = path.join(scriptDir, 'agent-loop-phase-runner.mjs');
const artifactsPath = path.join(scriptDir, 'agent-loop-phase-artifacts.mjs');
const logDir = '.claude/logs/agent-loop';
const decisionLog = path.join(logDir, 'decisions.md');
const summaryReport = path.join(logDir, 'summary.md');
const debugLog = path.join(logDir, 'debug.jsonl');

const state = {
  planDir: '',
  statusFile: '.claude/docs/phase-status.yaml',
  executionRoot: '',
  runtime: 'auto',
  maxPhases: 0,
  delaySeconds: 3,
  dryRun: false,
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
#   ./agent-loop.sh <plan-dir> [options]
#
# Arguments:
#   plan-dir          Directory containing master plan and phase documents
#
# Options:
#   --status-file     Path to phase-status.yaml (default: .claude/docs/phase-status.yaml)
#   --execution-root  Directory for execution bridge artifacts (default: <plan-dir>/execution)
#   --runtime         Runner CLI: auto|claude|codex (default: auto)
#   --max-phases N    Maximum phases to run (default: all)
#   --delay N         Delay between phases in seconds (default: 3)
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
      case '--max-phases':
        state.maxPhases = Number.parseInt(args.shift() ?? '0', 10) || 0;
        break;
      case '--delay':
        state.delaySeconds = Number.parseInt(args.shift() ?? '3', 10) || 3;
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
    console.error('Usage: ./agent-loop.sh <plan-dir> [options]');
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

function activePhaseContext() {
  return parseAssignments(phaseState('get-active-phase-context', state.statusFile));
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

function resolveMasterPlan(planDir) {
  const files = fs.readdirSync(planDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const match = files.find((name) => name.includes('master') || name.includes('00-'));
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

function buildSinglePhaseArgs({ nextPhase, phaseTitle, phaseDoc }) {
  const args = [
    state.planDir,
    '--status-file', state.statusFile,
    '--execution-root', state.executionRoot,
    '--runtime', state.runtime,
    '--phase-num', String(nextPhase),
    '--phase-title', phaseTitle,
    '--phase-doc', phaseDoc,
  ];

  if (state.delaySeconds !== 3) {
    args.push('--delay', String(state.delaySeconds));
  }

  args.push('--max-phases', '1', '--single-phase');
  return args;
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
    '## Decision Log',
    `See: ${decisionLog}`,
    '',
    '## Logs',
    `See: ${logDir}`,
    '',
  ].join('\n');
  fs.writeFileSync(summaryReport, body, 'utf8');
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

    const phaseNum = context.number;
    const phaseDoc = context.activePhaseDoc || phasePlan('get-phase-doc', state.planDir, phaseNum) || '';
    const phaseTitle = phasePlan('get-phase-title', state.planDir, phaseNum) || `Phase ${phaseNum}`;
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
    totalPhases = phasePlan('count-total-phases', state.planDir);
    ensureLoopLogs({ reset: true });
    printLoopHeader({ masterPlan, runtime, totalPhases });

    while (true) {
      reconcileCompletedPhasesFromArtifacts();
      handleStaleInProgressPhases();

      const nextPhase = phasePlan('get-next-phase', state.statusFile) || '';
      appendDebugLog('next-phase-resolved', {
        nextPhase,
        statusFile: state.statusFile,
      });
      if (!nextPhase) {
        break;
      }

      if (state.maxPhases > 0 && executedPhases >= state.maxPhases) {
        logInfo(`Reached max phases limit (${state.maxPhases})`);
        break;
      }

      const phaseTitle = phasePlan('get-phase-title', state.planDir, nextPhase);
      const phaseDoc = phasePlan('get-phase-doc', state.planDir, nextPhase);
      const runnerArgs = buildSinglePhaseArgs({ nextPhase, phaseTitle, phaseDoc });
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
      }

      let updatedNextPhase = '';
      try {
        reconcileCompletedPhasesFromArtifacts();
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
    appendDebugLog('agent-loop-summary-write', {
      completed: executedPhases,
      failed: failedPhases,
      stoppedEarly,
      stopPhase,
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

  return stoppedEarly ? 1 : 0;
}

parseArgs(process.argv.slice(2));
syncRuntimeEnvironment();
assertEnvironment();

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
  const totalPhases = phasePlan('count-total-phases', state.planDir);
  const nextPhase = phasePlan('get-next-phase', state.statusFile) || '1';
  const phaseTitle = phasePlan('get-phase-title', state.planDir, nextPhase);
  const phaseDoc = phasePlan('get-phase-doc', state.planDir, nextPhase);

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
