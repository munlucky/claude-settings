import { createCodexAdapter } from './adapters/codex.mjs';
import { CODEX_MODELS } from './codex-model-policy.mjs';
import { createCodexCliReviewLauncher } from './codex-cli-launcher.mjs';
import { dispatchKernelTurn } from './turn-dispatcher.mjs';
import { scanRepositoryEvidence } from '../../kernel/task/evidence-scan.mjs';

const KERNEL_BLOCK_REASONS = new Set([
  'question',
  'permission',
  'external-dependency',
  'unsupported-verification',
  'unsafe-command',
  'network-policy',
]);

const unsupportedHostResult = ({ runId, dispatched, kind } = {}) => {
  const dispatch = dispatched?.dispatch || {};
  const capability = dispatch.unsupportedCapability || dispatch.capability || null;
  return {
    schemaVersion: 1,
    runId,
    status: 'unsupported',
    errorCode: dispatch.errorCode || 'codex-host-capability-unsupported',
    errorSummary: dispatch.errorSummary || `${kind} Host capability is unavailable`,
    capability,
    dispatched,
    ...(kind === 'review' ? { review: null } : { worker: dispatch, report: null }),
  };
};

const unsupportedReviewError = (dispatched) => {
  const dispatch = dispatched?.dispatch || {};
  const error = new Error(`incomplete_review_chain: ${dispatch.errorSummary || 'Codex review Host capability is unavailable'}`);
  error.code = dispatch.errorCode || 'codex-host-capability-unsupported';
  error.details = {
    capability: dispatch.unsupportedCapability || dispatch.capability || null,
    dispatched,
  };
  return error;
};

// The worker contract deliberately speaks in worker terms. The Kernel report
// contract speaks in trusted command requests and typed blockers. Translate at
// this Host boundary so neither side silently drops requested proof or a child
// failure before it reaches the Kernel authority.
export const normalizeCodexWorkerReport = (workerReport = {}) => {
  const requestedVerifications = Array.isArray(workerReport.requestedVerifications)
    ? workerReport.requestedVerifications
      .filter((commandRef) => typeof commandRef === 'string' && commandRef.trim())
      .map((commandRef) => ({ commandRef: commandRef.trim() }))
    : [];
  const hasStructuredVerifications = Object.prototype.hasOwnProperty.call(workerReport, 'verifications');
  let structuredVerifications = null;
  if (hasStructuredVerifications) {
    if (!Array.isArray(workerReport.verifications)) {
      throw new Error('codex_worker_report_invalid: verifications must be an array');
    }
    structuredVerifications = workerReport.verifications.map((verification, index) => {
      if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
        throw new Error(`codex_worker_report_invalid: verifications[${index}] must be an object`);
      }
      if (typeof verification.obligationId !== 'string' || !verification.obligationId.trim()) {
        throw new Error(`codex_worker_report_invalid: verifications[${index}].obligationId must be a non-empty string`);
      }
      if (typeof verification.commandRef !== 'string' || !verification.commandRef.trim()) {
        throw new Error(`codex_worker_report_invalid: verifications[${index}].commandRef must be a non-empty string`);
      }
      if (!Array.isArray(verification.acceptanceCoverage)
        || verification.acceptanceCoverage.some((acceptanceId) => typeof acceptanceId !== 'string' || !acceptanceId.trim())) {
        throw new Error(`codex_worker_report_invalid: verifications[${index}].acceptanceCoverage must be an array of non-empty strings`);
      }
      return verification;
    });
  }
  const rawBlocker = workerReport.blocker;
  const typedBlocker = rawBlocker && typeof rawBlocker === 'object'
    ? rawBlocker
    : typeof rawBlocker === 'string' && rawBlocker.trim()
      ? {
        reason: KERNEL_BLOCK_REASONS.has(rawBlocker.trim()) ? rawBlocker.trim() : 'external-dependency',
        detail: rawBlocker.trim(),
      }
      : workerReport.status === 'blocked' || workerReport.status === 'failed'
        ? {
          reason: 'external-dependency',
          detail: `Codex worker returned ${workerReport.status} without a typed blocker`,
        }
        : null;
  return {
    ...workerReport,
    verifications: structuredVerifications || requestedVerifications,
    blocker: typedBlocker,
  };
};

