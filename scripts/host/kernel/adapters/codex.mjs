// Codex Host adapter (§11.2). The installed Codex profile deliberately leaves
// model/model_provider unset, so a global frontier pin cannot leak into cheap
// implementation turns. Model selection happens per worker invocation only.

import { materializeCodexProfiles } from '../codex-profile-materializer.mjs';
import { selectCodexProfileName } from '../codex-model-policy.mjs';
import { resolveCodexActorRoute } from '../codex-actor-router.mjs';
import {
  buildCodexMainSessionPolicy,
  compareCodexSessionConfig,
  CODEX_HOST_UNSUPPORTED_CAPABILITY,
  CODEX_PARENT_SESSION_REMEDIATION,
  CODEX_PARENT_SESSION_TELEMETRY_CAPABILITY,
  isCodexCapabilityUnavailable,
  resolveObservedCodexSessionConfig as resolveObservedCodexSessionConfigFromEvents,
} from '../codex-session-observer.mjs';
import {
  createCodexCliWorkerLauncher,
  createCodexNativeAgentLauncher,
  resolveObservedCodexSessionConfig as resolveObservedCodexSessionConfigFromRollout,
} from '../codex-cli-launcher.mjs';

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
  const repeatedFailure = decision.workProfile?.repeatedFailure === true
    || (decision.reasonCodes || []).some((code) => code === 'RETRY_ESCALATION' || code === 'PROTECTED_OBLIGATION_FAILURE' || code === 'ESCALATION_LOCKED');
  const freshSessionRequired = decision.independentContextRequired === true
    || decision.workProfile?.independentContextRequired === true
    || decision.role === 'reviewer'
    || repeatedFailure;
  return {
    mechanism,
    model: resolution.model,
    effort: resolution.effort,
    requestedModel: resolution.model,
    requestedEffort: resolution.effort,
    // Named by the materialized profile (default/plan/review/batch), which a
    // Kernel model class alone cannot distinguish — a protected review and a
    // routine implementation can share `frontier_reasoning`.
    profile: mechanism === 'launch-profile' ? selectCodexProfileName({ actionKind: decision.actionKind, complexity: decision.workProfile?.complexity }) : null,
    sandbox: decision.permissions === 'workspace_write' ? 'workspace-write' : 'read-only',
    approvalPolicy: decision.permissions === 'workspace_write' ? 'on-failure' : 'on-request',
    freshSessionRequired,
    sessionPolicy: freshSessionRequired ? 'fresh' : 'reusable',
  };
};

// `runtimeHome` is optional: when a caller supplies it, the four profile
// overlays are (re)materialized under the Kernel runtime home before the
// first dispatch that needs them, giving `codex-profile-materializer.mjs` an
// actual production caller instead of only the packaging-time snapshot in
// `package/profile-templates/codex/`. Materializing is idempotent (it just
// rewrites the overlay files) and never touches the caller's own `.codex/`
// config, so a Host that omits `runtimeHome` behaves exactly as before.
const nativeSessionId = (parentSessionId) => {
  const value = String(parentSessionId || '').trim();
  const separator = value.indexOf(':');
  return separator >= 0 ? value.slice(separator + 1) : value;
};

const normalizeParentObservation = (value, parentSessionId) => {
  if (!value || typeof value !== 'object') return null;
  return {
    ...value,
    sessionId: value.sessionId || parentSessionId || null,
  };
};

const defaultParentSessionObserver = async ({ parentSessionId, environment = null, env = process.env, startedAt = new Date() } = {}) => {
  if (!parentSessionId) return null;
  const observed = await resolveObservedCodexSessionConfigFromRollout({
    threadId: nativeSessionId(parentSessionId),
    env: { ...env, ...(environment || {}) },
    startedAt,
  });
  return normalizeParentObservation(observed, parentSessionId);
};

const buildUnsupportedCapability = ({ capability, reason, remediation = CODEX_PARENT_SESSION_REMEDIATION } = {}) => Object.freeze({
  type: 'unsupported-capability',
  code: CODEX_HOST_UNSUPPORTED_CAPABILITY,
  capability,
  reason,
  remediation,
});

