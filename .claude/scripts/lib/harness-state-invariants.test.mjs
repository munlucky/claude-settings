import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoGeneratedStalePhaseResidue,
  assertProjectionHasActiveLog,
  evaluateCloseoutInvariant,
} from './harness-state-invariants.mjs';

test('projection invariant rejects final or blocked artifacts without an active log path', () => {
  assert.throws(
    () => assertProjectionHasActiveLog({ finish: { nextPath: 'clean_finish' }, logFile: '' }),
    /active log path/,
  );
  assert.throws(
    () => assertProjectionHasActiveLog({ runtime: { status: 'verification_blocked' }, logFile: '' }),
    /active log path/,
  );
  assert.deepEqual(
    assertProjectionHasActiveLog({ finish: { nextPath: 'retry_loop' }, logFile: '' }),
    { ok: true },
  );
  assert.deepEqual(
    assertProjectionHasActiveLog({ finish: { nextPath: 'clean_finish' }, logFile: '.claude/logs/agent-loop/phase-07.log' }),
    { ok: true },
  );
});

test('generated stale phase residue is rejected without banning free-form phase mentions', () => {
  assert.throws(
    () => assertNoGeneratedStalePhaseResidue({
      activePhaseNumber: 7,
      fields: { reason: 'out_of_scope_for_phase_03' },
    }),
    /stale phase residue/,
  );
  assert.throws(
    () => assertNoGeneratedStalePhaseResidue({
      activePhaseNumber: 7,
      fields: { evidence: ['generated token phase_03'] },
    }),
    /phase_03/,
  );
  assert.deepEqual(
    assertNoGeneratedStalePhaseResidue({
      activePhaseNumber: 7,
      fields: { note: 'Phase 03에서 이관된 항목' },
    }),
    { ok: true, violations: [] },
  );
});

test('closeout invariant covers complete, blocked, failed, superseded, and environment blocker states', () => {
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'completed', normalizedRunVerdict: 'complete' }).ok, true);
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'blocked', normalizedRunVerdict: 'blocked' }).ok, true);
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'failed', normalizedRunVerdict: 'failed' }).ok, true);
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'superseded', normalizedRunVerdict: 'superseded' }).ok, true);

  const environmentBlocked = evaluateCloseoutInvariant({
    phaseStatus: 'verification_blocked',
    normalizedRunVerdict: 'complete_with_environment_blocker',
    environmentBlockers: [{ code: 'verifier_unavailable' }],
  });
  assert.equal(environmentBlocked.ok, true);
  assert.equal(environmentBlocked.completionState, 'blocked_by_environment');

  const fakeClean = evaluateCloseoutInvariant({
    phaseStatus: 'completed',
    normalizedRunVerdict: 'complete_with_environment_blocker',
    environmentBlockers: [{ code: 'verifier_unavailable' }],
  });
  assert.equal(fakeClean.ok, false);
});
