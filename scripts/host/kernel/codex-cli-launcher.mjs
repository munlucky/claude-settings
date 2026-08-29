import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { cleanupWindowsTimeoutProcessTree, readWindowsProcessTable } from '../../kernel/proof/process-tree.mjs';
import {
  resolveObservedCodexSessionConfig as resolveObservedCodexSessionConfigFromEvents,
} from './codex-session-observer.mjs';
import {
  buildCodexChildEnvironment,
  preflightCodexRuntime,
} from './codex-runtime.mjs';

const CODEX_LAUNCH_PROFILES = new Set(['plan', 'review', 'batch']);

const codexProfileArgs = (profile) => {
  if (!profile || profile === 'default') return [];
  if (!CODEX_LAUNCH_PROFILES.has(profile)) throw new Error(`codex_profile_unknown: ${profile}`);
  return ['--profile', profile];
};

export const CODEX_REVIEW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          category: { type: 'string', enum: ['contract', 'architecture', 'implementation', 'security', 'verification'] },
          path: { type: ['string', 'null'] },
          summary: { type: 'string' },
          requiredAction: { type: 'string', enum: ['fix', 'replan', 'block'] },
        },
        required: ['severity', 'category', 'path', 'summary', 'requiredAction'],
        additionalProperties: false,
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'risks', 'evidenceRefs'],
  additionalProperties: false,
});

const parseJsonLines = (text) => String(text || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });

export const resolveObservedCodexModel = (events = []) => {
  return resolveObservedCodexSessionConfigFromEvents(events).model;
};

const codexSessionDateDirectories = (sessionsRoot, startedAt = new Date()) => {
  const directories = new Set();
  for (const offset of [-86_400_000, 0, 86_400_000]) {
    const date = new Date(startedAt.getTime() + offset);
    const local = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    const utc = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    for (const [year, month, day] of [local, utc]) {
      directories.add(path.join(sessionsRoot, String(year), String(month).padStart(2, '0'), String(day).padStart(2, '0')));
    }
  }
  return [...directories];
};

const findCodexSessionRollout = async ({ threadId, env, startedAt }) => {
  if (!/^[0-9a-f-]{16,}$/i.test(String(threadId || ''))) return null;
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const suffix = `${threadId}.jsonl`;
  for (const directory of codexSessionDateDirectories(path.join(codexHome, 'sessions'), startedAt)) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { continue; }
    const match = entries.find((entry) => entry.isFile() && entry.name.endsWith(suffix));
    if (match) return path.join(directory, match.name);
  }
  return null;
};

export const resolveObservedCodexSessionConfig = async ({ threadId, env = process.env, startedAt = new Date() } = {}) => {
  const rolloutPath = await findCodexSessionRollout({ threadId, env, startedAt });
  if (!rolloutPath) return null;
  let identityMatched = false;
  let observed = {
    model: null,
    effort: null,
    approvalPolicy: null,
    sandboxPolicy: null,
    permissionProfile: null,
  };
  const lines = readline.createInterface({ input: createReadStream(rolloutPath), crlfDelay: Infinity });
  for await (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'session_meta') {
      const sessionId = event?.payload?.session_id ?? event?.payload?.id;
      identityMatched = sessionId === threadId;
    }
    const current = resolveObservedCodexSessionConfigFromEvents([event]);
    observed = {
      model: current.model || observed.model,
      effort: current.effort || observed.effort,
      approvalPolicy: event?.type === 'turn_context'
        ? event?.payload?.approval_policy ?? observed.approvalPolicy
        : observed.approvalPolicy,
      sandboxPolicy: event?.type === 'turn_context'
        ? event?.payload?.sandbox_policy ?? observed.sandboxPolicy
        : observed.sandboxPolicy,
      permissionProfile: event?.type === 'turn_context'
        ? event?.payload?.permission_profile ?? observed.permissionProfile
        : observed.permissionProfile,
    };
  }
  return identityMatched ? Object.freeze(observed) : null;
};

export const resolveObservedCodexSessionModel = async (options = {}) =>
  (await resolveObservedCodexSessionConfig(options))?.model || null;

const assertReviewOutcome = (value) => {
  if (!value || typeof value !== 'object' || !['pass', 'fail', 'blocked'].includes(value.verdict)) {
    throw new Error('codex_review_output_invalid: verdict must be pass, fail, or blocked');
  }
  for (const field of ['findings', 'risks', 'evidenceRefs']) {
    if (!Array.isArray(value[field])) throw new Error(`codex_review_output_invalid: ${field} must be an array`);
  }
  return value;
};

const reviewPrompt = ({ executionContract, executionCapsule }) => [
  'Perform the independent Kernel review described below.',
  'You are a read-only reviewer. Do not edit files, run mutating commands, or invoke Kernel commands.',
  'Inspect the current workspace and return only the JSON object required by the supplied output schema.',
  'A pass verdict requires every reviewed acceptance claim to be supported by the current files and evidence.',
  '',
  'EXECUTION CONTRACT',
  JSON.stringify(executionContract || {}, null, 2),
  '',
  'REVIEW CAPSULE',
  JSON.stringify(executionCapsule || {}, null, 2),
].join('\n');