const buildUnsupportedDispatch = ({
  invocation,
  parentSessionId = null,
  parentSessionPolicy = null,
  actorRole = null,
  sessionPolicy = null,
  dispatchMechanism = 'capability-guard',
  capability,
  reason,
  remediation = CODEX_PARENT_SESSION_REMEDIATION,
  fallbackReason = null,
} = {}) => {
  const unsupportedCapability = buildUnsupportedCapability({ capability, reason, remediation });
  return {
    status: 'unsupported',
    // `completed` is reserved for a worker outcome. Unsupported capability
    // is a terminal Host refusal, so receipts cannot mistake it for worker
    // completion even though the dispatch call itself returned normally.
    resultStatus: 'failed',
    resolvedModel: null,
    resolvedEffort: null,
    requestedModel: invocation?.model || null,
    requestedEffort: invocation?.effort || null,
    observedModel: null,
    observedEffort: null,
    dispatchMechanism,
    actorRole,
    sessionPolicy,
    parentSessionPolicy,
    enforcementStatus: 'unsupported',
    enforcementReason: reason,
    fallbackReason,
    errorCode: CODEX_HOST_UNSUPPORTED_CAPABILITY,
    errorSummary: `${capability} is unavailable: ${reason}. ${remediation}`,
    capability: unsupportedCapability,
    unsupportedCapability,
    actorSessionId: null,
    outcome: null,
    report: null,
    parentSessionId: parentSessionId || null,
    invocation,
  };
};

const WORKER_TELEMETRY_MISSING_REASONS = new Set([
  'model-observation-missing',
  'effort-observation-missing',
  'worker-session-observation-missing',
  'parent-session-missing',
]);

const isWorkerTelemetryUnavailable = ({ actualLauncher, identityRequired, observation, lineageReason } = {}) => Boolean(
  actualLauncher
  && (WORKER_TELEMETRY_MISSING_REASONS.has(observation?.reason) || WORKER_TELEMETRY_MISSING_REASONS.has(lineageReason))
  && (identityRequired || Boolean(lineageReason)),
);

