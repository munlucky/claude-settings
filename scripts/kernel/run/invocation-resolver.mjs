import { canonicalizeHostSessionId } from './host-session.mjs';
import { createOpaqueRunId } from './run-identity.mjs';
import { normalizeTaskContract } from '../task/task-contract.mjs';
import { classifyContractChange } from '../change-contract.mjs';

const codedError = (code, nextAction) => Object.assign(new Error(code), {
  code,
  errorCode: code,
  nextAction,
});

const normalizedContract = (taskContract) => {
  if (!taskContract || Object.keys(taskContract).length === 0) return null;
  if (taskContract.schemaVersion === 1 && taskContract.digest) return taskContract;
  return normalizeTaskContract(taskContract, {
    objective: taskContract.objective || 'Kernel execution task',
  });
};

export const resolveBoundInvocation = ({
  stateStore,
  projectId,
  provider,
  sessionId,
  workspaceId,
  worktreeId = null,
  explicitRunId = null,
  envRunId = null,
  taskContract = null,
} = {}) => {
  if (!stateStore || !projectId || (!worktreeId && !workspaceId)) {
    throw codedError('host_binding_missing', 'reopen-from-correct-worktree');
  }
  const canonicalSessionId = sessionId
    ? canonicalizeHostSessionId({ provider, sessionId })
    : null;
  if (sessionId && canonicalSessionId !== sessionId) {
    throw codedError('provider_session_invalid', 'reopen-from-correct-worktree');
  }
  const contract = normalizedContract(taskContract);
  const requestedRunId = explicitRunId || envRunId || null;
  const registeredWorkspace = workspaceId
    ? stateStore.getProjectWorkspace?.(workspaceId) || null
    : null;
  const effectiveWorktreeId = worktreeId || registeredWorkspace?.worktreeId || null;
  const binding = canonicalSessionId
    ? stateStore.getActiveOwnerBinding({
        projectId,
        sessionId: canonicalSessionId,
        workspaceId,
      })
    : null;

  const assertRunBinding = (run) => {
    if (run.projectId !== projectId) {
      throw codedError('run_project_mismatch', 'relaunch-from-bound-project');
    }
    if (run.worktreeId) {
      if (!effectiveWorktreeId || run.worktreeId !== effectiveWorktreeId) {
        throw codedError('run_worktree_mismatch', 'return-to-bound-worktree');
      }
    } else if (run.workspaceId && run.workspaceId !== workspaceId) {
      // Legacy Runs remain addressable through workspaceId, but a workspace-*
      // compatibility id is never compared directly with a worktree-* id.
      throw codedError('run_workspace_mismatch', 'return-to-bound-workspace');
    }
    return run;
  };

  const candidateRuns = typeof stateStore.listRuns === 'function'
    ? stateStore.listRuns({
        projectId,
        ...(effectiveWorktreeId ? { worktreeId: effectiveWorktreeId } : { workspaceId }),
        statuses: ['active', 'blocked'],
      })
    : typeof stateStore.listActiveRuns === 'function'
      ? stateStore.listActiveRuns({
          projectId,
          ...(effectiveWorktreeId ? { worktreeId: effectiveWorktreeId } : { workspaceId }),
        })
      : [];
  const worktreeLease = effectiveWorktreeId && typeof stateStore.getWorktreeMutationLease === 'function'
    ? stateStore.getWorktreeMutationLease(effectiveWorktreeId)
    : null;
  const mutableRuns = candidateRuns.filter((run) => run.status === 'active'
    || (run.status === 'blocked'
      && worktreeLease?.projectId === projectId
      && worktreeLease?.holderRunId === run.runId));
  if (mutableRuns.length > 1) {
    throw codedError('worktree_run_conflict', 'resolve-conflicting-active-runs');
  }
  const mutableRun = mutableRuns[0] || null;
  const requestedRun = requestedRunId ? stateStore.getRun(requestedRunId) : null;
  if (requestedRun) assertRunBinding(requestedRun);

  if (requestedRunId && mutableRun && requestedRunId !== mutableRun.runId) {
    throw codedError('worktree_run_conflict', 'resume-the-worktree-bound-run');
  }

  const latestRun = typeof stateStore.getLatestRunForWorktree === 'function'
    ? stateStore.getLatestRunForWorktree({
        projectId,
        ...(effectiveWorktreeId ? { worktreeId: effectiveWorktreeId } : { workspaceId }),
      })
    : null;
  const boundRun = binding?.runId ? stateStore.getRun(binding.runId) : null;
  const compatibleBoundRun = boundRun
    ? (() => {
        try { return assertRunBinding(boundRun); } catch { return null; }
      })()
    : null;
  if (
    requestedRunId
    && !requestedRun
    && compatibleBoundRun?.status === 'active'
    && compatibleBoundRun.runId !== requestedRunId
  ) {
    throw codedError('worktree_run_conflict', 'resume-the-worktree-bound-run');
  }
  const cursorRun = requestedRun || mutableRun || latestRun || compatibleBoundRun;

  if (!cursorRun) {
    if (!contract) throw codedError('host_binding_missing', 'supply-a-task-contract');
    return {
      mode: 'create',
      runId: requestedRunId || createOpaqueRunId(),
      predecessorRunId: null,
      binding: null,
      reason: 'no-worktree-cursor',
      taskContract: contract,
      changeClass: null,
    };
  }
  assertRunBinding(cursorRun);
  const cursorBinding = binding?.runId === cursorRun.runId ? binding : null;

  if (cursorRun.status === 'active' || cursorRun.status === 'blocked') {
    const revised = Boolean(contract && cursorRun.taskContract?.digest !== contract.digest);
    return {
      mode: revised ? 'revise' : 'resume',
      runId: cursorRun.runId,
      predecessorRunId: null,
      binding: cursorBinding,
      reason: revised
        ? 'worktree-run-contract-changed'
        : cursorRun.status === 'blocked' ? 'blocked-worktree-run' : 'active-worktree-run',
      taskContract: contract,
      changeClass: contract ? classifyContractChange({ previous: cursorRun.taskContract, next: contract }) : null,
    };
  }

  if (cursorRun.status === 'completed') {
    if (cursorRun.finalizationStatus !== 'completed') {
      return {
        mode: 'finalization-retry',
        runId: cursorRun.runId,
        predecessorRunId: null,
        binding: cursorBinding,
        reason: 'completed-run-finalization-incomplete',
        taskContract: contract,
        changeClass: contract ? classifyContractChange({ previous: cursorRun.taskContract, next: contract }) : null,
      };
    }
    if (!contract || cursorRun.taskContract?.digest === contract.digest) {
      return {
        mode: 'done',
        runId: cursorRun.runId,
        predecessorRunId: null,
        binding: cursorBinding,
        reason: contract ? 'same-contract-already-complete' : 'no-new-task-contract',
        taskContract: contract,
        changeClass: null,
      };
    }
    return {
      mode: 'successor',
      runId: createOpaqueRunId(),
      predecessorRunId: cursorRun.runId,
      binding: cursorBinding,
      reason: 'new-contract-after-completed-finalization',
      taskContract: contract,
      changeClass: classifyContractChange({ previous: cursorRun.taskContract, next: contract }),
    };
  }

  if (cursorRun.status === 'abandoned') {
    if (!contract) {
      throw codedError('no_active_run', 'supply-a-task-contract');
    }
    return {
      mode: 'create',
      runId: requestedRunId || createOpaqueRunId(),
      predecessorRunId: null,
      binding: null,
      reason: 'new-run-after-abandon',
      taskContract: contract,
      changeClass: null,
    };
  }

  throw codedError('run_access_denied', 'inspect-worktree-cursor');
};
