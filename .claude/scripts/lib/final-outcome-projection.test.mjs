import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATUS_PROJECTION_SCHEMA_VERSION,
  WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION,
  buildFinalOutcomeProjectionHash,
  canonicalProjectionIssues,
  isCanonicalFinalCompleteProjection,
  isFinalCompleteProjection,
  isUnrecoveredBlockerTerminalState,
  normalizeFinalRunVerdict,
  phaseProjectionCounts,
} from './final-outcome-projection.mjs';

function canonicalInput(overrides = {}) {
  const phases = overrides.phases || [
    { number: 1, status: 'completed', lastOutcome: 'clean_complete' },
  ];
  const workflowStates = overrides.workflowStates || [
    {
      basename: 'current-run.json',
      status: 'completed',
      completionStatus: 'completed',
      finalOutcomeSchemaVersion: WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION,
      finalVerdict: 'complete',
      normalizedRunVerdict: 'success',
      stopReasonCode: 'scope_complete',
    },
  ];
  const statusRoot = {
    projectionSchemaVersion: STATUS_PROJECTION_SCHEMA_VERSION,
    finalVerdict: 'complete',
    normalizedRunVerdict: 'success',
    lastStopReasonCode: 'scope_complete',
    activeExecutionStatus: 'finished',
    activePlannedPhases: 1,
    activeCompletedPhases: 1,
    activeBlockedPhases: 0,
    activePendingPhases: 0,
    activeRemainingPhases: 0,
    activeActionablePhasesRemaining: 0,
    ...(overrides.statusRoot || {}),
  };
  const projectionHash = buildFinalOutcomeProjectionHash({ statusRoot, phases, workflowStates });
  return {
    statusRoot,
    phases,
    workflowStates,
    summary: overrides.summary || {
      finalOutcomeSchemaVersion: '1.0',
      projectionHash,
    },
  };
}

test('legacy complete is final-complete but not canonical no-op', () => {
  const input = canonicalInput({
    statusRoot: {
      projectionSchemaVersion: '',
      normalizedRunVerdict: 'complete',
    },
    summary: {
      finalOutcomeSchemaVersion: '',
      projectionHash: '',
    },
  });

  assert.equal(isFinalCompleteProjection(input), true);
  assert.equal(isCanonicalFinalCompleteProjection(input), false);
  assert.deepEqual(
    canonicalProjectionIssues(input).filter((issue) => ['run_verdict_not_canonical', 'status_projection_schema_stale', 'summary_projection_stale'].includes(issue)).sort(),
    ['run_verdict_not_canonical', 'status_projection_schema_stale', 'summary_projection_stale'],
  );
});

test('canonical final projection requires exact root counters', () => {
  const input = canonicalInput({
    statusRoot: {
      activeCompletedPhases: 0,
    },
  });

  assert.equal(isFinalCompleteProjection(input), true);
  assert.equal(canonicalProjectionIssues(input).includes('phase_counter_projection_mismatch'), true);
});

test('canonical final projection rejects stale summary hash or schema marker', () => {
  const input = canonicalInput({
    summary: {
      finalOutcomeSchemaVersion: '',
      projectionHash: 'stale',
    },
  });

  assert.equal(isCanonicalFinalCompleteProjection(input), false);
  assert.equal(canonicalProjectionIssues(input).includes('summary_projection_stale'), true);
});

test('canonical final projection passes with schema markers, counters, workflow state, and summary hash', () => {
  const input = canonicalInput();

  assert.equal(isFinalCompleteProjection(input), true);
  assert.equal(isCanonicalFinalCompleteProjection(input), true);
});

test('legacy complete normalizes to canonical success verdicts', () => {
  assert.equal(normalizeFinalRunVerdict({ phase: { normalizedRunVerdict: 'complete' } }), 'success');
  assert.equal(normalizeFinalRunVerdict({ phase: { normalizedRunVerdict: 'complete' }, historicalWarnings: ['delegated-terminal-exit-1'] }), 'success_with_warning');
});

test('unrecovered blocker terminal state is terminal but not final-complete', () => {
  const input = canonicalInput({
    statusRoot: {
      finalVerdict: 'blocked',
      completionStatus: 'verification_blocked',
      normalizedRunVerdict: '',
      blockingStopReasonCode: 'node-test-runner-spawn-eperm',
    },
    workflowStates: [
      {
        basename: 'current-run.json',
        status: 'failed',
        completionStatus: 'verification_blocked',
        finalOutcomeSchemaVersion: WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION,
        finalVerdict: 'blocked',
        normalizedRunVerdict: '',
        stopReasonCode: 'node-test-runner-spawn-eperm',
      },
    ],
    summary: {
      finalOutcomeSchemaVersion: '1.0',
      projectionHash: 'not-a-final-complete-hash',
    },
  });

  assert.equal(isUnrecoveredBlockerTerminalState(input.statusRoot), true);
  assert.equal(isFinalCompleteProjection(input), false);
  assert.equal(canonicalProjectionIssues(input).includes('blocker_terminal_not_final_complete'), true);
  assert.equal(canonicalProjectionIssues(input).includes('run_verdict_not_canonical'), false);
});

test('unrecovered blocker raw verdict is not normalized into canonical complete', () => {
  assert.equal(normalizeFinalRunVerdict({ phase: { normalizedRunVerdict: 'blocked' } }), '');
  assert.equal(normalizeFinalRunVerdict({
    phase: {
      completionStatus: 'verification_blocked',
      finalVerdict: 'blocked',
      blockingStopReasonCode: 'node-test-runner-spawn-eperm',
    },
  }), '');
});

test('phase projection counts distinguish blocked phases from actionable remaining work', () => {
  assert.deepEqual(phaseProjectionCounts([
    { number: 1, status: 'completed' },
    { number: 2, status: 'blocked' },
    { number: 3, status: 'pending', planConfirmed: 'false' },
  ]), {
    planned: 2,
    completed: 1,
    blocked: 1,
    pending: 0,
    remaining: 0,
  });
});
