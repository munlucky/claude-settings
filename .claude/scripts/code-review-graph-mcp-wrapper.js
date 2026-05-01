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
const isWindows = process.platform === 'win32';
const idleTimeoutMs = Number.parseInt(process.env.CODE_REVIEW_GRAPH_MCP_IDLE_TIMEOUT_MS ?? '900000', 10);

function ensureGraphDir() {
  fs.mkdirSync(graphDir, { recursive: true });
}

function commandWorks(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  return result.status === 0;
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

const command = resolveCodeReviewGraphCommand();
if (!command) {
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
  console.error('[code-review-graph-mcp] failed to start code-review-graph');
  console.error('[code-review-graph-mcp] command:', command.command);
  console.error('[code-review-graph-mcp] detail:', error.message);
  exitOnce(1, null);
});

child.on('exit', (code, signal) => {
  exitOnce(code, signal);
});

resetIdleTimer();
