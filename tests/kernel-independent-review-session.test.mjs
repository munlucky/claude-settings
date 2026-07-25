import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { assertIndependentReviewSession } from '../scripts/kernel/proof/review-pipeline.mjs';
import { hashSessionId } from '../scripts/kernel/run/model-route-contract.mjs';

const IMPLEMENTER = hashSessionId('implementer');
const REVIEWER = hashSessionId('reviewer');

const withT3Run = async (fn) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-indep-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-indep-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-t3', objective: 'auth boundary', taskContract: { surfaces: ['security_boundary'] } });
    assert.equal((await cp.getRun('r-t3')).proofTier, 'T3');
    return await fn(cp, 'r-t3');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
};

const routeAndRun = async (cp, runId, actionKind, actorSessionId, extra = {}) => {
  const decision = await cp.decideModelRoute(runId, { actionKind, obligationId: 'default' });
  const receipt = await cp.recordModelUsage(runId, {
    decisionId: decision.decisionId,
    runId,
    hostSurface: 'claude',
    actorSessionId,
    resolvedModel: 'configured-model',
    enforcementStatus: 'enforced',
    resultStatus: 'completed',
    ...extra,
  });
  return { decision, receipt };
};

test('a routed T3 review cannot be self-approved by the implementing session', async () => {
  await withT3Run(async (cp, runId) => {
    await routeAndRun(cp, runId, 'implement', IMPLEMENTER);
    const selfReview = await routeAndRun(cp, runId, 'review_engineering', IMPLEMENTER);
    await assert.rejects(
      cp.recordReview(runId, { stage: 'engineering', verdict: 'pass', reviewerId: 'reviewer-2' }, { implementerId: 'impl-1', reviewReceiptId: selfReview.receipt.receiptId }),
      /the reviewing session is the implementing session/,
    );
  });
});

test('a routed T3 review passes when a distinct frontier session performed it', async () => {
  await withT3Run(async (cp, runId) => {
    await routeAndRun(cp, runId, 'implement', IMPLEMENTER);
    const review = await routeAndRun(cp, runId, 'review_engineering', REVIEWER);
    assert.equal(review.decision.modelClass, 'frontier_reasoning');
    assert.equal(review.decision.independentContextRequired, true);
    await cp.transition(runId, 'SHAPE');
    await cp.transition(runId, 'EXECUTE');
    await cp.transition(runId, 'PROVE');
    const recorded = await cp.recordReview(runId, { stage: 'engineering', verdict: 'pass', reviewerId: 'reviewer-2' }, { implementerId: 'impl-1', reviewReceiptId: review.receipt.receiptId });
    assert.equal(recorded.review.verdict, 'pass');
    assert.equal(recorded.followUp.requiredAction, 'none');
  });
});

test('once the Host routes models, a T3 review without a receipt is refused', async () => {
  await withT3Run(async (cp, runId) => {
    await routeAndRun(cp, runId, 'implement', IMPLEMENTER);
    await assert.rejects(
      cp.recordReview(runId, { stage: 'contract', verdict: 'pass', reviewerId: 'reviewer-2' }, { implementerId: 'impl-1' }),
      /requires the Host usage receipt/,
    );
  });
});

test('an advisory or unsupported routing cannot carry a T3 independence claim', () => {
  const base = { reviewDecision: { modelClass: 'frontier_reasoning' }, implementationSession: { actorSessionId: IMPLEMENTER } };
  for (const enforcementStatus of ['advisory', 'unsupported', 'failed']) {
    assert.throws(
      () => assertIndependentReviewSession({ ...base, reviewReceipt: { enforcementStatus, actorSessionId: REVIEWER } }),
      new RegExp(`cannot rest on ${enforcementStatus} model routing`),
    );
  }
  assert.throws(
    () => assertIndependentReviewSession({ ...base, reviewDecision: { modelClass: 'value_coding' }, reviewReceipt: { enforcementStatus: 'enforced', actorSessionId: REVIEWER } }),
    /must run on the frontier reasoning class/,
  );
  assert.ok(assertIndependentReviewSession({ ...base, reviewReceipt: { enforcementStatus: 'fallback', actorSessionId: REVIEWER } }));
});
