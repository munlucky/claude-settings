// Codex Host adapter (§11.2). The installed Codex profile deliberately leaves
// model/model_provider unset, so a global frontier pin cannot leak into cheap
// implementation turns. Model selection happens per worker invocation only.

import { materializeCodexProfiles } from '../codex-profile-materializer.mjs';

export const CODEX_CAPABILITIES = Object.freeze({
  surface: 'codex',
  supportsSubagentModel: false,
  supportsSessionModelOverride: true,
  supportsIndependentContext: true,
  supportsUsageTokens: false,
  supportsResolvedModelIdentity: true,
  // Wave 7. Session continuation is the one cache mechanism the CLI surface
  // actually gives us. Explicit breakpoints, cache token counts, persisted
  // reasoning, Programmatic Tool Calling, Pro mode, Fast mode, and Ultra are
  // Responses-API or app-surface features: a Host that has them says so by
  // overriding this, and until then the turn falls back honestly rather than
  // sending a request the CLI will reject.
  supportsSessionContinuation: true,
  supportsPromptCache: false,
  supportsExplicitCacheBreakpoints: false,
  supportsCacheReadTokens: false,
  supportsCacheWriteTokens: false,
  supportsPersistedReasoning: false,
  supportsProgrammaticToolCalling: false,
  supportsProMode: false,
  supportsFastMode: false,
  supportsUltra: false,
});

export const CODEX_PROFILE_FOR_CLASS = Object.freeze({
  frontier_reasoning: 'kernel-frontier',
  value_coding: 'kernel-value',
});

// Support order (§11.2): per-worker model override, then a separate session
// override, then a named launch profile; anything else can only be advisory.
export const selectCodexMechanism = ({ capabilities, resolution }) => {
  if (!resolution.model) return capabilities.supportsResolvedModelIdentity ? 'host-default' : 'unsupported';
  if (capabilities.supportsSubagentModel) return 'worker-model-override';
  if (capabilities.supportsSessionModelOverride) return 'session-model-override';
  if (capabilities.supportsLaunchProfile === true) return 'launch-profile';
  return 'advisory';
};

export const buildCodexInvocation = ({ decision, resolution, capabilities }) => {
  const mechanism = selectCodexMechanism({ capabilities, resolution });
  return {
    mechanism,
    model: resolution.model,
    effort: resolution.effort,
    profile: mechanism === 'launch-profile' ? CODEX_PROFILE_FOR_CLASS[decision.modelClass] || null : null,
    sandbox: decision.permissions === 'workspace_write' ? 'workspace-write' : 'read-only',
    approvalPolicy: decision.permissions === 'workspace_write' ? 'on-failure' : 'on-request',
    freshSessionRequired: decision.independentContextRequired === true || decision.role === 'reviewer',
  };
};

// `runtimeHome` is optional: when a caller supplies it, the four profile
// overlays are (re)materialized under the Kernel runtime home before the
// first dispatch that needs them, giving `codex-profile-materializer.mjs` an
// actual production caller instead of only the packaging-time snapshot in
// `package/profile-templates/codex/`. Materializing is idempotent (it just
// rewrites the overlay files) and never touches the caller's own `.codex/`
// config, so a Host that omits `runtimeHome` behaves exactly as before.
export const createCodexAdapter = ({ launch = null, capabilities = {}, runtimeHome = null, env = process.env } = {}) => {
  const resolved = { ...CODEX_CAPABILITIES, ...capabilities };
  let profilesMaterialized = null;
  return {
    surface: 'codex',
    capabilities: resolved,
    async dispatch({ decision, resolution, strategy, executionCapsule = null, executionContract, envelope = null }) {
      const invocation = buildCodexInvocation({ decision, resolution, capabilities: resolved });
      if (!launch || invocation.mechanism === 'unsupported') {
        return { status: 'unsupported', resultStatus: 'completed', invocation };
      }
      if (runtimeHome && !profilesMaterialized) {
        profilesMaterialized = materializeCodexProfiles({ runtimeHome, env });
        await profilesMaterialized;
      }
      const result = (await launch({ invocation, executionCapsule, executionContract, decision, strategy, envelope })) || {};
      return {
        status: result.status || 'completed',
        resultStatus: result.resultStatus || (result.status === 'failed' ? 'failed' : 'completed'),
        // Codex reports no usage tokens today; they stay unavailable rather
        // than being invented as zeros.
        resolvedModel: result.resolvedModel ?? null,
        resolvedEffort: result.resolvedEffort ?? invocation.effort ?? null,
        actorSessionId: result.sessionId || null,
        wallClockMs: result.wallClockMs ?? null,
        // Only forwarded when the Host observed them; the receipt gates these
        // on the declared capability regardless.
        cacheReadInputTokens: result.cacheReadInputTokens ?? null,
        cacheWriteInputTokens: result.cacheWriteInputTokens ?? null,
        previousResponseId: result.previousResponseId ?? null,
        speedMode: result.speedMode ?? null,
        invocation,
      };
    },
  };
};
