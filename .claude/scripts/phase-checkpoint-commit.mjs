#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_REFRESH_SCRIPT = path.join(SCRIPT_DIR, 'commit-moonshot-memory-refresh.mjs');

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function parseArgs(argv) {
  const [command = 'commit', ...rest] = argv;
  const options = {
    command,
    planDir: '',
    statusFile: '.claude/docs/phase-status.yaml',
    phaseNum: '',
    phaseTitle: '',
    qaReport: '',
    scorecard: '',
    json: false,
    skipMemoryRefresh: false,
  };

  while (rest.length > 0) {
    const arg = rest.shift();
    switch (arg) {
      case '--plan-dir':
        options.planDir = rest.shift() ?? '';
        break;
      case '--status-file':
        options.statusFile = rest.shift() ?? '';
        break;
      case '--phase-num':
        options.phaseNum = rest.shift() ?? '';
        break;
      case '--phase-title':
        options.phaseTitle = rest.shift() ?? '';
        break;
      case '--qa-report':
        options.qaReport = rest.shift() ?? '';
        break;
      case '--scorecard':
        options.scorecard = rest.shift() ?? '';
        break;
      case '--skip-memory-refresh':
        options.skipMemoryRefresh = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.command = 'help';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function showHelp() {
  writeStdoutLine(`Usage:
  node .claude/scripts/phase-checkpoint-commit.mjs commit --plan-dir <dir> --status-file <phase-status.yaml> --phase-num <n> --phase-title <title> [--json]
  node .claude/scripts/phase-checkpoint-commit.mjs self-test

Creates a phase checkpoint commit for non-runtime repository changes.
Memory refresh is attempted before staging, but refresh failure does not block commit.`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error || null,
  };
}

function git(args, cwd, options = {}) {
  return run('git', ['-c', `safe.directory=${cwd}`, ...args], {
    cwd,
    ...options,
  });
}

function resolveRepoRoot(cwd = process.cwd()) {
  const result = run('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr.trim() || result.error?.message || 'not a git repository');
  }
  return path.resolve(cwd, result.stdout.trim());
}

function normalizeStatusPath(rawPath) {
  return String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^"|"$/g, '')
    .trim();
}

function parseStatusPorcelain(output) {
  const entries = [];
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const status = line.slice(0, 2);
    const rest = line.slice(3);
    if (rest.includes(' -> ')) {
      const [fromPath, toPath] = rest.split(' -> ');
      entries.push({ status, path: normalizeStatusPath(toPath), originalPath: normalizeStatusPath(fromPath) });
      continue;
    }
    entries.push({ status, path: normalizeStatusPath(rest), originalPath: '' });
  }
  return entries;
}

function isRuntimeOrPrivatePath(repoPath) {
  const normalized = normalizeStatusPath(repoPath);
  if (!normalized) {
    return true;
  }

  const exact = new Set([
    '.mcp.json',
    '.claude/memory.json',
    '.claude/docs/phase-status.yaml',
    '.claude/worktree-prepare.json',
    '.claude/worktree-setup.log',
    '.claude/worktree-baseline.log',
  ]);
  if (exact.has(normalized)) {
    return true;
  }

  const prefixes = [
    '.agents/',
    '.claude/memorygraph/',
    '.claude/cache/memorygraph/',
    '.claude/logs/',
    '.tmp/',
  ];
  if (prefixes.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  const basenames = [
    '.claude/runtime-state.sqlite',
    '.claude/runtime-state.sqlite-shm',
    '.claude/runtime-state.sqlite-wal',
  ];
  if (basenames.includes(normalized)) {
    return true;
  }

  return /^\.claude\/(verification-results-|verification-verdict-|runtime-verdict-|knowledge-repo-audit-)/.test(normalized);
}

function currentStageablePaths(repoRoot) {
  const status = git(['status', '--short', '--untracked-files=all'], repoRoot);
  if (status.error || status.status !== 0) {
    throw new Error(status.stderr.trim() || status.error?.message || 'git status failed');
  }

  const entries = parseStatusPorcelain(status.stdout);
  return entries
    .filter((entry) => !isRuntimeOrPrivatePath(entry.path))
    .map((entry) => entry.path);
}

function runMemoryRefresh(repoRoot, options) {
  if (options.skipMemoryRefresh) {
    return {
      status: 'skipped',
      reason: 'skip_memory_refresh_requested',
      stdout: '',
      stderr: '',
      logPath: '',
    };
  }
  if (!fs.existsSync(MEMORY_REFRESH_SCRIPT)) {
    return {
      status: 'memory_refresh_failed',
      reason: 'memory_refresh_script_missing',
      stdout: '',
      stderr: '',
      logPath: '',
    };
  }

  const result = run(process.execPath, [
    MEMORY_REFRESH_SCRIPT,
    '--project-id',
    path.basename(repoRoot),
    '--project-path',
    repoRoot,
    '--mcp-status',
    'skipped',
    '--json',
  ], { cwd: repoRoot });

  let payload = null;
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch {
    payload = null;
  }

  if (result.error || result.status !== 0) {
    return {
      status: 'memory_refresh_failed',
      reason: result.stderr.trim() || result.error?.message || 'memory_refresh_nonzero_exit',
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      logPath: payload?.logPath || '',
    };
  }

  return {
    status: 'memory_refreshed',
    reason: payload?.status || 'ok',
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    logPath: payload?.logPath || '',
  };
}

function outputResult(payload, json) {
  if (json) {
    writeStdoutLine(JSON.stringify(payload, null, 2));
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      writeStdoutLine(`${key}=${value.join(',')}`);
    } else if (value && typeof value === 'object') {
      writeStdoutLine(`${key}=${JSON.stringify(value)}`);
    } else {
      writeStdoutLine(`${key}=${value ?? ''}`);
    }
  }
}

function makeCheckpointCommit(options) {
  const repoRoot = resolveRepoRoot();
  const phasePrefix = String(options.phaseNum || '').padStart(2, '0');
  const phaseTitle = options.phaseTitle || `Phase ${phasePrefix}`;
  const memory = runMemoryRefresh(repoRoot, options);
  const stageablePaths = currentStageablePaths(repoRoot);
  const committedAt = new Date().toISOString();

  if (stageablePaths.length === 0) {
    return {
      exitCode: 0,
      payload: {
        status: 'skipped_no_changes',
        commit: '',
        committedAt,
        reason: 'no_stageable_non_runtime_changes',
        stageablePaths,
        memory,
      },
    };
  }

  const add = git(['add', '--', ...stageablePaths], repoRoot);
  if (add.error || add.status !== 0) {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        committedAt,
        reason: add.stderr.trim() || add.error?.message || 'git_add_failed',
        stageablePaths,
        memory,
      },
    };
  }

  const diff = git(['diff', '--cached', '--quiet'], repoRoot);
  if (diff.status === 0) {
    return {
      exitCode: 0,
      payload: {
        status: 'skipped_no_changes',
        commit: '',
        committedAt,
        reason: 'no_cached_non_runtime_changes',
        stageablePaths,
        memory,
      },
    };
  }

  if (process.env.PHASE_CHECKPOINT_FORCE_COMMIT_FAILURE === 'true') {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        committedAt,
        reason: 'forced_commit_failure',
        stageablePaths,
        memory,
      },
    };
  }

  const subject = `phase ${phasePrefix} 체크포인트: ${phaseTitle}`;
  const body = [
    `Plan: ${options.planDir || 'n/a'}`,
    `Status: ${options.statusFile || 'n/a'}`,
    `QA: ${options.qaReport || 'n/a'}`,
    `Scorecard: ${options.scorecard || 'n/a'}`,
    `Memory refresh: ${memory.status} (${memory.reason || 'n/a'})`,
    memory.logPath ? `Memory log: ${memory.logPath}` : '',
    'Generated by phase-checkpoint-commit.mjs',
  ].filter(Boolean).join('\n');

  const commit = git(['commit', '-m', subject, '-m', body], repoRoot);
  if (commit.error || commit.status !== 0) {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        committedAt,
        reason: commit.stderr.trim() || commit.stdout.trim() || commit.error?.message || 'git_commit_failed',
        stageablePaths,
        memory,
      },
    };
  }

  const rev = git(['rev-parse', '--short', 'HEAD'], repoRoot);
  return {
    exitCode: 0,
    payload: {
      status: 'committed',
      commit: rev.stdout.trim(),
      committedAt,
      reason: 'checkpoint_commit_created',
      stageablePaths,
      memory,
    },
  };
}

