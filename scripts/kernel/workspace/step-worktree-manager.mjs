import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { runGit } from '../../lib/git-safe.mjs';
import { resolveKernelRuntimeHome } from '../runtime-home.mjs';
import { registerWorkspace } from '../run/workspace-registration.mjs';
import { observeWorkspaceIdentity } from '../run/workspace-identity.mjs';
import { shortWorktreeToken } from '../run/active-wave.mjs';

const commandError = (operation, result) => Object.assign(new Error(`${operation}: ${String(result?.stderr || '').trim() || 'git command failed'}`), {
  code: `WORKTREE_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
  gitStatus: result?.status ?? null,
});

const assertInside = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw Object.assign(new Error('worktree path escaped runtime worktree root'), { code: 'WORKTREE_PATH_ESCAPE' });
  }
};
export const worktreeRoot = ({ runtimeHome = resolveKernelRuntimeHome(), projectId, runId, waveId } = {}) => {
  if (!projectId || !runId || !waveId) throw new Error('projectId, runId, and waveId are required for worktrees');
  return path.join(runtimeHome, 'worktrees', `p-${shortWorktreeToken(projectId, 8)}`, `r-${shortWorktreeToken(runId, 8)}`, `w-${shortWorktreeToken(waveId, 8)}`);
};

const gitOutput = (repoRoot, args) => {
  const result = runGit(repoRoot, args, { maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw commandError(args[0] || 'git', result);
  return String(result.stdout || '').trim();
};

export const inspectGitWorkspace = (workspaceRoot) => {
  const head = runGit(workspaceRoot, ['rev-parse', '--verify', 'HEAD']);
  const inside = runGit(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
  if (head.error || head.status !== 0 || String(inside.stdout || '').trim() !== 'true') {
    return { ready: false, reason: 'not-a-git-workspace' };
  }
  const status = runGit(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status.error || status.status !== 0) return { ready: false, reason: 'git-status-unavailable' };
  const inProgress = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];
  const gitDir = String(runGit(workspaceRoot, ['rev-parse', '--git-dir']).stdout || '').trim();
  const operationInProgress = inProgress.some((entry) => existsSync(path.join(workspaceRoot, gitDir, entry)));
  if (operationInProgress) return { ready: false, reason: 'git-operation-in-progress' };
  if (String(status.stdout || '').trim()) return { ready: false, reason: 'dirty-working-tree' };
  return {
    ready: true,
    headCommitSha: String(head.stdout || '').trim(),
    gitCommonDir: String(runGit(workspaceRoot, ['rev-parse', '--git-common-dir']).stdout || '').trim(),
  };
};

export const canUseWayfinderWorkspace = (workspaceRoot) => inspectGitWorkspace(workspaceRoot);

const addWorktree = async ({ repoRoot, target, baseCommit }) => {
  await mkdir(path.dirname(target), { recursive: true });
  assertInside(path.dirname(path.dirname(path.dirname(target))), target);
  const result = runGit(repoRoot, ['worktree', 'add', '--detach', target, baseCommit], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw commandError('add', result);
  return target;
};

const workspaceRecord = ({ stateStore, projectId, workspaceRoot }) => {
  if (!stateStore || !projectId) return null;
  return registerWorkspace({ stateStore, projectId, workspaceRoot });
};

export const prepareStepWorktree = async ({
  repoRoot,
  baseCommit,
  runId,
  waveId,
  stepId,
  projectId,
  runtimeHome = resolveKernelRuntimeHome(),
  stateStore = null,
} = {}) => {
  const root = worktreeRoot({ runtimeHome, projectId, runId, waveId });
  const target = path.join(root, `s-${shortWorktreeToken(stepId, 4)}`);
  await addWorktree({ repoRoot, target, baseCommit });
  const workspace = workspaceRecord({ stateStore, projectId, workspaceRoot: target });
  const identity = observeWorkspaceIdentity({ projectRoot: target });
  return {
    kind: 'step',
    stepId,
    workspaceRoot: target,
    workspaceId: workspace?.workspaceId || null,
    baseCommitSha: baseCommit,
    baseWorkspaceIdentity: identity.identity,
    identity: workspace?.identity || null,
  };
};

export const prepareIntegrationWorktree = async ({
  repoRoot,
  baseCommit,
  runId,
  waveId,
  projectId,
  runtimeHome = resolveKernelRuntimeHome(),
  stateStore = null,
} = {}) => {
  const root = worktreeRoot({ runtimeHome, projectId, runId, waveId });
  const target = path.join(root, 'integration');
  await addWorktree({ repoRoot, target, baseCommit });
  const workspace = workspaceRecord({ stateStore, projectId, workspaceRoot: target });
  const identity = observeWorkspaceIdentity({ projectRoot: target });
  return {
    kind: 'integration',
    workspaceRoot: target,
    workspaceId: workspace?.workspaceId || null,
    baseCommitSha: baseCommit,
    baseWorkspaceIdentity: identity.identity,
    identity: workspace?.identity || null,
  };
};

export const prepareWaveWorkspaces = async ({ repoRoot, baseCommit, runId, waveId, projectId, steps = [], runtimeHome, stateStore } = {}) => {
  const integration = await prepareIntegrationWorktree({ repoRoot, baseCommit, runId, waveId, projectId, runtimeHome, stateStore });
  const stepWorkspaces = [];
  try {
    for (const step of steps) {
      stepWorkspaces.push(await prepareStepWorktree({ repoRoot, baseCommit, runId, waveId, stepId: step.stepId, projectId, runtimeHome, stateStore }));
    }
  } catch (error) {
    // Only generated worktrees are cleaned here. A delivery workspace is never
    // touched by preparation failure.
    await cleanupWaveWorkspaces({ runtimeHome, projectId, runId, waveId, retain: false }).catch(() => {});
    throw error;
  }
  return { integration, steps: stepWorkspaces };
};

export const listChangedPaths = (workspaceRoot) => {
  const result = runGit(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (result.error || result.status !== 0) throw commandError('status', result);
  return [...new Set(String(result.stdout || '').split(/\r?\n/u).filter(Boolean).map((line) => line.slice(3).replaceAll('\\', '/')))].sort();
};

export const createStepResultCommit = ({ workspaceRoot, runId, waveId, stepId, attemptNumber = 1, changedPaths = [] } = {}) => {
  const measured = listChangedPaths(workspaceRoot);
  const selected = changedPaths.length > 0 ? changedPaths : measured;
  if (measured.length === 0) return { commitSha: null, changedPaths: [], patch: '' };
  const add = runGit(workspaceRoot, ['add', '--all', '--', ...selected]);
  if (add.error || add.status !== 0) throw commandError('stage-step-result', add);
  const commit = runGit(workspaceRoot, ['commit', '--no-verify', '-m', `kernel-step ${shortWorktreeToken(runId, 8)}/${shortWorktreeToken(waveId, 8)}/${stepId}/${attemptNumber}`]);
  if (commit.error || commit.status !== 0) throw commandError('commit-step-result', commit);
  const commitSha = gitOutput(workspaceRoot, ['rev-parse', 'HEAD']);
  const patch = String(runGit(workspaceRoot, ['show', '--format=', '--binary', commitSha]).stdout || '');
  return { commitSha, changedPaths: measured, patch };
};

export const cleanupWaveWorkspaces = async ({ runtimeHome = resolveKernelRuntimeHome(), projectId, runId, waveId, repoRoot = null, retain = true } = {}) => {
  const root = worktreeRoot({ runtimeHome, projectId, runId, waveId });
  if (retain) return { retained: true, root };
  if (repoRoot) {
    const listed = runGit(repoRoot, ['worktree', 'list', '--porcelain']);
    if (listed.error || listed.status !== 0) throw commandError('list-worktrees', listed);
    const paths = String(listed.stdout || '').split(/\r?\n/u).filter((line) => line.startsWith('worktree ')).map((line) => line.slice(9));
    for (const candidate of paths.filter((candidate) => candidate.startsWith(root))) {
      assertInside(root, candidate);
      const result = runGit(repoRoot, ['worktree', 'remove', '--force', candidate]);
      if (result.error || result.status !== 0) throw commandError('remove-worktree', result);
    }
    runGit(repoRoot, ['worktree', 'prune']);
  }
  await rm(root, { recursive: true, force: true });
  return { retained: false, root };
};
