#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assignExecutionArtifactPaths, buildPhasePrompt, ensureExecutionArtifacts } from './agent-loop-phase-plan-lib.mjs';
import { evaluatePathAuthority } from './lib/path-authority.mjs';
import { createPhaseHarnessCaptureSession, normalizeArtifactRefs } from './lib/awtl-harness-capture.mjs';
import { collectVerificationPreflightBlockers, loadVerificationContractContext } from './lib/verification-contract.mjs';
import { classifyFailure, summarizeFailureDecision } from './lib/failure-classifier.mjs';
import { resolveModelRoute } from './lib/model-routing-policy.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeCliPath = path.join(scriptDir, 'runtime-cli.mjs');
const runtimePath = path.join(scriptDir, 'agent-loop-phase-runtime.mjs');
const statePath = path.join(scriptDir, 'agent-loop-phase-state.mjs');
const artifactsPath = path.join(scriptDir, 'agent-loop-phase-artifacts.mjs');
const attemptPath = path.join(scriptDir, 'agent-loop-phase-attempt.mjs');
const worktreeCoordinatorPath = path.join(scriptDir, 'phase-worktree-coordinator.mjs');
const logDir = '.claude/logs/agent-loop';
const decisionLog = path.join(logDir, 'decisions.md');
const debugLog = path.join(logDir, 'debug.jsonl');

const state = {
  planDir: '',
  statusFile: '.claude/docs/phase-status.yaml',
  executionRoot: '',
  runtime: 'auto',
  verificationRuntimes: 'auto',
  phaseNum: '',
  phaseTitle: '',
  phaseDoc: '',
  parallelWorktrees: Number.parseInt(process.env.PHASE_PARALLEL_WORKTREES ?? '1', 10) || 1,
  worktreeBase: process.env.PHASE_WORKTREE_BASE || 'HEAD',
  worktreeRoot: process.env.PHASE_WORKTREE_ROOT || '.tmp/harness-worktrees/phase-runs',
};

let activeAttemptContext = null;
let fatalPhaseRunnerHandled = false;

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

function nodeAssignments(scriptPath, ...args) {
  const result = runNodeScript(scriptPath, args);
  if (result.status !== 0) {
    throw new Error(result.stderr || `command failed: ${path.basename(scriptPath)} ${args.join(' ')}`);
  }
  return parseAssignments(result.stdout);
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
      case '--phase-num':
        state.phaseNum = args.shift() ?? '';
        break;
      case '--phase-title':
        state.phaseTitle = args.shift() ?? '';
        break;
      case '--phase-doc':
        state.phaseDoc = args.shift() ?? '';
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
      default:
        break;
    }
  }
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function appendDecisionLog(lines) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(decisionLog, `${lines.join('\n')}\n`, 'utf8');
}

