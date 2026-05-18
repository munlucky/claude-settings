#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_REFRESH_SCRIPT = path.join(SCRIPT_DIR, 'commit-moonshot-memory-refresh.mjs');

const IGNORED_EVIDENCE_PREFIXES = [
  '.claude/knowledge-repo-audit-',
  '.claude/runtime-verdict-',
  '.claude/verification-results-',
  '.claude/verification-verdict-',
];

const DENIED_CHECKPOINT_EXACT = new Set([
  '.claude/docs/phase-status.yaml',
  '.claude/memory.json',
  '.claude/worktree-baseline.log',
  '.claude/worktree-prepare.json',
  '.claude/worktree-setup.log',
  '.mcp.json',
]);

const DENIED_CHECKPOINT_PREFIXES = [
  '.claude/cache/memorygraph/',
  '.claude/logs/',
  '.claude/memorygraph/',
  '.claude/runtime-state.sqlite',
  '.tmp/',
];

const RUNTIME_CHECKPOINT_EXACT = new Set([
  '.claude/docs/phase-status.yaml',
  '.claude/memory.json',
  '.claude/worktree-baseline.log',
  '.claude/worktree-prepare.json',
  '.claude/worktree-setup.log',
]);

const RUNTIME_CHECKPOINT_PREFIXES = [
  '.claude/cache/memorygraph/',
  '.claude/logs/',
  '.claude/memorygraph/',
  '.claude/runtime-state.sqlite',
  '.tmp/',
];

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
  return run('git', ['-c', `safe.directory=${cwd}`, '-c', 'core.editor=true', ...args], {
    cwd,
    ...options,
    env: {
      ...process.env,
      GIT_EDITOR: process.env.GIT_EDITOR || 'true',
      ...(options.env || {}),
    },
  });
}