function initFixtureRepo(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `phase-checkpoint-${name}-`));
  const init = run('git', ['init'], { cwd: root });
  if (init.status !== 0) {
    throw new Error(init.stderr || 'git init failed');
  }
  run('git', ['config', 'user.name', 'Phase Checkpoint Test'], { cwd: root });
  run('git', ['config', 'user.email', 'phase-checkpoint@example.test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n', 'utf8');
  run('git', ['add', 'README.md'], { cwd: root });
  run('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
}

function runSelfTest() {
  const originalCwd = process.cwd();
  const tempRoots = [];
  try {
    const cleanRepo = initFixtureRepo('clean');
    tempRoots.push(cleanRepo);
    process.chdir(cleanRepo);
    let result = makeCheckpointCommit({
      phaseNum: '1',
      phaseTitle: 'Clean',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'skipped_no_changes') {
      throw new Error(`expected clean repo skip, got ${result.payload.status}`);
    }

    const changedRepo = initFixtureRepo('changed');
    tempRoots.push(changedRepo);
    fs.writeFileSync(path.join(changedRepo, 'feature.txt'), 'changed\n', 'utf8');
    process.chdir(changedRepo);
    result = makeCheckpointCommit({
      phaseNum: '2',
      phaseTitle: 'Changed',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'committed' || !result.payload.commit) {
      throw new Error(`expected commit, got ${result.payload.status}`);
    }

    const ignoredRepo = initFixtureRepo('ignored');
    tempRoots.push(ignoredRepo);
    fs.mkdirSync(path.join(ignoredRepo, '.claude', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(ignoredRepo, '.claude', 'memory.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(ignoredRepo, '.claude', 'logs', 'runtime.log'), 'log\n', 'utf8');
    process.chdir(ignoredRepo);
    result = makeCheckpointCommit({
      phaseNum: '3',
      phaseTitle: 'Ignored',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'skipped_no_changes') {
      throw new Error(`expected ignored artifact skip, got ${result.payload.status}`);
    }

    const failureRepo = initFixtureRepo('failure');
    tempRoots.push(failureRepo);
    fs.writeFileSync(path.join(failureRepo, 'failure.txt'), 'changed\n', 'utf8');
    process.chdir(failureRepo);
    process.env.PHASE_CHECKPOINT_FORCE_COMMIT_FAILURE = 'true';
    result = makeCheckpointCommit({
      phaseNum: '4',
      phaseTitle: 'Failure',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    delete process.env.PHASE_CHECKPOINT_FORCE_COMMIT_FAILURE;
    if (result.payload.status !== 'failed') {
      throw new Error(`expected forced failure, got ${result.payload.status}`);
    }

    writeStdoutLine('phase-checkpoint-commit self-test passed');
  } finally {
    process.chdir(originalCwd);
    delete process.env.PHASE_CHECKPOINT_FORCE_COMMIT_FAILURE;
    for (const root of tempRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    showHelp();
    process.exit(0);
  }
  if (options.command === 'self-test') {
    runSelfTest();
    process.exit(0);
  }
  if (options.command !== 'commit') {
    throw new Error(`Unknown command: ${options.command}`);
  }
  if (!options.phaseNum) {
    throw new Error('--phase-num is required');
  }
  const { exitCode, payload } = makeCheckpointCommit(options);
  outputResult(payload, options.json);
  process.exit(exitCode);
} catch (error) {
  const payload = {
    status: 'failed',
    commit: '',
    committedAt: new Date().toISOString(),
    reason: error instanceof Error ? error.message : String(error),
    stageablePaths: [],
    memory: {
      status: 'unknown',
      reason: 'not_attempted',
    },
  };
  const wantsJson = process.argv.includes('--json');
  outputResult(payload, wantsJson);
  process.exit(2);
}
