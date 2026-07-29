import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCompletionView } from '../scripts/kernel/run/completion-view.mjs';

test('completion view is derived from existing authorities', () => {
  const view = computeCompletionView({
    run: { finalizationStatus: 'completed', status: 'completed' },
    step: { state: 'passed' },
    obligations: [{ obligationId: 'test', evidenceClass: 'hard', status: 'required' }],
    verifications: [{ obligationId: 'test', status: 'passed' }],
    completionDecision: { decision: 'accepted' },
  });
  assert.deepEqual(view, {
    implementation: 'complete',
    verification: 'passed',
    review: 'not-required',
    kernelAcceptance: 'accepted',
    finalization: 'complete',
    overall: 'done',
  });
});

test('completion view uses latest obligation state for retries (failed -> passed)', () => {
  const view = computeCompletionView({
    run: { finalizationStatus: 'pending', status: 'active', mutationRevision: 1 },
    step: { state: 'passed' },
    obligations: [{ obligationId: 'test', evidenceClass: 'hard', status: 'required' }],
    verifications: [
      { id: 1, obligationId: 'test', status: 'failed' },
      { id: 2, obligationId: 'test', status: 'passed' },
    ],
  });
  assert.equal(view.verification, 'passed');
  assert.equal(view.overall, 'active');
});

test('completion view reflects latest obligation state for retries (passed -> failed)', () => {
  const view = computeCompletionView({
    run: { finalizationStatus: 'pending', status: 'active', mutationRevision: 1 },
    step: { state: 'passed' },
    obligations: [{ obligationId: 'test', evidenceClass: 'hard', status: 'required' }],
    verifications: [
      { id: 1, obligationId: 'test', status: 'passed' },
      { id: 2, obligationId: 'test', status: 'failed' },
    ],
  });
  assert.equal(view.verification, 'failed');
  assert.equal(view.overall, 'blocked');
});

test('completion view ignores historical reviews from prior mutation revisions', () => {
  const view = computeCompletionView({
    run: { finalizationStatus: 'pending', status: 'active', mutationRevision: 2 },
    step: { state: 'passed' },
    obligations: [{ obligationId: 'review-engineering', evidenceClass: 'judgment', status: 'required' }],
    reviews: [
      { id: 1, obligationId: 'review-engineering', verdict: 'fail', subject: { mutationRevision: 1 } },
      { id: 2, obligationId: 'review-engineering', verdict: 'pass', subject: { mutationRevision: 2 } },
    ],
  });
  assert.equal(view.review, 'passed');
  assert.equal(view.overall, 'active');
});

test('completion view review retry (fail -> pass) updates view to passed', () => {
  const view = computeCompletionView({
    run: { finalizationStatus: 'pending', status: 'active', mutationRevision: 1 },
    step: { state: 'passed' },
    obligations: [{ obligationId: 'review-engineering', evidenceClass: 'judgment', status: 'required' }],
    reviews: [
      { id: 1, obligationId: 'review-engineering', verdict: 'fail', subject: { mutationRevision: 1 } },
      { id: 2, obligationId: 'review-engineering', verdict: 'pass', subject: { mutationRevision: 1 } },
    ],
  });
  assert.equal(view.review, 'passed');
  assert.equal(view.overall, 'active');
});
