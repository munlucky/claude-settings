import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCanTransition,
  classifyStartupState,
  formatStateMarkdown,
  parseStateMarkdown,
  readState,
  resolveRunRoot,
  scrubCompatibilityProjection,
  withStateTransition,
  writeState,
} from './simple-run-state.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'simple-run-state-'));
}

function baseState(overrides = {}) {
  const rootDir = overrides.rootDir ?? tempRoot();
  const stateRunId = overrides.stateRunId ?? 'run-01';
  const runRoot = overrides.runRoot ?? resolveRunRoot(stateRunId, { rootDir });
  return {
    stateRunId,
    transitionId: overrides.transitionId ?? 'transition-01',
    projectionStatus: overrides.projectionStatus ?? 'committed',
    planDir: overrides.planDir ?? 'docs/implementation/example',
    statusFile: overrides.statusFile ?? '.claude/docs/phase-status.yaml',
    status: overrides.status ?? 'active',
    phase: overrides.phase ?? '1',
    attempt: overrides.attempt ?? 'attempt-01',
    owner: overrides.owner ?? 'codex',
    reason: overrides.reason ?? 'phase-started',
    runRoot,
    updated: overrides.updated ?? '2026-05-14T00:00:00Z',
  };
}

test('STATE.md headers round-trip deterministically', () => {
  const state = baseState();
  const text = formatStateMarkdown(state);
  const parsed = parseStateMarkdown(text);

  assert.deepEqual(parsed.diagnostics, []);
  for (const field of [
    'stateRunId',
    'transitionId',
    'projectionStatus',
    'planDir',
    'statusFile',
    'status',
    'phase',
    'attempt',
    'owner',
    'reason',
    'runRoot',
    'updated',
  ]) {
    assert.equal(parsed.state[field], state[field], field);
  }
});

test('missing required headers are explicit diagnostics with unknown values', () => {
  const parsed = parseStateMarkdown('status: active\nphase: 1\n');

  assert.equal(parsed.state.stateRunId, 'unknown');
  assert.equal(parsed.state.status, 'active');
  assert.ok(parsed.diagnostics.some((item) => item.type === 'missing_required_header' && item.header === 'stateRunId'));
});

test('readState reports missing state as resume-state-missing', () => {
  const rootDir = tempRoot();
  const result = readState({ stateRunId: 'missing-run', rootDir });

  assert.equal(result.exists, false);
  assert.equal(result.startupClassification, 'resume-state-missing');
  assert.equal(classifyStartupState(result), 'resume-state-missing');
});

test('transition rules reject unsafe terminal and same-attempt blocked restarts', () => {
  assert.throws(
    () => assertCanTransition(baseState({ status: 'complete' }), baseState({ status: 'active', attempt: 'attempt-02' })),
    /complete -> active/,
  );
  assert.throws(
    () => assertCanTransition(baseState({ status: 'blocked', attempt: 'attempt-01' }), baseState({ status: 'active', attempt: 'attempt-01' })),
    /blocked -> active requires/,
  );
  assert.equal(
    assertCanTransition(baseState({ status: 'blocked', attempt: 'attempt-01' }), baseState({ status: 'active', attempt: 'attempt-02' })),
    true,
  );
});

test('withStateTransition leaves pending state after projection failure and recovery detects incomplete_transaction', async () => {
  const rootDir = tempRoot();
  const stateRunId = 'run-pending';
  const runRoot = resolveRunRoot(stateRunId, { rootDir });

  await assert.rejects(
    () => withStateTransition(
      baseState({ rootDir, stateRunId, runRoot, status: 'active', attempt: 'attempt-01', transitionId: 'transition-pending' }),
      { rootDir, stateRunId, runRoot },
      async () => {
        throw new Error('projection failed');
      },
    ),
    /projection failed/,
  );

  const recovered = readState({ rootDir, stateRunId, runRoot });
  assert.equal(recovered.exists, true);
  assert.equal(recovered.state.transitionId, 'transition-pending');
  assert.equal(recovered.state.projectionStatus, 'pending');
  assert.equal(recovered.startupClassification, 'incomplete_transaction');
});

test('withStateTransition commits the same transition id after successful projection write', async () => {
  const rootDir = tempRoot();
  const stateRunId = 'run-commit';
  const runRoot = resolveRunRoot(stateRunId, { rootDir });
  const projectionPath = path.join(runRoot, 'projection.json');

  const result = await withStateTransition(
    baseState({ rootDir, stateRunId, runRoot, status: 'active', attempt: 'attempt-01', transitionId: 'transition-commit' }),
    { rootDir, stateRunId, runRoot },
    async (pendingState) => {
      fs.writeFileSync(projectionPath, JSON.stringify({ transitionId: pendingState.transitionId }), 'utf8');
      return { projectionPath };
    },
  );

  const recovered = readState({ rootDir, stateRunId, runRoot });
  assert.equal(result.transitionId, 'transition-commit');
  assert.equal(recovered.state.transitionId, 'transition-commit');
  assert.equal(recovered.state.projectionStatus, 'committed');
  assert.equal(recovered.startupClassification, 'resume-required');
  assert.deepEqual(JSON.parse(fs.readFileSync(projectionPath, 'utf8')), { transitionId: 'transition-commit' });
});

test('writeState persists blocked state and startup requires resume', () => {
  const rootDir = tempRoot();
  const stateRunId = 'run-blocked';
  const runRoot = resolveRunRoot(stateRunId, { rootDir });

  writeState(baseState({ rootDir, stateRunId, runRoot, status: 'blocked', reason: 'blocked-for-review' }), { rootDir, stateRunId, runRoot });
  const recovered = readState({ rootDir, stateRunId, runRoot });

  assert.equal(recovered.state.status, 'blocked');
  assert.equal(recovered.startupClassification, 'resume-required');
});

test('scrubCompatibilityProjection applies blocked, active, and complete field rules', () => {
  const blocked = scrubCompatibilityProjection(
    { stale: true },
    baseState({ status: 'blocked', reason: 'verification_failed' }),
    { targetKind: 'current-run' },
  );
  assert.equal(blocked.activeExecutionStatus, 'blocked');
  assert.equal(blocked.stopReasonCode, 'verification_failed');

  const active = scrubCompatibilityProjection(
    { stopReasonCode: 'old', blockedAt: 'old', finalVerdict: 'blocked' },
    baseState({ status: 'active' }),
    { targetKind: 'active-phase-run' },
  );
  assert.equal(active.activeExecutionStatus, 'active');
  assert.equal(active.stopReasonCode, undefined);
  assert.equal(active.finalVerdict, undefined);

  const complete = scrubCompatibilityProjection(
    { activeExecutionStatus: 'active', dispatchStage: 'execute', stopReasonCode: 'old' },
    baseState({ status: 'complete' }),
    { targetKind: 'latest-dispatch' },
  );
  assert.equal(complete.activeExecutionStatus, undefined);
  assert.equal(complete.dispatchStage, undefined);
  assert.equal(complete.finalVerdict, 'complete');
  assert.equal(complete.stopReasonCode, 'old');
});
