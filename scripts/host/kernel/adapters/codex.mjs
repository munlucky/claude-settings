// Codex Host adapter (§11.2). The installed Codex profile deliberately leaves
// model/model_provider unset, so a global frontier pin cannot leak into cheap
// implementation turns. Model selection happens per worker invocation only.

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
  resolveObservedCodexSessionConfigFromRollout,
} from '../codex-session-observer.mjs';

export const CODEX_WORKER_TIMEOUT_MS = 600000;

export const CODEX_REVIEW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          category: { type: 'string', enum: ['contract', 'architecture', 'implementation', 'security', 'verification'] },
          path: { type: ['string', 'null'] },
          summary: { type: 'string' },
          requiredAction: { type: 'string', enum: ['fix', 'replan', 'block'] },
        },
        required: ['severity', 'category', 'path', 'summary', 'requiredAction'],
        additionalProperties: false,
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'risks', 'evidenceRefs'],
  additionalProperties: false,
});

export const CODEX_WORKER_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['completed', 'blocked', 'failed'] },
    summary: { type: 'string' },
    changedPaths: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    verifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          obligationId: { type: 'string' },
          commandRef: { type: 'string' },
          acceptanceCoverage: { type: 'array', items: { type: 'string' } },
        },
        required: ['obligationId', 'commandRef', 'acceptanceCoverage'],
        additionalProperties: false,
      },
    },
    requestedVerifications: { type: 'array', items: { type: 'string' } },
    judgments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          obligationId: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'fail'] },
          reviewReceiptId: { type: ['string', 'null'] },
          acceptanceCoverage: { type: 'array', items: { type: 'string' } },
        },
        required: ['obligationId', 'verdict', 'reviewReceiptId', 'acceptanceCoverage'],
        additionalProperties: false,
      },
    },
    knowledgeObservations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposedType: { type: 'string' },
          statement: { type: 'string' },
          scope: { type: 'array', items: { type: 'string' } },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
        required: ['proposedType', 'statement', 'scope', 'evidenceRefs'],
        additionalProperties: false,
      },
    },
    blocker: { type: ['string', 'null'] },
  },
  required: ['status', 'summary', 'changedPaths', 'risks', 'verifications', 'requestedVerifications', 'judgments', 'knowledgeObservations', 'blocker'],
  additionalProperties: false,
});

const assertWorkerOutcome = (value) => {
  if (!value || typeof value !== 'object' || !['completed', 'blocked', 'failed'].includes(value.status)) {
    throw new Error('codex_worker_output_invalid: status must be completed, blocked, or failed');
  }
  for (const field of ['changedPaths', 'risks', 'requestedVerifications', 'judgments', 'knowledgeObservations']) {
    if (!Array.isArray(value[field])) throw new Error(`codex_worker_output_invalid: ${field} must be an array`);
  }
  if (typeof value.summary !== 'string' || (value.blocker !== null && typeof value.blocker !== 'string')) {
    throw new Error('codex_worker_output_invalid: summary and blocker have invalid types');
  }
  return value;
};

const assertReviewOutcome = (value) => {
  if (!value || typeof value !== 'object' || !['pass', 'fail', 'blocked'].includes(value.verdict)) {
    throw new Error('codex_review_output_invalid: verdict must be pass, fail, or blocked');
  }
  for (const field of ['findings', 'risks', 'evidenceRefs']) {
    if (!Array.isArray(value[field])) throw new Error(`codex_review_output_invalid: ${field} must be an array`);
  }
  return value;
};

const workerPrompt = ({ executionContract, executionCapsule }) => [
  'Perform the bounded Kernel worker action described below.',
  'You are a child actor assigned by the Host. Do not invoke Kernel next/report commands, do not delegate to another agent, and do not claim completion authority.',
  'Use only the supplied execution contract and capsule. Apply the requested workspace changes when the permissions allow them.',
  'Return only the JSON object required by the supplied output schema. Include every verification, risk, judgment, and reusable knowledge observation needed by the parent orchestrator.',
  'Report verification requests in the structured verifications array. Copy the exact obligationId, one exact commandRef from allowedCommandRefs, and exact acceptance IDs from acceptanceIds in WORKER CAPSULE.verification.obligations. Never invent, rename, infer, or substitute these IDs. When using structured verifications, set legacy requestedVerifications to [].',
  '',
  'EXECUTION CONTRACT',
  JSON.stringify(executionContract || {}, null, 2),
  '',
  'WORKER CAPSULE',
  JSON.stringify(executionCapsule || {}, null, 2),
].join('\n');