export const CODEX_WORKER_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['completed', 'blocked', 'failed'] },
    summary: { type: 'string' },
    changedPaths: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    verifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          obligationId: { type: 'string' },
          commandRef: { type: 'string' },
          acceptanceCoverage: { type: 'array', items: { type: 'string' } },
        },
        required: ['obligationId', 'commandRef', 'acceptanceCoverage'],
        additionalProperties: false,
      },
    },
    requestedVerifications: { type: 'array', items: { type: 'string' } },
    judgments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          obligationId: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'fail'] },
          reviewReceiptId: { type: ['string', 'null'] },
          acceptanceCoverage: { type: 'array', items: { type: 'string' } },
        },
        required: ['obligationId', 'verdict', 'reviewReceiptId', 'acceptanceCoverage'],
        additionalProperties: false,
      },
    },
    knowledgeObservations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposedType: { type: 'string' },
          statement: { type: 'string' },
          scope: { type: 'array', items: { type: 'string' } },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
        required: ['proposedType', 'statement', 'scope', 'evidenceRefs'],
        additionalProperties: false,
      },
    },
    blocker: { type: ['string', 'null'] },
  },
  required: ['status', 'summary', 'changedPaths', 'risks', 'verifications', 'requestedVerifications', 'judgments', 'knowledgeObservations', 'blocker'],
  additionalProperties: false,
});

const workerPrompt = ({ executionContract, executionCapsule }) => [
  'Perform the bounded Kernel worker action described below.',
  'You are a child actor assigned by the Host. Do not invoke Kernel next/report commands, do not delegate to another agent, and do not claim completion authority.',
  'Use only the supplied execution contract and capsule. Apply the requested workspace changes when the permissions allow them.',
  'Return only the JSON object required by the supplied output schema. Include every verification, risk, judgment, and reusable knowledge observation needed by the parent orchestrator.',
  'Report verification requests in the structured verifications array. Copy the exact obligationId, one exact commandRef from allowedCommandRefs, and exact acceptance IDs from acceptanceIds in WORKER CAPSULE.verification.obligations. Never invent, rename, infer, or substitute these IDs. When using structured verifications, set legacy requestedVerifications to [].',
  '',
  'EXECUTION CONTRACT',
  JSON.stringify(executionContract || {}, null, 2),
  '',
  'WORKER CAPSULE',
  JSON.stringify(executionCapsule || {}, null, 2),
].join('\n');

const assertWorkerOutcome = (value) => {
  if (!value || typeof value !== 'object' || !['completed', 'blocked', 'failed'].includes(value.status)) {
    throw new Error('codex_worker_output_invalid: status must be completed, blocked, or failed');
  }
  for (const field of ['changedPaths', 'risks', 'requestedVerifications', 'judgments', 'knowledgeObservations']) {
    if (!Array.isArray(value[field])) throw new Error(`codex_worker_output_invalid: ${field} must be an array`);
  }
  if (typeof value.summary !== 'string' || (value.blocker !== null && typeof value.blocker !== 'string')) {
    throw new Error('codex_worker_output_invalid: summary and blocker have invalid types');
  }
  return value;
};

const resolveNativeSpawnAgent = ({ spawnAgent = null, host = globalThis } = {}) => {
  if (typeof spawnAgent === 'function') return spawnAgent;
  if (typeof host?.spawn_agent === 'function') return host.spawn_agent.bind(host);
  if (typeof host?.spawnAgent === 'function') return host.spawnAgent.bind(host);
  if (typeof host?.codex?.spawn_agent === 'function') return host.codex.spawn_agent.bind(host.codex);
  if (typeof host?.codex?.spawnAgent === 'function') return host.codex.spawnAgent.bind(host.codex);
  return null;
};

const firstNativeValue = (values) => values.find((value) => value !== undefined && value !== null && String(value).trim()) ?? null;

