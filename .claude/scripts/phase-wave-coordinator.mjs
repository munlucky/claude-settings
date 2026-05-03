#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assignExecutionArtifactPaths } from './agent-loop-phase-plan-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const prepareWorktreeScript = path.join(SCRIPT_DIR, 'harness-prepare-worktree.mjs');
const phaseRunnerScript = path.join(SCRIPT_DIR, 'agent-loop-phase-runner.mjs');
const phaseStateScript = path.join(SCRIPT_DIR, 'agent-loop-phase-state.mjs');
const logDir = path.join('.claude', 'logs', 'agent-loop');

const state = {
  planDir: '',
  statusFile: '.claude/docs/phase-status.yaml',
  executionRoot: '',
  runtime: 'auto',
  verificationRuntimes: 'auto',
  waveFile: '',
  worktreeBase: process.env.PHASE_WORKTREE_BASE || 'HEAD',
  worktreeRoot: process.env.PHASE_WORKTREE_ROOT || '.tmp/harness-worktrees/phase-waves',
  dryRun: false,
};

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
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

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0 || result.error) {
    const detail = result.error?.message || result.stderr || result.stdout || `${command} failed`;
    throw new Error(detail.trim());
  }
  return result.stdout.trim();
}

function repoRoot(cwd = process.cwd()) {
  return runRequired('git', ['rev-parse', '--show-toplevel'], { cwd });
}

function sanitizeId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'phase';
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      copyTree(path.join(source, entry.name), path.join(target, entry.name));
    }
    return;
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function copyIfExists(root, worktreePath, relPath) {
  const normalized = normalizePath(relPath);
  if (!normalized) return;
  copyTree(path.join(root, normalized), path.join(worktreePath, normalized));
}

function applyRootPatchToWorktree(root, worktreePath) {
  const patch = run('git', ['diff', '--binary', state.worktreeBase, '--'], { cwd: root });
  if (patch.status !== 0 || patch.error) {
    throw new Error(patch.error?.message || patch.stderr || patch.stdout || 'failed to read root working diff');
  }
  if (!patch.stdout.trim()) {
    return;
  }
  const apply = run('git', ['apply', '--3way', '--whitespace=nowarn', '-'], {
    cwd: worktreePath,
    input: patch.stdout,
  });
  if (apply.status !== 0 || apply.error) {
    throw new Error(apply.error?.message || apply.stderr || apply.stdout || 'failed to apply root working diff to phase worktree');
  }
}

function prepareWorktree({ root, runId, phase }) {
  const taskId = `phase-wave-${sanitizeId(phase.number)}-${runId}`;
  const worktreePath = path.resolve(root, state.worktreeRoot, taskId);
  const branch = `codex/phase-wave-${sanitizeId(phase.number)}-${runId}`;
  const result = run('node', [
    prepareWorktreeScript,
    taskId,
    '--worktree-path', worktreePath,
    '--branch', branch,
    '--base', state.worktreeBase,
    '--hydrate-agent-config',
    '--agent-config-source', path.join(root, '.claude'),
  ], { cwd: root });
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `worktree prepare failed for phase ${phase.number}`);
  }
  applyRootPatchToWorktree(root, worktreePath);
  copyIfExists(root, worktreePath, state.planDir);
  copyIfExists(root, worktreePath, state.executionRoot);
  copyIfExists(root, worktreePath, state.statusFile);
  return { taskId, worktreePath, branch };
}

function localStatusPath(runId, phaseNumber) {
  return normalizePath(path.join('.claude', 'logs', 'agent-loop', 'waves', runId, `phase-status-${phaseNumber}.yaml`));
}

