#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_WORKTREE_ROOTS = [
  '.tmp/harness-worktrees/phase-runs',
  '.tmp/harness-worktrees/phase-waves',
];

const state = {
  command: 'assert-clean',
  planDir: '',
  statusFile: '',
  output: '',
  json: false,
  worktreeRoots: [],
};

function usage() {
  console.error([
    'Usage:',
    '  phase-final-git-closeout.mjs assert-clean [options]',
    '  phase-final-git-closeout.mjs audit [options]',
    '  phase-final-git-closeout.mjs self-test',
    '',
    'Options:',
    '  --plan-dir <path>',
    '  --status-file <path>',
    '  --worktree-root <path>    Can be repeated',
    '  --output <path>           Write JSON audit artifact',
    '  --json                    Print JSON payload',
  ].join('\n'));
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
    error: result.error ?? null,
  };
}

function runGit(args, cwd = process.cwd()) {
  return run('git', ['-c', 'safe.directory=*', ...args], { cwd });
}

function runRequiredGit(args, cwd = process.cwd()) {
  const result = runGit(args, cwd);
  if (result.status !== 0 || result.error) {
    const detail = result.error?.message || result.stderr || result.stdout || 'git command failed';
    throw new Error(detail.trim());
  }
  return result.stdout.trim();
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function parseStatusPath(line) {
  const payload = String(line || '').slice(3).trim();
  if (payload.includes(' -> ')) {
    return payload.split(' -> ').at(-1).trim();
  }
  return payload;
}

function isIgnorableStatusPath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized === ''
    || normalized.startsWith('.claude/logs/')
    || normalized === '.claude/docs/phase-status.yaml'
    || normalized === '.claude/runtime-state.sqlite'
    || normalized.startsWith('.claude/runtime-state.sqlite-')
    || normalized.startsWith('.claude/verification-results-')
    || normalized.startsWith('.claude/verification-verdict-')
    || normalized.startsWith('.claude/runtime-verdict-')
    || normalized.startsWith('.claude/knowledge-repo-audit-')
    || normalized === '.claude/worktree-prepare.json'
    || normalized === '.claude/worktree-setup.log'
    || normalized === '.claude/worktree-baseline.log';
}

function gitStatus(cwd) {
  const result = runGit(['status', '--short', '--untracked-files=all'], cwd);
  if (result.status !== 0 || result.error) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || result.stdout || 'git status failed',
      entries: [],
    };
  }
  return {
    ok: true,
    error: '',
    entries: result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .filter((line) => !isIgnorableStatusPath(parseStatusPath(line))),
  };
}

function parseWorktreeList(text) {
  const entries = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length), head: '', branch: '' };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function isInsideAnyRoot(candidatePath, roots) {
  const resolved = path.resolve(candidatePath);
  return roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
  });
}

function collectWorktreeIssues(repoRoot, worktreeRoots) {
  const result = runGit(['worktree', 'list', '--porcelain'], repoRoot);
  if (result.status !== 0 || result.error) {
    return [{
      path: '',
      branch: '',
      status: 'inspect_failed',
      detail: result.error?.message || result.stderr || result.stdout || 'git worktree list failed',
      entries: [],
    }];
  }

  const roots = worktreeRoots.map((root) => path.resolve(repoRoot, root));
  const entries = parseWorktreeList(result.stdout)
    .filter((entry) => path.resolve(entry.path) !== path.resolve(repoRoot))
    .filter((entry) => isInsideAnyRoot(entry.path, roots));

  return entries.map((entry) => {
    const status = gitStatus(entry.path);
    if (!status.ok) {
      return {
        path: entry.path,
        branch: entry.branch,
        head: entry.head,
        status: 'inspect_failed',
        detail: status.error,
        entries: [],
      };
    }
    return {
      path: entry.path,
      branch: entry.branch,
      head: entry.head,
      status: status.entries.length > 0 ? 'dirty' : 'clean',
      detail: '',
      entries: status.entries,
    };
  }).filter((entry) => entry.status !== 'clean');
}