// The Codex App Host may expose the native `spawn_agent` bridge to the Kernel
// process. Keeping this bridge in the Host layer makes the model/effort request
// concrete while leaving the provider-neutral Kernel Core unaware of Codex ids.
// If the bridge is absent, the adapter selects the bounded CLI worker instead.
export const createCodexNativeAgentLauncher = ({ spawnAgent = null, host = globalThis } = {}) => {
  const dispatch = resolveNativeSpawnAgent({ spawnAgent, host });
  if (!dispatch) return null;
  return async ({ invocation, executionCapsule, executionContract, parentSessionId = null, actorRoute = null, childSession = null, workingDirectory = null, concurrencyGroup = null }) => {
    if (!invocation?.model || !invocation?.effort) throw new Error('codex_native_worker_requires_explicit_model_and_effort');
    const reviewer = actorRoute?.role === 'reviewer';
    const handle = await dispatch({
      task_name: `kernel_${actorRoute?.role || 'worker'}`,
      model: invocation.model,
      reasoning_effort: invocation.effort,
      message: reviewer
        ? reviewPrompt({ executionContract, executionCapsule })
        : workerPrompt({ executionContract, executionCapsule }),
      execution_contract: executionContract || null,
      execution_capsule: executionCapsule || null,
      parent_session_id: parentSessionId,
      child_session: childSession || { canDelegate: false, canCommit: false },
      working_directory: workingDirectory,
      concurrency_group: concurrencyGroup,
    });
    const completed = typeof handle?.waitForOutcome === 'function'
      ? await handle.waitForOutcome()
      : typeof handle?.wait === 'function'
        ? await handle.wait()
        : typeof handle?.result === 'function'
          ? await handle.result()
          : null;
    const candidate = {
      ...(handle && typeof handle === 'object' ? handle : {}),
      ...(completed && typeof completed === 'object' ? completed : {}),
      ...(completed?.result && typeof completed.result === 'object' ? completed.result : {}),
    };
    const outcome = candidate.outcome || candidate.report || null;
    if (outcome) {
      if (reviewer) assertReviewOutcome(outcome);
      else assertWorkerOutcome(outcome);
    }
    // A native Host must return terminal/session telemetry or an equivalent
    // observed config. Handle fields such as `model` are not evidence: they
    // can merely echo the requested invocation. Missing telemetry therefore
    // stays null and the adapter fails closed instead of claiming enforcement.
    const terminalEvents = Array.isArray(candidate.terminalEvents)
      ? candidate.terminalEvents
      : Array.isArray(candidate.events) ? candidate.events : [];
    const terminalConfig = resolveObservedCodexSessionConfigFromEvents(terminalEvents);
    const observedConfig = candidate.observedSessionConfig || candidate.observedConfig || terminalConfig;
    const resolvedModel = firstNativeValue([
      observedConfig?.model,
    ]);
    const resolvedEffort = firstNativeValue([
      observedConfig?.effort,
      observedConfig?.reasoning_effort,
      observedConfig?.reasoningEffort,
    ]);
    const sessionId = firstNativeValue([
      candidate.sessionId,
      candidate.session_id,
      candidate.actorSessionId,
      candidate.actor_session_id,
      candidate.threadId,
      candidate.thread_id,
    ]);
    return {
      ...candidate,
      status: candidate.status || (outcome?.status === 'completed' ? 'completed' : outcome?.status || 'completed'),
      resultStatus: candidate.resultStatus || (candidate.status === 'failed' || outcome?.status === 'failed' ? 'failed' : 'completed'),
      resolvedModel,
      resolvedEffort,
      observedSessionConfig: { model: resolvedModel, effort: resolvedEffort },
      observedModel: resolvedModel,
      observedEffort: resolvedEffort,
      effortObserved: Boolean(resolvedEffort),
      sessionId,
      outcome: outcome || null,
      report: reviewer ? null : candidate.report || (outcome && candidate.outcome ? outcome : null),
    };
  };
};

const resolveWindowsCodexScript = (command, env) => {
  if (path.extname(command).toLowerCase() === '.ps1' && path.isAbsolute(command) && existsSync(command)) return command;
  for (const directory of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, 'codex.ps1');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('codex_review_dispatch_failed: codex.ps1 was not found on PATH');
};

const CODEX_TERMINAL_OUTPUT_WAIT_MS = 250;
const CODEX_TERMINAL_CLEANUP_WAIT_MS = 250;
const CODEX_TERMINAL_CLEANUP_POLL_MS = 10;
export const CODEX_REVIEW_TIMEOUT_MS = 600_000;
export const CODEX_WORKER_TIMEOUT_MS = 600_000;
export const CODEX_WORKSPACE_WRITE_PROBE_TIMEOUT_MS = 15_000;

const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
};

const launcherCleanupError = (message, reason = null) => {
  const error = new Error(reason ? `${message}: ${reason}` : message);
  // A caller must not remove the output/schema files while cleanup is
  // unverified: the child may still be running and could retain or rewrite
  // those paths after the launcher returns.
  error.preserveLauncherArtifacts = true;
  error.code = 'codex_launcher_cleanup_failed';
  error.errorCode = error.code;
  error.failureCategory = 'provider/infrastructure';
  error.failureStage = 'launcher-cleanup';
  return error;
};

const launcherTimeoutError = (timeoutMs, cleanup) => Object.assign(
  new Error(`codex_review_timeout after ${timeoutMs}ms; cleanup=${cleanup.status}; lineage=${cleanup.lineageSource || 'cleanup-snapshot'}`),
  {
    code: 'codex_cli_timeout',
    errorCode: 'codex_cli_timeout',
    failureCategory: 'provider/infrastructure',
    failureStage: 'worker-timeout',
    details: {
      timeoutMs,
      cleanupStatus: cleanup.status,
      cleanupClassification: cleanup.classification || null,
      lineageSource: cleanup.lineageSource || 'cleanup-snapshot',
      survivors: Array.isArray(cleanup.survivors) ? cleanup.survivors.length : null,
    },
  },
);

