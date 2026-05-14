#!/usr/bin/env node

/**
 * code-review-graph MCP wrapper.
 * - Keeps the server project-scoped with --repo <cwd>
 * - Keeps usage bounded by harness policy; upstream serve exposes its supported MCP tools
 * - Cleans up the child process tree on stdin close, signals, and idle timeout
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();
const graphDir = path.resolve(cwd, '.code-review-graph');
const diagnosticsPath = path.resolve(process.env.CODE_REVIEW_GRAPH_MCP_DIAGNOSTICS_PATH || path.join(cwd, '.claude', 'logs', 'code-review-graph', 'mcp-diagnostics.jsonl'));
const unavailableCachePath = path.resolve(process.env.CODE_REVIEW_GRAPH_MCP_CACHE_PATH || path.join(cwd, '.claude', 'cache', 'code-review-graph-native-mcp-cache.json'));
const isWindows = process.platform === 'win32';
const idleTimeoutMs = Number.parseInt(process.env.CODE_REVIEW_GRAPH_MCP_IDLE_TIMEOUT_MS ?? '900000', 10);
const runId = String(process.env.PHASE_RUN_ID || process.env.MOONSHOT_RUN_ID || process.env.AGENT_LOOP_RUN_ID || 'unknown').trim() || 'unknown';
const nativeCacheKey = `code-review-graph:native_mcp:${runId}`;

function ensureGraphDir() {
  fs.mkdirSync(graphDir, { recursive: true });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function classifyNativeFailure(text = '') {
  if (/timed?\s*out|timeout/i.test(text)) {
    return 'timeout';
  }
  if (/spawn|ENOENT|not found|not recognized/i.test(text)) {
    return 'spawn_failed';
  }
  if (/protocol|jsonrpc|parse/i.test(text)) {
    return 'protocol_error';
  }
  return 'transport_closed';
}

function fallbackCommand() {
  return process.env.CODE_REVIEW_GRAPH_FALLBACK_COMMAND || `code-review-graph status --repo ${cwd}`;
}

function fallbackEvidencePath() {
  return process.env.CODE_REVIEW_GRAPH_FALLBACK_EVIDENCE_PATH || path.join(cwd, '.claude', 'logs', 'code-review-graph', 'fallback-status.log');
}

function appendDiagnostic({ nativeAttempted, nativeSuppressed, failureClass, rootCause, fallbackExitCode = 1 }) {
  const record = {
    schemaVersion: 1,
    tool: 'code-review-graph',
    transport: 'native_mcp',
    runId,
    cacheKey: nativeCacheKey,
    observedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    failureClass,
    rootCause: String(rootCause || failureClass || 'native MCP transport unavailable').slice(0, 300),
    nativeAttempted,
    nativeSuppressed,
    resetCondition: 'new_run_or_successful_native_probe',
    fallbackKind: 'cli',
    fallbackCommand: fallbackCommand(),
    fallbackExitCode,
    fallbackEvidencePath: fallbackEvidencePath(),
    fallbackRange: process.env.CODE_REVIEW_GRAPH_FALLBACK_RANGE || '',
  };
  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  fs.appendFileSync(diagnosticsPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function readUnavailableCache() {
  return readJson(unavailableCachePath) || {};
}

function cacheNativeUnavailable(record) {
  writeJson(unavailableCachePath, {
    cacheKey: nativeCacheKey,
    runId,
    observedAt: record.observedAt,
    failureClass: record.failureClass,
    rootCause: record.rootCause,
  });
}

function clearNativeUnavailableCache() {
  const current = readUnavailableCache();
  if (current.cacheKey === nativeCacheKey) {
    writeJson(unavailableCachePath, {
      cacheKey: '',
      runId,
      clearedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      reason: 'successful_native_probe',
    });
  }
}

function nativeUnavailableCached() {
  return readUnavailableCache().cacheKey === nativeCacheKey;
}

function commandWorks(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  if (result.status === 0) {
    clearNativeUnavailableCache();
    return true;
  }
  return false;
}

function candidateCommands() {
  const candidates = [];
  if (process.env.CODE_REVIEW_GRAPH_COMMAND) {
    candidates.push(process.env.CODE_REVIEW_GRAPH_COMMAND);
  }

  candidates.push(isWindows ? 'code-review-graph.exe' : 'code-review-graph');
  candidates.push('code-review-graph');

  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', isWindows ? 'code-review-graph.exe' : 'code-review-graph'));
    candidates.push(path.join(home, '.local', 'bin', 'code-review-graph'));
  }

  return [...new Set(candidates.filter(Boolean))];
}

function candidateGitBashCommands() {
  if (!isWindows) {
    return [];
  }

  return [
    process.env.GIT_BASH_COMMAND,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  ].filter(Boolean);
}

function resolveCodeReviewGraphCommand() {
  for (const command of candidateCommands()) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) {
      continue;
    }
    if (commandWorks(command)) {
      return {
        command,
        args: ['serve', '--repo', cwd],
        mode: 'direct',
      };
    }
  }

  for (const command of candidateGitBashCommands()) {
    if (!fs.existsSync(command)) {
      continue;
    }
    const result = spawnSync(command, ['-lc', 'code-review-graph --version'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      env: {
        ...process.env,
        LANG: process.env.LANG || 'C.UTF-8',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });
    if (result.status === 0) {
      return {
        command,
        args: ['-lc', 'exec code-review-graph serve --repo "$CRG_REPO"'],
        mode: 'git-bash',
      };
    }
  }

  return null;
}

function terminateChildTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (isWindows) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Child already exited.
  }
}

function exitWithChildStatus(code, signal) {
  if (signal) {
    try {
      process.kill(process.pid, signal);
      return;
    } catch {
      process.exit(1);
      return;
    }
  }
  process.exit(code ?? 0);
}

ensureGraphDir();

if (nativeUnavailableCached()) {
  const cached = readUnavailableCache();
  appendDiagnostic({
    nativeAttempted: false,
    nativeSuppressed: true,
    failureClass: cached.failureClass || 'transport_closed',
    rootCause: cached.rootCause || 'same-run native MCP unavailable cache hit',
    fallbackExitCode: Number(process.env.CODE_REVIEW_GRAPH_FALLBACK_EXIT_CODE || 1),
  });
  console.error('[code-review-graph-mcp] native MCP suppressed after same-run failure; use CLI fallback evidence');
  process.exit(1);
}

if (process.env.CODE_REVIEW_GRAPH_NATIVE_FAILURE_FIXTURE) {
  const rootCause = process.env.CODE_REVIEW_GRAPH_NATIVE_FAILURE_FIXTURE;
  const record = appendDiagnostic({
    nativeAttempted: true,
    nativeSuppressed: false,
    failureClass: classifyNativeFailure(rootCause),
    rootCause,
    fallbackExitCode: Number(process.env.CODE_REVIEW_GRAPH_FALLBACK_EXIT_CODE || 1),
  });
  cacheNativeUnavailable(record);
  console.error('[code-review-graph-mcp] native MCP failure fixture:', rootCause);
  process.exit(1);
}

const command = resolveCodeReviewGraphCommand();
if (!command) {
  const record = appendDiagnostic({
    nativeAttempted: true,
    nativeSuppressed: false,
    failureClass: 'spawn_failed',
    rootCause: 'code-review-graph command not found or version probe failed',
    fallbackExitCode: Number(process.env.CODE_REVIEW_GRAPH_FALLBACK_EXIT_CODE || 1),
  });
  cacheNativeUnavailable(record);
  console.error('[code-review-graph-mcp] code-review-graph command not found');
  console.error('[code-review-graph-mcp] install with: pipx install "code-review-graph[communities]"');
  process.exit(1);
}

const childArgs = command.args;
const child = spawn(command.command, childArgs, {
  cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
  env: {
    ...process.env,
    LANG: process.env.LANG || 'C.UTF-8',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    CRG_REPO: cwd,
  },
  windowsHide: true,
});

let exiting = false;
let idleTimer = null;

function resetIdleTimer() {
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
    return;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    console.error(`[code-review-graph-mcp] idle timeout after ${idleTimeoutMs}ms; terminating code-review-graph`);
    terminateChildTree(child);
    exitOnce(0, null);
  }, idleTimeoutMs);
  if (typeof idleTimer.unref === 'function') {
    idleTimer.unref();
  }
}

function exitOnce(code, signal) {
  if (exiting) {
    return;
  }
  exiting = true;
  terminateChildTree(child);
  exitWithChildStatus(code, signal);
}

process.stdin.on('data', (chunk) => {
  resetIdleTimer();
  if (!child.stdin.destroyed) {
    child.stdin.write(chunk);
  }
});

process.stdin.on('end', () => {
  if (!child.stdin.destroyed) {
    child.stdin.end();
  }
});

process.stdin.on('close', () => {
  exitOnce(0, null);
});

child.stdout.on('data', (chunk) => {
  resetIdleTimer();
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

for (const signalName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signalName, () => {
    exitOnce(128 + (os.constants.signals?.[signalName] ?? 1), null);
  });
}

child.on('error', (error) => {
  const record = appendDiagnostic({
    nativeAttempted: true,
    nativeSuppressed: false,
    failureClass: classifyNativeFailure(error.message),
    rootCause: error.message,
    fallbackExitCode: Number(process.env.CODE_REVIEW_GRAPH_FALLBACK_EXIT_CODE || 1),
  });
  cacheNativeUnavailable(record);
  console.error('[code-review-graph-mcp] failed to start code-review-graph');
  console.error('[code-review-graph-mcp] command:', command.command);
  console.error('[code-review-graph-mcp] detail:', error.message);
  exitOnce(1, null);
});

child.on('exit', (code, signal) => {
  if (!exiting && ((code && code !== 0) || signal)) {
    const record = appendDiagnostic({
      nativeAttempted: true,
      nativeSuppressed: false,
      failureClass: signal ? 'transport_closed' : 'protocol_error',
      rootCause: signal ? `native MCP transport closed with signal ${signal}` : `native MCP transport exited with code ${code}`,
      fallbackExitCode: Number(process.env.CODE_REVIEW_GRAPH_FALLBACK_EXIT_CODE || 1),
    });
    cacheNativeUnavailable(record);
  }
  exitOnce(code, signal);
});

resetIdleTimer();
