// Host turn dispatcher (§11). Pulls the Kernel's directive, asks the Host
// adapter to run the turn under the requested model class, and files the
// receipt. It owns no provider client: `adapter.dispatch` is the only edge.

import { buildUsageReceipt } from './usage-receipt.mjs';
import { createModelRegistry } from './model-registry.mjs';
import { currentHostPolicies, revalidateBeforeDispatch } from './admission-revalidator.mjs';
import { buildPromptEnvelope } from './prompt-envelope.mjs';
import { buildToolManifest } from './tool-manifest.mjs';
import { resolveSessionLineage } from './session-affinity.mjs';
import { buildKernelContextSegments } from '../../kernel/context-segments.mjs';
import { resolveOptimizationModes } from './provider-prompt-policy.mjs';
import { resolveCodexModelPolicy } from './codex-model-policy.mjs';
import { resolveClaudeEffort } from './claude-effort-policy.mjs';

// A decision carries no risk-shape data (security/migration/...) to the Host
// today, only actionKind/riskTier/reasonCodes, so the recommendation below is
// computed from those alone; `shapes` stays at each policy function's
// default. `repeatedFailure` mirrors the predicate summarizeModelRouting()
// already uses to count an escalated turn, so both readings of the same
// decision agree on what counts as a retry escalation.
const isRepeatedFailure = (decision) =>
  (decision.reasonCodes || []).some((code) => code.endsWith('_ESCALATION') || code.endsWith('_REPLAN') || code === 'PROTECTED_OBLIGATION_FAILURE');

// Maps each policy module's internal reason vocabulary onto the receipt's
// closed MODEL_ESCALATION_REASONS enum; a reason with no honest mapping
// (the default-path reasons) reports no escalation rather than 'unknown'.
const ESCALATION_REASON_MAP = Object.freeze({
  'protected-review': 'risk-tier',
  'engineering-review': 'review-policy',
  'planning-action': 'complexity',
  'complex-implementation': 'complexity',
  'routine-batch': 'complexity',
  'repeated-failure-escalation': 'repeated-failure',
  'repeated-failure': 'repeated-failure',
  'user-requested-model': 'user-request',
  'user-requested-reasoning': 'user-request',
  'user-requested': 'user-request',
});

const firstMappedEscalationReason = (reasons = []) => {
  for (const reason of reasons) {
    const mapped = ESCALATION_REASON_MAP[reason];
    if (mapped) return mapped;
  }
  return null;
};

// Resolves the Wave 5/6 provider model-policy recommendation for this turn.
// Returned unconditionally (not gated on modelPolicyMode) so shadow mode can
// still measure what *would* have been chosen; only the caller decides
// whether to apply it to the resolution actually used for admission and
// dispatch.
export const resolveTurnModelPolicy = ({ decision, hostCapabilities } = {}) => {
  const repeatedFailure = isRepeatedFailure(decision);
  if (hostCapabilities.surface === 'codex') {
    const policy = resolveCodexModelPolicy({ actionKind: decision.actionKind, riskTier: decision.riskTier, repeatedFailure });
    return { model: policy.model, effort: policy.reasoning, reasons: policy.reasons };
  }
  if (hostCapabilities.surface === 'claude') {
    const policy = resolveClaudeEffort({ actionKind: decision.actionKind, riskTier: decision.riskTier, triggers: repeatedFailure ? ['repeated-failure'] : [] });
    return { model: null, effort: policy.effort, reasons: policy.reasons };
  }
  return null;
};

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

