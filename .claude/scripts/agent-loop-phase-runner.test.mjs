import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildPhaseLoopShadowSignal,
  computePhaseLoopShadowDecision,
} from './agent-loop-phase-runner.mjs';

test('shadow adapter converts review, verify, finish, checkpoint, and pass cases', () => {
  const cases = [
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'review', result: 'failed', failureClass: 'code_change_required' },
      expected: { stage: 'review', result: 'fail', failureClass: 'code_change_required' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'verify', result: 'failed', failureClass: 'missing_verification_evidence' },
      expected: { stage: 'verify', result: 'fail', failureClass: 'missing_verification_evidence' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'finish', result: 'failed', failureClass: 'projection_state_inconsistency' },
      expected: { stage: 'finish', result: 'fail', failureClass: 'projection_state_inconsistency' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'checkpoint', result: 'partial', failureClass: 'stale_projection' },
      expected: { stage: 'checkpoint', result: 'partial', failureClass: 'stale_projection' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'finish', result: 'passed', evidenceRefs: ['.claude/verification-verdict-phase02-final.json'] },
      expected: { stage: 'finish', result: 'pass', failureClass: '' },
    },
  ];

  for (const { input, expected } of cases) {
    const signal = buildPhaseLoopShadowSignal(input);
    assert.equal(signal.phaseNumber, 2);
    assert.equal(signal.attemptNumber, 1);
    assert.equal(signal.stage, expected.stage);
    assert.equal(signal.result, expected.result);
    assert.equal(signal.failureClass, expected.failureClass);
    assert.equal(Array.isArray(signal.failedCases), true);
    assert.equal(Array.isArray(signal.evidenceRefs), true);
    assert.equal(Array.isArray(signal.blockers), true);
    assert.equal(Object.hasOwn(signal, 'previousRemediation'), true);
  }
});

test('finalizer failure codes map to finish-stage normalized signals', () => {
  const expectedClasses = new Map([
    ['verification-verdict-not-passed', 'missing_verification_evidence'],
    ['review-evidence-missing', 'missing_review_evidence'],
    ['phase-status-inconsistent', 'projection_state_inconsistency'],
    ['current-artifacts-stale', 'projection_state_inconsistency'],
    ['workflow-state-failed', 'projection_state_inconsistency'],
    ['tool-unavailable', 'environment_unavailable'],
    ['spawn EPERM', 'environment_unavailable'],
  ]);

  for (const [code, failureClass] of expectedClasses) {
    const signal = buildPhaseLoopShadowSignal({
      phaseNumber: 2,
      attemptNumber: 3,
      finalizerFailureCode: code,
      evidenceRef: 'QA_REPORT.md',
    });
    assert.equal(signal.stage, 'finish');
    assert.equal(signal.failureClass, failureClass);
    assert.equal(signal.failedCases[0].class, failureClass);
    assert.equal(signal.failedCases[0].message, code);
  }
});

test('unknown finalizer failure gives controller enough context to block without retry', () => {
  const shadow = computePhaseLoopShadowDecision({
    legacyDecision: 'blocked',
    phaseNumber: 2,
    attemptNumber: 4,
    finalizerFailureCode: 'unexpected-finalizer-code',
  });

  assert.equal(shadow.signal.stage, 'finish');
  assert.equal(shadow.signal.failureClass, 'unknown_finalizer_failure');
  assert.equal(shadow.controllerDecision, 'blocked');
  assert.equal(shadow.decision.retryRecommended, false);
  assert.equal(shadow.decision.failedCases[0].class, 'unknown_finalizer_failure');
});

test('shadow mismatch is observable and legacy decision remains authoritative', () => {
  const shadow = computePhaseLoopShadowDecision({
    legacyDecision: 'rerun_verify',
    phaseNumber: 2,
    attemptNumber: 5,
    stage: 'review',
    result: 'failed',
    failureClass: 'code_change_required',
    evidenceRefs: ['QA_REPORT.md#review'],
  });

  assert.equal(shadow.controllerDecision, 'continue_execute');
  assert.equal(shadow.legacyDecision, 'rerun_verify');
  assert.equal(shadow.mismatch, true);
  assert.deepEqual(Object.keys(shadow.mismatchLog), [
    'legacyDecision',
    'controllerDecision',
    'phaseNumber',
    'attemptNumber',
    'stage',
    'failureClass',
    'evidenceRefs',
  ]);
  assert.equal(shadow.mismatchLog.legacyDecision, 'rerun_verify');
});
