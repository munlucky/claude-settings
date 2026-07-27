// Host turn dispatcher (§11). Pulls the Kernel's directive, asks the Host
// adapter to run the turn under the requested model class, and files the
// receipt. It owns no provider client: `adapter.dispatch` is the only edge.

import { buildUsageReceipt } from './usage-receipt.mjs';
import { createModelRegistry } from './model-registry.mjs';
import { currentHostPolicies, revalidateBeforeDispatch } from './admission-revalidator.mjs';

// Only the execution contract crosses to the worker (§4.4) — never the
// planner's reasoning, the conversation, or unrelated repository context.
export const buildExecutionContract = (modelInput = {}, decision = {}) => {
  const action = modelInput.action || {};
  const base = {
    objective: modelInput.objective || '',
    acceptance: modelInput.acceptance || [],
    constraints: modelInput.constraints || [],
    nonGoals: modelInput.nonGoals || [],
    role: decision.role,
    permissions: decision.permissions,
    action: { type: action.type, guidance: action.guidance || '' },
  };
  if (decision.role === 'reviewer') {
    return {
      objective: base.objective,
      acceptance: base.acceptance,
      role: base.role,
      permissions: base.permissions,
      changedPaths: modelInput.changedPaths || [],
      verificationEvidence: modelInput.evidence || [],
      riskTier: decision.riskTier,
    };
  }
  return {
    ...base,
    outstandingObligations: action.outstandingObligations || [],
    requiredEvidence: action.obligations || [],
    currentEvidence: modelInput.evidence || [],
  };
};

export const dispatchKernelTurn = async ({
  controlPlane,
  runId,
  adapter,
  registry,
  runtimeHome,
  env = process.env,
  overrides = {},
  actionContext = {},
  parentSessionId = null,
  toolPolicy = {},
  permissionPolicy = {},
  economics = {},
  now = () => new Date().toISOString(),
} = {}) => {
  if (!adapter) throw new Error('dispatchKernelTurn requires a Host adapter');
  const hostCapabilities = adapter.capabilities;
  const turn = await controlPlane.hostNext(runId, { hostCapabilities, actionContext });
  if (turn.status === 'not_found') return turn;

  const { modelInput, hostDirective } = turn;
  const decision = hostDirective.modelRouteDecision;
  // prove/close belong to the trusted proof runtime; dispatching a model for
  // them would hand completion authority to a provider.
  if (decision.modelClass === 'kernel') {
    return { schemaVersion: 1, runId, dispatched: false, reason: 'kernel-owned-action', modelInput, hostDirective, receipt: null };
  }

  const modelRegistry = registry || createModelRegistry({ surface: hostCapabilities.surface, runtimeHome, env, overrides });
  const resolution = modelRegistry.resolve(decision.modelClass, overrides);
  // K1: the capsule is the authority for what the worker may see and touch.
  // The flat contract is still passed for adapters that have not moved yet.
  const executionCapsule = turn.executionCapsule || hostDirective.executionCapsule || null;

  // K3: admission sits between the decision and the dispatch. A blocked or
  // drifted admission stops the turn here — no worker runs, and the refusal is
  // persisted rather than looking like a turn that never happened.
  const policies = currentHostPolicies({ registry: modelRegistry, capabilities: hostCapabilities, toolPolicy, permissionPolicy });
  const admission = await controlPlane.admitRoute(runId, {
    decision,
    resolution,
    capabilities: hostCapabilities,
    capsule: executionCapsule,
    policies,
    economics,
  });
  if (admission.decision === 'blocked' || admission.decision === 'redecision_required') {
    return { schemaVersion: 1, runId, dispatched: false, reason: admission.rejectionCode || admission.decision, admission, modelInput, hostDirective, executionCapsule, receipt: null };
  }
  const revalidated = revalidateBeforeDispatch({
    admission,
    registry: modelRegistry,
    capabilities: adapter.capabilities,
    toolPolicy,
    permissionPolicy,
  });
  if (!revalidated.valid) {
    const drifted = await controlPlane.admitRoute(runId, {
      decision,
      resolution,
      capabilities: adapter.capabilities,
      capsule: executionCapsule,
      policies: currentHostPolicies({ registry: modelRegistry, capabilities: adapter.capabilities, toolPolicy, permissionPolicy }),
      economics,
    });
    return { schemaVersion: 1, runId, dispatched: false, reason: revalidated.rejectionCode, admission: drifted, drift: revalidated.drift, modelInput, hostDirective, executionCapsule, receipt: null };
  }

  const startedAt = now();
  let dispatch;
  try {
    dispatch = await adapter.dispatch({
      decision,
      resolution,
      strategy: hostDirective.enforcementStrategy,
      executionCapsule,
      executionContract: buildExecutionContract(modelInput, decision),
    }) || {};
  } catch (error) {
    dispatch = { status: 'failed', resultStatus: 'failed', errorSummary: error.message };
  }

  const receipt = buildUsageReceipt({
    decision,
    capabilities: hostCapabilities,
    strategy: hostDirective.enforcementStrategy,
    resolution,
    dispatch,
    capsule: executionCapsule,
    admission,
    actorSessionId: dispatch.actorSessionId || `${hostCapabilities.surface}:${decision.decisionId}`,
    parentSessionId,
    startedAt,
    finishedAt: now(),
  });
  await controlPlane.recordModelUsage(runId, receipt);
  return { schemaVersion: 1, runId, dispatched: true, modelInput, hostDirective, resolution, dispatch, executionCapsule, admission, receipt };
};
