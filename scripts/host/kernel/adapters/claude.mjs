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
  async dispatch({ decision, resolution, strategy, executionCapsule = null, executionContract }) {
    const invocation = buildClaudeInvocation({ decision, resolution });
    if (!launch) return { status: 'unsupported', resultStatus: 'completed', invocation };
    const result = (await launch({ invocation, executionCapsule, executionContract, decision, strategy })) || {};
    return {
      status: result.status || 'completed',
      resultStatus: result.resultStatus || (result.status === 'failed' ? 'failed' : 'completed'),
      resolvedModel: result.resolvedModel ?? null,
      resolvedEffort: result.resolvedEffort ?? invocation.effort ?? null,
      actorSessionId: result.sessionId || null,
      inputTokens: result.inputTokens ?? null,
      cachedInputTokens: result.cachedInputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      wallClockMs: result.wallClockMs ?? null,
      invocation,
    };
  },
});
