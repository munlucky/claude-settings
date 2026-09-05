// Host-owned independent reviewer transport.
//
// This is intentionally a transport, not a second Kernel authority. A Host
// may expose an independent-subagent launcher when its native reviewer bridge
// is unavailable. The launcher returns a structured reviewer result plus a
// Host attestation; the common dispatcher verifies that attestation before it
// allows the existing Kernel receipt path to ingest the verdict.

import { observeWorkspaceIdentity } from '../../kernel/run/workspace-identity.mjs';

export const INDEPENDENT_SUBAGENT_REVIEW_SCHEMA_VERSION = 1;
export const INDEPENDENT_SUBAGENT_REVIEW_TRANSPORT = 'independent-subagent';
export const INDEPENDENT_SUBAGENT_REVIEW_DEFAULT_TIMEOUT_MS = 600000;

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const present = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const REVIEW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    findings: { type: 'array' },
    risks: { type: 'array' },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'risks', 'evidenceRefs'],
  additionalProperties: false,
});

const normalizeReviewOutcome = (value) => {
  if (!isObject(value) || !['pass', 'fail', 'blocked'].includes(value.verdict)) {
    throw new Error('independent_subagent_review_output_invalid: verdict must be pass, fail, or blocked');
  }
  for (const field of ['findings', 'risks', 'evidenceRefs']) {
    if (!Array.isArray(value[field])) {
      throw new Error(`independent_subagent_review_output_invalid: ${field} must be an array`);
    }
  }
  return value;
};

export const buildIndependentSubagentReviewPrompt = ({ executionContract = null, executionCapsule = null } = {}) => [
  'Perform the independent Kernel review described below.',
  'You are a read-only reviewer in a fresh child context. Do not edit files, run mutating commands, invoke Kernel commands, or delegate to another agent.',
  'Inspect only the current workspace and the supplied review capsule. Return exactly one JSON object matching the output schema.',
  'A pass verdict requires every reviewed acceptance claim to be supported by the current files and evidence.',
  '',
  'OUTPUT SCHEMA',
  JSON.stringify(REVIEW_OUTPUT_SCHEMA),
  '',
  'EXECUTION CONTRACT',
  JSON.stringify(executionContract || {}, null, 2),
  '',
  'REVIEW CAPSULE',
  JSON.stringify(executionCapsule || {}, null, 2),
].join('\n');

const resolveLauncher = ({ spawnIndependentReviewer = null, host = globalThis } = {}) => {
  if (typeof spawnIndependentReviewer === 'function') return spawnIndependentReviewer;
  const candidates = [
    [host, 'spawn_independent_reviewer'],
    [host, 'spawnIndependentReviewer'],
    [host, 'spawn_independent_subagent'],
    [host, 'spawnIndependentSubagent'],
    [host?.codex, 'spawn_independent_reviewer'],
    [host?.codex, 'spawnIndependentReviewer'],
    [host?.multi_agent, 'spawn_independent_reviewer'],
    [host?.multiAgent, 'spawnIndependentReviewer'],
  ];
  for (const [owner, key] of candidates) {
    if (typeof owner?.[key] === 'function') return owner[key].bind(owner);
  }
  return null;
};

const cleanupHandle = async (handle, timeoutMs = 5000) => {
  if (!handle || typeof handle !== 'object') return false;
  const method = ['cancel', 'abort', 'terminate', 'close']
    .find((name) => typeof handle[name] === 'function');
  if (!method) return false;
  const cleanup = Promise.resolve().then(() => handle[method]());
  await Promise.race([
    cleanup.catch(() => null),
    new Promise((resolve) => setTimeout(resolve, Math.max(1, timeoutMs))),
  ]);
  return true;
};

const resolveHandleResult = async (handle) => {
  if (!handle || typeof handle !== 'object') return {};
  if (typeof handle.waitForOutcome === 'function') return (await handle.waitForOutcome()) || {};
  if (typeof handle.wait === 'function') return (await handle.wait()) || {};
  if (typeof handle.result === 'function') return (await handle.result()) || {};
  return handle;
};

const mergeResult = (handle, completed) => {
  const nested = completed?.result && isObject(completed.result) ? completed.result : {};
  return {
    ...(isObject(handle) ? handle : {}),
    ...(isObject(completed) ? completed : {}),
    ...nested,
  };
};

