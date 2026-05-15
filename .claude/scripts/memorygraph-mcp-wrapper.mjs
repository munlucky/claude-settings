#!/usr/bin/env node

/**
 * Stable MemoryGraph MCP wrapper.
 *
 * The Codex app may keep an MCP transport alive longer than the project
 * workspace. This wrapper pins the MemoryGraph environment, records startup
 * diagnostics, and cleans up only the child process tree it owns.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveLegacyClaudeStatePath, resolveRuntimeStatePath } from './lib/runtime-state-root.mjs';

const cwd = process.cwd();
const dataDir = path.resolve(process.env.MEMORYGRAPH_DATA_DIR || resolveRuntimeStatePath('memorygraph'));
const legacyDataDir = resolveLegacyClaudeStatePath('memorygraph');
const sqlitePath = path.resolve(dataDir, 'memory.db');
const logDir = path.resolve(process.env.MEMORYGRAPH_LOG_DIR || resolveRuntimeStatePath('logs', 'memorygraph'));
const logPath = path.join(logDir, 'mcp-wrapper.log');
const isWindows = process.platform === 'win32';
const startupHealthTimeoutMs = Number(process.env.MEMORYGRAPH_STARTUP_HEALTH_TIMEOUT_MS || 10000);

let child = null;
let shuttingDown = false;
const diagnostics = [];

function ensureDirs() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
}

function appendLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line);
}

function wrapperEnv() {
  return {
    ...process.env,
    MEMORY_SQLITE_PATH: sqlitePath,
    MEMORYGRAPH_DATA_DIR: dataDir,
    MEMORYGRAPH_LEGACY_DATA_DIR: legacyDataDir,
  };
}

function candidateCommands() {
  const candidates = [];

  if (process.env.MEMORYGRAPH_COMMAND) {
    candidates.push(process.env.MEMORYGRAPH_COMMAND);
  }

  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', isWindows ? 'memorygraph.exe' : 'memorygraph'));
    candidates.push(path.join(home, 'pipx', 'venvs', 'memorygraphmcp', 'Scripts', 'memorygraph.exe'));
    candidates.push(path.join(home, '.local', 'bin', 'memorygraph'));
  }

  candidates.push(isWindows ? 'memorygraph.exe' : 'memorygraph');
  candidates.push('memorygraph');
  return [...new Set(candidates.filter(Boolean))];
}

function commandWorks(command) {
  const result = spawnSync(command, ['--health', '--health-json'], {
    cwd,
    env: wrapperEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    timeout: startupHealthTimeoutMs,
    windowsHide: true,
  });
  if (result.status === 0) {
    appendLog(`health ok command=${command} stdout=${String(result.stdout || '').trim()}`);
    return true;
  }
  diagnostics.push({
    command,
    status: result.status,
    signal: result.signal,
    error: result.error?.message || '',
    stderr: String(result.stderr || '').trim().slice(0, 500),
    stdout: String(result.stdout || '').trim().slice(0, 500),
  });
  return false;
}

function resolveMemoryGraphCommand() {
  for (const command of candidateCommands()) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) {
      diagnostics.push({
        command,
        status: 'missing',
        signal: '',
        error: 'absolute path does not exist',
        stderr: '',
        stdout: '',
      });
      continue;
    }
    if (commandWorks(command)) {
      return command;
    }
  }

  return null;
}

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killTree(pid) {
  if (!isRunning(pid)) {
    return;
  }
  if (isWindows) {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already exited.
    }
  }
}

function cleanupOwnedChild(reason) {
  if (!child || shuttingDown) {
    return;
  }
  shuttingDown = true;
  const pid = child.pid;
  appendLog(`cleanup reason=${reason} pid=${pid}`);
  if (isRunning(pid)) {
    killTree(pid);
  }
}

function writeStartupFailure() {
  appendLog('memorygraph command not found or startup health failed');
  for (const item of diagnostics) {
    appendLog([
      `candidate=${item.command}`,
      `status=${item.status}`,
      item.signal ? `signal=${item.signal}` : '',
      item.error ? `error=${item.error}` : '',
      item.stderr ? `stderr=${item.stderr}` : '',
      item.stdout ? `stdout=${item.stdout}` : '',
    ].filter(Boolean).join(' | '));
  }
}

ensureDirs();

const command = resolveMemoryGraphCommand();
if (!command) {
  writeStartupFailure();
  console.error('[memorygraph-mcp] memorygraph command not found or startup health failed');
  console.error('[memorygraph-mcp] log:', logPath);
  process.exit(1);
}

appendLog(`starting command=${command} cwd=${cwd} sqlite=${sqlitePath}`);

child = spawn(command, [], {
  cwd,
  env: wrapperEnv(),
  stdio: ['inherit', 'inherit', 'pipe'],
  shell: false,
  windowsHide: true,
});

child.stderr.on('data', (chunk) => {
  const text = chunk.toString('utf8');
  fs.appendFileSync(logPath, text);
  process.stderr.write(text);
});

child.on('error', (error) => {
  appendLog(`child error command=${command} detail=${error.message}`);
  console.error('[memorygraph-mcp] failed to start memorygraph');
  console.error('[memorygraph-mcp] command:', command);
  console.error('[memorygraph-mcp] detail:', error.message);
  cleanupOwnedChild('child-error');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  appendLog(`child exit code=${code ?? ''} signal=${signal || ''}`);
  child = null;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanupOwnedChild(signal);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

process.on('exit', () => {
  cleanupOwnedChild('parent-exit');
});