export const runCodexReviewProcess = ({
  command,
  args,
  input,
  cwd,
  env,
  timeoutMs,
  spawnImpl = spawn,
  platform = process.platform,
  resolveWindowsScript = resolveWindowsCodexScript,
  cleanupWindowsProcessTree = cleanupWindowsTimeoutProcessTree,
  captureWindowsProcessTable = readWindowsProcessTable,
  outputPath = null,
  terminalOutputWaitMs = CODEX_TERMINAL_OUTPUT_WAIT_MS,
  terminalCleanupWaitMs = CODEX_TERMINAL_CLEANUP_WAIT_MS,
  terminalCleanupPollMs = CODEX_TERMINAL_CLEANUP_POLL_MS,
}) => new Promise((resolve, reject) => {
  const startedAt = new Date();
  const commandExtension = path.extname(command).toLowerCase();
  const windowsScript = platform === 'win32' && (commandExtension === '.ps1' || (!path.isAbsolute(command) && !commandExtension))
    ? resolveWindowsScript(command, env)
    : null;
  const launchCommand = windowsScript ? 'powershell.exe' : command;
  const launchArgs = windowsScript
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsScript, ...args]
    : args;
  const child = spawnImpl(launchCommand, launchArgs, {
    cwd,
    env,
    windowsHide: true,
    shell: false,
  });
  let launchProcessTable = null;
  if (platform === 'win32' && child.pid) {
    try {
      launchProcessTable = captureWindowsProcessTable();
    } catch (error) {
      launchProcessTable = { status: 'unavailable', processes: [], reason: error?.message || 'launch-process-table-capture-failed' };
    }
  }
  const launcherEvidence = Object.freeze({
    pid: child.pid || null,
    parentPid: process.pid,
    command: launchCommand,
    args: windowsScript ? [windowsScript] : [],
    startedAt: startedAt.toISOString(),
  });
  // Passing the review prompt over stdin avoids Windows PowerShell's script
  // argument re-tokenization and gives codex.ps1 the EOF it requires.
  child.stdin?.on('error', () => {});
  child.stdin?.end(input);
  let stdout = '';
  let stderr = '';
  let settled = false;
  let closeObserved = false;
  let closeCode;
  let closeSignal;
  let threadStarted = false;
  let terminalCompleted = false;
  let failedTerminal = false;
  let terminalCleanupInProgress = false;
  let timeoutCleanupInProgress = false;
  let pendingStdout = '';
  let terminalCheckInFlight = false;
  const append = (current, chunk) => `${current}${chunk}`.slice(-4_000_000);
  const numericWait = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback;
  const outputWaitMs = numericWait(terminalOutputWaitMs, CODEX_TERMINAL_OUTPUT_WAIT_MS);
  const cleanupWaitMs = numericWait(terminalCleanupWaitMs, CODEX_TERMINAL_CLEANUP_WAIT_MS);
  const cleanupPollMs = Math.max(1, numericWait(terminalCleanupPollMs, CODEX_TERMINAL_CLEANUP_POLL_MS));
  const outputArtifactAvailable = async () => {
    if (!outputPath) return false;
    try {
      const artifact = await readFile(outputPath, 'utf8');
      if (!artifact.trim()) return false;
      JSON.parse(artifact);
      return true;
    } catch {
      return false;
    }
  };
  child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
  let timer = null;
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    callback(value);
  };
  const waitForClose = (waitMs) => new Promise((waitResolve) => {
    if (closeObserved) {
      waitResolve(true);
      return;
    }
    let finished = false;
    const finish = (observed) => {
      if (finished) return;
      finished = true;
      clearTimeout(waitTimer);
      child.removeListener?.('close', onClose);
      waitResolve(observed);
    };
    const onClose = () => finish(true);
    const waitTimer = setTimeout(() => finish(false), waitMs);
    child.once('close', onClose);
  });
  const requestUnixCleanup = async () => {
    if (typeof child.kill !== 'function') return { status: 'failed', reason: 'child-kill-unavailable' };
    try {
      const requested = child.kill('SIGTERM');
      if (requested === false) return { status: 'completed', closeObserved, closeCode, closeSignal };
    } catch (error) {
      return { status: 'failed', reason: error?.message || 'child-kill-failed' };
    }

    // Test doubles without an OS pid cannot be checked through the process
    // table. The successful kill request is the strongest cleanup proof that
    // such a double can provide; real ChildProcess instances always have a
    // pid and take the bounded close/aliveness checks below.
    if (!child.pid) return { status: 'completed', closeObserved, closeCode, closeSignal };
    if (!processIsAlive(child.pid)) return { status: 'completed', closeObserved, closeCode, closeSignal };
    if (await waitForClose(cleanupWaitMs)) return { status: 'completed', closeObserved, closeCode, closeSignal };

    try {
      const requested = child.kill('SIGKILL');
      if (requested === false) return { status: 'completed', closeObserved, closeCode, closeSignal };
    } catch (error) {
      return { status: 'failed', reason: error?.message || 'child-force-kill-failed' };
    }
    await waitForClose(Math.min(cleanupWaitMs, 100));
    return processIsAlive(child.pid)
      ? { status: 'failed', reason: 'child-survived-terminal-cleanup' }
      : { status: 'completed', closeObserved, closeCode, closeSignal };
  };
  const requestWindowsCleanup = () => {
    try {
      const cleanup = cleanupWindowsProcessTree({
        launcherPid: child.pid,
        expectedCommand: launchCommand,
        expectedArgs: windowsScript ? [windowsScript] : [],
        startedAt,
        platform,
        launchProcessTable,
        launcherEvidence,
      });
      return cleanup.status === 'completed'
        ? { ...cleanup, status: 'completed', closeObserved, closeCode, closeSignal }
        : { ...cleanup, status: 'failed', reason: cleanup.reason || cleanup.status };
    } catch (error) {
      return { status: 'failed', reason: error?.message || 'process-tree-cleanup-failed' };
    }
  };
  const requestCleanup = () => platform === 'win32' && child.pid ? requestWindowsCleanup() : requestUnixCleanup();
  const terminalOutputReady = async () => {
    const deadline = Date.now() + outputWaitMs;
    do {
      if (settled || closeObserved || failedTerminal) return false;
      if (await outputArtifactAvailable()) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((waitResolve) => setTimeout(waitResolve, Math.min(cleanupPollMs, Math.max(1, deadline - Date.now()))));
    } while (!settled && !closeObserved && !failedTerminal);
    return false;
  };
  const finishAfterTerminal = async () => {
    if (terminalCheckInFlight || settled || !outputPath || !threadStarted || !terminalCompleted || failedTerminal) return;
    terminalCheckInFlight = true;
    if (!await terminalOutputReady() || settled || closeObserved || failedTerminal) return;
    terminalCleanupInProgress = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const cleanup = await requestCleanup();
    if (settled) return;
    if (cleanup.status !== 'completed') {
      settle(reject, launcherCleanupError('codex_review_terminal_cleanup_failed', cleanup.reason));
      return;
    }
    if (failedTerminal) {
      settle(reject, new Error('codex_review_dispatch_failed: failed terminal event'));
      return;
    }
    const code = closeObserved && closeCode !== null && closeCode !== undefined ? closeCode : 0;
    settle(resolve, { code, stdout, stderr, terminalCompleted: true, closeObserved });
  };
  const processEvent = (event) => {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'thread.started') threadStarted = true;
    if (event.type === 'turn.failed' || event.type === 'error') failedTerminal = true;
    if (event.type === 'turn.completed') terminalCompleted = true;
    if (terminalCompleted && threadStarted && outputPath) void finishAfterTerminal();
  };
  const processStdoutLine = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    try { processEvent(JSON.parse(trimmed)); } catch { /* launcher parsing owns malformed-line handling */ }
  };
  const consumeStdout = (chunk) => {
    stdout = append(stdout, chunk);
    pendingStdout = `${pendingStdout}${chunk}`.slice(-4_000_000);
    const lines = pendingStdout.split(/\r?\n/);
    pendingStdout = lines.pop() || '';
    for (const line of lines) processStdoutLine(line);
    // Codex normally emits newline-delimited JSON. Accept a complete final
    // object without a newline as well, while leaving partial chunks pending.
    if (pendingStdout.trim()) {
      try {
        const event = JSON.parse(pendingStdout.trim());
        pendingStdout = '';
        processEvent(event);
      } catch { /* wait for the rest of the JSON object */ }
    }
  };
  child.stdout?.on('data', consumeStdout);
  child.stdout?.on('end', () => {
    if (pendingStdout.trim()) processStdoutLine(pendingStdout);
    pendingStdout = '';
  });
  const handleTimeout = async () => {
    if (settled || timeoutCleanupInProgress) return;
    timeoutCleanupInProgress = true;
    const cleanup = await requestCleanup();
    if (settled) return;
    if (cleanup.status !== 'completed') {
      settle(reject, launcherCleanupError(`codex_review_timeout_cleanup_failed`, cleanup.reason));
      return;
    }
    settle(reject, launcherTimeoutError(timeoutMs, cleanup));
  };
  timer = setTimeout(() => { void handleTimeout(); }, timeoutMs);
  child.once('error', (error) => {
    if (timeoutCleanupInProgress) return;
    if (terminalCleanupInProgress) {
      settle(reject, launcherCleanupError('codex_review_terminal_cleanup_failed', error?.message || 'child-error-during-cleanup'));
      return;
    }
    settle(reject, error);
  });
  child.once('close', (code, signal) => {
    closeObserved = true;
    closeCode = code;
    closeSignal = signal;
    if (timeoutCleanupInProgress) return;
    if (terminalCleanupInProgress && code === null) {
      settle(resolve, { code: 0, stdout, stderr, terminalCompleted: true, closeObserved: true });
      return;
    }
    settle(resolve, { code, stdout, stderr });
  });
});

