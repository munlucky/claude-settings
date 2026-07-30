import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { capsuleStaleness } from './execution-capsule.mjs';
import { findScopeViolations } from './capsule-selection.mjs';

export const MUTATION_OPERATIONS = Object.freeze([
  'file_write', 'file_delete', 'git_commit', 'git_checkout', 'git_reset',
  'dependency_install', 'migration', 'destructive_command',
]);

const fail = (code, message) => {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
};

const canonicalWorkspace = (workspaceRoot) => realpathSync(path.resolve(workspaceRoot));

export const canonicalMutationPath = ({ workspaceRoot, targetPath, platform = process.platform } = {}) => {
  const root = canonicalWorkspace(workspaceRoot);
  const requested = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(root, targetPath);
  let cursor = requested;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const resolvedBase = realpathSync(cursor);
  const resolved = path.resolve(resolvedBase, path.relative(cursor, requested));
  const normalizeCase = (value) => platform === 'win32' ? value.toLowerCase() : value;
  const comparableRoot = normalizeCase(root);
  const comparable = normalizeCase(resolved);
  if (comparable !== comparableRoot && !comparable.startsWith(`${comparableRoot}${path.sep}`)) {
    fail('mutation_outside_workspace', `target escapes workspace: ${targetPath}`);
  }
  const relative = path.relative(root, resolved).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    if (!relative) return '.';
    fail('mutation_outside_workspace', `target escapes workspace: ${targetPath}`);
  }
  return relative;
};

export const assertMutationAllowed = ({
  stateStore,
  workspaceRoot,
  runId,
  stepId,
  capsuleId,
  operation,
  targetPaths = [],
  fencingToken = null,
  sessionToken = null,
} = {}) => {
  if (!stateStore || !workspaceRoot) fail('mutation_guard_invalid', 'stateStore and workspaceRoot are required');
  if (!MUTATION_OPERATIONS.includes(operation)) fail('mutation_operation_unknown', operation);
  const run = stateStore.getRun(runId);
  if (!run || run.status !== 'active') fail('mutation_run_inactive', runId);
  const step = stateStore.getRunStep(runId, stepId);
  if (!step || !['ready', 'active'].includes(step.state)) fail('mutation_step_inactive', stepId);
  const capsule = stateStore.getExecutionCapsule(capsuleId, { runId });
  if (!capsule || capsule.stepId !== stepId || capsule.role !== 'implementer') fail('mutation_capsule_invalid', capsuleId);
  const stale = capsuleStaleness({ capsule, run });
  if (stale.stale) fail('mutation_capsule_stale', stale.reasons.join(', '));
  if (capsule.expiresAt && Date.parse(capsule.expiresAt) <= Date.now()) fail('mutation_capsule_expired', capsuleId);
  if (['git_reset', 'destructive_command'].includes(operation)) fail('mutation_operation_forbidden', operation);
  if (operation === 'git_commit' && capsule.permissions?.canCommit !== true) fail('mutation_operation_forbidden', operation);

  const lock = run.workspaceId
    ? stateStore.getWorkspaceMutationLockV2(run.workspaceId)
    : stateStore.getWorkspaceMutationLock(run.projectId);
  if (!lock) {
    fail('workspace_mutation_lock_missing', run.projectId);
  }
  if (fencingToken === null || fencingToken === undefined || !sessionToken) {
    fail('mutation_fence_credentials_missing', run.projectId);
  }
  if (
    lock.holderRunId !== runId
    || lock.fencingToken !== fencingToken
    || lock.sessionToken !== sessionToken
  ) {
    fail('workspace_mutation_fence_mismatch', run.projectId);
  }

  const relativePaths = targetPaths.map((targetPath) => canonicalMutationPath({ workspaceRoot, targetPath }));
  const violations = findScopeViolations({
    changedPaths: relativePaths,
    allowedPaths: capsule.workUnit?.allowedPaths || [],
    forbiddenPaths: capsule.workUnit?.forbiddenPaths || [],
  });
  if (violations.length) fail('mutation_path_forbidden', violations.map((item) => item.path).join(', '));
  return { allowed: true, runId, stepId, capsuleId, operation, targetPaths: relativePaths, fencingToken: lock?.fencingToken || null };
};
