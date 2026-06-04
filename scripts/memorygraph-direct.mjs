#!/usr/bin/env node

/**
 * Direct MemoryGraph MCP client.
 *
 * Use this when Codex Desktop's already-attached memory MCP transport is closed.
 * It starts a fresh MemoryGraph stdio child process, performs a bounded tool call,
 * and exits without requiring a Codex app/session restart.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { resolveRuntimeStatePath } from './lib/runtime-state-root.mjs';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(process.env.MEMORYGRAPH_DATA_DIR || resolveRuntimeStatePath('memorygraph'));
const SQLITE_PATH = path.join(DATA_DIR, 'memory.db');
const DEFAULT_SEED = path.resolve(process.env.MEMORYGRAPH_SEED_PATH || resolveRuntimeStatePath('cache', 'memorygraph', 'project-graph-seed.json'));
const PROTOCOL_VERSION = '2025-03-26';
const isWindows = process.platform === 'win32';
const commandDiagnostics = [];

const allowedMemoryTypes = new Set([
  'task',
  'code_pattern',
  'problem',
  'solution',
  'project',
  'technology',
  'error',
  'fix',
  'command',
  'file_context',
  'workflow',
  'general',
  'conversation',
]);

function printHelp() {
  process.stdout.write(`Usage: node .claude/scripts/memorygraph-direct.mjs <command> [options]

Commands:
  health
      Run MemoryGraph CLI health against the project-local SQLite DB.

  call <tool-name> --args-json <json-or-@file>
      Call a MemoryGraph MCP tool through a fresh stdio child process.

  store --type <type> --title <title> --content <content> [--tag <tag>...]
      Store one memory through a fresh stdio child process.

  refresh-seed [--seed <path>] [--max-nodes <n>] [--relationships]
      Upsert project seed nodes from memorygraph-project-index.mjs output.

Options:
  --context-json <json-or-@file>  Context for store.
  --summary <text>                Optional store_memory summary.
  --importance <n>                Optional importance 0.0-1.0.
  --timeout-ms <n>                MCP call timeout. Default 30000.
  --memorygraph-command <path>    Override memorygraph executable.
  --json                          Emit machine-readable JSON.
  -h, --help                      Show this help.
`);
}

function parseArgs(argv) {
  const result = { command: argv[0], positionals: [], options: { tags: [] } };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.options.help = true;
      continue;
    }
    if (arg === '--json') {
      result.options.json = true;
      continue;
    }
    if (arg === '--relationships') {
      result.options.relationships = true;
      continue;
    }
    if (arg === '--tag') {
      result.options.tags.push(String(argv[++i] ?? ''));
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      result.options[key] = String(argv[++i] ?? '');
      continue;
    }
    result.positionals.push(arg);
  }

  return result;
}

function fail(message, detail) {
  process.stderr.write(`[memorygraph-direct] ${message}\n`);
  if (detail) {
    process.stderr.write(`${detail}\n`);
  }
  process.exit(1);
}

function readJsonValue(value, label) {
  const source = String(value ?? '').trim();
  if (!source) {
    fail(`${label} is required`);
  }
  const raw = source.startsWith('@')
    ? fs.readFileSync(path.resolve(source.slice(1)), 'utf8')
    : source;
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${label} must be valid JSON`, error.message);
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`failed to read JSON: ${filePath}`, error.message);
  }
}

function commandWorks(command) {
  const result = spawnSync(command, ['--health', '--health-json'], {
    cwd: ROOT,
    env: memorygraphEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    timeout: 10000,
    windowsHide: true,
  });
  if (result.status === 0) {
    return true;
  }
  commandDiagnostics.push({
    command,
    status: result.status,
    signal: result.signal,
    error: result.error?.message || '',
    stderr: String(result.stderr || '').trim().slice(0, 500),
    stdout: String(result.stdout || '').trim().slice(0, 500),
  });
  return false;
}

function candidateCommands(override) {
  const candidates = [];
  if (override) {
    candidates.push(override);
  }
  if (process.env.MEMORYGRAPH_COMMAND) {
    candidates.push(process.env.MEMORYGRAPH_COMMAND);
  }
  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', isWindows ? 'memorygraph.exe' : 'memorygraph'));
    candidates.push(path.join(home, 'pipx', 'venvs', 'memorygraphmcp', 'Scripts', 'memorygraph.exe'));
  }
  candidates.push(isWindows ? 'memorygraph.exe' : 'memorygraph');
  candidates.push('memorygraph');
  return [...new Set(candidates.filter(Boolean))];
}

function resolveMemoryGraphCommand(override) {
  commandDiagnostics.length = 0;
  for (const command of candidateCommands(override)) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) {
      commandDiagnostics.push({
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

function formatCommandDiagnostics() {
  if (!commandDiagnostics.length) {
    return '';
  }
  return commandDiagnostics
    .map((item) => {
      const detail = [
        `command=${item.command}`,
        `status=${item.status}`,
        item.signal ? `signal=${item.signal}` : '',
        item.error ? `error=${item.error}` : '',
        item.stderr ? `stderr=${item.stderr}` : '',
        item.stdout ? `stdout=${item.stdout}` : '',
      ].filter(Boolean).join(' | ');
      return `- ${detail}`;
    })
    .join('\n');
}

function memorygraphEnv() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return {
    ...process.env,
    MEMORY_SQLITE_PATH: SQLITE_PATH,
    MEMORYGRAPH_DATA_DIR: DATA_DIR,
  };
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

function runHealth(options) {
  const command = resolveMemoryGraphCommand(options.memorygraphCommand);
  if (!command) {
    fail('memorygraph command not found or health check failed', formatCommandDiagnostics());
  }

  const result = spawnSync(command, ['--health', '--health-json'], {
    cwd: ROOT,
    env: memorygraphEnv(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

  if (result.status !== 0) {
    fail('health check failed', `${result.stderr || ''}${result.stdout || ''}`.trim());
  }

  if (options.json) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return;
  }

  const parsed = JSON.parse(result.stdout);
  process.stdout.write(`MemoryGraph healthy: ${parsed.status} (${parsed.backend_type})\n`);
  process.stdout.write(`SQLite: ${parsed.db_path}\n`);
}

class DirectMcpClient {
  constructor(options) {
    this.options = options;
    this.command = resolveMemoryGraphCommand(options.memorygraphCommand);
    if (!this.command) {
      fail('memorygraph command not found or health check failed', formatCommandDiagnostics());
    }
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = '';
  }

  start() {
    this.child = spawn(this.command, [], {
      cwd: ROOT,
      env: memorygraphEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString('utf8');
    });

    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        this.stderr += `${line}\n`;
        return;
      }
      if (Object.prototype.hasOwnProperty.call(message, 'id') && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
      }
    });

    this.child.on('exit', (code, signal) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(`memorygraph exited before response: code=${code} signal=${signal || ''}\n${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  request(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const timeoutMs = Number(this.options.timeoutMs || 30000);
    const payload = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}\n${this.stderr}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, 'utf8');
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`, 'utf8');
  }

  async initialize() {
    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'moonshot-relay-memorygraph-direct',
        version: '1.0.0',
      },
    });
    this.notify('notifications/initialized', {});
  }

  async callTool(name, args) {
    return this.request('tools/call', { name, arguments: args });
  }

  async close() {
    if (!this.child || this.child.killed) {
      return;
    }
    const childPid = this.child.pid;
    this.child.stdin.end();
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (isRunning(childPid)) {
          killTree(childPid);
        }
        resolve();
      }, 1000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (isRunning(childPid)) {
      killTree(childPid);
    }
  }
}

function toolText(result) {
  return (result?.content || [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

function extractFirstMemoryId(result) {
  const text = toolText(result);
  const patterns = [
    /memory_id["']?\s*[:=]\s*["']([^"',\s]+)["']/i,
    /ID[:\s]+([0-9a-fA-F-]{8,})/,
    /([0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractSearchItems(result) {
  const text = toolText(result);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.memories)) {
      return parsed.memories;
    }
    if (Array.isArray(parsed.results)) {
      return parsed.results;
    }
  } catch {
    // Text output fallback below.
  }

  const ids = [...text.matchAll(/(?:memory_id|id)["']?\s*[:=]\s*["']([^"',\s]+)["']/gi)]
    .map((match) => ({ id: match[1], memory_id: match[1] }));
  ids.push(...[...text.matchAll(/\(ID:\s*([0-9a-fA-F-]{8,})\)/g)]
    .map((match) => ({ id: match[1], memory_id: match[1] })));
  return ids;
}

function memoryIdOf(item) {
  return item?.memory_id || item?.id || item?.memory?.id || null;
}

function normalizeSeedNode(item) {
  const type = allowedMemoryTypes.has(item.type) ? item.type : 'general';
  return {
    type,
    title: String(item.title || item.stable_key || 'Untitled memory').slice(0, 500),
    content: String(item.content || item.title || item.stable_key || ''),
    tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 50) : [],
    importance: Number.isFinite(Number(item.importance)) ? Number(item.importance) : 0.5,
    context: typeof item.context === 'object' && item.context ? item.context : {},
  };
}

async function withClient(options, fn) {
  const client = new DirectMcpClient(options);
  client.start();
  try {
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function runCall(positionals, options) {
  const toolName = positionals[0];
  if (!toolName) {
    fail('tool name is required');
  }
  const args = readJsonValue(options.argsJson, '--args-json');
  const result = await withClient(options, (client) => client.callTool(toolName, args));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runStore(options) {
  const payload = {
    type: options.type,
    title: options.title,
    content: options.content,
  };
  if (!allowedMemoryTypes.has(payload.type)) {
    fail(`unsupported memory type: ${payload.type}`);
  }
  if (!payload.title || !payload.content) {
    fail('store requires --type, --title, and --content');
  }
  if (options.summary) {
    payload.summary = options.summary;
  }
  if (options.tags.length) {
    payload.tags = options.tags.filter(Boolean);
  }
  if (options.importance) {
    payload.importance = Number(options.importance);
  }
  if (options.contextJson) {
    payload.context = readJsonValue(options.contextJson, '--context-json');
  }

  const result = await withClient(options, (client) => client.callTool('store_memory', payload));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function upsertNode(client, item) {
  const payload = normalizeSeedNode(item);
  const keyTag = payload.tags.find((tag) => tag.startsWith('key:'));
  let memoryId = null;
  let action = 'created';

  if (keyTag) {
    const searchResult = await client.callTool('search_memories', {
      tags: [keyTag],
      limit: 1,
      search_tolerance: 'strict',
    });
    memoryId = memoryIdOf(extractSearchItems(searchResult)[0]);
  }

  if (memoryId) {
    await client.callTool('update_memory', {
      memory_id: memoryId,
      title: payload.title,
      content: payload.content,
      summary: payload.summary,
      tags: payload.tags,
      importance: payload.importance,
    });
    action = 'updated';
  } else {
    const storeResult = await client.callTool('store_memory', payload);
    memoryId = extractFirstMemoryId(storeResult);
  }

  return {
    stable_key: item.stable_key,
    memory_id: memoryId,
    action,
  };
}

async function runRefreshSeed(options) {
  const seedPath = path.resolve(options.seed || DEFAULT_SEED);
  const maxNodes = Number(options.maxNodes || 200);
  const seed = readJsonFile(seedPath);
  if (!Array.isArray(seed.nodes)) {
    fail(`seed has no nodes array: ${seedPath}`);
  }

  const selectedNodes = seed.nodes.slice(0, maxNodes);
  const results = [];
  const idByStableKey = new Map();

  await withClient(options, async (client) => {
    for (const item of selectedNodes) {
      const result = await upsertNode(client, item);
      results.push(result);
      if (result.memory_id) {
        idByStableKey.set(result.stable_key, result.memory_id);
      }
    }

    if (options.relationships && Array.isArray(seed.relationships)) {
      for (const item of seed.relationships) {
        const from = idByStableKey.get(item.from_stable_key);
        const to = idByStableKey.get(item.to_stable_key);
        if (!from || !to) {
          continue;
        }
        try {
          await client.callTool('create_relationship', {
            from_memory_id: from,
            to_memory_id: to,
            relationship_type: item.relationship_type,
            context: item.context || '',
          });
        } catch {
          // Relationship creation is best-effort because rerunning a seed may duplicate edges.
        }
      }
    }
  });

  const summary = {
    seed: seedPath,
    sqlitePath: SQLITE_PATH,
    selectedNodeCount: selectedNodes.length,
    created: results.filter((item) => item.action === 'created').length,
    updated: results.filter((item) => item.action === 'updated').length,
    missingIds: results.filter((item) => !item.memory_id).length,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
  if (!command || options.help) {
    printHelp();
    return;
  }

  if (command === 'health') {
    runHealth(options);
    return;
  }
  if (command === 'call') {
    await runCall(positionals, options);
    return;
  }
  if (command === 'store') {
    await runStore(options);
    return;
  }
  if (command === 'refresh-seed') {
    await runRefreshSeed(options);
    return;
  }

  fail(`unknown command: ${command}`);
}

main().catch((error) => {
  fail(error.message);
});