const failureResult = ({ errorCode, errorSummary, failureStage, failureCategory = 'provider/transport', launcherFailure = null, timedOut = false } = {}) => ({
  status: 'failed',
  resultStatus: 'failed',
  errorCode,
  errorSummary,
  failureStage,
  failureCategory,
  launcherFailure,
  timedOut,
  dispatchMechanism: INDEPENDENT_SUBAGENT_REVIEW_TRANSPORT,
  executionMode: 'independent-review',
  outcome: null,
  report: null,
});

const invokeWithTimeout = async ({ launcher, request, timeoutMs }) => {
  const controller = new AbortController();
  let handle = null;
  let timedOut = false;
  let timer = null;
  const startedAt = Date.now();
  const launchPromise = Promise.resolve().then(() => launcher({ ...request, signal: controller.signal }));
  // If a launcher resolves after the timeout, still give the Host handle a
  // chance to tear down its child. The timeout result remains terminal.
  launchPromise.then(async (value) => {
    handle = value;
    if (timedOut) await cleanupHandle(value);
  }).catch(() => null);
  const operation = launchPromise.then(async (value) => {
    handle = value;
    const completed = await resolveHandleResult(value);
    return { result: mergeResult(value, completed), wallClockMs: Date.now() - startedAt };
  });
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve({ timedOut: true, wallClockMs: Date.now() - startedAt });
    }, timeoutMs);
  });
  const outcome = await Promise.race([operation, timeout]);
  if (timer) clearTimeout(timer);
  if (outcome?.timedOut === true) {
    await cleanupHandle(handle);
    return {
      timedOut: true,
      wallClockMs: outcome.wallClockMs,
      result: failureResult({
        errorCode: 'independent-review-timeout',
        errorSummary: `Independent reviewer exceeded the ${timeoutMs}ms Host timeout`,
        failureStage: 'timeout',
        failureCategory: 'transport/infrastructure',
        launcherFailure: { status: 'failed', errorCode: 'independent-review-timeout', failureStage: 'timeout', cleanupStatus: handle ? 'requested' : 'unavailable' },
        timedOut: true,
      }),
    };
  }
  return { ...outcome, timedOut: false };
};

const observeWorkspace = (projectRoot) => {
  if (!present(projectRoot)) return null;
  try {
    const observed = observeWorkspaceIdentity({ projectRoot });
    return observed?.identity ? observed : null;
  } catch {
    return null;
  }
};

const attestationFor = (result) => result?.reviewTransportAttestation || result?.attestation || null;

export const validateIndependentSubagentReviewAttestation = ({
  dispatch = null,
  invocation = null,
  reviewSubject = null,
  parentSessionId = null,
} = {}) => {
  const attestation = attestationFor(dispatch);
  const reasons = [];
  if (!isObject(attestation)) reasons.push('attestation-missing');
  if (attestation?.schemaVersion !== INDEPENDENT_SUBAGENT_REVIEW_SCHEMA_VERSION) reasons.push('attestation-schema-invalid');
  if (attestation?.transport !== INDEPENDENT_SUBAGENT_REVIEW_TRANSPORT) reasons.push('attestation-transport-invalid');
  for (const field of ['executionId', 'childSessionId', 'observedModel', 'observedEffort', 'workspaceIdentityBefore', 'workspaceIdentityAfter', 'capsuleDigest']) {
    if (!present(attestation?.[field])) reasons.push(`attestation-${field}-missing`);
  }
  if (attestation?.freshContext !== true) reasons.push('attestation-fresh-context-not-proven');
  if (attestation?.readOnly !== true) reasons.push('attestation-read-only-not-proven');
  if (attestation?.canCommit !== false) reasons.push('attestation-commit-capability-not-denied');
  if (attestation?.canDelegate !== false) reasons.push('attestation-delegation-capability-not-denied');
  if (attestation?.cleanupStatus !== 'clean') reasons.push('attestation-cleanup-not-proven');

  if (invocation?.model && attestation?.requestedModel !== invocation.model) reasons.push('attestation-requested-model-mismatch');
  if (invocation?.effort && String(attestation?.requestedEffort || '').toLowerCase() !== String(invocation.effort).toLowerCase()) reasons.push('attestation-requested-effort-mismatch');
  if (invocation?.model && attestation?.observedModel !== invocation.model) reasons.push('attestation-observed-model-mismatch');
  if (invocation?.effort && String(attestation?.observedEffort || '').toLowerCase() !== String(invocation.effort).toLowerCase()) reasons.push('attestation-observed-effort-mismatch');
  if (present(parentSessionId) && attestation?.parentSessionId !== parentSessionId) reasons.push('attestation-parent-session-mismatch');
  if (present(parentSessionId) && attestation?.childSessionId === parentSessionId) reasons.push('attestation-child-session-not-distinct');
  if (dispatch?.actorSessionId && dispatch.actorSessionId !== attestation?.childSessionId) reasons.push('attestation-dispatch-session-mismatch');

  const expectedWorkspaceIdentity = reviewSubject?.workspaceIdentity || null;
  const expectedMutationRevision = Number(reviewSubject?.mutationRevision);
  const expectedCapsuleDigest = reviewSubject?.capsuleDigest || null;
  if (expectedWorkspaceIdentity && attestation?.workspaceIdentityBefore !== expectedWorkspaceIdentity) reasons.push('attestation-workspace-before-mismatch');
  if (expectedWorkspaceIdentity && attestation?.workspaceIdentityAfter !== expectedWorkspaceIdentity) reasons.push('attestation-workspace-after-mismatch');
  if (Number.isInteger(expectedMutationRevision) && Number(attestation?.mutationRevisionBefore) !== expectedMutationRevision) reasons.push('attestation-mutation-before-mismatch');
  if (Number.isInteger(expectedMutationRevision) && Number(attestation?.mutationRevisionAfter) !== expectedMutationRevision) reasons.push('attestation-mutation-after-mismatch');
  if (expectedCapsuleDigest && attestation?.capsuleDigest !== expectedCapsuleDigest) reasons.push('attestation-capsule-digest-mismatch');
  if (attestation?.actualWorkspaceIdentityBefore !== attestation?.workspaceIdentityBefore) reasons.push('attestation-actual-workspace-before-mismatch');
  if (attestation?.actualWorkspaceIdentityAfter !== attestation?.workspaceIdentityAfter) reasons.push('attestation-actual-workspace-after-mismatch');
  if (attestation?.actualWorkspaceIdentityBefore !== attestation?.actualWorkspaceIdentityAfter) reasons.push('attestation-workspace-mutated');

  return Object.freeze({ valid: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)]) });
};

