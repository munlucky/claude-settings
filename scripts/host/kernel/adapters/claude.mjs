// Claude Host adapter (§11.1). Maps an explicitly delegated Kernel role onto a
// Claude subagent and injects the model id from the Host registry. Ordinary
// work remains in the current native owner surface.

import { isNativeDelegationRequested } from '../codex-actor-router.mjs';

export const CLAUDE_AGENT_FOR_ROLE = Object.freeze({
  planner: 'kernel-planner',
  implementer: 'kernel-implementer',
  reviewer: 'kernel-reviewer',
});

export const CLAUDE_CAPABILITIES = Object.freeze({
  surface: 'claude',
  supportsSubagentModel: true,
  supportsSessionModelOverride: false,
  supportsIndependentContext: true,
  supportsCrossSurfaceReview: true,
  supportsReadOnlyReview: true,
  supportsUsageTokens: true,
  supportsResolvedModelIdentity: true,
  // Wave 7. Claude marks cacheable prefixes explicitly and reports read and
  // write token counts separately, so both are observable rather than inferred.
  supportsPromptCache: true,
  supportsExplicitCacheBreakpoints: true,
  supportsCacheReadTokens: true,
  supportsCacheWriteTokens: true,
  supportsSessionContinuation: true,
  // Responses-API-only features. Claude has no equivalent surface here, and
  // claiming one would produce requests that fail at dispatch.
  supportsPersistedReasoning: false,
  supportsProgrammaticToolCalling: false,
  supportsProMode: false,
  supportsFastMode: false,
  supportsUltra: false,
});

export const buildClaudeInvocation = ({ decision, resolution }) => {
  const subagent = CLAUDE_AGENT_FOR_ROLE[decision.role];
  if (!subagent) throw new Error(`No Claude subagent is defined for Kernel role: ${decision.role}`);
  return {
    subagent,
    model: resolution.model,
    effort: resolution.effort,
    permissions: decision.permissions,
    readOnly: decision.permissions === 'read_only',
    // Reviews and escalated work must not inherit the implementer's context;
    // T3 additionally requires a distinct session identity.
    freshContext: decision.role !== 'implementer' || decision.independentContextRequired,
    independentSessionRequired: decision.independentContextRequired === true,
  };
};

const ownerDirectDispatch = ({ decision, resolution, parentSessionId = null } = {}) => ({
  status: 'owner-direct',
  resultStatus: 'interrupted',
  executionMode: 'owner-direct',
  dispatchMechanism: 'owner-direct',
  requestedModel: resolution?.model || null,
  requestedEffort: resolution?.effort || null,
  actorRole: decision?.role || null,
  actorSessionId: null,
  parentSessionId,
  outcome: null,
  report: null,
});

const reviewPendingDispatch = ({ decision, resolution, parentSessionId = null } = {}) => ({
  status: 'review-required',
  resultStatus: 'interrupted',
  executionMode: 'independent-review',
  dispatchMechanism: 'independent-review',
  requestedModel: resolution?.model || null,
  requestedEffort: resolution?.effort || null,
  actorRole: decision?.role || 'reviewer',
  actorSessionId: null,
  parentSessionId,
  review: { required: true, status: 'pending', independent: true, crossSurface: true },
  outcome: null,
  report: null,
});

export const createClaudeAdapter = ({ launch = null, capabilities = {} } = {}) => ({
  surface: 'claude',
  capabilities: { ...CLAUDE_CAPABILITIES, ...capabilities },
  ownerDirectAvailable: true,
  ownerDirectDefault: true,
  nativeDelegationAvailable: Boolean(launch),
  async dispatch({ decision, resolution, strategy, executionCapsule = null, executionContract, envelope = null, workingDirectory = null, environment = null, parentSessionId = null, concurrencyGroup = null, childSession = null, executionMode = null, delegationRequested = false, actionContext = null }) {
    const invocation = buildClaudeInvocation({ decision, resolution });
    const nativeRequested = isNativeDelegationRequested({ executionMode, delegationRequested, actionContext, executionContract });
    const independentReviewRequired = decision.role === 'reviewer' && decision.independentContextRequired === true;
    if (independentReviewRequired && !launch) {
      // Independent review cannot silently fall back to the owner's context,
      // even when a caller explicitly requested optional native delegation.
      return { ...reviewPendingDispatch({ decision, resolution, parentSessionId }), invocation };
    }
    if (!nativeRequested || !launch) {
      return { ...ownerDirectDispatch({ decision, resolution, parentSessionId }), invocation };
    }
    // The envelope carries the cache-stable segments and breakpoint digests
    // (Wave 3/5); a launcher that speaks the Claude API reads it for
    // cache_control placement, but this adapter still owns no provider SDK.
    const result = (await launch({ invocation, executionCapsule, executionContract, decision, strategy, envelope, workingDirectory, environment, parentSessionId, concurrencyGroup, childSession })) || {};
    return {
      status: result.status || 'completed',
      resultStatus: result.resultStatus || (result.status === 'failed' ? 'failed' : 'completed'),
      resolvedModel: result.resolvedModel ?? null,
      resolvedEffort: result.resolvedEffort ?? invocation.effort ?? null,
      // The Claude Host launcher exposes the provider identity it observed;
      // keeping these separate lets the common receipt builder fail closed
      // when a launcher omits terminal/session telemetry.
      observedModel: result.observedModel ?? result.resolvedModel ?? null,
      observedEffort: result.observedEffort ?? result.resolvedEffort ?? invocation.effort ?? null,
      actorSessionId: result.sessionId || null,
      inputTokens: result.inputTokens ?? null,
      cachedInputTokens: result.cachedInputTokens ?? result.cacheReadInputTokens ?? null,
      cacheReadInputTokens: result.cacheReadInputTokens ?? result.cachedInputTokens ?? null,
      cacheWriteInputTokens: result.cacheWriteInputTokens ?? null,
      uncachedInputTokens: result.uncachedInputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      reasoningTokens: result.reasoningTokens ?? null,
      wallClockMs: result.wallClockMs ?? null,
      invocation,
    };
  },
});
