#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { classifyFailure } from './lib/failure-classifier.mjs';

const DEFAULT_WORKTREE_ROOTS = [
  '.tmp/harness-worktrees/phase-runs',
  '.tmp/harness-worktrees/phase-waves',
];

const IGNORED_EVIDENCE_PREFIXES = [
  '.claude/browser-flow-verdict-',
  '.claude/knowledge-repo-audit-',
  '.claude/runtime-verdict-',
  '.claude/visual-diff-verdict-',
  '.claude/verification-results-',
  '.claude/verification-verdict-',
];

const DENIED_CLOSEOUT_EXACT = new Set([
  '.claude/docs/phase-status.yaml',
  '.claude/memory.json',
  '.claude/worktree-baseline.log',
  '.claude/worktree-prepare.json',
  '.claude/worktree-setup.log',
  '.mcp.json',
]);

const DENIED_CLOSEOUT_PREFIXES = [
  '.claude/cache/memorygraph/',
  '.claude/logs/',
  '.claude/memorygraph/',
  '.claude/runtime-state.sqlite',
  '.tmp/',
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
    '  phase-final-git-closeout.mjs preflight [options]',
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
  const result = run('git', ['-c', 'safe.directory=*', '-c', 'core.editor=true', ...args], { cwd });
  if (process.env.PHASE_FINAL_GIT_CLOSEOUT_FIXTURE_GIT_WARNING === 'true' && args[0] === 'status') {
    return {
      ...result,
      stderr: `${result.stderr || ''}warning: unable to access 'C:\\Users\\moon/.config/git/ignore': Permission denied\n`,
    };
  }
  return result;
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
    || normalized === '.claude/docs/phase-status.yaml'
    || normalized === '.claude/worktree-prepare.json'
    || normalized === '.claude/worktree-setup.log'
    || normalized === '.claude/worktree-baseline.log';
}