export const createIndependentSubagentReviewTransport = ({
  spawnIndependentReviewer = null,
  host = globalThis,
  surface = 'codex',
  timeoutMs = INDEPENDENT_SUBAGENT_REVIEW_DEFAULT_TIMEOUT_MS,
  capabilities = {},
} = {}) => {
  const launcher = resolveLauncher({ spawnIndependentReviewer, host });
  const usableTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : INDEPENDENT_SUBAGENT_REVIEW_DEFAULT_TIMEOUT_MS;
  const available = typeof launcher === 'function';
  const resolvedCapabilities = {
    surface,
    supportsSubagentModel: available,
    supportsSessionModelOverride: false,
    supportsIndependentContext: available,
    supportsIndependentSubagentReview: available,
    supportsCrossSurfaceReview: false,
    supportsReadOnlyReview: true,
    supportsUsageTokens: capabilities.supportsUsageTokens === true,
    supportsResolvedModelIdentity: true,
    ...capabilities,
    // A caller cannot turn a missing launcher into a green capability claim.
    supportsIndependentContext: available && capabilities.supportsIndependentContext !== false,
    supportsIndependentSubagentReview: available && capabilities.supportsIndependentSubagentReview !== false,
    supportsSubagentModel: available && capabilities.supportsSubagentModel !== false,
  };

  return {
    surface,
    capabilities: Object.freeze(resolvedCapabilities),
    nativeDelegationAvailable: available,
    ownerDirectAvailable: false,
    ownerDirectDefault: false,
    async dispatch({
      decision,
      resolution,
      executionCapsule = null,
      executionContract = null,
      hostExecutionContract = null,
      envelope = null,
      workingDirectory = null,
      environment = null,
      parentSessionId = null,
      concurrencyGroup = null,
      childSession = null,
      reviewSubject = null,
    } = {}) {
      const invocation = {
        model: resolution?.model || null,
        effort: resolution?.effort || null,
        freshSessionRequired: true,
        readOnly: true,
        dispatchMechanism: INDEPENDENT_SUBAGENT_REVIEW_TRANSPORT,
      };
      if (decision?.role !== 'reviewer') {
        return {
          ...failureResult({
            errorCode: 'independent-review-role-required',
            errorSummary: 'The independent subagent transport only accepts reviewer turns',
            failureStage: 'pre-spawn',
            failureCategory: 'transport',
          }),
          invocation,
        };
      }
      if (!available) {
        return {
          ...failureResult({
            errorCode: 'launcher-unavailable',
            errorSummary: 'The Host does not expose an independent reviewer launcher',
            failureStage: 'pre-spawn',
            failureCategory: 'provider/transport',
          }),
          invocation,
        };
      }
      if (!invocation.model || !invocation.effort) {
        return {
          ...failureResult({
            errorCode: 'independent-review-route-incomplete',
            errorSummary: 'Independent review requires an explicit model and reasoning effort',
            failureStage: 'pre-spawn',
            failureCategory: 'transport',
          }),
          invocation,
        };
      }

      const before = observeWorkspace(workingDirectory);
      const request = {
        schemaVersion: INDEPENDENT_SUBAGENT_REVIEW_SCHEMA_VERSION,
        taskName: 'kernel_reviewer',
        task_name: 'kernel_reviewer',
        model: invocation.model,
        reasoningEffort: invocation.effort,
        reasoning_effort: invocation.effort,
        message: buildIndependentSubagentReviewPrompt({ executionContract, executionCapsule }),
        executionContract,
        execution_contract: executionContract,
        executionCapsule,
        execution_capsule: executionCapsule,
        hostExecutionContract,
        parentSessionId,
        parent_session_id: parentSessionId,
        childSession: {
          ...(childSession || {}),
          role: 'reviewer',
          freshSessionRequired: true,
          canCommit: false,
          canDelegate: false,
          permissions: 'read_only',
        },
        child_session: {
          ...(childSession || {}),
          role: 'reviewer',
          freshSessionRequired: true,
          canCommit: false,
          canDelegate: false,
          permissions: 'read_only',
        },
        workingDirectory,
        working_directory: workingDirectory,
        environment,
        concurrencyGroup: concurrencyGroup || null,
        concurrency_group: concurrencyGroup || null,
        timeoutMs: usableTimeoutMs,
        timeout_ms: usableTimeoutMs,
        // This is Host control data. Implementations must not append it to the
        // model prompt; it is supplied so the launcher can bind its before /
        // after workspace observation to the Kernel-issued subject.
        reviewSubject,
      };

      let invoked;
      try {
        invoked = await invokeWithTimeout({ launcher, request, timeoutMs: usableTimeoutMs });
      } catch (error) {
        const failureStage = error?.failureStage || error?.details?.failureStage || 'pre-spawn';
        return {
          ...failureResult({
            errorCode: error?.code || 'independent-review-launch-failed',
            errorSummary: error?.message || String(error),
            failureStage,
            failureCategory: error?.failureCategory || error?.details?.failureCategory || 'provider/transport',
          }),
          invocation,
        };
      }

      const after = observeWorkspace(workingDirectory);
      const result = invoked?.result || {};
      if (invoked?.timedOut === true) return { ...result, wallClockMs: invoked.wallClockMs, invocation };

      let outcome;
      try {
        outcome = normalizeReviewOutcome(result.outcome || result.report);
      } catch (error) {
        return {
          ...failureResult({
            errorCode: 'independent-review-output-invalid',
            errorSummary: error.message,
            failureStage: 'post-spawn',
            failureCategory: 'transport/infrastructure',
          }),
          wallClockMs: invoked.wallClockMs,
          invocation,
          reviewTransportAttestation: attestationFor(result),
        };
      }

      const attestation = attestationFor(result);
      const normalizedAttestation = isObject(attestation)
        ? {
          ...attestation,
          schemaVersion: attestation.schemaVersion ?? INDEPENDENT_SUBAGENT_REVIEW_SCHEMA_VERSION,
          transport: attestation.transport ?? INDEPENDENT_SUBAGENT_REVIEW_TRANSPORT,
          actualWorkspaceIdentityBefore: before?.identity || null,
          actualWorkspaceIdentityAfter: after?.identity || null,
        }
        : null;
      const actorSessionId = normalizedAttestation?.childSessionId || null;
      const observedModel = normalizedAttestation?.observedModel || null;
      const observedEffort = normalizedAttestation?.observedEffort || null;
      return {
        status: 'completed',
        resultStatus: 'completed',
        requestedModel: invocation.model,
        requestedEffort: invocation.effort,
        resolvedModel: observedModel,
        resolvedEffort: observedEffort,
        observedModel,
        observedEffort,
        dispatchMechanism: INDEPENDENT_SUBAGENT_REVIEW_TRANSPORT,
        executionMode: 'independent-review',
        actorRole: 'reviewer',
        actorSessionId,
        sessionId: actorSessionId,
        parentSessionId: parentSessionId || null,
        outcome,
        report: null,
        wallClockMs: invoked.wallClockMs,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        reasoningTokens: result.reasoningTokens ?? null,
        costMicros: result.costMicros ?? null,
        reviewTransportAttestation: normalizedAttestation,
        invocation,
      };
    },
  };
};