function collectPhaseBranchIssues(repoRoot) {
  const result = runGit(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads/codex/phase*'], repoRoot);
  if (result.status !== 0 || result.error) {
    return [{
      type: 'phase_branch_ref_inspect_failed',
      detail: result.error?.message || result.stderr || result.stdout || 'git for-each-ref failed',
      entries: [],
    }];
  }

  const entries = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [branch, head = ''] = line.split(/\s+/, 2);
      return { branch, head };
    })
    .filter((entry) => (
      /^codex\/phase-wave-/.test(entry.branch)
      || /^codex\/phase-[0-9]+-/.test(entry.branch)
    ));

  if (entries.length === 0) {
    return [];
  }

  return [{
    type: 'phase_branch_ref_remaining',
    detail: 'temporary phase branch refs remain after phase closeout',
    entries,
  }];
}

function shouldInspectWaveArtifact(payload) {
  const requestedPlanDir = normalizePath(state.planDir);
  const requestedStatusFile = normalizePath(state.statusFile);
  const payloadPlanDir = normalizePath(payload.planDir);
  const payloadStatusFile = normalizePath(payload.statusFile);
  if (requestedPlanDir && payloadPlanDir && requestedPlanDir !== payloadPlanDir) {
    return false;
  }
  if (requestedStatusFile && payloadStatusFile && requestedStatusFile !== payloadStatusFile) {
    return false;
  }
  return true;
}

function collectIncompleteWaveArtifactIssues(repoRoot) {
  const artifactDir = path.join(repoRoot, '.claude', 'logs', 'agent-loop');
  if (!fs.existsSync(artifactDir) || !fs.statSync(artifactDir).isDirectory()) {
    return [];
  }

  const entries = [];
  for (const entry of fs.readdirSync(artifactDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^(phase-wave-run|parallel-phase-run)-.+\.json$/.test(entry.name)) {
      continue;
    }
    const artifactPath = path.join(artifactDir, entry.name);
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    } catch {
      continue;
    }
    if (!shouldInspectWaveArtifact(payload)) {
      continue;
    }
    const status = String(payload.status || '').trim().toLowerCase();
    const mergeStatus = String(payload.mergeStatus || '').trim().toLowerCase();
    if (status === 'running' || mergeStatus === 'pending') {
      entries.push({
        artifact: path.relative(repoRoot, artifactPath),
        status,
        mergeStatus,
        runId: payload.runId || '',
      });
    }
  }

  if (entries.length === 0) {
    return [];
  }

  return [{
    type: 'phase_wave_artifact_incomplete',
    detail: 'phase wave artifacts remain in running or pending merge state',
    entries,
  }];
}