function isDeniedCloseoutPath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized !== '' && (
    DENIED_CLOSEOUT_EXACT.has(normalized)
    || DENIED_CLOSEOUT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function isIgnoredEvidencePath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized !== '' && IGNORED_EVIDENCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function safeGitEnvironmentWarnings(text) {
  const warnings = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const classification = classifyFailure({ message: line });
    if (classification.code !== 'safe_git_ignore_permission_warning') {
      continue;
    }
    warnings.push({
      code: classification.code,
      category: classification.category,
      decision: classification.decision,
      detail: line,
    });
  }
  return warnings;
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  const deduped = [];
  for (const warning of warnings) {
    const key = `${warning.code}|${warning.detail}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(warning);
  }
  return deduped;
}

function isSafeGitWarningLine(line) {
  return classifyFailure({ message: line }).code === 'safe_git_ignore_permission_warning';
}

function gitStatus(cwd, extraArgs = [], filterIgnorable = true) {
  const result = runGit(['status', '--short', '--untracked-files=all', ...extraArgs], cwd);
  const environmentWarnings = safeGitEnvironmentWarnings(`${result.stderr || ''}\n${result.stdout || ''}`);
  if (result.status !== 0 || result.error) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || result.stdout || 'git status failed',
      entries: [],
      environmentWarnings,
    };
  }
    return {
      ok: true,
      error: '',
      entries: result.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .filter((line) => !isSafeGitWarningLine(line))
        .filter((line) => !filterIgnorable || !isIgnorableStatusPath(parseStatusPath(line))),
      environmentWarnings,
  };
}

function collectIgnoredEvidence(repoRoot) {
  const result = gitStatus(repoRoot, [], false);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      entries: [],
      deniedEntries: [],
      environmentWarnings: result.environmentWarnings || [],
    };
  }

  const entries = [];
  const deniedEntries = [];
  for (const line of result.entries) {
    const status = line.slice(0, 2);
    if (status !== '!!') {
      continue;
    }
    const filePath = parseStatusPath(line);
    if (isIgnoredEvidencePath(filePath)) {
      entries.push({
        path: normalizePath(filePath),
        status,
      });
    } else if (isDeniedCloseoutPath(filePath)) {
      deniedEntries.push({
        path: normalizePath(filePath),
        status,
      });
    }
  }

  return {
    ok: true,
    error: '',
    entries,
    deniedEntries,
    environmentWarnings: result.environmentWarnings || [],
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

function collectGitOperationIssues(repoRoot) {
  const gitDirResult = runGit(['rev-parse', '--git-dir'], repoRoot);
  if (gitDirResult.status !== 0 || gitDirResult.error) {
    return [{
      type: 'git_operation_state_inspect_failed',
      detail: gitDirResult.error?.message || gitDirResult.stderr || gitDirResult.stdout || 'git dir inspect failed',
      entries: [],
    }];
  }

  const gitDir = path.resolve(repoRoot, gitDirResult.stdout.trim());
  const markers = [
    { type: 'git_rebase_in_progress', marker: 'rebase-merge' },
    { type: 'git_rebase_in_progress', marker: 'rebase-apply' },
    { type: 'git_merge_in_progress', marker: 'MERGE_HEAD' },
  ];
  const entries = markers
    .map((entry) => ({ ...entry, path: path.join(gitDir, entry.marker) }))
    .filter((entry) => fs.existsSync(entry.path));

  return entries.map((entry) => ({
    type: entry.type,
    detail: `${entry.marker} exists; finish or abort the Git operation before closeout`,
    entries: [{
      path: path.relative(repoRoot, entry.path) || entry.path,
      marker: entry.marker,
    }],
  }));
}

function collectUpstreamSyncIssues(repoRoot) {
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoRoot);
  if (upstream.status !== 0 || upstream.error) {
    return [];
  }

  const counts = runGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], repoRoot);
  if (counts.status !== 0 || counts.error) {
    return [{
      type: 'upstream_sync_inspect_failed',
      detail: counts.error?.message || counts.stderr || counts.stdout || 'upstream sync inspect failed',
      entries: [{ upstream: upstream.stdout.trim() }],
    }];
  }

  const [aheadRaw = '0', behindRaw = '0'] = counts.stdout.trim().split(/\s+/);
  const ahead = Number.parseInt(aheadRaw, 10) || 0;
  const behind = Number.parseInt(behindRaw, 10) || 0;
  if (ahead === 0 && behind === 0) {
    return [];
  }

  return [{
    type: 'upstream_not_synced',
    detail: `HEAD differs from upstream ${upstream.stdout.trim()} (ahead=${ahead}, behind=${behind})`,
    entries: [{ upstream: upstream.stdout.trim(), ahead, behind }],
  }];
}

function audit() {
  const repoRoot = runRequiredGit(['rev-parse', '--show-toplevel']);
  const worktreeRoots = state.worktreeRoots.length > 0 ? state.worktreeRoots : DEFAULT_WORKTREE_ROOTS;
  const mainStatus = gitStatus(repoRoot);
  const ignoredEvidence = collectIgnoredEvidence(repoRoot);
  const repoHead = runRequiredGit(['rev-parse', 'HEAD'], repoRoot);
  const environmentWarnings = dedupeWarnings([
    ...(mainStatus.environmentWarnings || []),
    ...(ignoredEvidence.environmentWarnings || []),
  ]);
  const issues = [];
  const deniedEntries = [];
  const stageableEntries = [];
  if (!mainStatus.ok) {
    issues.push({
      type: 'main_status_failed',
      detail: mainStatus.error,
      entries: [],
    });
  } else if (mainStatus.entries.length > 0) {
    for (const entry of mainStatus.entries) {
      const filePath = parseStatusPath(entry);
      if (isDeniedCloseoutPath(filePath)) {
        deniedEntries.push({
          path: normalizePath(filePath),
          status: entry.slice(0, 2),
        });
      } else {
        stageableEntries.push({
          path: normalizePath(filePath),
          status: entry.slice(0, 2),
        });
      }
    }
    if (stageableEntries.length > 0) {
      issues.push({
        type: 'main_worktree_dirty',
        detail: 'main worktree has uncommitted non-runtime changes',
        entries: stageableEntries,
      });
    }
  }

  if (ignoredEvidence.ok && ignoredEvidence.entries.length > 0) {
    issues.push({
      type: 'ignored_verification_evidence_detected',
      detail: 'ignored verification evidence must be force-added before closeout',
      entries: ignoredEvidence.entries,
    });
  }

  if (!ignoredEvidence.ok) {
    issues.push({
      type: 'ignored_evidence_scan_failed',
      detail: ignoredEvidence.error,
      entries: [],
    });
  } else if (ignoredEvidence.deniedEntries.length > 0) {
    issues.push({
      type: 'ignored_denied_path_detected',
      detail: 'ignored runtime/cache/private paths are denied for closeout staging',
      entries: ignoredEvidence.deniedEntries,
    });
  }

  if (deniedEntries.length > 0) {
    issues.push({
      type: 'denied_closeout_path_detected',
      detail: 'runtime/cache/private paths must not be staged during closeout',
      entries: deniedEntries,
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
  issues.push(...collectGitOperationIssues(repoRoot));
  issues.push(...collectUpstreamSyncIssues(repoRoot));

  const payload = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    repoRoot,
    head: repoHead,
    planDir: state.planDir,
    statusFile: state.statusFile,
    mode: state.command,
    worktreeRoots,
    clean: issues.length === 0,
    stageableEntries,
    environmentWarnings,
    ignoredEvidence: ignoredEvidence.ok ? ignoredEvidence.entries : [],
    deniedEntries: deniedEntries.concat(ignoredEvidence.deniedEntries || []),
    issues,
    nextAction: issues.length === 0
      ? 'none'
      : deniedEntries.length > 0 || (ignoredEvidence.ok && ignoredEvidence.deniedEntries.length > 0)
        ? 'remove denied runtime/cache/private paths from the closeout scope, then rerun preflight'
        : ignoredEvidence.ok && ignoredEvidence.entries.length > 0
          ? `force-add ignored verification evidence (${ignoredEvidence.entries.map((entry) => entry.path).join(', ')}), then commit`
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
  runRequiredGit(['commit', '--allow-empty', '-m', 'fixture'], root);
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
  const originalCwd = process.cwd();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-final-git-closeout-'));
  try {
    const repo = path.join(tmpRoot, 'repo');
    initFixtureRepo(repo);

    let result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 0) {
      throw new Error(`clean repo should pass: ${result.stderr || result.stdout}`);
    }

    fs.writeFileSync(path.join(repo, 'dirty.txt'), 'dirty\n', 'utf8');
    result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('main_worktree_dirty')) {
      throw new Error(`dirty main should fail with main_worktree_dirty: ${result.stderr || result.stdout}`);
    }
    fs.rmSync(path.join(repo, 'dirty.txt'), { force: true });

    const worktreePath = path.join(repo, '.tmp', 'harness-worktrees', 'phase-runs', 'phase-1');
    runRequiredGit(['worktree', 'add', '-b', 'codex/final-closeout-smoke', worktreePath, 'HEAD'], repo);
    fs.appendFileSync(path.join(worktreePath, 'README.md'), 'worktree dirty\n', 'utf8');
    result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('phase_worktree_dirty')) {
      throw new Error(`dirty phase worktree should fail: ${result.stderr || result.stdout}`);
    }
    runRequiredGit(['worktree', 'remove', '--force', worktreePath], repo);

    runRequiredGit(['branch', 'codex/phase-wave-smoke', 'HEAD'], repo);
    result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('phase_branch_ref_remaining')) {
      throw new Error(`remaining phase branch should fail: ${result.stderr || result.stdout}`);
    }
    runRequiredGit(['branch', '-D', 'codex/phase-wave-smoke'], repo);

    const gitDir = path.join(repo, '.git');
    fs.mkdirSync(path.join(gitDir, 'rebase-merge'), { recursive: true });
    result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('git_rebase_in_progress')) {
      throw new Error(`rebase in-progress marker should fail: ${result.stderr || result.stdout}`);
    }
    fs.rmSync(path.join(gitDir, 'rebase-merge'), { recursive: true, force: true });

    fs.writeFileSync(path.join(gitDir, 'MERGE_HEAD'), `${runRequiredGit(['rev-parse', 'HEAD'], repo)}\n`, 'utf8');
    result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('git_merge_in_progress')) {
      throw new Error(`merge in-progress marker should fail: ${result.stderr || result.stdout}`);
    }
    fs.rmSync(path.join(gitDir, 'MERGE_HEAD'), { force: true });

    process.env.PHASE_FINAL_GIT_CLOSEOUT_FIXTURE_GIT_WARNING = 'true';
    result = runSelf(['preflight', '--json'], repo);
    delete process.env.PHASE_FINAL_GIT_CLOSEOUT_FIXTURE_GIT_WARNING;
    if (result.status !== 0 || !result.stdout.includes('safe_git_ignore_permission_warning')) {
      throw new Error(`safe git ignore warning should be recorded without failing closeout: ${result.stderr || result.stdout}`);
    }

    const artifactPath = path.join(repo, '.claude', 'logs', 'agent-loop', 'phase-wave-run-smoke.json');
    writeFixture(artifactPath, JSON.stringify({
      schemaVersion: '1.0',
      runId: 'smoke',
      status: 'running',
      mergeStatus: 'pending',
      generatedAt: new Date().toISOString(),
    }, null, 2));
    result = runSelf(['preflight', '--json'], repo);
    if (result.status !== 2 || !result.stdout.includes('phase_wave_artifact_incomplete')) {
      throw new Error(`incomplete wave artifact should fail: ${result.stderr || result.stdout}`);
    }

    const ignoredRepo = path.join(tmpRoot, 'ignored');
    initFixtureRepo(ignoredRepo);
    writeFixture(path.join(ignoredRepo, '.gitignore'), '.claude/verification-verdict-*.json\n');
    runRequiredGit(['add', '.gitignore'], ignoredRepo);
    runRequiredGit(['commit', '-m', 'ignore verification evidence'], ignoredRepo);
    fs.mkdirSync(path.join(ignoredRepo, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(ignoredRepo, '.claude', 'verification-verdict-phase06-test.json'), '{}\n', 'utf8');
    process.chdir(ignoredRepo);
    result = runSelf(['preflight', '--json'], ignoredRepo);
    if (result.status !== 0 || result.stdout.includes('ignored_verification_evidence_detected')) {
      throw new Error(`ignored legacy evidence should not block closeout: ${result.stderr || result.stdout}`);
    }

    const deniedRepo = path.join(tmpRoot, 'denied');
    initFixtureRepo(deniedRepo);
    fs.mkdirSync(path.join(deniedRepo, '.tmp'), { recursive: true });
    fs.writeFileSync(path.join(deniedRepo, '.tmp', 'runtime-cache.json'), '{}\n', 'utf8');
    process.chdir(deniedRepo);
    result = runSelf(['preflight', '--json'], deniedRepo);
    if (result.status !== 2 || !result.stdout.includes('denied_closeout_path_detected')) {
      throw new Error(`denied closeout path should be reported: ${result.stderr || result.stdout}`);
    }

    const nonRepo = fs.mkdtempSync(path.join(tmpRoot, 'non-repo-'));
    result = runSelf(['preflight', '--json'], nonRepo);
    if (result.status === 0) {
      throw new Error('non-repo execution should fail');
    }
  } finally {
    process.chdir(originalCwd);
    delete process.env.PHASE_FINAL_GIT_CLOSEOUT_FIXTURE_GIT_WARNING;
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
  if (!['audit', 'assert-clean', 'preflight'].includes(state.command)) {
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
