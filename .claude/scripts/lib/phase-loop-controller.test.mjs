import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ALLOWED_PHASE_LOOP_DECISIONS,
  PHASE_LOOP_DECISIONS,
  decidePhaseLoop,
  isAllowedPhaseLoopDecision,
} from './phase-loop-controller.mjs';

test('exports exactly the six allowed decisions', () => {
  assert.deepEqual(ALLOWED_PHASE_LOOP_DECISIONS, [
    'continue_execute',
    'rerun_review',
    'rerun_verify',
    'repair_required',
    'blocked',
    'clean_finish_candidate',
  ]);

  for (const decision of ALLOWED_PHASE_LOOP_DECISIONS) {
    assert.equal(isAllowedPhaseLoopDecision(decision), true);
  }
  assert.equal(isAllowedPhaseLoopDecision('implicit_retry'), false);
});

test('review findings that require code change continue execution', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 2,
    stage: 'review',
    result: 'failed',
    failedCases: [{ class: 'code_change_required', message: 'fix controller' }],
    improvementDirectives: ['patch implementation'],
    evidenceRefs: ['QA_REPORT.md#review'],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.CONTINUE_EXECUTE);
  assert.equal(result.retryRecommended, true);
  assert.equal(result.failedStage, 'review');
  assert.equal(result.nextAttemptInput.retryStrategy, 'execute_repair');
  assertOutputShape(result);
});

test('non-actionable review failures rerun review', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 1,
    stage: 'review',
    result: 'failed',
    failedCases: [{ class: 'review_verdict_missing' }],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.RERUN_REVIEW);
  assert.equal(result.nextAttemptInput.retryStrategy, 'rerun_review');
  assertOutputShape(result);
});

test('missing verification evidence reruns verification', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 3,
    stage: 'verify',
    result: 'failed',
    failedCases: [{ class: 'missing_verification_evidence' }],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.RERUN_VERIFY);
  assert.equal(result.retryRecommended, true);
  assert.equal(result.nextAttemptInput.retryStrategy, 'rerun_verify');
  assertOutputShape(result);
});

test('verification failures that require code change continue execution', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 4,
    stage: 'verify',
    result: 'failed',
    failedCases: [{ class: 'test_failure', evidenceRef: 'node --test' }],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.CONTINUE_EXECUTE);
  assert.equal(result.failedCases[0].evidenceRef, 'node --test');
  assert.equal(result.nextAttemptInput.retryStrategy, 'execute_repair');
  assertOutputShape(result);
});

test('finish projection or state inconsistency requires repair', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 5,
    stage: 'finish',
    result: 'failed',
    failedCases: [{ class: 'projection_state_inconsistency' }],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.REPAIR_REQUIRED);
  assert.equal(result.retryRecommended, true);
  assert.equal(result.nextAttemptInput.retryStrategy, 'repair_projection');
  assertOutputShape(result);
});

test('checkpoint projection inconsistency requires repair', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 6,
    stage: 'checkpoint',
    result: 'failed',
    failedCases: [{ class: 'stale_projection' }],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.REPAIR_REQUIRED);
  assert.equal(result.failedStage, 'checkpoint');
  assertOutputShape(result);
});

test('unknown finalizer failure blocks without retry', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 7,
    stage: 'finish',
    result: 'failed',
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.BLOCKED);
  assert.equal(result.retryRecommended, false);
  assert.equal(result.failedCases[0].class, 'unknown_finalizer_failure');
  assert.equal(result.nextAttemptInput.retryStrategy, 'stop_and_handoff');
  assertOutputShape(result);
});

test('all-pass signal produces a clean finish candidate only', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 8,
    stage: 'finish',
    result: 'passed',
    evidenceRefs: ['verification-verdict.json'],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.CLEAN_FINISH_CANDIDATE);
  assert.equal(result.retryRecommended, false);
  assert.equal(result.failedStage, null);
  assert.deepEqual(result.failedCases, []);
  assert.equal(result.nextAttemptInput.retryStrategy, 'none');
  assertOutputShape(result);
});

test('contradictory pass signal with failed cases requires repair', () => {
  const result = decidePhaseLoop({
    phaseNumber: 1,
    attemptNumber: 8,
    stage: 'finish',
    result: 'passed',
    failedCases: [{ class: 'projection_state_inconsistency' }],
  });

  assert.equal(result.decision, PHASE_LOOP_DECISIONS.REPAIR_REQUIRED);
  assert.equal(result.retryRecommended, true);
  assert.equal(result.failedStage, 'finish');
  assertOutputShape(result);
});

test('output is stable and does not mutate frozen input', () => {
  const input = deepFreeze({
    phaseNumber: 1,
    attemptNumber: 9,
    stage: 'verify',
    result: 'failed',
    failedCases: [{ class: 'missing_verification_evidence' }],
    improvementDirectives: ['rerun verifier'],
    evidenceRefs: ['QA_REPORT.md'],
  });

  const before = JSON.stringify(input);
  const first = decidePhaseLoop(input);
  const second = decidePhaseLoop(input);

  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, second);
  assert.match(first.sourceDecisionId, /^phase-loop:[0-9a-f]{8}$/);
});

test('controller source has no fs import and no raw markdown read', () => {
  const source = readFileSync(new URL('./phase-loop-controller.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /from ['"]node:fs['"]/);
  assert.doesNotMatch(source, /from ['"]fs['"]/);
  assert.doesNotMatch(source, /readFile|\.md\b|Markdown/i);
});

function assertOutputShape(result) {
  assert.deepEqual(Object.keys(result), [
    'schemaVersion',
    'decision',
    'phaseNumber',
    'attemptNumber',
    'sourceDecisionId',
    'retryRecommended',
    'failedStage',
    'failedCases',
    'improvementDirectives',
    'evidenceRefs',
    'nextAttemptInput',
  ]);
  assert.equal(result.schemaVersion, 1);
  assert.equal(typeof result.phaseNumber, 'number');
  assert.equal(typeof result.attemptNumber, 'number');
  assert.equal(typeof result.sourceDecisionId, 'string');
  assert.equal(Array.isArray(result.failedCases), true);
  assert.equal(Array.isArray(result.improvementDirectives), true);
  assert.equal(Array.isArray(result.evidenceRefs), true);
  assert.equal(typeof result.nextAttemptInput.retryStrategy, 'string');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return value;
}
