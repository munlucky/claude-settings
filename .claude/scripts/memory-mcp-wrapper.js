#!/usr/bin/env node

/**
 * Memory MCP wrapper.
 * - Resolves a per-project memory file from the current working directory
 * - Repairs missing or malformed memory.json before launch
 * - Starts server-memory with OS-safe command resolution
 *
 * Works in Node ESM projects on macOS, Linux, and Windows.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();
const claudeDir = path.resolve(cwd, '.claude');
const memoryFilePath = path.resolve(claudeDir, 'memory.json');
const emptyGraph = () => ({
  entities: [],
  relations: [],
});

function writeMemoryFile(filePath, graph) {
  fs.writeFileSync(filePath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

function ensureMemoryFile(filePath) {
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    writeMemoryFile(filePath, emptyGraph());
    console.error(`[memory-mcp] created ${filePath}`);
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    writeMemoryFile(filePath, emptyGraph());
    console.error(`[memory-mcp] initialized empty ${filePath}`);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(parsed.entities) ||
      !Array.isArray(parsed.relations)
    ) {
      throw new Error('memory.json must contain { entities: [], relations: [] }');
    }
  } catch (error) {
    const backupPath = `${filePath}.broken-${Date.now()}.bak`;
    fs.copyFileSync(filePath, backupPath);
    writeMemoryFile(filePath, emptyGraph());
    console.error(
      `[memory-mcp] repaired malformed memory file and backed it up to ${backupPath}`,
    );
    console.error(`[memory-mcp] original parse error: ${error.message}`);
  }
}

ensureMemoryFile(memoryFilePath);

const env = {
  ...process.env,
  MEMORY_FILE_PATH: memoryFilePath,
};

const isWindows = process.platform === 'win32';
const idleTimeoutMs = Number.parseInt(process.env.MEMORY_MCP_IDLE_TIMEOUT_MS ?? '900000', 10);

function npmRootGlobal() {
  const result = spawnSync('npm', ['root', '-g'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function fallbackServerMemoryCommand() {
  return isWindows
    ? {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npx', '-y', '@modelcontextprotocol/server-memory'],
    }
    : {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    };
}

function resolveServerMemoryCommand() {
  const candidateRoots = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'node_modules') : '',
    npmRootGlobal(),
  ].filter(Boolean);

  for (const root of candidateRoots) {
    const entry = path.join(root, '@modelcontextprotocol', 'server-memory', 'dist', 'index.js');
    if (fs.existsSync(entry)) {
      return {
        command: process.execPath,
        args: [entry],
      };
    }
  }

  return fallbackServerMemoryCommand();
}

let { command, args } = resolveServerMemoryCommand();

function spawnServerMemory(commandToRun, argsToRun) {
  return spawn(commandToRun, argsToRun, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    shell: false,
  });
}

let child;
try {
  child = spawnServerMemory(command, args);
} catch (error) {
  const fallback = fallbackServerMemoryCommand();
  if (command === fallback.command && args.join('\0') === fallback.args.join('\0')) {
    throw error;
  }
  console.error(`[memory-mcp] direct server-memory launch failed; falling back to npx (${error.message})`);
  command = fallback.command;
  args = fallback.args;
  child = spawnServerMemory(command, args);
}

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
    console.error(`[memory-mcp] idle timeout after ${idleTimeoutMs}ms; terminating server-memory`);
    terminateChildTree();
    exitWithChildStatus(0, null);
  }, idleTimeoutMs);
  if (typeof idleTimer.unref === 'function') {
    idleTimer.unref();
  }
}

function terminateChildTree() {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Child already exited.
  }
}

function exitWithChildStatus(code, signal) {
  if (exiting) {
    return;
  }
  exiting = true;

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
  terminateChildTree();
  exitWithChildStatus(0, null);
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
    terminateChildTree();
    exitWithChildStatus(128 + (os.constants.signals?.[signalName] ?? 1), null);
  });
}

child.on('error', (error) => {
  console.error('[memory-mcp] failed to start server-memory');
  console.error('[memory-mcp] command:', command, args.join(' '));
  console.error('[memory-mcp] detail:', error.message);
  terminateChildTree();
  process.exit(1);
});

child.on('exit', (code, signal) => {
  exitWithChildStatus(code, signal);
});

resetIdleTimer();
