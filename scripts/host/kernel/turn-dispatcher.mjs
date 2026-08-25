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
import { buildModelCapsuleView } from './model-capsule-view.mjs';
import { dispatchKernelRun } from './wave-dispatcher.mjs';

// A decision carries no risk-shape data (security/migration/...) to the Host
// today, only actionKind/riskTier/reasonCodes, so the recommendation below is
// computed from those alone; `shapes` stays at each policy function's
// default. `repeatedFailure` mirrors the predicate summarizeModelRouting()
// already uses to count an escalated turn, plus 'ESCALATION_LOCKED' — the
// reason resolveModelRoute() emits to KEEP an already-escalated obligation on
// frontier_reasoning for its subsequent attempts. Without it, applying the
// model-policy recommendation on a locked turn would fall through to the
// default Codex Luna/Max (or Claude's default effort) and silently undo
// the very escalation the lock exists to hold.
const isRepeatedFailure = (decision) =>
  decision.workProfile?.repeatedFailure === true
  || (decision.reasonCodes || []).some((code) => code.endsWith('_ESCALATION') || code.endsWith('_REPLAN') || code === 'PROTECTED_OBLIGATION_FAILURE' || code === 'ESCALATION_LOCKED');

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
    const policy = resolveCodexModelPolicy({
      actionKind: decision.actionKind,
      riskTier: decision.riskTier,
      complexity: decision.workProfile?.complexity || 'standard',
      repeatedFailure,
    });
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
    workProfile: decision.workProfile || null,
    action: { type: action.type, guidance: action.guidance || '' },
  };
  if (decision.role === 'reviewer') {
    const acceptanceMatch = String(decision.obligationId || '').match(/^judgment-ac-(\d+)$/i);
    const scopedAcceptance = acceptanceMatch
      ? base.acceptance.filter((entry) => String(entry?.id || '').toUpperCase() === `AC-${acceptanceMatch[1]}`)
      : (decision.obligationId === 'security-review' ? [] : base.acceptance);
    return {
      objective: base.objective,
      acceptance: scopedAcceptance,
      role: base.role,
      permissions: base.permissions,
      changedPaths: modelInput.changedPaths || [],
      // Prior protected judgments are not evidence for a sibling judgment.
      // Passing them here would bypass the review-capsule isolation and can
      // create circular failures between otherwise independent obligations.
      verificationEvidence: (modelInput.evidence || [])
        .filter((entry) => entry.evidenceClass !== 'judgment'),
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
  // The current work unit lives at action.step (run-loop.mjs's buildNextPayload
  // only sets it there for implement/fix actions), not at a top-level `step` —
  // reading the wrong path silently produced an empty step, no allowed/
  // forbidden paths, and a null control stepId on every real turn.
  const step = action.step || {};
  const contextSegments = buildKernelContextSegments({
    runStable: {
      objective: modelInput.objective,
      acceptance: modelInput.acceptance || [],
      constraints: modelInput.constraints || [],
      nonGoals: modelInput.nonGoals || [],
    },
    volatile: {
      action: { type: action.type, guidance: action.guidance },
      step: { stepId: step.stepId, objective: step.objective },
      allowedPaths: step.allowedPaths || [],
      forbiddenPaths: step.forbiddenPaths || [],
      evidence: modelInput.evidence || [],
      // action.obligations is the *outstanding* subset recomputed every turn
      // (run-loop.mjs's buildNextPayload derives it from what has not yet
      // passed) — it shrinks as obligations pass and is absent entirely on a
      // fix action. Classifying it as run-stable would move runStableDigest,
      // and reset cache/session affinity, on every obligation that clears
      // even though the task contract itself never changed. No stable,
      // contract-level obligation set reaches the Host at this layer today
      // (a known gap, not silently worked around), so this stays volatile.
      outstandingObligations: action.obligations || [],
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

// Wayfinder workers still use the normal Host routing boundary. The wave
// dispatcher obtains the Kernel directive for each Step, then calls this
// helper before it reaches an adapter so model resolution, route admission,
// dispatch-time revalidation, and the prompt envelope cannot be skipped by the
// parallel path.
export const prepareWayfinderWorkerDispatch = async ({
  controlPlane,
  runId,
  adapter,
  hosted,
  step,
  registry = null,
  runtimeHome,
  env = process.env,
  overrides = {},
  toolPolicy = {},
  permissionPolicy = {},
  economics = {},
} = {}) => {
  const hostCapabilities = adapter?.capabilities || {};
  const modelInput = hosted?.modelInput || {};
  const hostDirective = hosted?.hostDirective || {};
  const decision = hostDirective.modelRouteDecision;
  if (!decision) return { status: 'failed', failureCode: 'worker-route-missing' };
  if (decision.modelClass === 'kernel') return { status: 'failed', failureCode: 'kernel-owned-worker-action' };

  const modelRegistry = registry || createModelRegistry({ surface: hostCapabilities.surface, runtimeHome, env, overrides });
  let resolution = modelRegistry.resolve(decision.modelClass, overrides);
  const modes = resolveOptimizationModes(env);
  const modelPolicyMode = hostCapabilities.surface === 'codex' ? modes.codexModelPolicyMode : modes.modelPolicyMode;
  const modelPolicyRecommendation = resolveTurnModelPolicy({ decision, hostCapabilities });
  if (modelPolicyMode === 'on' && modelPolicyRecommendation && resolution.source !== 'invocation-override') {
    const appliedModel = modelPolicyRecommendation.model || resolution.model;
    resolution = {
      ...resolution,
      model: appliedModel,
      effort: modelPolicyRecommendation.effort || resolution.effort,
      ...(appliedModel ? { source: 'model-policy', enforcementIntent: 'enforced' } : {}),
    };
  }

  const executionCapsule = hosted.executionCapsule || hostDirective.executionCapsule || null;
  const attemptId = hostDirective.attemptId || null;
  const policies = currentHostPolicies({ registry: modelRegistry, capabilities: hostCapabilities, toolPolicy, permissionPolicy });
  const admission = await controlPlane.admitRoute(runId, {
    decision,
    resolution,
    capabilities: hostCapabilities,
    capsule: executionCapsule,
    attemptId,
    step,
    policies,
    economics,
  });
  if (admission.decision === 'blocked' || admission.decision === 'redecision_required') {
    return { status: 'failed', failureCode: admission.rejectionCode || admission.decision, modelInput, hostDirective, decision, resolution, executionCapsule, admission };
  }

  const revalidated = revalidateBeforeDispatch({
    admission,
    registry: modelRegistry,
    capabilities: hostCapabilities,
    toolPolicy,
    permissionPolicy,
  });
  if (!revalidated.valid) {
    const drifted = await controlPlane.admitRoute(runId, {
      decision,
      resolution,
      capabilities: hostCapabilities,
      capsule: executionCapsule,
      attemptId,
      step,
      policies: currentHostPolicies({ registry: modelRegistry, capabilities: hostCapabilities, toolPolicy, permissionPolicy }),
      economics,
    });
    return { status: 'failed', failureCode: revalidated.rejectionCode || 'route-admission-drift', modelInput, hostDirective, decision, resolution, executionCapsule, admission: drifted, drift: revalidated.drift };
  }

  return {
    status: 'ready',
    runId,
    modelInput,
    hostDirective,
    decision,
    resolution,
    executionCapsule,
    modelVisibleCapsule: executionCapsule ? buildModelCapsuleView(executionCapsule, { role: decision.role }) : null,
    executionContract: buildExecutionContract(modelInput, decision),
    admission,
    strategy: hostDirective.enforcementStrategy,
    envelope: buildTurnPromptEnvelope({ modelInput, decision, resolution, hostCapabilities, env }),
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
  parentSessionConfig = null,
  toolPolicy = {},
  permissionPolicy = {},
  economics = {},
  now = () => new Date().toISOString(),
} = {}) => {
  if (!adapter) throw new Error('dispatchKernelTurn requires a Host adapter');
  const wayfinderMode = String(env.MOON_RELAY_KERNEL_WAYFINDER_MODE || 'shadow').toLowerCase();
  if (wayfinderMode === 'on' && actionContext.skipWayfinder !== true && controlPlane?.getExecutableSteps) {
    return dispatchKernelRun({
      controlPlane,
      runId,
      adapter,
      projectRoot: controlPlane.projectRoot,
      runtimeHome,
      stateStore: controlPlane.stateStore,
      parentSessionId,
      parentSessionConfig,
      env,
      actionContext,
      prepareDispatch: ({ hosted, step }) => prepareWayfinderWorkerDispatch({
        controlPlane,
        runId,
        adapter,
        hosted,
        step,
        registry,
        runtimeHome,
        env,
        overrides,
        toolPolicy,
        permissionPolicy,
        economics,
      }),
      sequentialDispatcher: () => dispatchKernelTurn({
        controlPlane,
        runId,
        adapter,
        registry,
        runtimeHome,
        env,
        overrides,
        actionContext: { ...actionContext, skipWayfinder: true },
        parentSessionId,
        parentSessionConfig,
        toolPolicy,
        permissionPolicy,
        economics,
        now,
      }),
    });
  }
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
  // Codex uses its provider-specific switch; Claude continues to use the
  // generic switch. Shadow must never change what actually runs.
  const modes = resolveOptimizationModes(env);
  const modelPolicyMode = hostCapabilities.surface === 'codex' ? modes.codexModelPolicyMode : modes.modelPolicyMode;
  const modelPolicyRecommendation = resolveTurnModelPolicy({ decision, hostCapabilities });
  // 'invocation-override' is the registry's own highest-precedence source
  // (§10.2: an explicit per-call override outranks environment, profile, and
  // host-default). Applying the model-policy recommendation on top of it would
  // silently run a different model than the one a caller explicitly asked
  // for — e.g. an experiment pinning a specific model for one call.
  if (modelPolicyMode === 'on' && modelPolicyRecommendation && resolution.source !== 'invocation-override') {
    const appliedModel = modelPolicyRecommendation.model || resolution.model;
    resolution = {
      ...resolution,
      model: appliedModel,
      effort: modelPolicyRecommendation.effort || resolution.effort,
      // Claiming 'model-policy'/'enforced' asserts a concrete, Host-decided
      // model exists. Claude's recommendation supplies only an effort, so a
      // registry with no configured model would otherwise still flip to
      // 'enforced' with no model behind it — letting a T3 review's
      // checkRoleRules() pass on an unproven resolution. Only claim it when
      // the merge actually produced a model.
      ...(appliedModel ? { source: 'model-policy', enforcementIntent: 'enforced' } : {}),
    };
  }
  // K1: the capsule is the authority for what the worker may see and touch.
  // The flat contract is still passed for adapters that have not moved yet.
  const executionCapsule = turn.executionCapsule || hostDirective.executionCapsule || null;
  const attemptId = hostDirective.attemptId || null;
  const attempt = hostDirective.attempt || null;

  // K3: admission sits between the decision and the dispatch. A blocked or
  // drifted admission stops the turn here — no worker runs, and the refusal is
  // persisted rather than looking like a turn that never happened.
  const policies = currentHostPolicies({ registry: modelRegistry, capabilities: hostCapabilities, toolPolicy, permissionPolicy });
  const admission = await controlPlane.admitRoute(runId, {
    decision,
    resolution,
    capabilities: hostCapabilities,
    capsule: executionCapsule,
    attemptId,
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
      attemptId,
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

  // Wave 3: the launcher gets the allowlisted model-visible projection, never
  // the persisted capsule — the persisted one carries control/provenance
  // fields (capsuleId, mutationRevision, workspaceIdentity, ...) that must
  // not enter a cacheable prompt. `executionCapsule` below (unprojected)
  // still flows to admission and the receipt, where that lineage is required.
  const modelVisibleCapsule = executionCapsule ? buildModelCapsuleView(executionCapsule, { role: decision.role }) : null;

  const startedAt = now();
  let dispatch;
  try {
    dispatch = await adapter.dispatch({
      decision,
      resolution,
      strategy: hostDirective.enforcementStrategy,
      executionCapsule: modelVisibleCapsule,
      executionContract: buildExecutionContract(modelInput, decision),
      envelope,
      workingDirectory: controlPlane.projectRoot || null,
      environment: env,
      parentSessionId,
      parentSessionConfig,
      concurrencyGroup: actionContext.concurrencyGroup || runId,
      childSession: {
        role: decision.role,
        canDelegate: false,
        canCommit: false,
        freshSessionRequired: decision.workProfile?.independentContextRequired === true || decision.independentContextRequired === true || decision.role === 'reviewer',
      },
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
    attemptId,
    bindingId: attempt?.bindingId || null,
    actorSessionId: dispatch.actorSessionId || `${hostCapabilities.surface}:${decision.decisionId}`,
    parentSessionId,
    startedAt,
    finishedAt: now(),
    envelope,
    sessionLineage,
    cacheContext: {
      // Recorded regardless of modelPolicyMode: the whole point of computing
      // the recommendation unconditionally is that shadow mode can measure
      // which turns *would* have escalated (for risk, complexity, review
      // policy, or repeated failure) before the mode is ever turned on.
      // Gating this on 'on' discarded the only receipt-level evidence of
      // that measurement.
      modelEscalationReason: firstMappedEscalationReason(modelPolicyRecommendation?.reasons),
      // The denominator eligibleHitRatio needs: the token estimate of every
      // segment this turn declared cacheable. Without it every live receipt
      // reports a null eligiblePrefixTokens, so summarizeCacheEconomics() can
      // never publish a real hit ratio outside the replay corpus.
      eligiblePrefixTokens: envelope.segments.filter((segment) => segment.cacheable).reduce((total, segment) => total + segment.tokenEstimate, 0),
    },
  });
  await controlPlane.recordModelUsage(runId, receipt);
  return {
    schemaVersion: 1,
    runId,
    dispatched: true,
    modelInput,
    hostDirective,
    resolution,
    dispatch,
    executionCapsule,
    admission,
    receipt,
    envelope,
    attemptId,
    report: dispatch.report
      ? {
        ...dispatch.report,
        attemptId,
        bindingId: attempt?.bindingId || dispatch.report.bindingId,
        assignmentId: dispatch.report.assignmentId || hostDirective.actorAssignment?.assignmentId || null,
        actorSessionId: dispatch.report.actorSessionId || dispatch.actorSessionId || null,
      }
      : null,
  };
};