function gitAddPaths(repoRoot, paths, { force = false } = {}) {
  if (paths.length === 0) {
    return { status: 0, error: null, stderr: '', stdout: '' };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-checkpoint-pathspec-'));
  const pathspecFile = path.join(tempRoot, 'paths.txt');
  try {
    fs.writeFileSync(pathspecFile, `${paths.join('\0')}\0`, 'utf8');
    return git([
      'add',
      ...(force ? ['-f'] : []),
      `--pathspec-from-file=${pathspecFile}`,
      '--pathspec-file-nul',
    ], repoRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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

function isDeniedCheckpointPath(repoPath) {
  const normalized = normalizeStatusPath(repoPath);
  if (!normalized) {
    return true;
  }

  if (DENIED_CHECKPOINT_EXACT.has(normalized)) {
    return true;
  }

  if (DENIED_CHECKPOINT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  return normalized === '.claude/runtime-state.sqlite-shm'
    || normalized === '.claude/runtime-state.sqlite-wal';
}

function isRuntimeCheckpointPath(repoPath) {
  const normalized = normalizeStatusPath(repoPath);
  if (!normalized) {
    return true;
  }

  return RUNTIME_CHECKPOINT_EXACT.has(normalized)
    || RUNTIME_CHECKPOINT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    || normalized === '.claude/runtime-state.sqlite-shm'
    || normalized === '.claude/runtime-state.sqlite-wal';
}

function isIgnoredEvidencePath(repoPath) {
  const normalized = normalizeStatusPath(repoPath);
  if (!normalized) {
    return false;
  }
  return IGNORED_EVIDENCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function currentStageCandidates(repoRoot) {
  const status = git(['status', '--short', '--untracked-files=all'], repoRoot);
  if (status.error || status.status !== 0) {
    throw new Error(status.stderr.trim() || status.error?.message || 'git status failed');
  }

  const entries = parseStatusPorcelain(status.stdout);
  const stageablePaths = [];
  const forceAddPaths = [];
  const deniedPaths = [];
  const runtimePaths = [];

  for (const entry of entries) {
    const normalized = normalizeStatusPath(entry.path);
    if (!normalized) {
      continue;
    }
    if (entry.status === '!!') {
      continue;
    }
    if (isRuntimeCheckpointPath(normalized)) {
      runtimePaths.push(normalized);
      continue;
    }
    if (isDeniedCheckpointPath(normalized)) {
      deniedPaths.push(normalized);
      continue;
    }
    if (isIgnoredEvidencePath(normalized)) {
      forceAddPaths.push(normalized);
      continue;
    }
    stageablePaths.push(normalized);
  }

  return {
    stageablePaths: [...new Set(stageablePaths)],
    forceAddPaths: [...new Set(forceAddPaths)],
    deniedPaths: [...new Set(deniedPaths)],
    runtimePaths: [...new Set(runtimePaths)],
  };
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

function formatOptionalPath(label, value) {
  return `${label}: ${value || '해당 없음'}`;
}

function makeKoreanCommitMessage(options, memory, phasePrefix) {
  const subject = `페이즈 ${phasePrefix} 체크포인트 커밋`;
  const body = [
    `- 기능: 페이즈 ${phasePrefix} 체크포인트 - 완료 산출물과 상태 원장을 커밋`,
    `- 산출물: ${formatOptionalPath('계획', options.planDir)}; ${formatOptionalPath('상태 원장', options.statusFile)}`,
    `- 산출물: ${formatOptionalPath('QA 보고서', options.qaReport)}; ${formatOptionalPath('스코어카드', options.scorecard)}`,
    `- 메모리: 커밋 전 메모리 갱신 ${memory.status} (${memory.reason || '상세 없음'})`,
    memory.logPath ? `- 메모리: 갱신 로그 ${memory.logPath}` : '',
    '- 이유: 페이즈 러너 자동 체크포인트로 검증된 비런타임 변경을 보존',
    '- 영향: 다음 페이즈가 동일한 상태 원장과 검증 증적을 기준으로 이어서 실행 가능',
    '- 생성: phase-checkpoint-commit.mjs 자동 생성',
  ].filter(Boolean).join('\n');

  return { subject, body };
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
  const memory = runMemoryRefresh(repoRoot, options);
  const { stageablePaths, forceAddPaths, deniedPaths, runtimePaths } = currentStageCandidates(repoRoot);
  const committedAt = new Date().toISOString();

  if (deniedPaths.length > 0) {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        head: '',
        committedAt,
        reason: `denied closeout paths detected: ${deniedPaths.join(', ')}`,
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
        memory,
      },
    };
  }

  if (stageablePaths.length === 0 && forceAddPaths.length === 0) {
    return {
      exitCode: 0,
      payload: {
        status: 'skipped_no_changes',
        commit: '',
        head: '',
        committedAt,
        reason: 'no_stageable_non_runtime_changes',
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
        memory,
      },
    };
  }

  const add = gitAddPaths(repoRoot, stageablePaths);
  if (add.error || add.status !== 0) {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        head: '',
        committedAt,
        reason: add.stderr.trim() || add.error?.message || 'git_add_failed',
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
        memory,
      },
    };
  }

  const forceAdd = gitAddPaths(repoRoot, forceAddPaths, { force: true });
  if (forceAdd.error || forceAdd.status !== 0) {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        head: '',
        committedAt,
        reason: forceAdd.stderr.trim() || forceAdd.error?.message || 'git_force_add_failed',
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
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
        head: '',
        committedAt,
        reason: 'no_cached_non_runtime_changes',
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
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
        head: '',
        committedAt,
        reason: 'forced_commit_failure',
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
        memory,
      },
    };
  }

  const { subject, body } = makeKoreanCommitMessage(options, memory, phasePrefix);

  const commit = git(['commit', '-m', subject, '-m', body], repoRoot);
  if (commit.error || commit.status !== 0) {
    return {
      exitCode: 2,
      payload: {
        status: 'failed',
        commit: '',
        head: '',
        committedAt,
        reason: commit.stderr.trim() || commit.stdout.trim() || commit.error?.message || 'git_commit_failed',
        stageablePaths,
        forceAddPaths,
        deniedPaths,
        runtimePaths,
        memory,
      },
    };
  }

  const rev = git(['rev-parse', '--short', 'HEAD'], repoRoot);
  const head = git(['rev-parse', 'HEAD'], repoRoot);
  return {
    exitCode: 0,
    payload: {
      status: 'committed',
      commit: rev.stdout.trim(),
      head: head.stdout.trim(),
      committedAt,
      reason: 'checkpoint_commit_created',
      stageablePaths,
      forceAddPaths,
      deniedPaths,
      runtimePaths,
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
    if (!result.payload.head || result.payload.head.length < 12) {
      throw new Error(`expected full head, got ${result.payload.head || 'missing'}`);
    }
    const commitMessage = git(['log', '-1', '--pretty=format:%s%n%b'], changedRepo);
    if (commitMessage.status !== 0) {
      throw new Error(commitMessage.stderr.trim() || 'git log failed');
    }
    const messageText = commitMessage.stdout;
    const expectedFragments = [
      '페이즈 02 체크포인트 커밋',
      '- 기능: 페이즈 02 체크포인트',
      '- 산출물: 계획: docs/implementation',
      '- 메모리: 커밋 전 메모리 갱신 skipped',
      '- 이유: 페이즈 러너 자동 체크포인트',
      '- 영향: 다음 페이즈',
      '- 생성: phase-checkpoint-commit.mjs 자동 생성',
    ];
    for (const fragment of expectedFragments) {
      if (!messageText.includes(fragment)) {
        throw new Error(`expected Korean commit message fragment: ${fragment}`);
      }
    }
    const forbiddenFragments = ['Plan:', 'Status:', 'QA:', 'Scorecard:', 'Memory refresh:', 'Generated by'];
    for (const fragment of forbiddenFragments) {
      if (messageText.includes(fragment)) {
        throw new Error(`unexpected English commit message fragment: ${fragment}`);
      }
    }

    const ignoredRepo = initFixtureRepo('ignored');
    tempRoots.push(ignoredRepo);
    fs.writeFileSync(path.join(ignoredRepo, '.gitignore'), '.claude/verification-verdict-*.json\n', 'utf8');
    run('git', ['add', '.gitignore'], { cwd: ignoredRepo });
    run('git', ['commit', '-m', 'ignore verdict fixtures'], { cwd: ignoredRepo });
    fs.mkdirSync(path.join(ignoredRepo, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(ignoredRepo, '.claude', 'verification-verdict-phase06-test.json'), '{}\n', 'utf8');
    process.chdir(ignoredRepo);
    result = makeCheckpointCommit({
      phaseNum: '3',
      phaseTitle: 'Ignored',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'skipped_no_changes' || result.payload.forceAddPaths.length !== 0) {
      throw new Error(`expected ignored evidence to stay out of checkpoint, got ${result.payload.status}`);
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

    const runtimeRepo = initFixtureRepo('runtime');
    tempRoots.push(runtimeRepo);
    fs.mkdirSync(path.join(runtimeRepo, '.tmp'), { recursive: true });
    fs.mkdirSync(path.join(runtimeRepo, '.claude', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(runtimeRepo, '.tmp', 'runtime-cache.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(runtimeRepo, '.claude', 'docs', 'phase-status.yaml'), 'status\n', 'utf8');
    process.chdir(runtimeRepo);
    result = makeCheckpointCommit({
      phaseNum: '5',
      phaseTitle: 'Runtime',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'skipped_no_changes' || !result.payload.runtimePaths.includes('.claude/docs/phase-status.yaml')) {
      throw new Error(`expected runtime paths to be ignored, got ${result.payload.status}`);
    }

    const deniedRepo = initFixtureRepo('denied');
    tempRoots.push(deniedRepo);
    fs.writeFileSync(path.join(deniedRepo, '.mcp.json'), '{}\n', 'utf8');
    process.chdir(deniedRepo);
    result = makeCheckpointCommit({
      phaseNum: '6',
      phaseTitle: 'Denied',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'failed' || !String(result.payload.reason || '').includes('denied closeout paths detected')) {
      throw new Error(`expected denied path failure, got ${result.payload.status}`);
    }

    const manyPathsRepo = initFixtureRepo('many-paths');
    tempRoots.push(manyPathsRepo);
    for (let index = 0; index < 220; index += 1) {
      const directory = path.join(
        manyPathsRepo,
        'docs',
        'implementation',
        'archive',
        `very-long-phase-runner-checkpoint-path-${String(index).padStart(3, '0')}`,
      );
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `artifact-${String(index).padStart(3, '0')}.md`), `artifact ${index}\n`, 'utf8');
    }
    process.chdir(manyPathsRepo);
    result = makeCheckpointCommit({
      phaseNum: '7',
      phaseTitle: 'Many Paths',
      planDir: 'docs/implementation',
      statusFile: '.claude/docs/phase-status.yaml',
      skipMemoryRefresh: true,
    });
    if (result.payload.status !== 'committed' || result.payload.stageablePaths.length !== 220) {
      throw new Error(`expected many-path checkpoint commit, got ${result.payload.status}`);
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