const permissionPreflightError = (code, message, details = {}) => Object.assign(new Error(message), {
  code,
  errorCode: code,
  failureCategory: 'provider/infrastructure',
  failureStage: 'pre-spawn',
  details: {
    failureCategory: 'provider/infrastructure',
    failureStage: 'pre-spawn',
    remediation: 'Run this mutating work through a Codex Host that exposes the native spawn_agent bridge, or configure a separately authenticated standalone Codex CLI whose fresh capability probe reports workspace-write. Do not use dangerous sandbox bypass flags.',
    ...details,
  },
});

const summarizePermissionProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  const fileSystem = profile.file_system && typeof profile.file_system === 'object'
    ? profile.file_system
    : null;
  const accesses = Array.isArray(fileSystem?.entries)
    ? [...new Set(fileSystem.entries.map((entry) => String(entry?.access || '').trim()).filter(Boolean))]
    : [];
  return Object.freeze({
    type: typeof profile.type === 'string' ? profile.type : null,
    fileSystemType: typeof fileSystem?.type === 'string' ? fileSystem.type : null,
    accesses,
  });
};

const permissionProfileExplicitlyReadOnly = (summary) => summary?.fileSystemType === 'restricted'
  && summary.accesses.length > 0
  && summary.accesses.every((access) => ['read', 'read-only'].includes(access.toLowerCase()));

