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
  explicitRunId = null,
  envRunId = null,
  taskContract = null,
} = {}) => {
  if (!stateStore || !projectId || !workspaceId) {
    throw codedError('host_binding_missing', 'relaunch-through-kernel-host');
  }
  const canonicalSessionId = canonicalizeHostSessionId({ provider, sessionId });
  if (canonicalSessionId !== sessionId) {
    throw codedError('provider_session_invalid', 'relaunch-through-kernel-host');
  }
  const contract = normalizedContract(taskContract);
  const binding = stateStore.getActiveOwnerBinding({
    projectId,
    sessionId: canonicalSessionId,
  });
  const requestedRunId = explicitRunId || envRunId || null;

  if (binding && requestedRunId && binding.runId !== requestedRunId) {
    throw codedError('run_session_mismatch', 'resume-the-bound-run');
  }

  if (!binding) {
    if (!contract && !requestedRunId) {
      throw codedError('host_binding_missing', 'supply-a-task-contract');
    }
    if (requestedRunId) {
      const requestedRun = stateStore.getRun(requestedRunId);
      if (requestedRun) {
        if (requestedRun.projectId !== projectId) {
          throw codedError('run_project_mismatch', 'relaunch-from-bound-project');
        }
        if (requestedRun.workspaceId && requestedRun.workspaceId !== workspaceId) {
          throw codedError('run_workspace_mismatch', 'return-to-bound-workspace');
        }
        return {
          mode: contract && requestedRun.taskContract?.digest !== contract.digest
            ? 'revise'
            : 'resume',
          runId: requestedRunId,
          predecessorRunId: null,
          binding: null,
          reason: 'explicit-unbound-run',
          taskContract: contract,
          changeClass: contract ? classifyContractChange({ previous: requestedRun.taskContract, next: contract }) : null,
        };
      }
    }
    if (!contract) {
      throw codedError('host_binding_missing', 'supply-a-task-contract');
    }
    return {
      mode: 'create',
      runId: requestedRunId || createOpaqueRunId(),
      predecessorRunId: null,
      binding: null,
      reason: 'no-active-owner-binding',
      taskContract: contract,
      changeClass: null,
    };
  }

  const run = stateStore.getRun(binding.runId);
  if (!run) throw codedError('run_access_denied', 'inspect-active-owner-binding');
  if (run.projectId !== projectId) {
    throw codedError('run_project_mismatch', 'relaunch-from-bound-project');
  }
  const workspaceChanged = (
    (binding.workspaceId && binding.workspaceId !== workspaceId)
    || (run.workspaceId && run.workspaceId !== workspaceId)
  );
  const finalizedSuccessorRequested = run.status === 'completed'
    && run.finalizationStatus === 'completed'
    && contract
    && run.taskContract?.digest !== contract.digest;
  if (workspaceChanged && !finalizedSuccessorRequested) {
    throw codedError('run_workspace_mismatch', 'return-to-bound-workspace');
  }
  if (workspaceChanged) {
    const successorWorkspace = stateStore.getProjectWorkspace?.(workspaceId);
    if (!successorWorkspace || successorWorkspace.projectId !== projectId) {
      throw codedError('run_workspace_mismatch', 'register-a-project-worktree');
    }
  }

  if (run.status === 'completed') {
    if (run.finalizationStatus !== 'completed') {
      return {
        mode: 'finalization-retry',
        runId: run.runId,
        predecessorRunId: null,
        binding,
        reason: 'completed-run-finalization-incomplete',
        taskContract: contract,
        changeClass: contract ? classifyContractChange({ previous: run.taskContract, next: contract }) : null,
      };
    }
    if (!contract || run.taskContract?.digest === contract.digest) {
      return {
        mode: 'done',
        runId: run.runId,
        predecessorRunId: null,
        binding,
        reason: contract ? 'same-contract-already-complete' : 'no-new-task-contract',
        taskContract: contract,
        changeClass: null,
      };
    }
    return {
      mode: 'successor',
      runId: createOpaqueRunId(),
      predecessorRunId: run.runId,
      binding,
      reason: 'new-contract-after-completed-finalization',
      taskContract: contract,
      changeClass: classifyContractChange({ previous: run.taskContract, next: contract }),
    };
  }

  return {
    mode: contract && run.taskContract?.digest !== contract.digest ? 'revise' : 'resume',
    runId: run.runId,
    predecessorRunId: null,
    binding,
    reason: contract && run.taskContract?.digest !== contract.digest
      ? 'active-run-contract-changed'
      : 'active-owner-binding',
    taskContract: contract,
    changeClass: contract ? classifyContractChange({ previous: run.taskContract, next: contract }) : null,
  };
};
