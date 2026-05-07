#!/usr/bin/env node

/**
 * Commit-time MemoryGraph refresh with direct fallback.
 *
 * This keeps commit-moonshot closeout independent from Codex Desktop's
 * already-attached MCP transport. A stale MCP transport becomes an observed
 * routing state, not a Git closeout blocker.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { classifyFailure } from './lib/failure-classifier.mjs';
import {
  knownUnavailableSummary,
  readUnavailableCapabilities,
  recordUnavailableCapability,
} from './lib/runtime-unavailable-cache.mjs';

const ROOT = process.cwd();
const CLAUDE_ROOT = path.join(ROOT, '.claude');
const LOG_DIR = path.join(CLAUDE_ROOT, 'logs', 'memorygraph');
const DEFAULT_SEED = path.join(CLAUDE_ROOT, 'cache', 'memorygraph', 'project-graph-seed.json');
const NODE = process.execPath;
const isWindows = process.platform === 'win32';
const PHASE_STATUS_FILE = path.join(CLAUDE_ROOT, 'docs', 'phase-status.yaml');
const MEMORYGRAPH_FINGERPRINT = classifyFailure({ code: 'memorygraph_unavailable', source: 'commit-moonshot-memory-refresh' }).fingerprint;

function printHelp() {
  process.stdout.write(`Usage: node .claude/scripts/commit-moonshot-memory-refresh.mjs [options]

Runs commit-time MemoryGraph preflight and direct fallback.

Options:
  --project-id <id>          Project id. Defaults to package name or cwd basename.
  --project-path <path>      Project path. Defaults to current working directory.
  --mcp-error <text>         Error from Codex Memory MCP, for example "Transport closed".
  --mcp-status <status>      ok | failed | skipped. Default: skipped.
  --store-json <json|@file>  store_memory payload to write through direct fallback.
  --max-files <n>            Files to index for seed refresh. Default: 500.
  --max-nodes <n>            Seed nodes to upsert. Default: 200.
  --timeout-ms <n>           Per-command timeout. Default: 30000.
  --strict                   Exit non-zero when direct fallback fails.
  --json                     Emit only JSON.
  -h, --help                 Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    mcpStatus: 'skipped',
    maxFiles: '500',
    maxNodes: '200',
    timeoutMs: '30000',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = String(argv[++i] ?? '');
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function readJsonValue(value, label) {
  const source = String(value || '').trim();
  if (!source) {
    return null;
  }
  const raw = source.startsWith('@')
    ? fs.readFileSync(path.resolve(source.slice(1)), 'utf8')
    : source;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function readPackageName() {
  const packagePath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return '';
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return typeof parsed.name === 'string' ? parsed.name : '';
  } catch {
    return '';
  }
}

function defaultProjectId() {
  return readPackageName() || path.basename(ROOT);
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
    spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
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

function runCommand(label, command, args, options) {
  const startedAt = new Date().toISOString();
  const timeoutMs = Number(options.timeoutMs || 30000);

  return new Promise((resolve) => {
    let child;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    try {
      child = spawn(command, args, {
        cwd: ROOT,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        label,
        command,
        args,
        startedAt,
        completedAt: new Date().toISOString(),
        status: null,
        signal: null,
        timedOut,
        ok: false,
        stdout,
        stderr,
        error: error.message,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        label,
        command,
        args,
        startedAt,
        completedAt: new Date().toISOString(),
        status: null,
        signal: null,
        timedOut,
        ok: false,
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on('exit', (status, signal) => {
      clearTimeout(timer);
      resolve({
        label,
        command,
        args,
        startedAt,
        completedAt: new Date().toISOString(),
        status,
        signal,
        timedOut,
        ok: status === 0 && !timedOut,
        stdout,
        stderr,
      });
    });
  });
}

function classifyMcp(options) {
  const mcpError = String(options.mcpError || '');
  if (/transport closed/i.test(mcpError)) {
    return {
      status: 'mcp_transport_failed',
      route: 'direct_fallback',
      reason: 'transport_closed',
      error: mcpError,
    };
  }
  if (options.mcpStatus === 'ok') {
    return {
      status: 'mcp_ok',
      route: 'mcp',
      reason: 'mcp_refresh_completed',
      error: '',
    };
  }
  if (options.mcpStatus === 'failed') {
    return {
      status: 'mcp_failed',
      route: 'direct_fallback',
      reason: 'mcp_failed_non_transport',
      error: mcpError,
    };
  }
  return {
    status: 'mcp_skipped',
    route: 'direct_fallback',
    reason: 'no_attached_mcp_client_in_cli_context',
    error: mcpError,
  };
}

function truncate(text) {
  return String(text || '').trim().slice(0, 2000);
}

function writeLog(summary) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(LOG_DIR, `commit-refresh-${stamp}.json`);
  fs.writeFileSync(logPath, `${JSON.stringify(summary, null, 2)}\n`);
  return logPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const projectId = options.projectId || defaultProjectId();
  const projectPath = path.resolve(options.projectPath || ROOT);
  const mcp = classifyMcp(options);
  const storePayload = readJsonValue(options.storeJson, '--store-json');
  const commands = [];
  const strictMemoryGateEnabled = Boolean(options.strict) || String(process.env.PHASE_STRICT_MEMORY_GATE ?? process.env.MEMORYGRAPH_STRICT_MODE ?? 'false').toLowerCase() === 'true';
  const cachedUnavailable = readUnavailableCapabilities(PHASE_STATUS_FILE).find((entry) => entry.code === 'memorygraph_unavailable');

  if (mcp.status === 'mcp_ok') {
    const summary = {
      status: 'mcp_ok',
      route: 'mcp',
      projectId,
      projectPath,
      mcp,
      commands,
      logPath: '',
    };
    summary.logPath = writeLog(summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (cachedUnavailable && !strictMemoryGateEnabled) {
    const summary = {
      status: 'cached_unavailable',
      route: 'cached_fallback',
      reason: 'cached_memorygraph_unavailable',
      projectId,
      projectPath,
      mcp,
      runtime: 'runtime_broken_or_unavailable',
      writeStatus: 'promotion_write_unavailable',
      denialCodes: ['memorygraph_unavailable'],
      closeoutStatus: 'non_blocking',
      storePayloadProvided: Boolean(storePayload),
      commands,
      logPath: '',
      cachedUnavailableSummary: knownUnavailableSummary(PHASE_STATUS_FILE, { code: 'memorygraph_unavailable' }),
    };
    summary.logPath = writeLog(summary);
    recordUnavailableCapability(PHASE_STATUS_FILE, {
      code: 'memorygraph_unavailable',
      fingerprint: MEMORYGRAPH_FINGERPRINT,
      source: 'commit-moonshot-memory-refresh',
      evidencePath: summary.logPath,
      strict: 'false',
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      process.stdout.write(`MemoryGraph commit refresh: ${summary.status} (${summary.reason})\n`);
      process.stdout.write(`Route: ${summary.route}; cache: ${summary.cachedUnavailableSummary}\n`);
      process.stdout.write(`Log: ${summary.logPath}\n`);
    }
    return;
  }

  const health = await runCommand('direct-health', NODE, [
    path.join(CLAUDE_ROOT, 'scripts', 'memorygraph-direct.mjs'),
    'health',
    '--json',
  ], options);
  commands.push(health);

  let finalStatus = 'direct_failed';
  let route = 'direct_fallback';
  let directReason = 'direct_health_failed';

  if (health.ok) {
    if (storePayload) {
      const payload = {
        ...storePayload,
        context: {
          ...(storePayload.context && typeof storePayload.context === 'object' ? storePayload.context : {}),
          project_id: projectId,
          project_path: projectPath,
          stage: 'commit',
          memoryMode: 'write_requested',
          memoryRefreshRoute: route,
        },
      };
      const tags = Array.isArray(payload.tags) ? payload.tags.map(String) : [];
      for (const tag of [`project:${projectId}`, 'source:moonshot']) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
      payload.tags = tags;

      const store = await runCommand('direct-store-memory', NODE, [
        path.join(CLAUDE_ROOT, 'scripts', 'memorygraph-direct.mjs'),
        'call',
        'store_memory',
        '--args-json',
        JSON.stringify(payload),
      ], options);
      commands.push(store);
      finalStatus = store.ok ? 'direct_fallback_succeeded' : 'direct_failed';
      directReason = store.ok ? 'store_memory_fallback_succeeded' : 'store_memory_fallback_failed';
    } else {
      const index = await runCommand('project-index', NODE, [
        path.join(CLAUDE_ROOT, 'scripts', 'memorygraph-project-index.mjs'),
        '--max-files',
        String(options.maxFiles || 500),
      ], options);
      commands.push(index);

      if (index.ok) {
        const refresh = await runCommand('direct-refresh-seed', NODE, [
          path.join(CLAUDE_ROOT, 'scripts', 'memorygraph-direct.mjs'),
          'refresh-seed',
          '--seed',
          DEFAULT_SEED,
          '--max-nodes',
          String(options.maxNodes || 200),
        ], options);
        commands.push(refresh);
        finalStatus = refresh.ok ? 'direct_fallback_succeeded' : 'direct_failed';
        directReason = refresh.ok ? 'seed_refresh_fallback_succeeded' : 'seed_refresh_fallback_failed';
      } else {
        directReason = 'project_index_failed';
      }
    }
  }

  const compactCommands = commands.map((command) => ({
    label: command.label,
    ok: command.ok,
    status: command.status,
    signal: command.signal,
    timedOut: command.timedOut,
    startedAt: command.startedAt,
    completedAt: command.completedAt,
    stdout: truncate(command.stdout),
    stderr: truncate(command.stderr),
    error: command.error || '',
  }));

  const denialCodes = [];
  if (mcp.status !== 'mcp_ok') {
    denialCodes.push(mcp.reason || mcp.status);
  }
  if (finalStatus === 'direct_failed') {
    denialCodes.push(directReason);
  }

  const summary = {
    status: finalStatus,
    route,
    reason: directReason,
    projectId,
    projectPath,
    mcp,
    runtime: finalStatus === 'direct_failed' ? 'runtime_broken_or_unavailable' : 'direct_runtime_ok',
    writeStatus: (mcp.status === 'mcp_ok' || finalStatus === 'direct_fallback_succeeded')
      ? 'promotion_write_available'
      : 'promotion_write_unavailable',
    denialCodes,
    closeoutStatus: options.strict && finalStatus !== 'direct_fallback_succeeded' ? 'blocked' : 'non_blocking',
    storePayloadProvided: Boolean(storePayload),
    commands: compactCommands,
    logPath: '',
  };
  summary.logPath = writeLog(summary);
  if (!health.ok || mcp.status !== 'mcp_ok') {
    recordUnavailableCapability(PHASE_STATUS_FILE, {
      code: 'memorygraph_unavailable',
      fingerprint: MEMORYGRAPH_FINGERPRINT,
      source: 'commit-moonshot-memory-refresh',
      evidencePath: summary.logPath,
      strict: strictMemoryGateEnabled ? 'true' : 'false',
    });
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`MemoryGraph commit refresh: ${summary.status} (${summary.reason})\n`);
    process.stdout.write(`Route: ${summary.route}; MCP: ${summary.mcp.status}; runtime: ${summary.runtime}\n`);
    process.stdout.write(`Log: ${summary.logPath}\n`);
  }

  if (options.strict && summary.status !== 'direct_fallback_succeeded') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const summary = {
    status: 'failed',
    route: 'direct_fallback',
    reason: 'unexpected_error',
    projectId: defaultProjectId(),
    projectPath: ROOT,
    mcp: { status: 'unknown', route: 'direct_fallback', reason: 'unexpected_error', error: '' },
    runtime: 'unknown',
    commands: [],
    error: error.stack || error.message,
    logPath: '',
  };
  summary.logPath = writeLog(summary);
  process.stderr.write(`[commit-moonshot-memory-refresh] ${error.message}\n`);
  process.stderr.write(`Log: ${summary.logPath}\n`);
  process.exitCode = 1;
});
