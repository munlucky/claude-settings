import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runGit } from '../scripts/lib/git-safe.mjs';
import {
  cleanupExecutionWorkspaces,
  executionRoot,
  inspectGitWorkspace,
  prepareExecutionWorkspaces,
} from '../scripts/kernel/workspace/step-worktree-manager.mjs';

const makeRepository = async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-parallel-recovery-repo-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-parallel-recovery-home-'));
  runGit(repoRoot, ['init', '-b', 'main']);
  runGit(repoRoot, ['config', 'user.name', 'Kernel Recovery Test']);
  runGit(repoRoot, ['config', 'user.email', 'kernel-recovery@example.invalid']);
  await mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await writeFile(path.join(repoRoot, 'src', 'base.txt'), 'base\n');
  runGit(repoRoot, ['add', '--all']);
  runGit(repoRoot, ['commit', '-m', 'fixture']);
  return {
    repoRoot,
    runtimeHome,
    baseCommit: String(runGit(repoRoot, ['rev-parse', 'HEAD']).stdout).trim(),
  };
};

const steps = [
  { stepId: 'step-alpha', allowedPaths: ['src/alpha/**'], obligationIds: ['alpha-proof'] },
  { stepId: 'step-beta', allowedPaths: ['src/beta/**'], obligationIds: ['beta-proof'] },
];

const worktreeCount = (repoRoot) => String(runGit(repoRoot, ['worktree', 'list', '--porcelain']).stdout)
  .split(/\r?\n/u)
  .filter((line) => line.startsWith('worktree ')).length;

test('restart reuses clean run-keyed execution workspaces without adding lifecycle state', async () => {
  const fixture = await makeRepository();
  const input = { ...fixture, runId: 'run-restart-reuse', projectId: 'project-restart-reuse', steps };
  try {
    const first = await prepareExecutionWorkspaces(input);
    assert.equal(first.integration.reused, false);
    assert.ok(first.steps.every((workspace) => workspace.reused === false));
    const firstRoots = [first.integration.workspaceRoot, ...first.steps.map((workspace) => workspace.workspaceRoot)];
    assert.equal(worktreeCount(fixture.repoRoot), 4);

    const second = await prepareExecutionWorkspaces(input);
    assert.equal(second.integration.reused, true);
    assert.ok(second.steps.every((workspace) => workspace.reused === true));
    assert.deepEqual(
      [second.integration.workspaceRoot, ...second.steps.map((workspace) => workspace.workspaceRoot)],
      firstRoots,
    );
    assert.equal(worktreeCount(fixture.repoRoot), 4, 'restart must not create duplicate worktrees');
    assert.ok(inspectGitWorkspace(second.integration.workspaceRoot).ready);
    assert.ok(inspectGitWorkspace(second.steps[0].workspaceRoot).ready);
    assert.equal(existsSync(path.join(executionRoot(input), 'integration')), true);
  } finally {
    await cleanupExecutionWorkspaces({ ...input, repoRoot: fixture.repoRoot, retain: false });
    await rm(fixture.runtimeHome, { recursive: true, force: true });
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('a dirty interrupted workspace is preserved and rejected instead of being overwritten', async () => {
  const fixture = await makeRepository();
  const input = { ...fixture, runId: 'run-dirty-recovery', projectId: 'project-dirty-recovery', steps };
  try {
    const first = await prepareExecutionWorkspaces(input);
    const dirtyPath = path.join(first.steps[0].workspaceRoot, 'src', 'alpha', 'uncommitted.txt');
    await mkdir(path.dirname(dirtyPath), { recursive: true });
    await writeFile(dirtyPath, 'worker-progress\n');

    await assert.rejects(
      () => prepareExecutionWorkspaces(input),
      (error) => error.code === 'WORKTREE_REUSE_FAILED' && /dirty-working-tree/u.test(error.message),
    );
    assert.equal(existsSync(dirtyPath), true, 'recovery must not delete interrupted worker progress');
    assert.equal(existsSync(first.integration.workspaceRoot), true);
    assert.equal(existsSync(executionRoot(input)), true);
  } finally {
    await cleanupExecutionWorkspaces({ ...input, repoRoot: fixture.repoRoot, retain: false });
    await rm(fixture.runtimeHome, { recursive: true, force: true });
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
});

test('a retained execution root is explicitly recoverable after a partial worker failure', async () => {
  const fixture = await makeRepository();
  const input = { ...fixture, runId: 'run-partial-retain', projectId: 'project-partial-retain', steps };
  try {
    const prepared = await prepareExecutionWorkspaces(input);
    const retained = await cleanupExecutionWorkspaces({ ...input, repoRoot: fixture.repoRoot, retain: true });
    assert.equal(retained.retained, true);
    assert.equal(existsSync(prepared.integration.workspaceRoot), true);
    assert.equal(existsSync(prepared.steps[1].workspaceRoot), true);
  } finally {
    await cleanupExecutionWorkspaces({ ...input, repoRoot: fixture.repoRoot, retain: false });
    await rm(fixture.runtimeHome, { recursive: true, force: true });
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
});