const reviewPrompt = ({ executionContract, executionCapsule }) => [
  'Perform the independent Kernel review described below.',
  'You are a read-only reviewer. Do not edit files, run mutating commands, or invoke Kernel commands.',
  'Inspect the current workspace and return only the JSON object required by the supplied output schema.',
  'A pass verdict requires every reviewed acceptance claim to be supported by the current files and evidence.',
  '',
  'EXECUTION CONTRACT',
  JSON.stringify(executionContract || {}, null, 2),
  '',
  'REVIEW CAPSULE',
  JSON.stringify(executionCapsule || {}, null, 2),
].join('\n');

const resolveNativeSpawnAgent = ({ spawnAgent = null, host = globalThis } = {}) => {
  if (typeof spawnAgent === 'function') return spawnAgent;
  if (typeof host?.spawn_agent === 'function') return host.spawn_agent.bind(host);
  if (typeof host?.spawnAgent === 'function') return host.spawnAgent.bind(host);
  if (typeof host?.codex?.spawn_agent === 'function') return host.codex.spawn_agent.bind(host.codex);
  if (typeof host?.codex?.spawnAgent === 'function') return host.codex.spawnAgent.bind(host.codex);
  return null;
};

const firstNativeValue = (values) => values.find((value) => value !== undefined && value !== null && String(value).trim()) ?? null;

export const createCodexNativeAgentLauncher = ({ spawnAgent = null, host = globalThis } = {}) => {
  const dispatch = resolveNativeSpawnAgent({ spawnAgent, host });
  if (!dispatch) return null;
  return async ({ invocation, executionCapsule, executionContract, parentSessionId = null, actorRoute = null, childSession = null, workingDirectory = null, concurrencyGroup = null }) => {
    if (!invocation?.model || !invocation?.effort) throw new Error('codex_native_worker_requires_explicit_model_and_effort');
    const reviewer = actorRoute?.role === 'reviewer';
    const handle = await dispatch({
      task_name: `kernel_${actorRoute?.role || 'worker'}`,
      model: invocation.model,
      reasoning_effort: invocation.effort,
      message: reviewer
        ? reviewPrompt({ executionContract, executionCapsule })
        : workerPrompt({ executionContract, executionCapsule }),
      execution_contract: executionContract || null,
      execution_capsule: executionCapsule || null,
      parent_session_id: parentSessionId,
      child_session: childSession || { canDelegate: false, canCommit: false },
      working_directory: workingDirectory,
      concurrency_group: concurrencyGroup,
    });
    const completed = typeof handle?.waitForOutcome === 'function'
      ? await handle.waitForOutcome()
      : typeof handle?.wait === 'function'
        ? await handle.wait()
        : typeof handle?.result === 'function'
          ? await handle.result()
          : null;
    const candidate = {
      ...(handle && typeof handle === 'object' ? handle : {}),
      ...(completed && typeof completed === 'object' ? completed : {}),
      ...(completed?.result && typeof completed.result === 'object' ? completed.result : {}),
    };
    const outcome = candidate.outcome || candidate.report || null;
    if (outcome) {
      if (reviewer) assertReviewOutcome(outcome);
      else assertWorkerOutcome(outcome);
    }
    const terminalEvents = Array.isArray(candidate.terminalEvents)
      ? candidate.terminalEvents
      : Array.isArray(candidate.events) ? candidate.events : [];
    const terminalConfig = resolveObservedCodexSessionConfigFromEvents(terminalEvents);
    const observedConfig = candidate.observedSessionConfig || candidate.observedConfig || terminalConfig;
    const resolvedModel = firstNativeValue([
      observedConfig?.model,
    ]);
    const resolvedEffort = firstNativeValue([
      observedConfig?.effort,
      observedConfig?.reasoning_effort,
      observedConfig?.reasoningEffort,
    ]);
    const sessionId = firstNativeValue([
      candidate.sessionId,
      candidate.session_id,
      candidate.actorSessionId,
      candidate.actor_session_id,
      candidate.threadId,
      candidate.thread_id,
    ]);
    return {
      ...candidate,
      status: candidate.status || (outcome?.status === 'completed' ? 'completed' : outcome?.status || 'completed'),
      resultStatus: candidate.resultStatus || (candidate.status === 'failed' || outcome?.status === 'failed' ? 'failed' : 'completed'),
      resolvedModel,
      resolvedEffort,
      observedSessionConfig: { model: resolvedModel, effort: resolvedEffort },
      observedModel: resolvedModel,
      observedEffort: resolvedEffort,
      effortObserved: Boolean(resolvedEffort),
      sessionId,
      outcome: outcome || null,
      report: reviewer ? null : candidate.report || (outcome && candidate.outcome ? outcome : null),
    };
  };
};

