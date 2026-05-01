#!/usr/bin/env node

/**
 * Codex MCP singleton launcher.
 *
 * Codex Desktop may leave old stdio MCP process trees alive when a project
 * session is re-opened or re-initialized. This wrapper keeps one process tree
 * per MCP name in the current project by terminating the previous wrapper PID
 * recorded in .claude/cache before starting a new server.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const cwd = process.cwd();
const scriptPath = fs.realpathSync(process.argv[1]);

function usage() {
  console.error('usage: node .claude/scripts/codex-mcp-singleton.mjs <name> -- <command> [args...]');
  process.exit(2);
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  if (separatorIndex <= 0 || separatorIndex === argv.length - 1) {
    usage();
  }

  const name = argv[0];
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    console.error(`[codex-mcp-singleton] invalid MCP name: ${name}`);
    process.exit(2);
  }

  return {
    name,
    command: argv[separatorIndex + 1],
    args: argv.slice(separatorIndex + 2),
  };
}

function lockPathFor(name) {
  const dir = path.resolve(cwd, '.claude', 'cache', 'codex-mcp-singleton');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.json`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
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
      // Already gone.
    }
  }
}

function waitForExit(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      return true;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return !isRunning(pid);
}

function cleanupPrevious(lockFile, name) {
  if (process.env.CODEX_MCP_SINGLETON_DISABLE_CLEANUP === '1') {
    return;
  }

  const lock = readJson(lockFile);
  if (!lock || lock.cwd !== cwd || lock.name !== name || lock.scriptPath !== scriptPath) {
    return;
  }

  if (isRunning(lock.pid)) {
    console.error(`[codex-mcp-singleton] terminating previous ${name} MCP wrapper pid=${lock.pid}`);
    killTree(lock.pid);
    if (!waitForExit(lock.pid)) {
      console.error(`[codex-mcp-singleton] previous ${name} MCP wrapper pid=${lock.pid} is still running after cleanup`);
    }
  }
}

function resolveCommand(command) {
  if (!isWindows || path.extname(command) || path.isAbsolute(command)) {
    return command;
  }

  const pathExt = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean);
  const pathEntries = (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);

  for (const dir of pathEntries) {
    for (const ext of pathExt) {
      const candidate = path.join(dir, `${command}${ext.toLowerCase()}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const upperCandidate = path.join(dir, `${command}${ext.toUpperCase()}`);
      if (fs.existsSync(upperCandidate)) {
        return upperCandidate;
      }
    }
  }

  return command;
}

function removeLockIfOwned(lockFile) {
  const lock = readJson(lockFile);
  if (lock?.pid === process.pid) {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Best effort cleanup.
    }
  }
}

const { name, command, args } = parseArgs(process.argv.slice(2));
const lockFile = lockPathFor(name);

cleanupPrevious(lockFile, name);
writeJson(lockFile, {
  name,
  pid: process.pid,
  cwd,
  scriptPath,
  command,
  args,
  startedAt: new Date().toISOString(),
  host: os.hostname(),
});

const child = spawn(resolveCommand(command), args, {
  cwd,
  env: process.env,
  shell: false,
  stdio: ['inherit', 'inherit', 'inherit'],
  windowsHide: true,
  detached: !isWindows,
});

writeJson(lockFile, {
  name,
  pid: process.pid,
  childPid: child.pid,
  cwd,
  scriptPath,
  command,
  args,
  startedAt: new Date().toISOString(),
  host: os.hostname(),
});

child.on('error', (error) => {
  console.error(`[codex-mcp-singleton] failed to start ${name}: ${error.message}`);
  removeLockIfOwned(lockFile);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  removeLockIfOwned(lockFile);
  if (signal) {
    process.exit(128);
  }
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    killTree(child.pid);
    removeLockIfOwned(lockFile);
    process.exit(128);
  });
}
