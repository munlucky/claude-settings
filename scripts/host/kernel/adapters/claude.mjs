// Claude Host adapter (§11.1). Maps a Kernel role onto a Claude subagent and
// injects the model id from the Host registry. No provider SDK lives here: the
// adapter builds an invocation and hands it to the launcher the Host supplies.

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

export const createClaudeAdapter = ({ launch = null, capabilities = {} } = {}) => ({
  surface: 'claude',
  capabilities: { ...CLAUDE_CAPABILITIES, ...capabilities },
  async dispatch({ decision, resolution, strategy, executionCapsule = null, executionContract, envelope = null }) {
    const invocation = buildClaudeInvocation({ decision, resolution });
    if (!launch) return { status: 'unsupported', resultStatus: 'completed', invocation };
    // The envelope carries the cache-stable segments and breakpoint digests
    // (Wave 3/5); a launcher that speaks the Claude API reads it for
    // cache_control placement, but this adapter still owns no provider SDK.
    const result = (await launch({ invocation, executionCapsule, executionContract, decision, strategy, envelope })) || {};
    return {
      status: result.status || 'completed',
      resultStatus: result.resultStatus || (result.status === 'failed' ? 'failed' : 'completed'),
      resolvedModel: result.resolvedModel ?? null,
      resolvedEffort: result.resolvedEffort ?? invocation.effort ?? null,
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