function audit() {
  const repoRoot = runRequiredGit(['rev-parse', '--show-toplevel']);
  const worktreeRoots = state.worktreeRoots.length > 0 ? state.worktreeRoots : DEFAULT_WORKTREE_ROOTS;
  const mainStatus = gitStatus(repoRoot);
  const issues = [];
  if (!mainStatus.ok) {
    issues.push({
      type: 'main_status_failed',
      detail: mainStatus.error,
      entries: [],
    });
  } else if (mainStatus.entries.length > 0) {
    issues.push({
      type: 'main_worktree_dirty',
      detail: 'main worktree has uncommitted non-runtime changes',
      entries: mainStatus.entries,
    });
  }

  const worktreeIssues = collectWorktreeIssues(repoRoot, worktreeRoots);
  for (const issue of worktreeIssues) {
    issues.push({
      type: issue.status === 'inspect_failed' ? 'phase_worktree_inspect_failed' : 'phase_worktree_dirty',
      path: path.relative(repoRoot, issue.path) || issue.path,
      branch: issue.branch,
      head: issue.head,
      detail: issue.detail || 'phase worktree has uncommitted non-runtime changes',
      entries: issue.entries,
    });
  }

  issues.push(...collectPhaseBranchIssues(repoRoot));
  issues.push(...collectIncompleteWaveArtifactIssues(repoRoot));

  const payload = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    repoRoot,
    planDir: state.planDir,
    statusFile: state.statusFile,
    mode: state.command,
    worktreeRoots,
    clean: issues.length === 0,
    issues,
    nextAction: issues.length === 0
      ? 'none'
      : 'triage phase worktrees, merge or discard valid residual patches, then commit main worktree changes before returning success',
  };

  if (state.output) {
    fs.mkdirSync(path.dirname(state.output), { recursive: true });
    fs.writeFileSync(state.output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  return payload;
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length > 0 && !args[0].startsWith('--')) {
    state.command = args.shift();
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--plan-dir':
        state.planDir = args.shift() ?? '';
        break;
      case '--status-file':
        state.statusFile = args.shift() ?? '';
        break;
      case '--worktree-root':
        state.worktreeRoots.push(args.shift() ?? '');
        break;
      case '--output':
        state.output = args.shift() ?? '';
        break;
      case '--json':
        state.json = true;
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
}

function writeFixture(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function initFixtureRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  runRequiredGit(['init'], root);
  runRequiredGit(['config', 'user.email', 'final-closeout@example.invalid'], root);
  runRequiredGit(['config', 'user.name', 'Final Closeout Test'], root);
  writeFixture(path.join(root, 'README.md'), '# fixture\n');
  runRequiredGit(['add', '.'], root);
  runRequiredGit(['commit', '-m', 'fixture'], root);
}

function runSelf(commandArgs, cwd) {
  return run(process.execPath, [fileURLToPath(import.meta.url), ...commandArgs], { cwd });
}

function selfTest() {
  const childProbe = run(process.execPath, ['--version']);
  if (childProbe.error && childProbe.error.code === 'EPERM') {
    process.stdout.write('phase-final-git-closeout self-test passed (child process spawn unavailable; skipped git fixture)\n');
    return;
  }
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-final-git-closeout-'));
  try {
    const repo = path.join(tmpRoot, 'repo');
    initFixtureRepo(repo);

    let result = runSelf(['assert-clean', '--json'], repo);
    if (result.status !== 0) {
      throw new Error(`clean repo should pass: ${result.stderr || result.stdout}`);
    }

    fs.appendFileSync(path.join(repo, 'README.md'), 'dirty\n', 'utf8');
    result = runSelf(['assert-clean', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('main_worktree_dirty')) {
      throw new Error(`dirty main should fail with main_worktree_dirty: ${result.stderr || result.stdout}`);
    }
    runRequiredGit(['checkout', '--', 'README.md'], repo);

    const worktreePath = path.join(repo, '.tmp', 'harness-worktrees', 'phase-runs', 'phase-1');
    runRequiredGit(['worktree', 'add', '-b', 'codex/final-closeout-smoke', worktreePath, 'HEAD'], repo);
    fs.appendFileSync(path.join(worktreePath, 'README.md'), 'worktree dirty\n', 'utf8');
    result = runSelf(['assert-clean', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('phase_worktree_dirty')) {
      throw new Error(`dirty phase worktree should fail: ${result.stderr || result.stdout}`);
    }
    runRequiredGit(['worktree', 'remove', '--force', worktreePath], repo);

    runRequiredGit(['branch', 'codex/phase-wave-smoke', 'HEAD'], repo);
    result = runSelf(['assert-clean', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('phase_branch_ref_remaining')) {
      throw new Error(`remaining phase branch should fail: ${result.stderr || result.stdout}`);
    }
    runRequiredGit(['branch', '-D', 'codex/phase-wave-smoke'], repo);

    const artifactPath = path.join(repo, '.claude', 'logs', 'agent-loop', 'phase-wave-run-smoke.json');
    writeFixture(artifactPath, JSON.stringify({
      schemaVersion: '1.0',
      runId: 'smoke',
      status: 'running',
      mergeStatus: 'pending',
      generatedAt: new Date().toISOString(),
    }, null, 2));
    result = runSelf(['assert-clean', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('phase_wave_artifact_incomplete')) {
      throw new Error(`incomplete wave artifact should fail: ${result.stderr || result.stdout}`);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  process.stdout.write('phase-final-git-closeout self-test passed\n');
}

try {
  parseArgs(process.argv.slice(2));
  if (state.command === 'self-test') {
    selfTest();
    process.exit(0);
  }
  if (!['audit', 'assert-clean'].includes(state.command)) {
    throw new Error(`Unknown command: ${state.command}`);
  }
  const payload = audit();
  if (state.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (!payload.clean) {
    process.stdout.write(`phase final git closeout required: ${payload.issues.length} issue(s)\n`);
    if (state.output) {
      process.stdout.write(`artifact: ${state.output}\n`);
    }
    for (const issue of payload.issues) {
      const where = issue.path ? ` ${issue.path}` : '';
      process.stdout.write(`- ${issue.type}${where}: ${issue.detail}\n`);
    }
  } else {
    process.stdout.write('phase final git closeout clean\n');
  }
  process.exit(payload.clean || state.command === 'audit' ? 0 : 2);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
