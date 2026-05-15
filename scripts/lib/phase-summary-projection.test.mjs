import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUMMARY_PROJECTION_SCHEMA_VERSION,
  parsePhaseSummaryProjection,
  renderPhaseSummaryProjection,
} from './phase-summary-projection.mjs';

function completedInput(overrides = {}) {
  const phases = overrides.phases || Array.from({ length: 8 }, (_, index) => ({
    number: index + 1,
    status: 'completed',
    lastOutcome: 'clean_complete',
  }));
  return {
    statusRoot: {
      projectionSchemaVersion: 'final-outcome-v1',
      finalVerdict: 'complete',
      normalizedRunVerdict: 'success',
      activeExecutionStatus: 'finished',
      activePlannedPhases: 8,
      activeCompletedPhases: 8,
      activeBlockedPhases: 0,
      activePendingPhases: 0,
      activeRemainingPhases: 0,
      activeActionablePhasesRemaining: 0,
      ...(overrides.statusRoot || {}),
    },
    phases,
    workflowStates: overrides.workflowStates || [
      {
        basename: 'current-run.json',
        status: 'completed',
        completionStatus: 'completed',
        finalOutcomeSchemaVersion: '1.0',
        finalVerdict: 'complete',
        normalizedRunVerdict: 'success',
        stopReasonCode: 'scope_complete',
      },
    ],
    repositoryCloseout: overrides.repositoryCloseout || {},
    generatedAt: '2026-05-12T00:00:00.000Z',
    projectionHash: overrides.projectionHash || 'abc123',
  };
}

test('renders schema marker and final complete counts without active failures', () => {
  const summary = renderPhaseSummaryProjection(completedInput());

  assert.match(summary, /summaryProjectionSchemaVersion: "1\.0"/);
  assert.match(summary, /Completed 8/);
  assert.match(summary, /Failed 0/);
  assert.match(summary, /State completed/);
  assert.equal(parsePhaseSummaryProjection(summary).summaryProjectionSchemaVersion, SUMMARY_PROJECTION_SCHEMA_VERSION);
});

test('renders historical warnings without converting them into active failures', () => {
  const summary = renderPhaseSummaryProjection(completedInput({
    statusRoot: {
      normalizedRunVerdict: 'success_with_warning',
      historicalWarnings: ['delegated-terminal-exit-1'],
    },
  }));

  assert.match(summary, /Runtime completed with historical warnings/);
  assert.match(summary, /Completed 8/);
  assert.match(summary, /Failed 0/);
  assert.match(summary, /State completed/);
});

test('keeps repository pending separate from completed runtime state', () => {
  const summary = renderPhaseSummaryProjection(completedInput({
    repositoryCloseout: { state: 'pending' },
  }));

  assert.match(summary, /## Runtime\nCompleted 8\nFailed 0\nState completed/);
  assert.match(summary, /## Repository Closeout\nState pending/);
});