export const createCodexAdapter = ({ launch = null, nativeLaunch = null, nativeAgentHost = globalThis, cliLaunch = null, parentSessionObserver = null, defaultParentSessionConfig = null, projectRoot = null, images = [], timeoutMs = 600_000, executable = null, spawnImpl = undefined, capabilities = {}, runtimeHome = null, env = process.env } = {}) => {
  const automaticNativeLaunch = nativeLaunch === null ? createCodexNativeAgentLauncher({ host: nativeAgentHost }) : null;
  const effectiveNativeLaunch = nativeLaunch || automaticNativeLaunch;
  const resolved = {
    ...CODEX_CAPABILITIES,
    ...capabilities,
    ...(capabilities.supportsSubagentModel === undefined && effectiveNativeLaunch ? { supportsSubagentModel: true } : {}),
  };
  const effectiveCliLaunch = cliLaunch || (!launch && projectRoot
    ? createCodexCliWorkerLauncher({ projectRoot, images, timeoutMs, executable: executable || undefined, env, spawnImpl })
    : null);
  const observeParentSession = parentSessionObserver || defaultParentSessionObserver;
  let profilesMaterialized = null;
  return {
    surface: 'codex',
    capabilities: resolved,
    async dispatch({ decision, resolution, strategy, executionCapsule = null, executionContract, envelope = null, workingDirectory = null, environment = null, parentSessionId = null, parentSessionConfig = defaultParentSessionConfig, concurrencyGroup = null, childSession = null }) {
      const invocation = buildCodexInvocation({ decision, resolution, capabilities: resolved });
      const nativeAvailable = Boolean(effectiveNativeLaunch && resolved.supportsSubagentModel === true);
      // A capability can describe how a real Host would resolve its default
      // session, but it cannot make an adapter without a launcher execute.
      // Keep the no-launcher surface honest instead of returning a synthetic
      // completed result for `host-default`.
      if (!nativeAvailable && !effectiveCliLaunch && !launch) {
        return buildUnsupportedDispatch({
          invocation,
          parentSessionId,
          dispatchMechanism: 'capability-guard',
          capability: 'bounded-child-worker-launcher',
          reason: 'worker-launcher-missing',
          remediation: 'Provide a native Codex Host bridge or an explicit bounded CLI worker launcher.',
        });
      }
      if (runtimeHome && !profilesMaterialized) {
        profilesMaterialized = materializeCodexProfiles({ runtimeHome, env });
        await profilesMaterialized;
      }

      const suppliedPair = Boolean(parentSessionConfig?.before || parentSessionConfig?.after);
      const observeParent = async (phase) => {
        if (suppliedPair) return normalizeParentObservation(parentSessionConfig[phase], parentSessionId);
        if (parentSessionConfig && phase === 'before') return normalizeParentObservation(parentSessionConfig, parentSessionId);
        try {
          return normalizeParentObservation(await observeParentSession({
            parentSessionId,
            phase,
            environment,
            env,
            startedAt: new Date(),
          }), parentSessionId);
        } catch {
          return null;
        }
      };
      const parentBefore = await observeParent('before');
      const parentBeforePolicy = buildCodexMainSessionPolicy({ parentSessionId, observed: parentBefore || {} });
      const actorRoute = resolveCodexActorRoute({
        decision,
        invocation,
        capabilities: resolved,
        hasNativeLauncher: Boolean(effectiveNativeLaunch),
        hasCliLauncher: Boolean(effectiveCliLaunch),
        parentSessionId,
        parentSessionConfig,
      });
      const routeParentCapabilityUnavailable = isCodexCapabilityUnavailable(actorRoute.parentSessionPolicy);
      const parentBeforeCapabilityUnavailable = isCodexCapabilityUnavailable(parentBeforePolicy);
      if (routeParentCapabilityUnavailable || parentBeforeCapabilityUnavailable || actorRoute.parentSessionPolicy.observationStatus === 'failed' || !['observed', 'enforced'].includes(parentBeforePolicy.observationStatus)) {
        const parentSessionPolicy = actorRoute.parentSessionPolicy.observationStatus === 'failed'
          ? actorRoute.parentSessionPolicy
          : parentBeforePolicy;
        if (isCodexCapabilityUnavailable(parentSessionPolicy)) {
          return buildUnsupportedDispatch({
            invocation,
            parentSessionId,
            parentSessionPolicy,
            actorRole: actorRoute.role,
            sessionPolicy: actorRoute.sessionPolicy,
            dispatchMechanism: 'parent-session-guard',
            capability: parentSessionPolicy.capability?.capability || CODEX_PARENT_SESSION_TELEMETRY_CAPABILITY,
            reason: parentSessionPolicy.capability?.reason || parentSessionPolicy.observationReason,
            remediation: parentSessionPolicy.capability?.remediation || CODEX_PARENT_SESSION_REMEDIATION,
          });
        }
        return {
          status: 'failed',
          resultStatus: 'failed',
          resolvedModel: null,
          resolvedEffort: null,
          requestedModel: invocation.model || null,
          requestedEffort: invocation.effort || null,
          observedModel: null,
          observedEffort: null,
          dispatchMechanism: 'parent-session-guard',
          actorRole: actorRoute.role,
          sessionPolicy: actorRoute.sessionPolicy,
          parentSessionPolicy,
          enforcementStatus: 'failed',
          enforcementReason: `parent-session-invariant-${parentSessionPolicy.observationReason}`,
          errorCode: 'parent-session-invariant-failed',
          actorSessionId: null,
          invocation,
        };
      }
      // A snapshot is enough to prove the parent before launch, but it is not
      // the final invariant. The after snapshot below must match the same
      // Luna/Max session before this dispatch can be reported as successful.
      const parentSessionPolicyBefore = parentBeforePolicy;
      const invoke = async (selectedLaunch, dispatchMechanism, fallbackReason = null) => {
        if (!selectedLaunch) return { result: {}, dispatchMechanism, fallbackReason };
        const dispatchedInvocation = { ...invocation, dispatchMechanism, fallbackReason };
        const result = (await selectedLaunch({
          invocation: dispatchedInvocation,
          actorRoute,
          executionCapsule,
          executionContract,
          decision,
          strategy,
          envelope,
          workingDirectory,
          environment,
          parentSessionId,
          parentSessionPolicy: parentSessionPolicyBefore,
          concurrencyGroup,
          childSession,
        })) || {};
        return { result, dispatchMechanism, fallbackReason };
      };

      const nativeSelected = nativeAvailable;
      let selectedLaunch = nativeSelected ? effectiveNativeLaunch : effectiveCliLaunch || launch;
      let dispatchMechanism = nativeSelected ? 'native-subagent' : effectiveCliLaunch ? 'cli-worker' : launch ? 'legacy-launch' : invocation.mechanism;
      let fallbackReason = null;
      let invocationResult;
      try {
        invocationResult = await invoke(selectedLaunch, dispatchMechanism);
      } catch (error) {
        invocationResult = {
          result: {
            status: 'failed',
            resultStatus: 'failed',
            errorCode: 'codex-launch-failed',
            errorSummary: error?.message || String(error),
          },
          dispatchMechanism,
          fallbackReason,
        };
      }
      let result = invocationResult.result;
      const actualLauncher = Boolean(selectedLaunch);
      const identityRequired = Boolean(invocation.model || invocation.effort);
      const observeResult = (candidate, mechanism) => {
        const terminalEvents = Array.isArray(candidate?.terminalEvents)
          ? candidate.terminalEvents
          : Array.isArray(candidate?.events) ? candidate.events : [];
        const observedConfig = candidate?.observedSessionConfig
          || candidate?.observedConfig
          || (terminalEvents.length > 0 ? resolveObservedCodexSessionConfigFromEvents(terminalEvents) : null);
        const requiresTerminalTelemetry = mechanism === 'native-subagent' || mechanism === 'cli-worker';
        const observedModel = requiresTerminalTelemetry
          ? observedConfig?.model ?? null
          : candidate.resolvedModel ?? candidate.observedModel ?? null;
        const observedEffort = requiresTerminalTelemetry
          ? observedConfig?.effort ?? observedConfig?.reasoning_effort ?? observedConfig?.reasoningEffort ?? null
          : candidate.resolvedEffort ?? candidate.observedEffort ?? null;
        let observation = compareCodexSessionConfig({
          requested: { model: invocation.model, effort: invocation.effort },
          observed: { model: observedModel, effort: observedEffort },
        });
        const lineageReason = !candidate.sessionId
          ? 'worker-session-observation-missing'
          : !parentSessionId
            ? 'parent-session-missing'
            : String(candidate.sessionId) === String(parentSessionId)
              || nativeSessionId(candidate.sessionId) === nativeSessionId(parentSessionId)
              ? 'worker-session-not-distinct'
              : null;
        if (lineageReason) observation = { ...observation, exact: false, reason: lineageReason };
        return { observedModel, observedEffort, observation, lineageReason };
      };
      let observedResult = observeResult(result, dispatchMechanism);
      let resolvedModel = observedResult.observedModel;
      let resolvedEffort = observedResult.observedEffort;
      let observation = observedResult.observation;
      const dispatchMismatch = () => actualLauncher && (identityRequired ? !observation.exact : Boolean(observedResult.lineageReason));
      const mutatingDispatch = decision?.permissions === 'workspace_write'
        || invocation.sandbox === 'workspace-write';
      if (dispatchMismatch() && nativeSelected && effectiveCliLaunch && !mutatingDispatch) {
        // Native capability is disabled for the remainder of this dispatch;
        // the bounded CLI worker is a safe fallback only for read-only work.
        fallbackReason = `native-${observation.reason || 'route-mismatch'}`;
        dispatchMechanism = 'cli-worker';
        selectedLaunch = effectiveCliLaunch;
        try {
          invocationResult = await invoke(effectiveCliLaunch, dispatchMechanism, fallbackReason);
        } catch (error) {
          invocationResult = {
            result: {
              status: 'failed',
              resultStatus: 'failed',
              errorCode: 'codex-launch-failed',
              errorSummary: error?.message || String(error),
            },
            dispatchMechanism,
            fallbackReason,
          };
        }
        result = invocationResult.result;
        observedResult = observeResult(result, dispatchMechanism);
        resolvedModel = observedResult.observedModel;
        resolvedEffort = observedResult.observedEffort;
        observation = observedResult.observation;
      } else if (dispatchMismatch() && nativeSelected && mutatingDispatch) {
        // A mismatched native worker may already have touched the caller's
        // workspace before its telemetry was available. Reusing that same
        // directory for a CLI fallback would let the fallback inherit an
        // unverified partial mutation, so mutating roles fail closed.
        fallbackReason = `native-${observation.reason || 'route-mismatch'}-mutating-fallback-disabled`;
      }
      const parentAfter = await observeParent('after');
      const parentSessionPolicy = buildCodexMainSessionPolicy({
        parentSessionId,
        observed: { before: parentBefore || {}, after: parentAfter || {} },
      });
      const parentCapabilityUnavailable = isCodexCapabilityUnavailable(parentSessionPolicy);
      const parentInvariantFailed = parentSessionPolicy.observationStatus !== 'enforced';
      const workerCapabilityUnavailable = isWorkerTelemetryUnavailable({
        actualLauncher,
        identityRequired,
        observation,
        lineageReason: observedResult.lineageReason,
      });
      const capabilityUnavailable = parentCapabilityUnavailable || workerCapabilityUnavailable;
      const failedByEnforcement = dispatchMismatch() || parentInvariantFailed;
      const unsupportedReason = parentCapabilityUnavailable
        ? parentSessionPolicy.capability?.reason || parentSessionPolicy.observationReason
        : workerCapabilityUnavailable
          ? observation.reason || observedResult.lineageReason
          : null;
      const unsupportedCapability = parentCapabilityUnavailable
        ? parentSessionPolicy.capability?.capability || CODEX_PARENT_SESSION_TELEMETRY_CAPABILITY
        : workerCapabilityUnavailable ? 'worker-session-telemetry' : null;
      const completionOutcome = capabilityUnavailable ? null : (result.outcome ?? null);
      const completionReport = capabilityUnavailable ? null : (result.report ?? null);
      return {
        status: capabilityUnavailable ? 'unsupported' : failedByEnforcement ? 'failed' : (result.status || 'completed'),
        resultStatus: capabilityUnavailable ? 'failed' : failedByEnforcement ? 'failed' : (result.resultStatus || (result.status === 'failed' ? 'failed' : 'completed')),
        // Codex reports no usage tokens today; they stay unavailable rather
        // than being invented as zeros.
        resolvedModel,
        resolvedEffort,
        requestedModel: invocation.model || null,
        requestedEffort: invocation.effort || null,
        observedModel: resolvedModel,
        observedEffort: resolvedEffort,
        dispatchMechanism,
        actorRole: actorRoute.role,
        sessionPolicy: actorRoute.sessionPolicy,
        parentSessionPolicy,
        enforcementStatus: capabilityUnavailable ? 'unsupported' : failedByEnforcement ? 'failed' : (actualLauncher && identityRequired ? 'enforced' : null),
        enforcementReason: capabilityUnavailable
          ? unsupportedReason
          : failedByEnforcement
          ? (parentInvariantFailed ? `parent-session-invariant-${parentSessionPolicy.observationReason}` : observation.reason)
          : null,
        fallbackReason,
        errorCode: capabilityUnavailable
          ? CODEX_HOST_UNSUPPORTED_CAPABILITY
          : parentInvariantFailed
          ? 'parent-session-invariant-failed'
          : failedByEnforcement ? 'model-enforcement-failed' : (result.errorCode ?? null),
        errorSummary: capabilityUnavailable
          ? `${unsupportedCapability} is unavailable: ${unsupportedReason}. ${parentSessionPolicy.capability?.remediation || CODEX_PARENT_SESSION_REMEDIATION}`
          : result.errorSummary ?? null,
        capability: capabilityUnavailable
          ? buildUnsupportedCapability({
            capability: unsupportedCapability,
            reason: unsupportedReason,
            remediation: parentSessionPolicy.capability?.remediation || CODEX_PARENT_SESSION_REMEDIATION,
          })
          : null,
        unsupportedCapability: capabilityUnavailable
          ? buildUnsupportedCapability({
            capability: unsupportedCapability,
            reason: unsupportedReason,
            remediation: parentSessionPolicy.capability?.remediation || CODEX_PARENT_SESSION_REMEDIATION,
          })
          : null,
        actorSessionId: result.sessionId || null,
        wallClockMs: result.wallClockMs ?? null,
        inputTokens: result.inputTokens ?? null,
        cachedInputTokens: result.cachedInputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        outcome: completionOutcome,
        report: completionReport,
        // Only forwarded when the Host observed them; the receipt gates these
        // on the declared capability regardless.
        cacheReadInputTokens: result.cacheReadInputTokens ?? null,
        cacheWriteInputTokens: result.cacheWriteInputTokens ?? null,
        previousResponseId: result.previousResponseId ?? null,
        speedMode: result.speedMode ?? null,
        parentSessionId: parentSessionId || null,
        invocation,
      };
    },
  };
};
