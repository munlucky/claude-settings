// K0 freshness: a Review Receipt is bound to the workspace identity and the
// mutation revision it reviewed. Change the workspace after the review and the
// review goes stale instead of quietly completing the run.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { hashSessionId } from '../scripts/kernel/run/model-route-contract.mjs';
import { digestOfPaths, evaluateReviewReceipt } from '../scripts/kernel/proof/review-receipt.mjs';

const IMPLEMENTER = hashSessionId('freshness-implementer');
const REVIEWER = hashSessionId('freshness-reviewer');

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-rrf-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-rrf-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'rrf-fixture',
    version: '0.0.1',
    scripts: { 'test:ok': 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' },
  }, null, 2));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const v = 0;\n');
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

const mutate = (projectRoot, value) => writeFile(path.join(projectRoot, 'app.mjs'), `export const v = ${value};\n`);

const routeAndRun = async (cp, runId, actionKind, actorSessionId) => {
  const decision = await cp.decideModelRoute(runId, { actionKind, obligationId: 'default' });
  const receipt = await cp.recordModelUsage(runId, {
    decisionId: decision.decisionId,
    runId,
    hostSurface: 'claude',
    actorSessionId,
    resolvedModel: 'configured-model',
    enforcementStatus: 'enforced',
    resultStatus: 'completed',
  });
  return { decision, receipt };
};

const reviewedT3Run = async (fixture, cp, runId) => {
  await cp.startRun({ runId, objective: 'auth boundary', taskContract: { surfaces: ['security_boundary'], acceptance: ['works'] } });
  await mutate(fixture.projectRoot, 1);
  await routeAndRun(cp, runId, 'implement', IMPLEMENTER);
  await cp.report(runId, {
    summary: 'implemented',
    changedPaths: ['app.mjs'],
    verifications: [
      { obligationId: 'unit-test', commandRef: 'test:ok', acceptanceCoverage: ['works'] },
      { obligationId: 'static-analysis', commandRef: 'lint' },
    ],
  });
  const review = await routeAndRun(cp, runId, 'review_engineering', REVIEWER);
  return cp.recordReview(
    runId,
    { stage: 'engineering', verdict: 'pass', reviewerId: 'reviewer-2' },
    { implementerId: 'impl-1', reviewReceiptId: review.receipt.receiptId, obligationId: 'security-review', changedPaths: ['app.mjs'] },
  );
};

test('K0-5: a workspace change after the review makes the review stale', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const recorded = await reviewedT3Run(fixture, cp, 'r-stale');
    assert.equal((await cp.assessCompletion('r-stale')).readyExceptClose, true);

    // The implementer keeps working after the review landed.
    await mutate(fixture.projectRoot, 2);
    const reported = await cp.report('r-stale', {
      summary: 'more work after review',
      implementerId: 'impl-1',
      judgments: [{
        obligationId: 'security-review',
        verdict: 'pass',
        reviewerId: 'reviewer-2',
        rationale: 'already reviewed',
        reviewReceiptId: recorded.reviewReceipt.receiptId,
      }],
    });
    assert.match(reported.failures[0].errorSummary, /review-stale-(workspace-identity|mutation-revision)/);

    const completion = await cp.assessCompletion('r-stale');
    const byId = Object.fromEntries(completion.obligationStatuses.map((entry) => [entry.obligationId, entry]));
    assert.equal(byId['security-review'].satisfied, false, 'the earlier review cannot cover a workspace it never saw');
    assert.equal(completion.decision, 'blocked');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K0-6: a mutation revision bump alone invalidates the receipt', () => {
  const receipt = {
    runId: 'r-1',
    verdict: 'pass',
    reviewer: { actorSessionId: REVIEWER, modelClass: 'frontier_reasoning', enforcementStatus: 'enforced' },
    implementer: { actorSessionId: IMPLEMENTER },
    subject: { workspaceIdentity: `sha256:${'a'.repeat(64)}`, mutationRevision: 3, changedPathsDigest: digestOfPaths([]), evidenceDigest: `sha256:${'b'.repeat(64)}` },
  };
  const run = { runId: 'r-1', mutationRevision: 3, currentWorkspaceIdentity: `sha256:${'a'.repeat(64)}` };
  const options = { requireIndependentSession: true, requireFrontierClass: true, requireTrustedEnforcement: true };

  assert.equal(evaluateReviewReceipt({ receipt, run, ...options }).usable, true);
  assert.deepEqual(
    evaluateReviewReceipt({ receipt, run: { ...run, mutationRevision: 4 }, ...options }).reasons,
    ['review-stale-mutation-revision'],
  );
  assert.deepEqual(
    evaluateReviewReceipt({ receipt, run: { ...run, currentWorkspaceIdentity: `sha256:${'e'.repeat(64)}` }, ...options }).reasons,
    ['review-stale-workspace-identity'],
  );
  assert.deepEqual(
    evaluateReviewReceipt({ receipt: { ...receipt, verdict: 'changes-requested' }, run, ...options }).reasons,
    ['review-verdict-changes-requested'],
  );
});

test('K0-6b: a re-review at the new workspace state restores completion', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await reviewedT3Run(fixture, cp, 'r-rereview');
    await mutate(fixture.projectRoot, 2);
    // Re-run the executable obligations against the new state, then review it.
    await cp.report('r-rereview', {
      summary: 'follow-up fix',
      changedPaths: ['app.mjs'],
      verifications: [
        { obligationId: 'unit-test', commandRef: 'test:ok', acceptanceCoverage: ['works'] },
        { obligationId: 'static-analysis', commandRef: 'lint' },
      ],
    });
    const secondReview = await routeAndRun(cp, 'r-rereview', 'review_engineering', REVIEWER);
    const recorded = await cp.recordReview(
      'r-rereview',
      { stage: 'engineering', verdict: 'pass', reviewerId: 'reviewer-2' },
      { implementerId: 'impl-1', reviewReceiptId: secondReview.receipt.receiptId, obligationId: 'security-review', changedPaths: ['app.mjs'] },
    );
    const run = await cp.getRun('r-rereview');
    assert.equal(recorded.reviewReceipt.subject.mutationRevision, run.mutationRevision);
    assert.equal((await cp.assessCompletion('r-rereview')).readyExceptClose, true);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});
