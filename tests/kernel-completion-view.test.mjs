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
