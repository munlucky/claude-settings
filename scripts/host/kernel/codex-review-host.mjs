import { createCodexAdapter } from './adapters/codex.mjs';
import { CODEX_MODELS } from './codex-model-policy.mjs';
import { createCodexCliReviewLauncher } from './codex-cli-launcher.mjs';
import { dispatchKernelTurn } from './turn-dispatcher.mjs';
import { scanRepositoryEvidence } from '../../kernel/task/evidence-scan.mjs';

export const runCodexIndependentReview = async ({
  controlPlane,
  runId,
  projectRoot,
  runtimeHome,
  parentSessionId,
  obligationId = 'security-review',
  model = CODEX_MODELS.sol,
  effort = 'high',
  images = [],
  launch = null,
  env = process.env,
} = {}) => {
  if (!controlPlane || !runId || !projectRoot || !parentSessionId) {
    throw new Error('Codex review Host requires controlPlane, runId, projectRoot, and parentSessionId');
  }
  const launcher = launch || createCodexCliReviewLauncher({ projectRoot, images, env });
  const adapter = createCodexAdapter({
    launch: launcher,
    runtimeHome,
    env,
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
    overrides: { frontier_reasoning: { model, effort } },
    actionContext: { actionKind: 'review_engineering', obligationId, changedPaths },
  });
  if (!dispatched.dispatched || !dispatched.receipt || !dispatched.dispatch?.outcome) {
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