export const runCodexIndependentReview = async ({
  controlPlane,
  runId,
  projectRoot,
  runtimeHome,
  parentSessionId,
  obligationId = 'security-review',
  model = CODEX_MODELS.sol,
  effort = null,
  images = [],
  launch = null,
  nativeLaunch = null,
  nativeAgentHost = globalThis,
  cliLaunch = null,
  parentSessionConfig = null,
  parentSessionObserver = null,
  env = process.env,
} = {}) => {
  if (!controlPlane || !runId || !projectRoot || !parentSessionId) {
    throw new Error('Codex review Host requires controlPlane, runId, projectRoot, and parentSessionId');
  }
  const proofTier = controlPlane.stateStore?.getRun?.(runId)?.proofTier || 'T1';
  const resolvedEffort = effort || (proofTier === 'T3' ? 'xhigh' : 'high');
  // A review may run through the Host's bounded native sub-agent bridge. Keep
  // the explicit `launch` seam for older callers, but make the review CLI a
  // named fallback so a native child can fail over without changing the
  // read-only output contract. Both paths still pass through the same Kernel
  // route, capsule, admission, usage receipt, and outcome-ingest chain below.
  const launcher = launch || null;
  const reviewCliLaunch = cliLaunch || (!launch
    ? createCodexCliReviewLauncher({ projectRoot, images, env })
    : null);
  const adapter = createCodexAdapter({
    launch: launcher,
    nativeLaunch,
    nativeAgentHost,
    cliLaunch: reviewCliLaunch,
    projectRoot,
    images,
    runtimeHome,
    env,
    defaultParentSessionConfig: parentSessionConfig,
    parentSessionObserver,
    capabilities: {
      supportsUsageTokens: true,
      supportsCacheReadTokens: true,
    },
  });
  const changedPaths = scanRepositoryEvidence({ projectRoot }).dirtyPaths;
  const dispatched = await dispatchKernelTurn({
    controlPlane,
    runId,
    adapter,
    runtimeHome,
    env,
    parentSessionId,
    parentSessionConfig,
    overrides: { frontier_reasoning: { model, effort: resolvedEffort } },
    actionContext: { actionKind: 'review_engineering', obligationId, changedPaths },
  });
  if (!dispatched.dispatched || !dispatched.receipt || !dispatched.dispatch?.outcome) {
    if (dispatched.dispatch?.status === 'unsupported' || dispatched.dispatch?.enforcementStatus === 'unsupported') {
      throw unsupportedReviewError(dispatched);
    }
    throw new Error(`codex_review_not_dispatched: ${dispatched.reason || dispatched.dispatch?.errorSummary || 'missing outcome'}`);
  }
  const outcome = {
    ...dispatched.dispatch.outcome,
    reviewedMutationRevision: dispatched.executionCapsule.subject.mutationRevision,
  };
  const ingested = await controlPlane.ingestReviewerOutcome({
    runId,
    stepId: dispatched.executionCapsule.stepId || null,
    capsuleId: dispatched.executionCapsule.capsuleId,
    routeDecisionId: dispatched.hostDirective.modelRouteDecision.decisionId,
    usageReceiptId: dispatched.receipt.receiptId,
    reviewerSessionId: dispatched.dispatch.actorSessionId,
    outcome,
  });
  return {
    schemaVersion: 1,
    runId,
    reviewerThreadId: dispatched.dispatch.actorSessionId,
    usageReceiptId: dispatched.receipt.receiptId,
    reviewReceiptId: ingested.reviewReceipt?.receiptId || null,
    verdict: outcome.verdict,
    findings: outcome.findings,
    risks: outcome.risks,
    review: ingested,
  };
};

// Ordinary Codex work uses the same Host boundary as review, but the worker
// outcome is reported back through the Kernel only after the child identity,
// capsule, attempt, and observed usage receipt have been attached. This is the
// production Host entrypoint for implement/debug actors; the parent session
// never receives a direct implementation fallback.
export const runCodexKernelWorker = async ({
  controlPlane,
  runId,
  projectRoot,
  runtimeHome,
  parentSessionId,
  actionKind = 'implement',
  obligationId = null,
  complexity = null,
  workProfile = null,
  nativeLaunch = null,
  nativeAgentHost = globalThis,
  cliLaunch = null,
  parentSessionConfig = null,
  parentSessionObserver = null,
  env = process.env,
} = {}) => {
  if (!controlPlane || !runId || !projectRoot || !parentSessionId) {
    throw new Error('Codex worker Host requires controlPlane, runId, projectRoot, and parentSessionId');
  }
  const adapter = createCodexAdapter({
    nativeLaunch,
    nativeAgentHost,
    cliLaunch,
    projectRoot,
    runtimeHome,
    env,
    defaultParentSessionConfig: parentSessionConfig,
    parentSessionObserver,
  });
  const dispatched = await dispatchKernelTurn({
    controlPlane,
    runId,
    adapter,
    runtimeHome,
    env,
    parentSessionId,
    parentSessionConfig,
    actionContext: { actionKind, obligationId, complexity, workProfile },
  });
  if (!dispatched.dispatched || !dispatched.dispatch?.outcome) {
    if (dispatched.dispatch?.status === 'unsupported' || dispatched.dispatch?.enforcementStatus === 'unsupported') {
      return unsupportedHostResult({ runId, dispatched, kind: 'worker' });
    }
    throw new Error(`codex_worker_not_dispatched: ${dispatched.reason || dispatched.dispatch?.errorSummary || 'missing outcome'}`);
  }
  const workerReport = dispatched.report || dispatched.dispatch.report || dispatched.dispatch.outcome;
  if (!workerReport || typeof workerReport !== 'object') {
    throw new Error('codex_worker_report_missing');
  }
  const report = await controlPlane.report(runId, {
    ...normalizeCodexWorkerReport(workerReport),
    stepId: workerReport.stepId || dispatched.executionCapsule?.stepId || null,
    capsuleId: workerReport.capsuleId || dispatched.executionCapsule?.capsuleId || null,
    attemptId: workerReport.attemptId || dispatched.attemptId || null,
    bindingId: workerReport.bindingId || dispatched.hostDirective?.attempt?.bindingId || null,
    assignmentId: workerReport.assignmentId || dispatched.hostDirective?.actorAssignment?.assignmentId || null,
    actorSessionId: workerReport.actorSessionId || dispatched.dispatch.actorSessionId || null,
  });
  return {
    schemaVersion: 1,
    runId,
    status: report.status,
    dispatched,
    worker: dispatched.dispatch,
    report,
  };
};