function runPhaseRunner({ root, runId, phase, prepared }) {
  const statusFile = localStatusPath(runId, phase.number);
  const sourceStatus = path.join(root, state.statusFile);
  const targetStatus = path.join(prepared.worktreePath, statusFile);
  fs.mkdirSync(path.dirname(targetStatus), { recursive: true });
  fs.copyFileSync(sourceStatus, targetStatus);

  const logFile = path.join(prepared.worktreePath, '.claude', 'logs', 'agent-loop', `wave-phase-${phase.number}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const args = [
    phaseRunnerScript,
    state.planDir,
    '--status-file', statusFile,
    '--execution-root', state.executionRoot,
    '--runtime', state.runtime,
    '--verification-runtimes', state.verificationRuntimes,
    '--phase-num', String(phase.number),
    '--phase-title', phase.title || `Phase ${phase.number}`,
    '--phase-doc', phase.phaseDoc,
  ];
  return new Promise((resolve) => {
    const output = fs.createWriteStream(logFile, { flags: 'a' });
    output.write(`$ node ${args.join(' ')}\n\n`);
    const child = spawn('node', args, {
      cwd: prepared.worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    child.on('error', (error) => {
      output.write(`\n--- error ---\n${error.message}\n`);
      output.end();
      resolve({ exitCode: 1, logFile, localStatusFile: statusFile, error: error.message });
    });
    child.on('exit', (code) => {
      output.end();
      resolve({ exitCode: code ?? 1, logFile, localStatusFile: statusFile, error: '' });
    });
  });
}

function isHarnessGeneratedPath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized === 'AGENTS.md'
    || normalized.startsWith('.agents/')
    || normalized === '.claude/worktree-prepare.json'
    || normalized === '.claude/worktree-setup.log'
    || normalized === '.claude/worktree-baseline.log'
    || normalized.startsWith('.claude/logs/')
    || normalized === normalizePath(state.statusFile);
}

function collectChangedFiles(worktreePath) {
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktreePath })
    .stdout.split(/\r?\n/).map(normalizePath).filter(Boolean)
    .filter((filePath) => !isHarnessGeneratedPath(filePath));
  if (untracked.length > 0) {
    run('git', ['add', '-N', '--', ...untracked], { cwd: worktreePath });
  }
  const tracked = runRequired('git', ['diff', '--name-only', state.worktreeBase, '--'], { cwd: worktreePath })
    .split(/\r?\n/).map(normalizePath).filter(Boolean)
    .filter((filePath) => !isHarnessGeneratedPath(filePath));
  return [...new Set([...tracked, ...untracked])];
}

function detectChangedFileConflicts(results) {
  const owners = new Map();
  const conflicts = [];
  for (const result of results) {
    for (const filePath of result.changedFiles || []) {
      if (owners.has(filePath)) {
        conflicts.push(`${filePath}:${owners.get(filePath)}:${result.phase.number}`);
      } else {
        owners.set(filePath, result.phase.number);
      }
    }
  }
  return conflicts;
}

function applyPhasePatch(result) {
  if (!result.changedFiles || result.changedFiles.length === 0) {
    result.mergeStatus = 'no_changes';
    return;
  }
  const patchResult = run('git', ['diff', '--binary', state.worktreeBase, '--', ...result.changedFiles], { cwd: result.worktreePath });
  if (patchResult.status !== 0 || patchResult.error) {
    result.mergeStatus = 'failed';
    throw new Error(patchResult.error?.message || patchResult.stderr || patchResult.stdout || `git diff failed for phase ${result.phase.number}`);
  }
  const apply = run('git', ['apply', '--3way', '--whitespace=nowarn', '-'], {
    cwd: process.cwd(),
    input: patchResult.stdout,
  });
  if (apply.status !== 0 || apply.error) {
    result.mergeStatus = 'failed';
    throw new Error(apply.error?.message || apply.stderr || apply.stdout || `git apply failed for phase ${result.phase.number}`);
  }
  result.mergeStatus = 'merged';
}

function checkPhasePatch(result) {
  if (!result.changedFiles || result.changedFiles.length === 0) {
    return;
  }
  const patchResult = run('git', ['diff', '--binary', state.worktreeBase, '--', ...result.changedFiles], { cwd: result.worktreePath });
  if (patchResult.status !== 0 || patchResult.error) {
    throw new Error(patchResult.error?.message || patchResult.stderr || patchResult.stdout || `git diff failed for phase ${result.phase.number}`);
  }
  const check = run('git', ['apply', '--check', '--3way', '--whitespace=nowarn', '-'], {
    cwd: process.cwd(),
    input: patchResult.stdout,
  });
  if (check.status !== 0 || check.error) {
    throw new Error(check.error?.message || check.stderr || check.stdout || `git apply check failed for phase ${result.phase.number}`);
  }
}

function updateMainPhaseCompleted(phase) {
  const paths = assignExecutionArtifactPaths(phase.number, phase.title || `Phase ${phase.number}`, state.executionRoot);
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const result = run('node', [
    phaseStateScript,
    'update-phase-state',
    state.statusFile,
    String(phase.number),
    'completed',
    timestamp,
    'completed',
    'false',
    phase.phaseDoc,
    paths.phaseSprintContract,
    paths.phaseQaReport,
    paths.phaseHandoff,
    paths.phaseScorecard,
  ]);
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `phase status update failed for ${phase.number}`);
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function runCoordinator() {
  if (!state.waveFile || !fs.existsSync(state.waveFile)) {
    throw new Error('--wave-file is required');
  }
  const wave = JSON.parse(fs.readFileSync(state.waveFile, 'utf8'));
  if (wave.executionPlan !== 'parallel_wave' || !Array.isArray(wave.phases) || wave.phases.length < 2) {
    return { exitCode: 78, reason: 'not-a-parallel-wave' };
  }
  const root = repoRoot();
  const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const artifactPath = path.join(logDir, `phase-wave-run-${runId}.json`);
  const payload = {
    schemaVersion: '1.0',
    runId,
    status: 'running',
    mergeStatus: 'pending',
    waveFile: state.waveFile,
    phases: wave.phases.map((phase) => ({ number: phase.number, title: phase.title, status: 'pending' })),
    artifactPath,
    generatedAt: new Date().toISOString(),
  };
  writeJson(artifactPath, payload);

  const results = await Promise.all(wave.phases.map(async (phase) => {
    const prepared = state.dryRun
      ? { taskId: `dry-${phase.number}`, worktreePath: '', branch: `codex/dry-${phase.number}` }
      : prepareWorktree({ root, runId, phase });
    if (state.dryRun) {
      return { ...prepared, phase, exitCode: 0, logFile: '', localStatusFile: '', changedFiles: [], mergeStatus: 'dry_run' };
    }
    const runner = await runPhaseRunner({ root, runId, phase, prepared });
    const changedFiles = runner.exitCode === 0 ? collectChangedFiles(prepared.worktreePath) : [];
    return { ...prepared, phase, ...runner, changedFiles, mergeStatus: 'pending' };
  }));

  payload.phases = results.map((result) => ({
    number: result.phase.number,
    title: result.phase.title,
    exitCode: result.exitCode,
    changedFiles: result.changedFiles,
    logFile: result.logFile,
    branch: result.branch,
  }));

  const failed = results.find((result) => result.exitCode !== 0);
  if (failed) {
    payload.status = 'fallback';
    payload.mergeStatus = 'not_started';
    payload.reason = `phase-runner-failed:${failed.phase.number}:exit=${failed.exitCode}`;
    writeJson(artifactPath, payload);
    return { exitCode: 78, reason: payload.reason, artifactPath };
  }

  const conflicts = detectChangedFileConflicts(results);
  if (conflicts.length > 0) {
    payload.status = 'fallback';
    payload.mergeStatus = 'conflict';
    payload.reason = `changed-file-conflict:${conflicts.join(',')}`;
    writeJson(artifactPath, payload);
    return { exitCode: 78, reason: payload.reason, artifactPath };
  }

  try {
    for (const result of results) {
      if (!state.dryRun) {
        checkPhasePatch(result);
      }
    }
    for (const result of [...results].sort((a, b) => Number(a.phase.number) - Number(b.phase.number))) {
      if (!state.dryRun) {
        applyPhasePatch(result);
        updateMainPhaseCompleted(result.phase);
      }
    }
  } catch (error) {
    payload.status = 'blocked';
    payload.mergeStatus = 'failed';
    payload.reason = error instanceof Error ? error.message : String(error);
    writeJson(artifactPath, payload);
    return { exitCode: 2, reason: payload.reason, artifactPath };
  }

  payload.status = 'completed';
  payload.mergeStatus = state.dryRun ? 'dry_run' : 'merged';
  payload.finishedAt = new Date().toISOString();
  payload.phases = results.map((result) => ({
    number: result.phase.number,
    title: result.phase.title,
    exitCode: result.exitCode,
    changedFiles: result.changedFiles,
    mergeStatus: result.mergeStatus,
    logFile: result.logFile,
    branch: result.branch,
  }));
  writeJson(artifactPath, payload);
  return { exitCode: 0, reason: 'completed', artifactPath };
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length > 0 && !args[0].startsWith('--')) {
    state.planDir = args.shift();
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--status-file':
        state.statusFile = args.shift() ?? '';
        break;
      case '--execution-root':
        state.executionRoot = args.shift() ?? '';
        break;
      case '--runtime':
        state.runtime = args.shift() ?? 'auto';
        break;
      case '--verification-runtimes':
        state.verificationRuntimes = args.shift() ?? 'auto';
        break;
      case '--wave-file':
        state.waveFile = args.shift() ?? '';
        break;
      case '--worktree-base':
        state.worktreeBase = args.shift() ?? 'HEAD';
        break;
      case '--worktree-root':
        state.worktreeRoot = args.shift() ?? '.tmp/harness-worktrees/phase-waves';
        break;
      case '--dry-run':
        state.dryRun = true;
        break;
      case '--help':
      case '-h':
        writeStdoutLine('Usage: phase-wave-coordinator.mjs <plan-dir> --status-file <file> --execution-root <dir> --wave-file <json>');
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
}

try {
  parseArgs(process.argv.slice(2));
  if (!state.planDir || !state.statusFile || !state.executionRoot) {
    throw new Error('plan-dir, --status-file, and --execution-root are required');
  }
  const result = await runCoordinator();
  if (result.artifactPath) {
    writeStdoutLine(`artifactPath=${result.artifactPath}`);
  }
  writeStdoutLine(`reason=${result.reason}`);
  process.exit(result.exitCode);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