function appendDebugLog(event, details = {}) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(debugLog, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    source: 'agent-loop-phase-runner',
    phaseNum: state.phaseNum || '',
    phaseTitle: state.phaseTitle || '',
    event,
    ...details,
  })}\n`, 'utf8');
}

function appendCaptureWarning(context, detail) {
  appendDebugLog('awtl-capture-warning', { context, detail });
}

function collectFileReconciliationRefs() {
  const trackedResult = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    encoding: 'utf8',
  });
  const untrackedResult = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  });
  const combined = [];
  if (!trackedResult.error && (trackedResult.status ?? 0) === 0) {
    combined.push(...(trackedResult.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }
  if (!untrackedResult.error && (untrackedResult.status ?? 0) === 0) {
    combined.push(...(untrackedResult.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }
  return normalizeArtifactRefs(combined, process.cwd());
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
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

function logSuccess(message) {
  writeStdoutLine(`\u001b[0;32m✅\u001b[0m ${message}`);
}

function phaseState(...args) {
  const result = runNodeScript(statePath, args);
  if (result.status !== 0) {
    throw new Error(result.stderr || `phase-state failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function artifactsCommand(...args) {
  const result = runNodeScript(artifactsPath, args);
  if (result.status !== 0) {
    throw new Error(result.stderr || `phase-artifacts failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function runtimeCommand(...args) {
  const result = runNodeScript(runtimePath, args);
  if (result.status !== 0 && !['run-with-watchdog', 'run-worker-prompt-with-completion-gate'].includes(args[0])) {
    throw new Error(result.stderr || `phase-runtime failed: ${args.join(' ')}`);
  }
  return result;
}

function describeStopReason(reason, runtime, detail = '') {
  return runtimeCommand('describe-stop-reason', reason, runtime, detail).stdout.trim();
}

function detectFinalStopReason(logFile, defaultReason) {
  return runtimeCommand(
    'detect-final-stop-reason',
    logFile,
    defaultReason,
    process.env.AGENT_LOOP_TOOL_SCHEMA_ERROR_GUARD ?? '2',
  ).stdout.trim();
}

function classifyTimeoutReason(logFile) {
  return runtimeCommand('classify-timeout-reason', logFile).stdout.trim();
}

function resolveTimeoutFallbackRuntime(currentRuntime) {
  return runtimeCommand('resolve-timeout-fallback-runtime', currentRuntime).stdout.trim();
}

function readLatestCapabilityReport(workspaceRoot = process.cwd()) {
  const logPath = path.join(workspaceRoot, '.claude', 'logs', 'agent-loop');
  if (!fs.existsSync(logPath)) {
    return null;
  }

  const candidates = fs.readdirSync(logPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^capabilities-.*\.json$/.test(entry.name))
    .map((entry) => {
      const filePath = path.join(logPath, entry.name);
      const stats = fs.statSync(filePath);
      return { filePath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(fs.readFileSync(candidate.filePath, 'utf8'));
      return { ...candidate, payload };
    } catch {
      continue;
    }
  }

  return null;
}

function summarizeRetrySuppression(workspaceRoot = process.cwd(), finalStopReason = '') {
  const latest = readLatestCapabilityReport(workspaceRoot);
  if (!latest) {
    return null;
  }

  const payload = latest.payload || {};
  const counts = payload.failureClassCounts && typeof payload.failureClassCounts === 'object'
    ? payload.failureClassCounts
    : {};
  const summary = summarizeFailureDecision(counts);
  const stopClassification = classifyFailure({ reason: finalStopReason, message: finalStopReason });
  const blockerCode = payload.reason || summary.blockerCode || stopClassification.code;
  const sameFailureClassCount = Number(
    payload.sameFailureClassCount
    ?? counts[blockerCode]
    ?? summary.sameFailureClassCount
    ?? 0,
  );
  const decision = payload.decision || summary.decision;
  const reason = payload.reason || summary.reason || stopClassification.code || 'ok';
  const shouldSuppressRetry = sameFailureClassCount >= 2
    && decision !== 'continue'
    && (stopClassification.blocker || decision !== 'continue');

  return {
    reportPath: latest.filePath,
    blockerCode,
    sameFailureClassCount,
    decision,
    reason,
    shouldSuppressRetry,
    fallbackHints: Array.isArray(payload.fallbackHints) ? payload.fallbackHints : [],
  };
}

function evaluatePhaseCompletionGateWithRetry(startEpoch, paths) {
  const retries = 2;
  const delaySeconds = 2;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const values = nodeAssignments(
      statePath,
      'evaluate-phase-completion-gate',
      String(startEpoch),
      paths.phaseQaReport,
      paths.phaseScorecard,
      paths.phaseExecutionDir,
      process.env.AGENT_LOOP_SCORECARD_REQUIRED ?? 'true',
      process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
      paths.phaseHandoff,
    );
    if (values.PHASE_COMPLETION_ALLOWED === 'true' || values.PHASE_COMPLETION_REASON !== 'no-fresh-verification-artifact' || attempt === retries) {
      return values;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delaySeconds * 1000);
  }
  return {
    PHASE_COMPLETION_ALLOWED: 'false',
    PHASE_COMPLETION_REASON: 'no-verification-evaluation',
    PHASE_COMPLETION_ARTIFACTS: '',
  };
}

function updatePhaseState(phaseNum, newStatus, lastOutcome, incrementAttempt, phaseDoc, paths) {
  phaseState(
    'update-phase-state',
    state.statusFile,
    String(phaseNum),
    newStatus,
    utcTimestamp(),
    lastOutcome,
    incrementAttempt ? 'true' : 'false',
    phaseDoc,
    paths.phaseSprintContract,
    paths.phaseQaReport,
    paths.phaseHandoff,
    paths.phaseScorecard,
  );
}

function appendQaRuntimeUpdate(status, logFile, detail, paths) {
  artifactsCommand(
    'append-qa-runtime-update',
    status,
    logFile,
    detail ?? '',
    '.claude/logs/workflow-enforcement',
    paths.phaseQaReport,
    paths.phaseScorecard,
  );
}

function recordPhaseProgressCheckpoint(stage, status, logFile, detail, runtime, paths) {
  artifactsCommand(
    'record-phase-progress-checkpoint',
    paths.phaseQaReport,
    paths.phaseScorecard,
    stage,
    status,
    logFile ?? '',
    detail ?? '',
    runtime,
  );
  artifactsCommand('normalize-qa-report-workflow-fields', paths.phaseQaReport);
}

function appendHandoffUpdate(reason, logFile, detail, paths) {
  artifactsCommand(
    'append-handoff-update',
    reason,
    logFile,
    detail ?? '',
    String(state.phaseNum),
    state.phaseTitle,
    paths.phaseSprintContract,
    paths.phaseQaReport,
    state.phaseDoc,
    paths.phaseScorecard,
    paths.phaseHandoff,
  );
}

function syncCleanFinishArtifacts(completionArtifacts, paths) {
  artifactsCommand(
    'sync-clean-finish-artifacts',
    completionArtifacts,
    paths.phaseQaReport,
    paths.phaseScorecard,
    state.phaseTitle,
    process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
  );
  artifactsCommand('normalize-qa-report-workflow-fields', paths.phaseQaReport);
}

function writeCleanFinishHandoff(paths) {
  artifactsCommand(
    'write-clean-finish-handoff',
    String(state.phaseNum),
    state.phaseTitle,
    state.phaseDoc,
    paths.phaseSprintContract,
    paths.phaseQaReport,
    paths.phaseHandoff,
  );
}

function codexBaseArgs(cwd) {
  const result = runNodeScript(runtimeCliPath, ['codex-base-args', cwd]);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveActiveMasterPlanPath() {
  const statusMasterPlan = fs.existsSync(state.statusFile)
    ? fs.readFileSync(state.statusFile, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^masterPlan:\s*(.+)\s*$/)?.[1]?.trim().replace(/^"|"$/g, '') || '')
      .find((candidate) => candidate)
    : '';
  return statusMasterPlan;
}

function phaseEnv(paths) {
  const currentRuntime = activeAttemptContext?.runtime || '';
  const modelRoute = resolveModelRoute({
    runtime: currentRuntime || state.runtime || 'auto',
    stage: process.env.PHASE_MODEL_STAGE || 'phase_implementation',
    profile: process.env.AGENT_LOOP_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE,
  });
  const verificationContext = loadVerificationContractContext('.claude/verification.contract.yaml', {
    requestedRuntime: state.runtime,
    verificationRuntimes: state.verificationRuntimes,
    currentRuntime,
  });
  const env = {
    ...process.env,
    WORKSPACE_ROOT: process.cwd(),
    PHASE_WORK_RUNTIME: currentRuntime || state.runtime || 'auto',
    PHASE_STATUS_FILE: state.statusFile,
    PHASE_PLAN_DIR: state.planDir,
    PHASE_EXECUTION_ROOT: state.executionRoot,
    PHASE_MASTER_PLAN: resolveActiveMasterPlanPath(),
    PHASE_SELECTED_MODEL_PROVIDER: modelRoute.provider,
    PHASE_SELECTED_MODEL: modelRoute.model,
    PHASE_SELECTED_MODEL_EFFORT: modelRoute.effort,
    PHASE_MODEL_SELECTION_REASON: modelRoute.selectionReason,
    PHASE_VERIFICATION_TARGET_RUNTIMES: verificationContext.effectiveSelection,
    PHASE_RUNTIME_PARITY_TARGET_RUNTIMES: verificationContext.effectiveSelection,
    HARNESS_REQUIREMENTS_TRACEABILITY_FILE: `${state.executionRoot}/REQUIREMENTS_TRACEABILITY.md`,
    HARNESS_SCENARIO_MATRIX_FILE: `${state.executionRoot}/SCENARIO_MATRIX.md`,
    HARNESS_UAT_CHECKLIST_FILE: `${state.executionRoot}/UAT_CHECKLIST.md`,
  };
  if (process.platform === 'win32' && !env.npm_config_prefix) {
    env.npm_config_prefix = 'C:\\Program Files\\nodejs';
  }
  if (paths.phaseScorecard) {
    env.HARNESS_SCORECARD_FILE = paths.phaseScorecard;
  }
  if (paths.phaseQaReport) {
    env.HARNESS_QA_REPORT_FILE = paths.phaseQaReport;
  }
  return env;
}

function buildWorkerCommand(prompt, runtime, stage = process.env.PHASE_MODEL_STAGE || 'phase_implementation') {
  const modelRoute = resolveModelRoute({
    runtime,
    stage,
    profile: process.env.AGENT_LOOP_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE,
  });
  if (runtime === 'claude') {
    const args = ['claude'];
    if (modelRoute.model) {
      args.push('--model', modelRoute.model);
    }
    if (modelRoute.effort) {
      args.push('--effort', modelRoute.effort);
    }
    args.push('--dangerously-skip-permissions', '--no-session-persistence', '-p', prompt);
    return args;
  }
  if (runtime === 'codex') {
    const args = codexBaseArgs(process.cwd());
    if (modelRoute.model) {
      args.push('-m', modelRoute.model);
    }
    if (modelRoute.effort) {
      args.push('-c', `model_reasoning_effort="${modelRoute.effort}"`);
    }
    appendCodexPromptArg(args, prompt);
    return args;
  }
  throw new Error(`Unsupported runtime: ${runtime}`);
}

function appendCodexPromptArg(args, prompt) {
  if (process.platform === 'win32' && shouldUsePromptFileForCodex(args)) {
    fs.mkdirSync(logDir, { recursive: true });
    const promptDir = path.resolve(logDir, 'prompts');
    fs.mkdirSync(promptDir, { recursive: true });
    const promptFile = path.join(promptDir, `codex-prompt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`);
    fs.writeFileSync(promptFile, prompt, 'utf8');
    args.push('--codex-prompt-file', promptFile);
    return;
  }
  args.push(prompt);
}

function shouldUsePromptFileForCodex(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return false;
  }
  const command = String(args[0] || '').toLowerCase();
  if (command.endsWith('powershell.exe') || command.endsWith('pwsh.exe')) {
    return true;
  }
  return args.some((arg) => String(arg || '').toLowerCase().endsWith('.ps1'));
}

function runWorkerPrompt(logFile, prompt, startEpoch, qaChecksumBefore, paths, runtime) {
  const command = buildWorkerCommand(prompt, runtime, 'phase_implementation');
  const result = runNodeScript(runtimePath, [
    'run-worker-prompt-with-completion-gate',
    '--log-file', logFile,
    '--phase-start-epoch', String(startEpoch),
    '--qa-checksum-before', qaChecksumBefore,
    '--phase-qa-report', paths.phaseQaReport,
    '--phase-scorecard', paths.phaseScorecard,
    '--phase-execution-dir', paths.phaseExecutionDir,
    '--scorecard-required', process.env.AGENT_LOOP_SCORECARD_REQUIRED ?? 'true',
    '--target-completion-score', process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
    '--watchdog-max-seconds', process.env.AGENT_LOOP_WATCHDOG_MAX_SECONDS ?? String(2 * 60 * 60),
    '--watchdog-check-seconds', process.env.AGENT_LOOP_WATCHDOG_CHECK_SECONDS ?? '60',
    '--status-file', state.statusFile,
    '--phase-num', String(state.phaseNum),
    '--active-phase-doc', state.phaseDoc,
    '--phase-sprint-contract', paths.phaseSprintContract,
    '--phase-handoff', paths.phaseHandoff,
    '--heartbeat-seconds', process.env.AGENT_LOOP_HEARTBEAT_SECONDS ?? '20',
    '--',
    ...command,
  ], { env: phaseEnv(paths), stdio: 'inherit' });
  return result.status ?? 1;
}

function runWorktreeCoordinator(paths, runtime) {
  if (state.parallelWorktrees < 2) {
    return { status: 78, stdout: '', stderr: '' };
  }
  const result = runNodeScript(worktreeCoordinatorPath, [
    paths.phaseExecutionDir,
    '--plan-dir', state.planDir,
    '--phase-num', String(state.phaseNum),
    '--phase-title', state.phaseTitle,
    '--phase-doc', state.phaseDoc,
    '--runtime', runtime,
    '--worksets-file', paths.phaseWorksets,
    '--base', state.worktreeBase || 'HEAD',
    '--worktree-root', state.worktreeRoot || '.tmp/harness-worktrees/phase-runs',
    '--parallel-worktrees', String(state.parallelWorktrees),
    '--qa-report', paths.phaseQaReport,
    '--handoff', paths.phaseHandoff,
    '--scorecard', paths.phaseScorecard,
  ], { stdio: 'pipe' });
  appendDebugLog('phase-worktree-coordinator-exit', {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return result;
}

function runCommitPrompt(logFile, prompt, runtime) {
  if ((process.env.AGENT_LOOP_RUN_COMMIT_PROMPT ?? 'false') !== 'true') {
    logInfo('Commit prompt disabled by policy (set AGENT_LOOP_RUN_COMMIT_PROMPT=true to opt in)');
    return;
  }
  if ((process.env.AGENT_LOOP_SKIP_COMMIT_PROMPT ?? 'false') === 'true') {
    logInfo('Commit prompt skipped (AGENT_LOOP_SKIP_COMMIT_PROMPT=true)');
    return;
  }

  const command = runtime === 'claude'
    ? (() => {
      const route = resolveModelRoute({
        runtime: 'claude',
        stage: 'closeout_gate',
        profile: process.env.AGENT_LOOP_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE,
      });
      const args = ['claude'];
      if (route.model) args.push('--model', route.model);
      if (route.effort) args.push('--effort', route.effort);
      args.push('--dangerously-skip-permissions', '--no-session-persistence', '-c', '-p', prompt);
      return args;
    })()
    : (() => {
      const args = codexBaseArgs(process.cwd());
      const route = resolveModelRoute({
        runtime: 'codex',
        stage: 'closeout_gate',
        profile: process.env.AGENT_LOOP_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE,
      });
      if (route.model) {
        args.push('-m', route.model);
      }
      if (route.effort) {
        args.push('-c', `model_reasoning_effort="${route.effort}"`);
      }
      appendCodexPromptArg(args, prompt);
      return args;
    })();

  runNodeScript(runtimePath, [
    'run-with-watchdog',
    '--log-file', logFile,
    '--max-seconds', process.env.AGENT_LOOP_WATCHDOG_MAX_SECONDS ?? String(2 * 60 * 60),
    '--check-seconds', process.env.AGENT_LOOP_WATCHDOG_CHECK_SECONDS ?? '60',
    '--',
    ...command,
  ], { env: phaseEnv(assignExecutionArtifactPaths(state.phaseNum, state.phaseTitle, state.executionRoot)), stdio: 'inherit' });
}

function sha1FileOrEmpty(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function resolveRunnerRuntime(requestedRuntime) {
  return runtimeCommand('resolve-runner-runtime', requestedRuntime).stdout.trim();
}

function isBlockedCompletionReason(reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  return normalized.startsWith('blocked:')
    || normalized === 'scorecard-verdict=blocked'
    || normalized === 'verification-preflight-blocked'
    || normalized === 'path-authority-preflight-failed';
}

function isHardBlockedCompletionReason(reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  return normalized === 'verification-preflight-blocked'
    || normalized === 'path-authority-preflight-failed';
}

function stopBlockedPhase(paths, logFile, detail, stopReason = 'verification-preflight-blocked') {
  appendQaRuntimeUpdate(stopReason, logFile, detail, paths);
  appendHandoffUpdate('blocked', logFile, detail, paths);
  const status = stopReason === 'verification-preflight-blocked' ? 'verification_blocked' : 'blocked';
  updatePhaseState(state.phaseNum, status, 'blocked', false, state.phaseDoc, paths);
  appendDecisionLog([`## Phase ${state.phaseNum}`, '- Status: ⛔ Blocked', `- Detail: ${detail}`, '']);
  recordLoopStop(state.phaseNum, stopReason, detail, logFile);
  return 2;
}

function assessRuntimeHealth(runtime) {
  return nodeAssignments(runtimePath, 'assess-runtime-health', runtime, process.cwd());
}

function decideMissingEvidenceAction(autoFixCount, finalStopReason) {
  return nodeAssignments(
    attemptPath,
    'decide-missing-evidence-action',
    String(autoFixCount),
    process.env.AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS ?? '3',
    process.env.AGENT_LOOP_AUTONOMOUS_MODE ?? 'true',
    process.env.AGENT_LOOP_ADVANCE_ON_FAILURE ?? 'false',
    finalStopReason,
  );
}

const REVIEW_ONLY_GATE_REASONS = new Set([
  'review-incomplete',
  'workflow-review-skill-missing',
  'workflow-review-bundle-missing',
]);

const CLOSEOUT_GATE_REASONS = new Set([
  ...REVIEW_ONLY_GATE_REASONS,
  'finish-closeout-incomplete',
  'workflow-finish-bundle-missing',
  'workflow-evidence-warnings',
]);

function gateIndicatesStrongCompletion(gate) {
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

function gateReasonNeedsCloseout(reason, gate = null) {
  const normalized = String(reason || '').trim();
  if (normalized === 'workflow-evidence-warnings' && gateIndicatesStrongCompletion(gate)) {
    return false;
  }
  return CLOSEOUT_GATE_REASONS.has(normalized);
}

function remediationStageForGateReason(reason, gate = null) {
  const normalized = String(reason || '').trim();
  if (REVIEW_ONLY_GATE_REASONS.has(normalized)) {
    return 'review';
  }
  if (gateReasonNeedsCloseout(normalized, gate)) {
    return 'finish/handoff';
  }
  return 'verify';
}

function remediationStatusLabel(reason, gate = null) {
  const stage = remediationStageForGateReason(reason, gate);
  if (stage === 'review') {
    return 'closeout-remediation-review-started';
  }
  if (stage === 'finish/handoff') {
    return 'closeout-remediation-finish-started';
  }
  return 'verification-remediation-started';
}

function missingEvidenceRuntimeStatus(reason, autoFixCount, gate = null) {
  return gateReasonNeedsCloseout(reason, gate)
    ? `phase-command-missing-closeout-evidence-attempt-${autoFixCount}`
    : `phase-command-missing-fresh-verification-attempt-${autoFixCount}`;
}

function incompleteRemediationStatus(reason, gate = null) {
  return gateReasonNeedsCloseout(reason, gate)
    ? 'closeout-remediation-incomplete'
    : 'verification-remediation-incomplete';
}

function handoffStopReason(reason, gate = null) {
  return gateReasonNeedsCloseout(reason, gate) ? 'deferred_verification' : 'missing-fresh-verification-evidence';
}

function decideFailureAction(autoFixCount, finalStopReason) {
  return nodeAssignments(
    attemptPath,
    'decide-failure-action',
    String(autoFixCount),
    process.env.AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS ?? '3',
    process.env.AGENT_LOOP_AUTONOMOUS_MODE ?? 'true',
    process.env.AGENT_LOOP_ADVANCE_ON_FAILURE ?? 'false',
    finalStopReason,
  );
}

function decideTimeoutAction(restartCount, timeoutFallbackUsed, fallbackRuntime, currentRuntime) {
  return nodeAssignments(
    attemptPath,
    'decide-timeout-action',
    String(restartCount),
    process.env.AGENT_LOOP_WATCHDOG_MAX_RESTARTS ?? '2',
    process.env.AGENT_LOOP_TIMEOUT_RUNTIME_FALLBACK ?? 'true',
    timeoutFallbackUsed ? 'true' : 'false',
    fallbackRuntime,
    currentRuntime,
    process.env.AGENT_LOOP_AUTONOMOUS_MODE ?? 'true',
    process.env.AGENT_LOOP_ADVANCE_ON_FAILURE ?? 'false',
  );
}

function buildVerificationRemediationPrompt(phaseNum, logFile, reason) {
  return runNodeScript(attemptPath, [
    'build-verification-remediation-prompt',
    String(phaseNum),
    logFile,
    reason,
  ]).stdout;
}

function buildAutoFixPrompt(phaseNum, logFile) {
  return runNodeScript(attemptPath, [
    'build-auto-fix-prompt',
    String(phaseNum),
    logFile,
  ]).stdout;
}

function localFileTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function parallelWorkerInstructions(phaseNum) {
  if (process.env.PHASE_MODEL_STAGE !== 'parallel_worker') {
    return '';
  }
  const assignedPhase = process.env.PHASE_PARALLEL_ASSIGNED_PHASE || String(phaseNum);
  const manifestPath = process.env.PHASE_PARALLEL_WAVE_MANIFEST || '';
  let peers = [];
  try {
    peers = JSON.parse(process.env.PHASE_PARALLEL_PEERS_JSON || '[]');
  } catch {
    peers = [];
  }
  const peerLines = peers.map((peer) => {
    const marker = String(peer.number) === String(assignedPhase) ? 'assigned' : 'peer';
    const owned = Array.isArray(peer.ownedPaths) && peer.ownedPaths.length > 0
      ? peer.ownedPaths.join(', ')
      : 'n/a';
    return `- ${marker} phase ${peer.number}: ${peer.title || ''}; ownedPaths=${owned}; phaseDoc=${peer.phaseDoc || ''}`;
  }).join('\n') || '- Peer list unavailable; stay strictly on the assigned phase.';

  return `

Parallel wave worker context:
- This process is one worker in a phase-level parallel wave.
- Assigned phase for this worker: ${assignedPhase}.
- Active wave manifest: ${manifestPath || 'not provided'}.
- Do not implement peer phases, do not edit peer-owned paths, and do not expand scope to shared follow-up work.
- If the assigned phase needs a peer-owned path or another phase's scope, stop this phase as blocked and record the dependency instead of doing duplicate work.
- Main merge happens only in the wave coordinator after all workers succeed; do not run git merge, git branch cleanup, or phase-wave cleanup from inside this worker.

Parallel wave assignments:
${peerLines}`;
}

function primaryInstructions(phaseNum) {
  return `Implement phase ${phaseNum} using the active phase doc as the only planning baseline.

Primary objective:
- Complete the scoped work for phase ${phaseNum}.
- Keep changes bounded to the active phase.
- Do not move to other phases in this run.
- If the phase artifacts declare an exact verification command, run that command exactly once instead of searching for alternative verifiers.
- Do not stop at implementation-complete or verification-complete checkpoints alone.
- Return control only after fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`.${parallelWorkerInstructions(phaseNum)}`;
}

function autonomousInstructions() {
  return `## 자율 실행 모드
- 사용자 확인 없이 최선의 판단으로 자율적으로 진행하세요
- 불확실한 경우 보수적이고 안전한 선택을 하세요
- 모든 결정사항은 간략히 기록해주세요
- 실패 시 대안을 시도한 후 진행하세요
- 절대로 사용자에게 질문하거나 확인을 요청하지 마세요`;
}

function recordLoopStop(phaseNum, reason, detail, logFile) {
  const displayDetail = reason === 'path-authority-preflight-failed'
    ? `${reason}: ${detail}`
    : detail;
  appendDebugLog('phase-stop', {
    reason,
    detail,
    logFile,
  });
  appendDecisionLog([
    `## Phase ${phaseNum} - Stopped Early`,
    `- Reason: ${reason}`,
    `- Detail: ${detail}`,
    ...(logFile ? [`- Log: ${logFile}`] : []),
    '',
  ]);
  logError(`Phase ${phaseNum} 중단 사유: ${displayDetail}`);
  if (logFile) {
    logError(`확인할 로그: ${logFile}`);
  }
}

function finalizeCompletion(logFile, durationSeconds, completionArtifacts, paths, runtime, completionLabel, commitPrompt) {
  appendDebugLog('phase-completion', {
    logFile,
    durationSeconds,
    runtime,
    completionLabel,
    completionArtifacts,
  });
  if (activeAttemptContext?.captureSession) {
    activeAttemptContext.captureSession.recordSpanCompleted({
      spanId: activeAttemptContext.currentWorkerSpanId || activeAttemptContext.captureRunSpanId,
      parentSpanId: activeAttemptContext.captureAttemptSpanId,
      spanName: 'worker-prompt',
      summary: 'span_completed',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('span_completed', result.error?.message || 'capture failed');
      }
    });
    activeAttemptContext.captureSession.recordSpanCompleted({
      spanId: activeAttemptContext.captureAttemptSpanId,
      parentSpanId: activeAttemptContext.captureRunSpanId,
      spanName: 'attempt',
      summary: 'span_completed',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('attempt_completed', result.error?.message || 'capture failed');
      }
    });
  }
  logSuccess(`Phase ${state.phaseNum} completed${completionLabel} (${durationSeconds}s)`);
  appendQaRuntimeUpdate(
    completionLabel === '' ? 'phase-command-succeeded' : `phase-completed${completionLabel}`,
    logFile,
    completionArtifacts,
    paths,
  );
  syncCleanFinishArtifacts(completionArtifacts, paths);
  updatePhaseState(state.phaseNum, 'completed', 'completed', false, state.phaseDoc, paths);
  writeCleanFinishHandoff(paths);
  appendDecisionLog([
    `## Phase ${state.phaseNum}`,
    `- Status: ✅ Completed${completionLabel ? ` (${completionLabel.slice(1).replace(/-/g, ' ')})` : ''}`,
    `- Duration: ${durationSeconds}s`,
    '',
  ]);
  runCommitPrompt(logFile, commitPrompt, runtime);
}

function handleFatalPhaseRunnerError(error, origin = 'phase-runner-exception') {
  if (fatalPhaseRunnerHandled) {
    return;
  }
  fatalPhaseRunnerHandled = true;

  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const detail = `${origin}: ${normalizedError.message}`;

  appendDebugLog('phase-runner-fatal', {
    origin,
    message: normalizedError.message,
    stack: normalizedError.stack || '',
    activeAttemptContext,
  });

  if (!activeAttemptContext?.paths) {
    return;
  }

  try {
    appendQaRuntimeUpdate('phase-runner-crash', activeAttemptContext.logFile ?? '', detail, activeAttemptContext.paths);
  } catch (qaError) {
    appendDebugLog('phase-runner-fatal-qa-update-failed', {
      message: qaError instanceof Error ? qaError.message : String(qaError),
    });
  }

  try {
    appendHandoffUpdate('blocked', activeAttemptContext.logFile ?? '', detail, activeAttemptContext.paths);
  } catch (handoffError) {
    appendDebugLog('phase-runner-fatal-handoff-update-failed', {
      message: handoffError instanceof Error ? handoffError.message : String(handoffError),
    });
  }

  try {
    updatePhaseState(state.phaseNum, 'failed', 'runner_exception', false, state.phaseDoc, activeAttemptContext.paths);
  } catch (stateError) {
    appendDebugLog('phase-runner-fatal-state-update-failed', {
      message: stateError instanceof Error ? stateError.message : String(stateError),
    });
  }

  try {
    appendDecisionLog([
      `## Phase ${state.phaseNum} - Fatal Runner Error`,
      `- Origin: ${origin}`,
      `- Detail: ${normalizedError.message}`,
      ...(activeAttemptContext.logFile ? [`- Log: ${activeAttemptContext.logFile}`] : []),
      '',
    ]);
  } catch {
    // Ignore debug-only append failures.
  }
}

function closeoutInterruptedAttempt(signalName, origin = 'phase-runner-signal') {
  if (!activeAttemptContext?.paths || fatalPhaseRunnerHandled) {
    return;
  }

  let protectedGate = null;
  try {
    protectedGate = evaluatePhaseCompletionGateWithRetry(activeAttemptContext.startEpoch ?? 0, activeAttemptContext.paths);
  } catch (error) {
    appendDebugLog('phase-runner-signal-completion-gate-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (protectedGate && (protectedGate.PHASE_COMPLETION_ALLOWED === 'true' || gateIndicatesStrongCompletion(protectedGate))) {
    const detail = `${origin}: received ${signalName} after clean-finish completion bookkeeping was already recorded`;
    appendDebugLog('phase-runner-signal-preserve-completed', {
      signalName,
      origin,
      gate: protectedGate,
      activeAttemptContext,
    });
    try {
      appendQaRuntimeUpdate('phase-runner-interrupted-after-completion', activeAttemptContext.logFile ?? '', detail, activeAttemptContext.paths);
    } catch (error) {
      appendDebugLog('phase-runner-signal-preserve-qa-update-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      updatePhaseState(state.phaseNum, 'completed', 'completed', false, state.phaseDoc, activeAttemptContext.paths);
    } catch (error) {
      appendDebugLog('phase-runner-signal-preserve-state-update-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const detail = `${origin}: received ${signalName} while the active phase attempt was still running`;
  appendDebugLog('phase-runner-signal-closeout', {
    signalName,
    origin,
    activeAttemptContext,
  });

  try {
    appendQaRuntimeUpdate('phase-runner-interrupted', activeAttemptContext.logFile ?? '', detail, activeAttemptContext.paths);
  } catch (error) {
    appendDebugLog('phase-runner-signal-qa-update-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    appendHandoffUpdate('interrupted', activeAttemptContext.logFile ?? '', detail, activeAttemptContext.paths);
  } catch (error) {
    appendDebugLog('phase-runner-signal-handoff-update-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    updatePhaseState(state.phaseNum, 'in_progress', 'partial', false, state.phaseDoc, activeAttemptContext.paths);
  } catch (error) {
    appendDebugLog('phase-runner-signal-state-update-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function runPhaseAttempt() {
  fs.mkdirSync(logDir, { recursive: true });
  appendDebugLog('phase-attempt-bootstrap', {
    planDir: state.planDir,
    executionRoot: state.executionRoot,
    requestedRuntime: state.runtime,
    phaseDoc: state.phaseDoc,
  });

  if (!state.executionRoot) {
    state.executionRoot = `${state.planDir.replace(/\/$/, '')}/execution`;
  }

  const masterPlanPath = resolveActiveMasterPlanPath();
  let paths = assignExecutionArtifactPaths(state.phaseNum, state.phaseTitle, state.executionRoot);
  const pathAuthority = evaluatePathAuthority({
    planDir: state.planDir,
    statusFile: state.statusFile,
    masterPlan: masterPlanPath,
    masterPlanProvided: Boolean(masterPlanPath),
    executionRoot: state.executionRoot,
    phaseDoc: state.phaseDoc,
    artifactPaths: [
      { label: 'Sprint contract', path: paths.phaseSprintContract, parentPath: paths.phaseExecutionDir },
      { label: 'QA report', path: paths.phaseQaReport, parentPath: paths.phaseExecutionDir },
      { label: 'Handoff', path: paths.phaseHandoff, parentPath: paths.phaseExecutionDir },
      { label: 'Scorecard', path: paths.phaseScorecard, parentPath: paths.phaseExecutionDir },
      { label: 'Worksets', path: paths.phaseWorksets, parentPath: paths.phaseExecutionDir },
    ],
  });
  if (!pathAuthority.allowed) {
    const pathAuthorityLogFile = `${logDir}/phase-${state.phaseNum}_${localFileTimestamp()}.log`;
    fs.mkdirSync(paths.phaseExecutionDir, { recursive: true });
    appendDebugLog('path-authority-preflight-failed', {
      requestedRuntime: state.runtime,
      planDir: state.planDir,
      statusFile: state.statusFile,
      executionRoot: state.executionRoot,
      masterPlanPath,
      phaseDoc: state.phaseDoc,
      authorityCode: pathAuthority.authorityCode,
      reason: pathAuthority.reason,
      issues: pathAuthority.issues,
    });
    return stopBlockedPhase(paths, pathAuthorityLogFile, pathAuthority.detail, 'path-authority-preflight-failed');
  }

  const runtime = resolveRunnerRuntime(state.runtime);
  const pathsWithArtifacts = ensureExecutionArtifacts({
    phaseNum: state.phaseNum,
    phaseTitle: state.phaseTitle,
    phaseDoc: state.phaseDoc,
    masterPlan: masterPlanPath,
    executionRoot: state.executionRoot,
    statusFile: state.statusFile,
    planDir: state.planDir,
    verificationContractFile: '.claude/verification.contract.yaml',
    targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
    scorecardProfile: process.env.AGENT_LOOP_SCORECARD_PROFILE ?? 'auto',
    workspaceRoot: process.cwd(),
    requestedRuntime: state.runtime,
    verificationRuntimes: state.verificationRuntimes,
    currentRuntime: runtime,
  });

  writeStdoutLine('\u001b[0;36m───────────────────────────────────────────────────────────────\u001b[0m');
  writeStdoutLine(`\u001b[0;36m📦\u001b[0m Phase ${state.phaseNum}: ${state.phaseTitle}`);
  logInfo(`Sprint contract: ${pathsWithArtifacts.phaseSprintContract}`);
  logInfo(`QA report: ${pathsWithArtifacts.phaseQaReport}`);
  logInfo(`Handoff: ${pathsWithArtifacts.phaseHandoff}`);
  logInfo(`Scorecard: ${pathsWithArtifacts.phaseScorecard}`);
  logInfo(`Worksets: ${pathsWithArtifacts.phaseWorksets}`);
  paths = pathsWithArtifacts;

  let activeRuntime = runtime;
  const logFile = `${logDir}/phase-${state.phaseNum}_${localFileTimestamp()}.log`;
  const verificationPreflight = collectVerificationPreflightBlockers('.claude/verification.contract.yaml', {
    requestedRuntime: state.runtime,
    verificationRuntimes: state.verificationRuntimes,
    currentRuntime: activeRuntime,
  });
  if (verificationPreflight.blockers.length > 0) {
    const detail = [
      `verification runtime target=${verificationPreflight.effectiveSelection}`,
      `available=${verificationPreflight.availableRuntimes.join(',') || 'none'}`,
      ...verificationPreflight.blockers.map((blocker) => blocker.detail),
    ].join(' | ');
    appendDebugLog('verification-preflight-blocked', {
      requestedRuntime: state.runtime,
      verificationRuntimes: state.verificationRuntimes,
      currentRuntime: activeRuntime,
      blockers: verificationPreflight.blockers,
      availableRuntimes: verificationPreflight.availableRuntimes,
    });
    return stopBlockedPhase(paths, logFile, detail);
  }
  let prompt = buildPhasePrompt({
    nextPhase: state.phaseNum,
    phaseTitle: state.phaseTitle,
    planDir: state.planDir,
    phaseDoc: state.phaseDoc,
    statusFile: state.statusFile,
    executionRoot: state.executionRoot,
    paths,
    runtime: activeRuntime,
    targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
    extraInstructions: primaryInstructions(state.phaseNum),
    autonomousInstructions: autonomousInstructions(),
    workspaceRoot: process.cwd(),
    verificationRuntimes: verificationPreflight.effectiveSelection,
  });
  const startEpoch = Math.floor(Date.now() / 1000);
  let restartCount = 0;
  let autoFixCount = 0;
  let timeoutFallbackUsed = false;
  const captureRunId = process.env.PHASE_RUN_LEASE_ID || `phase-${state.phaseNum}`;
  const captureSession = createPhaseHarnessCaptureSession({
    traceId: captureRunId,
    runId: captureRunId,
    taskId: `phase-${state.phaseNum}`,
    sessionId: captureRunId,
    stage: 'ready/isolate',
    source: 'agent-loop-phase-runner',
  });
  const captureRunSpanId = `run-${captureRunId}`;
  const captureAttemptSpanId = `attempt-${crypto.randomUUID().slice(0, 8)}`;
  captureSession.recordAttemptStarted({
    spanId: captureAttemptSpanId,
    parentSpanId: captureRunSpanId,
    phaseNum: state.phaseNum,
    phaseTitle: state.phaseTitle,
    attemptIndex: autoFixCount + 1,
    summary: 'attempt_started',
  }).then((result) => {
    if (!result.ok) {
      appendCaptureWarning('attempt_started', result.error?.message || 'capture failed');
    }
  });
  activeAttemptContext = {
    logFile,
    paths,
    runtime,
    startEpoch,
    captureSession,
    captureRunId,
    captureRunSpanId,
    captureAttemptSpanId,
  };

  const runtimeHealth = assessRuntimeHealth(activeRuntime);
  appendDebugLog('runtime-health-assessment', runtimeHealth);
  if (runtimeHealth.HEALTHY === 'true' && runtimeHealth.REASON === 'phase-verification-blocker-stale') {
    const detail = [
      runtimeHealth.DETAIL || runtimeHealth.REASON,
      runtimeHealth.VERDICT_PATH ? `verdict=${runtimeHealth.VERDICT_PATH}` : '',
      runtimeHealth.BLOCKER_CLASS ? `blockerClass=${runtimeHealth.BLOCKER_CLASS}` : '',
      'nextAction=reverify-phase',
    ].filter(Boolean).join(' | ');
    appendQaRuntimeUpdate('stale-blocker-cleared', logFile, detail, paths);
    appendHandoffUpdate('pending_reverify', logFile, detail, paths);
    updatePhaseState(state.phaseNum, 'pending_reverify', 'stale_blocker_cleared', false, state.phaseDoc, paths);
    appendDecisionLog([
      `## Phase ${state.phaseNum} - Stale Blocker Cleared`,
      `- Verdict: ${runtimeHealth.VERDICT_PATH || 'n/a'}`,
      `- Blocker class: ${runtimeHealth.BLOCKER_CLASS || 'n/a'}`,
      '- Decision: continue with fresh phase re-verification',
      '',
    ]);
  } else if (runtimeHealth.HEALTHY === 'true' && runtimeHealth.REASON === 'phase-verification-blocked-not-runtime') {
    appendDebugLog('phase-verification-blocker-not-runtime', {
      detail: runtimeHealth.DETAIL || '',
      verdictPath: runtimeHealth.VERDICT_PATH || '',
      blockerClass: runtimeHealth.BLOCKER_CLASS || '',
    });
  }
  if (runtimeHealth.HEALTHY !== 'true') {
    if (runtimeHealth.FALLBACK_RUNTIME) {
      const previousRuntime = activeRuntime;
      activeRuntime = runtimeHealth.FALLBACK_RUNTIME;
      activeAttemptContext.runtime = activeRuntime;
      appendQaRuntimeUpdate('runtime-health-fallback', logFile, runtimeHealth.DETAIL || runtimeHealth.REASON, paths);
      appendHandoffUpdate(
        'runtime-health-fallback',
        logFile,
        `requestedRuntime=${state.runtime} | effectiveRuntime=${activeRuntime} | fallbackReason=${runtimeHealth.REASON || runtimeHealth.DETAIL || 'runtime-health-fallback'} | ${previousRuntime} -> ${activeRuntime}: ${runtimeHealth.DETAIL || runtimeHealth.REASON}`,
        paths,
      );
      prompt = buildPhasePrompt({
        nextPhase: state.phaseNum,
        phaseTitle: state.phaseTitle,
        planDir: state.planDir,
        phaseDoc: state.phaseDoc,
        statusFile: state.statusFile,
        executionRoot: state.executionRoot,
        paths,
        runtime: activeRuntime,
        targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
        extraInstructions: primaryInstructions(state.phaseNum),
        autonomousInstructions: autonomousInstructions(),
        workspaceRoot: process.cwd(),
        verificationRuntimes: verificationPreflight.effectiveSelection,
      });
      logWarn(`Runtime health gate switched ${previousRuntime} -> ${activeRuntime}`);
    } else {
      const runtimeHealthDetail = [
        runtimeHealth.DETAIL || runtimeHealth.REASON,
        runtimeHealth.FALLBACK_POLICY ? `fallback-policy=${runtimeHealth.FALLBACK_POLICY}` : '',
      ].filter(Boolean).join(' | ');
      appendQaRuntimeUpdate('runtime-health-blocked', logFile, runtimeHealthDetail, paths);
      appendHandoffUpdate('blocked', logFile, runtimeHealthDetail, paths);
      updatePhaseState(state.phaseNum, 'runtime_unhealthy', 'runtime_unhealthy', false, state.phaseDoc, paths);
      recordLoopStop(
        state.phaseNum,
        runtimeHealth.REASON || 'runtime-health-check-failed',
        runtimeHealthDetail || 'runtime health gate failed',
        logFile,
      );
      return 2;
    }
  }

  const worktreeCoordinator = runWorktreeCoordinator(paths, activeRuntime);
  if (worktreeCoordinator.status === 0) {
    const detail = (worktreeCoordinator.stdout || '').trim() || 'phase worktree coordinator completed';
    appendQaRuntimeUpdate('parallel-worktree-merged', logFile, detail, paths);
    captureSession.recordFileReconciliation({
      spanId: captureAttemptSpanId,
      artifactRefs: collectFileReconciliationRefs(),
      reconcileMode: 'git-diff-name-only',
      summary: 'file_reconciliation',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('file_reconciliation', result.error?.message || 'capture failed');
      }
    });
    appendDecisionLog([
      `## Phase ${state.phaseNum} - Parallel Worktree Worksets`,
      '- Status: completed',
      `- Detail: ${detail}`,
      '',
    ]);
  } else if (worktreeCoordinator.status === 78) {
    appendDebugLog('phase-worktree-coordinator-fallback', {
      reason: (worktreeCoordinator.stdout || worktreeCoordinator.stderr || '').trim(),
    });
  } else if (state.parallelWorktrees > 1) {
    const detail = (worktreeCoordinator.stderr || worktreeCoordinator.stdout || 'phase worktree coordinator failed').trim();
    return stopBlockedPhase(paths, logFile, detail, 'parallel-worktree-blocked');
  }

  while (true) {
    updatePhaseState(state.phaseNum, 'in_progress', 'running', true, state.phaseDoc, paths);
    recordPhaseProgressCheckpoint('ready/isolate', 'phase-attempt-started', logFile, 'Phase state moved to in_progress before the worker prompt.', activeRuntime, paths);
    const workerSpanId = `span-${crypto.randomUUID().slice(0, 8)}`;
    const workerActionId = `action-${crypto.randomUUID().slice(0, 8)}`;
    activeAttemptContext.currentWorkerSpanId = workerSpanId;
    activeAttemptContext.currentWorkerActionId = workerActionId;
    captureSession.recordSpanStarted({
      spanId: workerSpanId,
      parentSpanId: captureAttemptSpanId,
      spanName: 'worker-prompt',
      summary: 'span_started',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('span_started', result.error?.message || 'capture failed');
      }
    });
    captureSession.recordActionStarted({
      actionId: workerActionId,
      spanId: workerSpanId,
      parentSpanId: captureAttemptSpanId,
      actionName: 'worker-prompt',
      summary: 'action_started',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('action_started', result.error?.message || 'capture failed');
      }
    });
    const qaChecksumBefore = sha1FileOrEmpty(paths.phaseQaReport);
    appendDebugLog('worker-prompt-start', {
      logFile,
      runtime: activeRuntime,
      qaChecksumBefore,
      autoFixCount,
      restartCount,
    });
    const exitCode = runWorkerPrompt(logFile, prompt, startEpoch, qaChecksumBefore, paths, activeRuntime);
    captureSession.recordActionCompleted({
      actionId: workerActionId,
      spanId: workerSpanId,
      parentSpanId: captureAttemptSpanId,
      actionName: 'worker-prompt',
      actionResult: `exit_code=${exitCode}`,
      exitCode,
      summary: 'action_completed',
    }).then((result) => {
      if (!result.ok) {
        appendCaptureWarning('action_completed', result.error?.message || 'capture failed');
      }
    });
    appendDebugLog('worker-prompt-exit', {
      logFile,
      runtime: activeRuntime,
      exitCode,
      autoFixCount,
      restartCount,
    });

    if (exitCode === 0) {
      const duration = Math.floor(Date.now() / 1000) - startEpoch;
      const gate = evaluatePhaseCompletionGateWithRetry(startEpoch, paths);
      appendDebugLog('completion-gate-result', {
        logFile,
        runtime: activeRuntime,
        allowed: gate.PHASE_COMPLETION_ALLOWED,
        reason: gate.PHASE_COMPLETION_REASON,
        score: gate.PHASE_COMPLETION_SCORE,
        scoreVerdict: gate.PHASE_COMPLETION_SCORE_VERDICT,
        scoreSource: gate.PHASE_COMPLETION_SCORE_SOURCE,
      });
      captureSession.recordJudgeResult({
        actionId: workerActionId,
        spanId: captureAttemptSpanId,
        judgeName: 'phase-completion-gate',
        result: gate.PHASE_COMPLETION_ALLOWED === 'true' ? 'pass' : 'warn',
        artifactRefs: collectFileReconciliationRefs(),
        detail: gate.PHASE_COMPLETION_REASON,
        summary: 'judge_result',
      }).then((result) => {
        if (!result.ok) {
          appendCaptureWarning('judge_result', result.error?.message || 'capture failed');
        }
      });
      if (gate.PHASE_COMPLETION_ALLOWED === 'true') {
        finalizeCompletion(
          logFile,
          duration,
          gate.PHASE_COMPLETION_ARTIFACTS ?? '',
          paths,
          activeRuntime,
          '',
          `/commit-moonshot Phase ${state.phaseNum} 완료. 해당 페이즈 변경사항을 커밋해주세요.`,
        );
        return 0;
      }

      if (isHardBlockedCompletionReason(gate.PHASE_COMPLETION_REASON)) {
        return stopBlockedPhase(paths, logFile, `completion gate blocked: ${gate.PHASE_COMPLETION_REASON}`, 'completion-gate-blocked');
      }

      autoFixCount += 1;
      logError(`Phase ${state.phaseNum} produced no valid completion evidence (${gate.PHASE_COMPLETION_REASON})`);
      appendQaRuntimeUpdate(missingEvidenceRuntimeStatus(gate.PHASE_COMPLETION_REASON, autoFixCount, gate), logFile, gate.PHASE_COMPLETION_REASON, paths);
      appendHandoffUpdate(handoffStopReason(gate.PHASE_COMPLETION_REASON, gate), logFile, gate.PHASE_COMPLETION_REASON, paths);

      const finalStopReason = detectFinalStopReason(logFile, 'missing-verification-evidence');
      const retrySuppression = summarizeRetrySuppression(process.cwd(), finalStopReason);
      if (retrySuppression?.shouldSuppressRetry) {
        const detail = [
          `blocker=${retrySuppression.blockerCode || finalStopReason}`,
          `sameFailureClassCount=${retrySuppression.sameFailureClassCount}`,
          `decision=${retrySuppression.decision}`,
          retrySuppression.reportPath ? `artifact=${retrySuppression.reportPath}` : '',
        ].filter(Boolean).join(' | ');
        return stopBlockedPhase(paths, logFile, detail, 'verification-preflight-blocked');
      }
      const decision = decideMissingEvidenceAction(autoFixCount, finalStopReason);
      if (decision.ACTION === 'stop-loop') {
        updatePhaseState(state.phaseNum, 'failed', 'failed', false, state.phaseDoc, paths);
        recordLoopStop(state.phaseNum, finalStopReason, describeStopReason(finalStopReason, activeRuntime, gate.PHASE_COMPLETION_REASON), logFile);
        return 2;
      }

      if (decision.ACTION === 'verification-remediation') {
        const remediationStage = remediationStageForGateReason(gate.PHASE_COMPLETION_REASON, gate);
        const remediationLabel = remediationStage === 'verify' ? 'Verification Remediation' : 'Closeout Remediation';
        logInfo(`Attempting ${remediationLabel.toLowerCase()}...`);
        appendDecisionLog([`## Phase ${state.phaseNum} - ${remediationLabel} #${autoFixCount}`, '']);
        const fixPrompt = buildPhasePrompt({
          nextPhase: state.phaseNum,
          phaseTitle: state.phaseTitle,
          planDir: state.planDir,
          phaseDoc: state.phaseDoc,
          statusFile: state.statusFile,
          executionRoot: state.executionRoot,
          paths,
          runtime: activeRuntime,
          targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
          extraInstructions: buildVerificationRemediationPrompt(state.phaseNum, logFile, gate.PHASE_COMPLETION_REASON),
          autonomousInstructions: autonomousInstructions(),
          workspaceRoot: process.cwd(),
          verificationRuntimes: verificationPreflight.effectiveSelection,
        });
        updatePhaseState(state.phaseNum, 'in_progress', 'running', false, state.phaseDoc, paths);
        recordPhaseProgressCheckpoint(remediationStage, remediationStatusLabel(gate.PHASE_COMPLETION_REASON, gate), logFile, gate.PHASE_COMPLETION_REASON, activeRuntime, paths);
        const remediationExit = runWorkerPrompt(logFile, fixPrompt, startEpoch, sha1FileOrEmpty(paths.phaseQaReport), paths, activeRuntime);
        if (remediationExit === 0) {
          const remediationGate = evaluatePhaseCompletionGateWithRetry(startEpoch, paths);
          if (remediationGate.PHASE_COMPLETION_ALLOWED === 'true') {
            finalizeCompletion(
              logFile,
              Math.floor(Date.now() / 1000) - startEpoch,
              remediationGate.PHASE_COMPLETION_ARTIFACTS ?? '',
              paths,
              activeRuntime,
              '-after-verification-remediation',
              `/commit-moonshot Phase ${state.phaseNum} 완료 (verification remediation). 변경사항을 커밋해주세요.`,
            );
            return 0;
          }
          if (isHardBlockedCompletionReason(remediationGate.PHASE_COMPLETION_REASON)) {
            return stopBlockedPhase(paths, logFile, `completion gate blocked after remediation: ${remediationGate.PHASE_COMPLETION_REASON}`, 'completion-gate-blocked');
          }
          logError(`Phase ${state.phaseNum} still lacks valid completion evidence (${remediationGate.PHASE_COMPLETION_REASON})`);
          appendQaRuntimeUpdate(incompleteRemediationStatus(remediationGate.PHASE_COMPLETION_REASON, remediationGate), logFile, remediationGate.PHASE_COMPLETION_REASON, paths);
          appendHandoffUpdate(handoffStopReason(remediationGate.PHASE_COMPLETION_REASON, remediationGate), logFile, remediationGate.PHASE_COMPLETION_REASON, paths);
        }
        continue;
      }

      updatePhaseState(state.phaseNum, 'failed', 'failed', false, state.phaseDoc, paths);
      appendDecisionLog([`## Phase ${state.phaseNum}`, '- Status: ❌ Failed (missing fresh verification evidence)', '']);
      if (decision.ACTION === 'advance-after-failure') {
        logWarn('Autonomous mode: Moving to next phase without marking completion');
        return 0;
      }
      recordLoopStop(state.phaseNum, finalStopReason, describeStopReason(finalStopReason, activeRuntime, gate.PHASE_COMPLETION_REASON), logFile);
      return 2;
    }

    if (exitCode === 124 && (process.env.AGENT_LOOP_WATCHDOG_AUTO_RESTART ?? 'true') === 'true') {
      restartCount += 1;
      const timeoutReason = classifyTimeoutReason(logFile);
      const timeoutDetail = describeStopReason(timeoutReason, activeRuntime);
      appendDebugLog('worker-timeout', {
        logFile,
        runtime: activeRuntime,
        restartCount,
        timeoutReason,
        timeoutDetail,
      });
      appendQaRuntimeUpdate(`phase-timeout-attempt-${restartCount}`, logFile, timeoutDetail, paths);
      appendHandoffUpdate(`phase-timeout-attempt-${restartCount}`, logFile, timeoutDetail, paths);
      logWarn(`Phase ${state.phaseNum} timed out. Restarting... (attempt ${restartCount})`);
      appendDecisionLog([`## Phase ${state.phaseNum} - Timeout Restart #${restartCount}`, `- Runtime: ${activeRuntime}`, `- Detail: ${timeoutDetail}`, '']);

      const fallbackRuntime = resolveTimeoutFallbackRuntime(activeRuntime);
      const decision = decideTimeoutAction(restartCount, timeoutFallbackUsed, fallbackRuntime, activeRuntime);
      if (decision.ACTION === 'switch-runtime') {
        const previousRuntime = activeRuntime;
        activeRuntime = decision.FALLBACK_RUNTIME;
        timeoutFallbackUsed = true;
        prompt = buildPhasePrompt({
          nextPhase: state.phaseNum,
          phaseTitle: state.phaseTitle,
          planDir: state.planDir,
          phaseDoc: state.phaseDoc,
          statusFile: state.statusFile,
          executionRoot: state.executionRoot,
          paths,
          runtime: activeRuntime,
          targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
          extraInstructions: primaryInstructions(state.phaseNum),
          autonomousInstructions: autonomousInstructions(),
          workspaceRoot: process.cwd(),
          verificationRuntimes: verificationPreflight.effectiveSelection,
        });
        const fallbackDetail = `${timeoutDetail}. 동일 phase를 ${previousRuntime}에서 ${activeRuntime}로 전환해 1회 더 시도합니다.`;
        logWarn(`Timeout fallback: switching runtime from ${previousRuntime} to ${activeRuntime}`);
        appendQaRuntimeUpdate('timeout-runtime-fallback', logFile, fallbackDetail, paths);
        appendHandoffUpdate(
          'timeout-runtime-fallback',
          logFile,
          `requestedRuntime=${state.runtime} | effectiveRuntime=${activeRuntime} | fallbackReason=${timeoutReason || timeoutDetail || 'timeout-runtime-fallback'} | ${fallbackDetail}`,
          paths,
        );
        continue;
      }
      if (decision.ACTION === 'retry-timeout') {
        continue;
      }

      const stopDetail = describeStopReason('timeout-restart-limit', activeRuntime, timeoutDetail);
      logError(`Phase ${state.phaseNum} exceeded restart limit`);
      appendQaRuntimeUpdate('timeout-restart-limit-exceeded', logFile, stopDetail, paths);
      appendHandoffUpdate('timeout-restart-limit-exceeded', logFile, stopDetail, paths);
      updatePhaseState(state.phaseNum, 'failed', 'failed', false, state.phaseDoc, paths);
      appendDecisionLog([`## Phase ${state.phaseNum}`, '- Status: ❌ Failed (restart limit exceeded)', `- Detail: ${stopDetail}`, '']);
      if (decision.ACTION === 'advance-after-failure') {
        logWarn('Autonomous mode: Moving to next phase');
        return 0;
      }
      recordLoopStop(state.phaseNum, 'timeout-restart-limit', stopDetail, logFile);
      return 2;
    }

    autoFixCount += 1;
    appendDebugLog('worker-nonzero-exit', {
      logFile,
      runtime: activeRuntime,
      exitCode,
      autoFixCount,
    });
    logError(`Phase ${state.phaseNum} failed (attempt ${autoFixCount}/${process.env.AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS ?? '3'})`);
    appendQaRuntimeUpdate(`phase-command-failed-attempt-${autoFixCount}`, logFile, '', paths);

    const finalStopReason = detectFinalStopReason(logFile, 'phase-failed');
    const retrySuppression = summarizeRetrySuppression(process.cwd(), finalStopReason);
    if (retrySuppression?.shouldSuppressRetry) {
      const detail = [
        `blocker=${retrySuppression.blockerCode || finalStopReason}`,
        `sameFailureClassCount=${retrySuppression.sameFailureClassCount}`,
        `decision=${retrySuppression.decision}`,
        retrySuppression.reportPath ? `artifact=${retrySuppression.reportPath}` : '',
      ].filter(Boolean).join(' | ');
      return stopBlockedPhase(paths, logFile, detail, 'verification-preflight-blocked');
    }
    const decision = decideFailureAction(autoFixCount, finalStopReason);

    if (decision.ACTION === 'stop-loop' && finalStopReason === 'tool-schema-error-loop') {
      appendHandoffUpdate('tool-schema-error-loop', logFile, describeStopReason(finalStopReason, activeRuntime), paths);
      updatePhaseState(state.phaseNum, 'failed', 'failed', false, state.phaseDoc, paths);
      appendDecisionLog([`## Phase ${state.phaseNum}`, '- Status: ❌ Failed (tool schema error loop)', `- Detail: ${describeStopReason(finalStopReason, activeRuntime)}`, '']);
      recordLoopStop(state.phaseNum, finalStopReason, describeStopReason(finalStopReason, activeRuntime), logFile);
      return 2;
    }

    if (decision.ACTION === 'stop-loop' && finalStopReason === 'verification-command-missing') {
      updatePhaseState(state.phaseNum, 'failed', 'failed', false, state.phaseDoc, paths);
      appendDecisionLog([`## Phase ${state.phaseNum}`, '- Status: ❌ Failed (verification command missing)', '']);
      recordLoopStop(state.phaseNum, finalStopReason, describeStopReason(finalStopReason, activeRuntime), logFile);
      return 2;
    }

    if (decision.ACTION === 'auto-fix') {
      logInfo('Attempting auto-fix...');
      appendDecisionLog([`## Phase ${state.phaseNum} - Auto-fix #${autoFixCount}`, '']);
      const fixPrompt = buildPhasePrompt({
        nextPhase: state.phaseNum,
        phaseTitle: state.phaseTitle,
        planDir: state.planDir,
        phaseDoc: state.phaseDoc,
        statusFile: state.statusFile,
        executionRoot: state.executionRoot,
        paths,
        runtime: activeRuntime,
        targetCompletionScore: process.env.AGENT_LOOP_TARGET_COMPLETION_SCORE ?? '100',
        extraInstructions: buildAutoFixPrompt(state.phaseNum, logFile),
        autonomousInstructions: autonomousInstructions(),
        workspaceRoot: process.cwd(),
        verificationRuntimes: verificationPreflight.effectiveSelection,
      });
      updatePhaseState(state.phaseNum, 'in_progress', 'running', false, state.phaseDoc, paths);
      recordPhaseProgressCheckpoint('execute', 'auto-fix-started', logFile, 'Retrying the active phase after a failed attempt.', activeRuntime, paths);
      const fixExit = runWorkerPrompt(logFile, fixPrompt, startEpoch, sha1FileOrEmpty(paths.phaseQaReport), paths, activeRuntime);
      if (fixExit === 0) {
        const gate = evaluatePhaseCompletionGateWithRetry(startEpoch, paths);
        if (gate.PHASE_COMPLETION_ALLOWED === 'true') {
          finalizeCompletion(
            logFile,
            Math.floor(Date.now() / 1000) - startEpoch,
            gate.PHASE_COMPLETION_ARTIFACTS ?? '',
            paths,
            activeRuntime,
            '-after-auto-fix',
            `/commit-moonshot Phase ${state.phaseNum} 완료 (auto-fix). 변경사항을 커밋해주세요.`,
          );
          return 0;
        }
        logError(`Phase ${state.phaseNum} still lacks valid completion evidence (${gate.PHASE_COMPLETION_REASON})`);
        appendQaRuntimeUpdate('auto-fix-succeeded-without-fresh-verification', logFile, gate.PHASE_COMPLETION_REASON, paths);
        appendHandoffUpdate(handoffStopReason(gate.PHASE_COMPLETION_REASON, gate), logFile, gate.PHASE_COMPLETION_REASON, paths);
      }
      continue;
    }

    appendHandoffUpdate('phase-failed-max-attempts', logFile, '', paths);
    updatePhaseState(state.phaseNum, 'failed', 'failed', false, state.phaseDoc, paths);
    appendDecisionLog([`## Phase ${state.phaseNum}`, '- Status: ❌ Failed (max attempts reached)', '']);
    if (decision.ACTION === 'advance-after-failure') {
      logWarn(`Autonomous mode: Moving to next phase after ${process.env.AGENT_LOOP_MAX_AUTO_FIX_ATTEMPTS ?? '3'} failed attempts`);
      return 0;
    }
    recordLoopStop(state.phaseNum, 'phase-max-attempts', describeStopReason('phase-max-attempts', activeRuntime), logFile);
    return 2;
  }
}

parseArgs(process.argv.slice(2));
if (!state.planDir || !state.phaseNum || !state.phaseTitle || !state.phaseDoc) {
  console.error('Usage: agent-loop-phase-runner.mjs <plan-dir> --status-file <path> --execution-root <dir> --runtime <runtime> --verification-runtimes <target> --phase-num <n> --phase-title <title> --phase-doc <path>');
  process.exit(64);
}

process.on('uncaughtException', (error) => {
  handleFatalPhaseRunnerError(error, 'uncaughtException');
  console.error(error.stack || error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  handleFatalPhaseRunnerError(error, 'unhandledRejection');
  console.error(error.stack || error.message);
  process.exit(1);
});

for (const signalName of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signalName, () => {
    closeoutInterruptedAttempt(signalName, 'phase-runner-signal');
    const signalNumber = os.constants.signals?.[signalName] ?? 1;
    process.exit(128 + signalNumber);
  });
}

try {
  process.exit(runPhaseAttempt());
} catch (error) {
  handleFatalPhaseRunnerError(error, 'top-level-catch');
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  console.error(normalizedError.stack || normalizedError.message);
  process.exit(1);
}