export const probeCodexWorkspaceWriteCapability = async ({
  executable,
  invocation,
  workingDirectory,
  env,
  timeoutMs = CODEX_WORKSPACE_WRITE_PROBE_TIMEOUT_MS,
  spawnImpl = spawn,
  runProcess = runCodexReviewProcess,
  resolveSessionConfig = resolveObservedCodexSessionConfig,
} = {}) => {
  const started = Date.now();
  const args = [
    'exec', '--json', '--model', invocation.model,
    '-c', `model_reasoning_effort=${invocation.effort}`,
    '--sandbox', 'workspace-write',
    '--cd', workingDirectory, '--skip-git-repo-check',
    ...codexProfileArgs(invocation.profile),
  ];
  let processResult;
  try {
    processResult = await runProcess({
      command: executable,
      args,
      input: 'Kernel capability probe only. Do not call tools, inspect files, or modify anything. Reply with exactly KERNEL_WORKSPACE_WRITE_PROBE_OK.',
      cwd: workingDirectory,
      env,
      timeoutMs,
      spawnImpl,
    });
  } catch (error) {
    const probeFailureCode = error?.code === 'codex_cli_timeout'
      ? 'codex_worker_permission_probe_timeout'
      : 'codex_worker_permission_probe_failed';
    throw permissionPreflightError(
      probeFailureCode,
      `Codex workspace-write capability probe failed before worker dispatch (${probeFailureCode})`,
      {
        probeTimeoutMs: timeoutMs,
        cleanupStatus: error?.details?.cleanupStatus || null,
        cleanupClassification: error?.details?.cleanupClassification || null,
        lineageSource: error?.details?.lineageSource || null,
      },
    );
  }
  const events = parseJsonLines(processResult.stdout);
  const threadId = events.find((event) => event.type === 'thread.started')?.thread_id || null;
  const completed = [...events].reverse().find((event) => event.type === 'turn.completed') || null;
  const failed = [...events].reverse().find((event) => event.type === 'turn.failed' || event.type === 'error') || null;
  if (processResult.code !== 0 || failed || !threadId || !completed) {
    throw permissionPreflightError(
      'codex_worker_permission_probe_failed',
      `Codex workspace-write capability probe did not complete: exit=${processResult.code}; terminal=${failed?.type || 'missing'}`,
      { probeTimeoutMs: timeoutMs },
    );
  }
  const observed = await resolveSessionConfig({
    threadId,
    env,
    startedAt: new Date(started),
  });
  const effectiveSandbox = observed?.sandboxPolicy?.type || null;
  const effectivePermissionProfile = summarizePermissionProfile(observed?.permissionProfile);
  if (effectiveSandbox !== 'workspace-write' || permissionProfileExplicitlyReadOnly(effectivePermissionProfile)) {
    throw permissionPreflightError(
      'codex_worker_effective_permission_mismatch',
      `Codex worker requested workspace-write but the fresh capability probe observed sandbox=${effectiveSandbox || 'unobserved'}`,
      {
        probeTimeoutMs: timeoutMs,
        effectiveSandbox,
        effectiveApprovalPolicy: observed?.approvalPolicy || null,
        effectivePermissionProfile,
        probeSessionId: threadId,
      },
    );
  }
  return Object.freeze({
    status: 'verified',
    probeTimeoutMs: timeoutMs,
    effectiveSandbox,
    effectiveApprovalPolicy: observed?.approvalPolicy || null,
    effectivePermissionProfile,
    probeSessionId: threadId,
  });
};

