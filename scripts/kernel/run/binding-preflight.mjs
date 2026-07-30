const ACCESS = Object.freeze({
  next: ['owner'],
  report: ['owner'],
  blocker: ['owner'],
  resume: ['owner'],
  finalize: ['owner'],
  status: ['owner', 'reviewer', 'read_only'],
  context: ['owner', 'reviewer', 'read_only'],
});

export class KernelBindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'KernelBindingError';
    this.code = code;
  }
}

const fail = (code) => { throw new KernelBindingError(code); };

export const bindingErrorPayload = (error) => ({
  schemaVersion: 1,
  status: 'error',
  errorCode: error?.code || error?.message || 'host_binding_missing',
});

export const assertBoundRunAccess = ({
  stateStore,
  requestedRunId,
  currentProject,
  currentWorkspace = null,
  sessionId,
  requiredAccess,
  command,
} = {}) => {
  if (!sessionId || !requestedRunId) fail('host_binding_missing');
  const projectId = currentProject?.projectId || currentProject;
  if (!projectId) fail('run_project_mismatch');
  const binding = stateStore.getActiveRunBinding({
    projectId,
    sessionId,
    runId: requestedRunId,
  });
  if (!binding) {
    const observedScope = stateStore.getActiveRunBindingScope({
      sessionId,
      runId: requestedRunId,
    });
    if (observedScope && observedScope.projectId !== projectId) fail('run_project_mismatch');
    fail('host_binding_missing');
  }
  if (binding.expiresAt && Date.parse(binding.expiresAt) <= Date.now()) fail('binding_expired');
  if (binding.status !== 'active') fail('binding_expired');
  if (binding.runId !== String(requestedRunId)) fail('run_session_mismatch');
  const run = stateStore.getRunMetadata(requestedRunId);
  if (!run) fail('active_run_not_found');
  if (!projectId || run.projectId !== projectId || binding.projectId !== projectId) fail('run_project_mismatch');
  if (binding.sessionId !== String(sessionId)) fail('run_session_mismatch');
  if (binding.accessMode === 'owner' && run.ownerBindingId !== binding.bindingId) fail('run_access_denied');
  const allowed = ACCESS[requiredAccess || command] || ['owner'];
  if (!allowed.includes(binding.accessMode)) fail('run_access_denied');
  const workspaceId = currentWorkspace?.workspaceId || currentWorkspace;
  if (run.workspaceId && binding.workspaceId !== run.workspaceId) fail('run_workspace_mismatch');
  if (workspaceId && binding.workspaceId && workspaceId !== binding.workspaceId) fail('run_workspace_mismatch');
  return { run, binding, projectId, workspaceId: binding.workspaceId, accessMode: binding.accessMode };
};