// Compiles the Host prompt envelope for one turn from the Kernel's `next`
// payload (§Wave 3). Project-stable knowledge is left empty here: `next`
// exposes it today only as `knowledge`, a single pre-rendered text block
// that mixes project- and task-scoped facts, so it cannot yet be split into
// the project-stable / volatile layers the envelope expects. Splitting that
// requires a Kernel-side change to `buildStageContext`'s return shape and is
// tracked separately; this wiring does not fabricate a split it cannot prove.
// Likewise no tool schema reaches this generic dispatcher yet, so the tool
// manifest is empty rather than guessed.
export const buildTurnPromptEnvelope = ({ modelInput = {}, decision, resolution, hostCapabilities, env = process.env } = {}) => {
  const action = modelInput.action || {};
  const step = modelInput.step || {};
  const contextSegments = buildKernelContextSegments({
    runStable: {
      objective: modelInput.objective,
      acceptance: modelInput.acceptance || [],
      constraints: modelInput.constraints || [],
      nonGoals: modelInput.nonGoals || [],
      obligations: action.obligations || [],
    },
    volatile: {
      action: { type: action.type, guidance: action.guidance },
      step: { stepId: step.stepId, objective: step.objective },
      allowedPaths: step.allowedPaths || [],
      forbiddenPaths: step.forbiddenPaths || [],
      evidence: modelInput.evidence || [],
    },
  }).segments;
  return buildPromptEnvelope({
    provider: hostCapabilities.surface,
    surface: hostCapabilities.surface,
    role: decision.role,
    action: decision.actionKind,
    riskTier: decision.riskTier,
    toolManifest: buildToolManifest([]),
    contextSegments,
    modelPolicy: { modelClass: decision.modelClass, resolvedModel: resolution.model, resolvedEffort: resolution.effort },
    capabilities: hostCapabilities,
    control: { runId: decision.runId, stepId: step.stepId, capsuleId: action.capsuleId },
    env,
  });
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
  let resolution = modelRegistry.resolve(decision.modelClass, overrides);
  // Wave 5/6: the model-policy recommendation is computed unconditionally so
  // its reasons can be recorded on the receipt even in shadow mode, but it is
  // only applied to the resolution admission and dispatch actually use when
  // MOON_RELAY_KERNEL_MODEL_POLICY_MODE=on — shadow must not change what runs.
  const modelPolicyMode = resolveOptimizationModes(env).modelPolicyMode;
  const modelPolicyRecommendation = resolveTurnModelPolicy({ decision, hostCapabilities });
  if (modelPolicyMode === 'on' && modelPolicyRecommendation) {
    resolution = {
      ...resolution,
      model: modelPolicyRecommendation.model || resolution.model,
      effort: modelPolicyRecommendation.effort || resolution.effort,
      source: 'model-policy',
      enforcementIntent: 'enforced',
    };
  }
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

  // Wave 3/7: the envelope is computed on every real turn — not only in the
  // replay corpus — so its digests and cache policy are what the launcher and
  // the usage receipt actually see. Computing it here does not itself change
  // `executionContract`, so a Host still on the legacy path behaves exactly
  // as before; a Host whose `launch()` reads `envelope.segments` gets the
  // cache-stable prompt and breakpoints described in Waves 3-5.
  const envelope = buildTurnPromptEnvelope({ modelInput, decision, resolution, hostCapabilities, env });
  // No persisted cross-turn lineage store exists yet (§Wave 7 follow-up), so
  // `previous` stays null and continuity is never claimed (`continued` is
  // always false here). `instanceSeed` still keys the id off this turn's own
  // decisionId, so two independent turns that happen to share the same
  // identity fingerprint do not mint the same sessionLineageId — without it,
  // an aggregate that groups receipts by lineage id would misread them as one
  // continued session.
  const sessionLineage = resolveSessionLineage({ previous: null, current: envelope.cacheIdentity, role: decision.role, instanceSeed: decision.decisionId });

  const startedAt = now();
  let dispatch;
  try {
    dispatch = await adapter.dispatch({
      decision,
      resolution,
      strategy: hostDirective.enforcementStrategy,
      executionCapsule,
      executionContract: buildExecutionContract(modelInput, decision),
      envelope,
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
    envelope,
    sessionLineage,
    cacheContext: {
      modelEscalationReason: modelPolicyMode === 'on' ? firstMappedEscalationReason(modelPolicyRecommendation?.reasons) : null,
    },
  });
  await controlPlane.recordModelUsage(runId, receipt);
  return { schemaVersion: 1, runId, dispatched: true, modelInput, hostDirective, resolution, dispatch, executionCapsule, admission, receipt, envelope };
};