const defaultParentSessionObserver = async ({ parentSessionId, parentSessionEnvironment = null, parentEnvironment = null, environment = null, env = process.env, startedAt = new Date() } = {}) => {
  if (!parentSessionId) return null;
  const observationEnvironment = parentSessionEnvironment || parentEnvironment
    ? { ...(parentEnvironment || {}), ...(parentSessionEnvironment || {}) }
    : { ...env, ...(environment || {}) };
  const observed = await resolveObservedCodexSessionConfigFromRollout({
    threadId: nativeSessionId(parentSessionId),
    env: observationEnvironment,
    startedAt,
  });
  return normalizeParentObservation(observed, parentSessionId);
};

export const CODEX_CAPABILITIES = Object.freeze({
  surface: 'codex',
  supportsSubagentModel: false,
  supportsSessionModelOverride: true,
  supportsLaunchProfile: true,
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
// The selected profile is carried independently of that mechanism because the
// CLI profile also supplies non-model settings (approval, sandbox defaults,
// network policy, and verbosity) while explicit invocation flags remain the
// authority for model and effort.
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
  const profile = selectCodexProfileName({
    actionKind: decision.actionKind,
    complexity: decision.workProfile?.complexity,
  });
  return {
    mechanism,
    model: resolution.model,
    effort: resolution.effort,
    requestedModel: resolution.model,
    requestedEffort: resolution.effort,
    // Named by the materialized profile (default/plan/review/batch), which a
    // Kernel model class alone cannot distinguish — a protected review and a
    // routine implementation can share `frontier_reasoning`.
    profile,
    sandbox: decision.permissions === 'workspace_write' ? 'workspace-write' : 'read-only',
    approvalPolicy: decision.permissions === 'workspace_write' ? 'on-failure' : 'on-request',
    freshSessionRequired,
    sessionPolicy: freshSessionRequired ? 'fresh' : 'reusable',
  };
};

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

const buildUnsupportedCapability = ({ capability, reason, remediation = CODEX_PARENT_SESSION_REMEDIATION } = {}) => Object.freeze({
  type: 'unsupported-capability',
  code: CODEX_HOST_UNSUPPORTED_CAPABILITY,
  capability,
  reason,
  remediation,
});

const isIndependentReviewRequired = ({ decision = {}, actorRoute = null, executionContract = null } = {}) => Boolean(
  (actorRoute?.role === 'reviewer' || decision.role === 'reviewer')
  && (
    decision.independentContextRequired === true
    || executionContract?.independentReviewRequired === true
    || executionContract?.independentReview === true
    || executionContract?.reviewMode === 'independent'
  ),
);

const buildUnsupportedDispatch = ({
  invocation,
  parentSessionId = null,
  parentSessionPolicy = null,
  actorRole = null,
  sessionPolicy = null,
  dispatchMechanism = 'capability-guard',
  executionMode = null,
  delegation = null,
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
    executionMode,
    delegation,
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

// A missing optional worker launcher is not a failed implementation. The
// current native Codex owner can execute the already-issued bounded work unit
// and later call Kernel report. This intent deliberately has no outcome or
// report: returning either would fabricate completion before the owner acts.
const buildOwnerDirectDispatch = ({ invocation, parentSessionId = null, actorRole = null, sessionPolicy = null } = {}) => ({
  status: 'owner-direct',
  resultStatus: 'interrupted',
  resolvedModel: null,
  resolvedEffort: null,
  requestedModel: invocation?.model || null,
  requestedEffort: invocation?.effort || null,
  observedModel: null,
  observedEffort: null,
  dispatchMechanism: 'owner-direct',
  executionMode: 'owner-direct',
  delegation: {
    mode: 'optional',
    available: false,
    actorRole,
  },
  actorRole,
  sessionPolicy,
  parentSessionPolicy: null,
  enforcementStatus: 'advisory',
  enforcementReason: 'owner-session-execution',
  fallbackReason: null,
  errorCode: null,
  errorSummary: null,
  capability: null,
  unsupportedCapability: null,
  actorSessionId: parentSessionId || null,
  outcome: null,
  report: null,
  parentSessionId: parentSessionId || null,
  invocation,
});

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

export const createCodexAdapter = ({ launch = null, nativeLaunch = null, nativeAgentHost = globalThis, parentSessionObserver = null, defaultParentSessionConfig = null, parentSessionEnvironment = null, parentEnvironment = null, projectRoot = null, images = [], timeoutMs = CODEX_WORKER_TIMEOUT_MS, capabilities = {}, runtimeHome = null, env = process.env } = {}) => {
  const automaticNativeLaunch = nativeLaunch === null ? createCodexNativeAgentLauncher({ host: nativeAgentHost }) : null;
  const effectiveNativeLaunch = nativeLaunch || automaticNativeLaunch;
  const resolved = {
    ...CODEX_CAPABILITIES,
    ...capabilities,
    ...(capabilities.supportsSubagentModel === undefined && effectiveNativeLaunch ? { supportsSubagentModel: true } : {}),
  };
  const observeParentSession = parentSessionObserver || defaultParentSessionObserver;
  const configuredParentSessionEnvironment = parentSessionEnvironment || parentEnvironment || null;
  return {
    surface: 'codex',
    capabilities: resolved,
    ownerDirectAvailable: true,
    ownerDirectDefault: Boolean(!effectiveNativeLaunch && !launch),
    async dispatch({ decision, resolution, strategy, executionCapsule = null, executionContract, envelope = null, workingDirectory = null, environment = null, parentSessionId = null, parentSessionConfig = defaultParentSessionConfig, parentSessionEnvironment: dispatchParentSessionEnvironment = null, parentEnvironment: dispatchParentEnvironment = null, concurrencyGroup = null, childSession = null }) {
      const invocation = buildCodexInvocation({ decision, resolution, capabilities: resolved });
      const nativeAvailable = Boolean(effectiveNativeLaunch && resolved.supportsSubagentModel === true);
      const actorRoute = resolveCodexActorRoute({
        decision,
        invocation,
        capabilities: resolved,
        hasNativeLauncher: Boolean(effectiveNativeLaunch),
        parentSessionId,
        parentSessionConfig,
      });
      // A missing native launcher only removes optional delegation. The
      // owner-direct path is the normal interactive Codex execution surface;
      // it must not require parent/child telemetry or invent a worker result.
      if (!nativeAvailable && !launch) {
        const independentReviewRequired = isIndependentReviewRequired({ decision, actorRoute, executionContract });
        if (!independentReviewRequired) {
          return buildOwnerDirectDispatch({
            invocation,
            parentSessionId,
            actorRole: actorRoute.role,
            sessionPolicy: actorRoute.sessionPolicy,
          });
        }
        return buildUnsupportedDispatch({
          invocation,
          parentSessionId,
          actorRole: actorRoute.role,
          sessionPolicy: actorRoute.sessionPolicy,
          dispatchMechanism: 'capability-guard',
          executionMode: 'independent-review',
          delegation: { mode: 'required', available: false, actorRole: actorRoute.role },
          capability: 'independent-reviewer',
          reason: 'independent-review-unavailable',
          remediation: 'Provide an independent native Codex review context.',
        });
      }

      const suppliedPair = Boolean(parentSessionConfig?.before || parentSessionConfig?.after);
      const observationEnvironment = dispatchParentSessionEnvironment || dispatchParentEnvironment || configuredParentSessionEnvironment;
      const observeParent = async (phase) => {
        if (suppliedPair) return normalizeParentObservation(parentSessionConfig[phase], parentSessionId);
        if (parentSessionConfig && phase === 'before') return normalizeParentObservation(parentSessionConfig, parentSessionId);
        try {
          return normalizeParentObservation(await observeParentSession({
            parentSessionId,
            phase,
            parentSessionEnvironment: observationEnvironment,
            parentEnvironment: observationEnvironment,
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
      let selectedLaunch = nativeSelected ? effectiveNativeLaunch : launch;
      let dispatchMechanism = nativeSelected ? 'native-subagent' : (launch ? 'legacy-launch' : invocation.mechanism);
      let fallbackReason = null;
      let invocationResult;
      try {
        invocationResult = await invoke(selectedLaunch, dispatchMechanism);
      } catch (error) {
        invocationResult = {
          result: {
            status: 'failed',
            resultStatus: 'failed',
            errorCode: error?.code || 'codex-launch-failed',
            errorSummary: error?.message || String(error),
            failureCategory: error?.failureCategory || error?.details?.failureCategory || 'provider/infrastructure',
            failureStage: error?.failureStage || error?.details?.failureStage || 'launch',
            remediation: error?.details?.remediation || null,
            runtimePreflight: error?.details && (error?.failureStage || error?.details?.failureStage) === 'pre-spawn' ? {
              status: 'failed',
              errorCode: error?.code || 'codex-launch-failed',
              failureCategory: error?.details?.failureCategory || 'provider/infrastructure',
              failureStage: error?.details?.failureStage || 'pre-spawn',
              remediation: error?.details?.remediation || null,
              credentialContentsInspected: error?.details?.credentialContentsInspected ?? null,
              userHomeAuthAvailable: error?.details?.userHomeAuthAvailable ?? null,
              cacheStatus: error?.details?.cacheStatus || null,
              cacheClientVersion: error?.details?.cacheClientVersion || null,
              executableVersion: error?.details?.executableVersion || null,
              probeTimeoutMs: error?.details?.probeTimeoutMs ?? null,
              effectiveSandbox: error?.details?.effectiveSandbox || null,
              effectiveApprovalPolicy: error?.details?.effectiveApprovalPolicy || null,
              effectivePermissionProfile: error?.details?.effectivePermissionProfile || null,
            } : null,
            launcherFailure: error?.details && (error?.failureStage || error?.details?.failureStage) !== 'pre-spawn' ? {
              status: 'failed',
              errorCode: error?.code || 'codex-launch-failed',
              failureStage: error?.failureStage || error?.details?.failureStage || 'launch',
              cleanupStatus: error?.details?.cleanupStatus || null,
              cleanupClassification: error?.details?.cleanupClassification || null,
              lineageSource: error?.details?.lineageSource || null,
              survivorCount: error?.details?.survivors ?? null,
            } : null,
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
        const requiresTerminalTelemetry = mechanism === 'native-subagent';
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
      const parentAfter = await observeParent('after');
      const parentSessionPolicy = buildCodexMainSessionPolicy({
        parentSessionId,
        observed: { before: parentBefore || {}, after: parentAfter || {} },
      });
      const parentCapabilityUnavailable = isCodexCapabilityUnavailable(parentSessionPolicy);
      const parentInvariantFailed = parentSessionPolicy.observationStatus !== 'enforced';
      const explicitDispatchFailure = result.status === 'failed'
        || result.resultStatus === 'failed'
        || Boolean(result.errorCode);
      const workerCapabilityUnavailable = !explicitDispatchFailure && isWorkerTelemetryUnavailable({
        actualLauncher,
        identityRequired,
        observation,
        lineageReason: observedResult.lineageReason,
      });
      const capabilityUnavailable = parentCapabilityUnavailable || workerCapabilityUnavailable;
      const failedByEnforcement = parentInvariantFailed || (!explicitDispatchFailure && dispatchMismatch());
      const dispatchFailed = explicitDispatchFailure || failedByEnforcement;
      const explicitFailureCode = result.errorCode
        || (explicitDispatchFailure ? 'codex-worker-failed' : null);
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
        status: capabilityUnavailable ? 'unsupported' : dispatchFailed ? 'failed' : (result.status || 'completed'),
        resultStatus: capabilityUnavailable ? 'failed' : dispatchFailed ? 'failed' : (result.resultStatus || (result.status === 'failed' ? 'failed' : 'completed')),
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
        enforcementStatus: capabilityUnavailable ? 'unsupported' : dispatchFailed ? 'failed' : (actualLauncher && identityRequired ? 'enforced' : null),
        enforcementReason: capabilityUnavailable
          ? unsupportedReason
          : parentInvariantFailed
          ? `parent-session-invariant-${parentSessionPolicy.observationReason}`
          : explicitDispatchFailure
          ? explicitFailureCode
          : failedByEnforcement
          ? observation.reason
          : null,
        fallbackReason,
        errorCode: capabilityUnavailable
          ? CODEX_HOST_UNSUPPORTED_CAPABILITY
          : parentInvariantFailed
          ? 'parent-session-invariant-failed'
          : explicitDispatchFailure
          ? explicitFailureCode
          : failedByEnforcement ? 'model-enforcement-failed' : (result.errorCode ?? null),
        errorSummary: capabilityUnavailable
          ? `${unsupportedCapability} is unavailable: ${unsupportedReason}. ${parentSessionPolicy.capability?.remediation || CODEX_PARENT_SESSION_REMEDIATION}`
          : result.errorSummary ?? null,
        failureCategory: result.failureCategory ?? null,
        failureStage: result.failureStage ?? null,
        remediation: result.remediation ?? null,
        launcherFailure: result.launcherFailure ?? null,
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
        runtimePreflight: result.runtimePreflight ?? null,
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