export const createCodexCliReviewLauncher = ({
  executable = null,
  projectRoot,
  images = [],
  timeoutMs = CODEX_REVIEW_TIMEOUT_MS,
  env = process.env,
  spawnImpl = spawn,
  runtimePreflight = preflightCodexRuntime,
} = {}) => async ({ invocation, executionCapsule, executionContract }) => {
  if (!projectRoot) throw new Error('Codex CLI review launcher requires projectRoot');
  if (invocation?.sandbox !== 'read-only' || invocation?.freshSessionRequired !== true) {
    throw new Error('codex_review_requires_fresh_read_only_session');
  }
  if (!invocation.model) throw new Error('codex_review_requires_explicit_model');

  const selectedExecutable = executable || env?.CODEX_EXECUTABLE || (process.platform === 'win32' ? 'codex.ps1' : 'codex');
  const processEnv = buildCodexChildEnvironment({ env, executable: selectedExecutable });
  const runtimePreflightResult = await runtimePreflight({
    executable: selectedExecutable,
    codexHome: processEnv.CODEX_HOME,
    env: processEnv,
  });

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-review-'));
  const schemaPath = path.join(tempRoot, 'review-output.schema.json');
  const outputPath = path.join(tempRoot, 'review-output.json');
  let preserveTempRoot = false;
  try {
    await writeFile(schemaPath, JSON.stringify(CODEX_REVIEW_OUTPUT_SCHEMA, null, 2));
    const args = [
      'exec', '--json', '--model', invocation.model, '--sandbox', 'read-only',
      '-c', `model_reasoning_effort=${invocation.effort}`,
      '--cd', path.resolve(projectRoot), '--skip-git-repo-check',
      ...codexProfileArgs(invocation.profile),
      '--output-schema', schemaPath, '--output-last-message', outputPath,
    ];
    for (const image of images) args.push('--image', path.resolve(image));
    const input = reviewPrompt({ executionContract, executionCapsule });

    const started = Date.now();
    const processResult = await runCodexReviewProcess({ command: selectedExecutable, args, input, cwd: projectRoot, env: processEnv, timeoutMs, spawnImpl, outputPath });
    const events = parseJsonLines(processResult.stdout);
    const threadId = events.find((event) => event.type === 'thread.started')?.thread_id || null;
    const completed = [...events].reverse().find((event) => event.type === 'turn.completed') || null;
    const failed = [...events].reverse().find((event) => event.type === 'turn.failed' || event.type === 'error') || null;
    if (processResult.code !== 0 || failed || !threadId || !completed) {
      throw new Error(`codex_review_dispatch_failed: exit=${processResult.code}; ${failed?.message || processResult.stderr || 'missing terminal event'}`);
    }
    const outcome = assertReviewOutcome(JSON.parse(await readFile(outputPath, 'utf8')));
    const eventConfig = resolveObservedCodexSessionConfigFromEvents(events);
    const rolloutConfig = await resolveObservedCodexSessionConfig({ threadId, env: processEnv, startedAt: new Date(started) });
    const observedConfig = {
      model: eventConfig.model || rolloutConfig?.model || null,
      effort: eventConfig.effort || rolloutConfig?.effort || null,
    };
    return {
      status: 'completed',
      resultStatus: 'completed',
      resolvedModel: observedConfig.model,
      resolvedEffort: observedConfig.effort,
      observedSessionConfig: observedConfig,
      effortObserved: true,
      sessionId: threadId,
      wallClockMs: Date.now() - started,
      inputTokens: completed.usage?.input_tokens ?? null,
      cachedInputTokens: completed.usage?.cached_input_tokens ?? null,
      outputTokens: completed.usage?.output_tokens ?? null,
      runtimePreflight: runtimePreflightResult,
      outcome,
    };
  } catch (error) {
    preserveTempRoot = Boolean(error?.preserveLauncherArtifacts);
    throw error;
  } finally {
    if (!preserveTempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
};

// General implementation/debug worker launcher. Review keeps its stricter
// read-only schema above; this path is the production CLI fallback for a
// native Codex actor that is unavailable or cannot prove the requested config.
export const createCodexCliWorkerLauncher = ({
  executable = null,
  projectRoot,
  images = [],
  timeoutMs = CODEX_WORKER_TIMEOUT_MS,
  env = process.env,
  spawnImpl = spawn,
  runtimePreflight = preflightCodexRuntime,
  workspaceWritePreflight = probeCodexWorkspaceWriteCapability,
  workspaceWriteProbeTimeoutMs = CODEX_WORKSPACE_WRITE_PROBE_TIMEOUT_MS,
} = {}) => async ({ invocation, executionCapsule, executionContract, parentSessionId = null, environment = null, workingDirectory = null }) => {
  if (!projectRoot) throw new Error('Codex CLI worker launcher requires projectRoot');
  if (!invocation?.model || !invocation?.effort) throw new Error('codex_worker_requires_explicit_model_and_effort');

  // Wayfinder workers run in isolated sibling worktrees. The dispatch-time
  // directory is therefore authoritative; the constructor root is only the
  // fallback for ordinary sequential turns.
  const workerRoot = path.resolve(workingDirectory || projectRoot);
  if (!existsSync(workerRoot)) throw new Error(`codex_worker_working_directory_missing: ${workerRoot}`);

  const inheritedEnv = { ...env, ...(environment || {}) };
  const selectedExecutable = executable || inheritedEnv.CODEX_EXECUTABLE || (process.platform === 'win32' ? 'codex.ps1' : 'codex');
  const processEnv = buildCodexChildEnvironment({ env: inheritedEnv, executable: selectedExecutable });
  const runtimePreflightResult = await runtimePreflight({
    executable: selectedExecutable,
    codexHome: processEnv.CODEX_HOME,
    env: processEnv,
  });
  const requestedSandbox = invocation.sandbox || 'workspace-write';
  const permissionPreflightResult = requestedSandbox === 'workspace-write'
    ? await workspaceWritePreflight({
      executable: selectedExecutable,
      invocation: { ...invocation, sandbox: requestedSandbox },
      workingDirectory: workerRoot,
      env: processEnv,
      timeoutMs: workspaceWriteProbeTimeoutMs,
      spawnImpl,
    })
    : null;

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-worker-'));
  const schemaPath = path.join(tempRoot, 'worker-output.schema.json');
  const outputPath = path.join(tempRoot, 'worker-output.json');
  let preserveTempRoot = false;
  try {
    await writeFile(schemaPath, JSON.stringify(CODEX_WORKER_OUTPUT_SCHEMA, null, 2));
    const args = [
      'exec', '--json', '--model', invocation.model,
      '-c', `model_reasoning_effort=${invocation.effort}`,
      '--sandbox', requestedSandbox,
      '--cd', workerRoot, '--skip-git-repo-check',
      ...codexProfileArgs(invocation.profile),
      '--output-schema', schemaPath, '--output-last-message', outputPath,
    ];
    for (const image of images) args.push('--image', path.resolve(image));
    const started = Date.now();
    const processResult = await runCodexReviewProcess({
      command: selectedExecutable,
      args,
      input: workerPrompt({ executionContract, executionCapsule }),
      cwd: workerRoot,
      env: processEnv,
      timeoutMs,
      spawnImpl,
      outputPath,
    });
    const events = parseJsonLines(processResult.stdout);
    const threadId = events.find((event) => event.type === 'thread.started')?.thread_id || null;
    const completed = [...events].reverse().find((event) => event.type === 'turn.completed') || null;
    const failed = [...events].reverse().find((event) => event.type === 'turn.failed' || event.type === 'error') || null;
    if (processResult.code !== 0 || failed || !threadId || !completed) {
      throw new Error(`codex_worker_dispatch_failed: exit=${processResult.code}; ${failed?.message || processResult.stderr || 'missing terminal event'}`);
    }
    if (parentSessionId && threadId === parentSessionId) throw new Error('codex_worker_session_not_distinct');
    const outcome = assertWorkerOutcome(JSON.parse(await readFile(outputPath, 'utf8')));
    const eventConfig = resolveObservedCodexSessionConfigFromEvents(events);
    const rolloutConfig = await resolveObservedCodexSessionConfig({ threadId, env: processEnv, startedAt: new Date(started) });
    const observedConfig = {
      model: eventConfig.model || rolloutConfig?.model || null,
      effort: eventConfig.effort || rolloutConfig?.effort || null,
    };
    return {
      status: outcome.status === 'completed' ? 'completed' : outcome.status,
      resultStatus: outcome.status === 'completed' ? 'completed' : 'failed',
      resolvedModel: observedConfig.model,
      resolvedEffort: observedConfig.effort,
      observedSessionConfig: observedConfig,
      effortObserved: true,
      sessionId: threadId,
      wallClockMs: Date.now() - started,
      inputTokens: completed.usage?.input_tokens ?? null,
      cachedInputTokens: completed.usage?.cached_input_tokens ?? null,
      outputTokens: completed.usage?.output_tokens ?? null,
      runtimePreflight: runtimePreflightResult,
      permissionPreflight: permissionPreflightResult,
      outcome,
      report: outcome,
    };
  } catch (error) {
    preserveTempRoot = Boolean(error?.preserveLauncherArtifacts);
    throw error;
  } finally {
    if (!preserveTempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
};
