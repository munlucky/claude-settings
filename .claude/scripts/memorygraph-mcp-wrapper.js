#!/usr/bin/env node

/**
 * MemoryGraph MCP wrapper.
 * - Uses a per-project data directory at .claude/memorygraph
 * - Injects MEMORYGRAPH_DATA_DIR without shell-specific quoting
 * - Starts the MemoryGraph MCP server without falling back to server-memory
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();
const claudeDir = path.resolve(cwd, '.claude');
const dataDir = path.resolve(claudeDir, 'memorygraph');
const isWindows = process.platform === 'win32';

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function commandWorks(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

function candidateCommands() {
  const candidates = [];

  if (process.env.MEMORYGRAPH_COMMAND) {
    candidates.push(process.env.MEMORYGRAPH_COMMAND);
  }

  candidates.push(isWindows ? 'memorygraph.exe' : 'memorygraph');
  candidates.push('memorygraph');

  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', isWindows ? 'memorygraph.exe' : 'memorygraph'));
    candidates.push(path.join(home, '.local', 'bin', 'memorygraph'));
  }

  return [...new Set(candidates.filter(Boolean))];
}

function resolveMemoryGraphCommand() {
  for (const command of candidateCommands()) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) {
      continue;
    }
    if (commandWorks(command)) {
      return command;
    }
  }

  return null;
}

ensureDataDir();

const command = resolveMemoryGraphCommand();
if (!command) {
  console.error('[memorygraph-mcp] memorygraph command not found');
  console.error('[memorygraph-mcp] install with: pipx install memorygraphMCP');
  console.error('[memorygraph-mcp] data dir:', dataDir);
  process.exit(1);
}

const child = spawn(command, [], {
  stdio: ['inherit', 'inherit', 'inherit'],
  shell: false,
  env: {
    ...process.env,
    MEMORYGRAPH_DATA_DIR: dataDir,
  },
});

child.on('error', (error) => {
  console.error('[memorygraph-mcp] failed to start memorygraph');
  console.error('[memorygraph-mcp] command:', command);
  console.error('[memorygraph-mcp] detail:', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
