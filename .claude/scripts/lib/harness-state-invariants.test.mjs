import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertNoGeneratedStalePhaseResidue,
  evaluateHarnessStateInvariants,
  assertProjectionHasActiveLog,
  evaluateCloseoutInvariant,
  evaluateSidecarCanonicalInvariant,
  workflowStateClass,
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

test('terminal completion fields take precedence over active status fields', () => {
  const blockedPayload = {
    status: 'active',
    activeExecutionStatus: 'active',
    completionStatus: 'blocked',
    attemptOutcome: 'blocked',
  };
  assert.equal(workflowStateClass(blockedPayload), 'terminal');

  const nestedBlockedPayload = {
    status: 'active',
    phaseRunLease: {
      completionStatus: 'blocked',
    },
  };
  assert.equal(workflowStateClass(nestedBlockedPayload), 'terminal');
});

test('completed phase invariant does not treat terminal blocked payload as running', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-invariants-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), `${JSON.stringify({
      status: 'active',
      activeExecutionStatus: 'active',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      activePhaseNumber: 1,
      activePhaseTitle: 'Phase 01',
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 2 },
      phases: [{ number: 1, title: 'Phase 01', status: 'completed' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.violations.some((entry) => entry.code === 'current-run-running-phase-completed'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sidecar canonical invariant rejects manifest-only state without legacy fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sidecar-invariants-'));
  try {
    const paths = {
      blockerEvidencePath: path.join(root, 'BLOCKER_EVIDENCE.jsonl'),
      attemptLedgerPath: path.join(root, 'ATTEMPT_LEDGER.jsonl'),
      projectionManifestPath: path.join(root, 'projection-manifest.json'),
    };
    assert.equal(evaluateSidecarCanonicalInvariant(paths).ok, true);
    assert.equal(evaluateSidecarCanonicalInvariant(paths).mode, 'legacy_verifier');

    fs.writeFileSync(paths.projectionManifestPath, '{}\n', 'utf8');
    const manifestOnly = evaluateSidecarCanonicalInvariant(paths);
    assert.equal(manifestOnly.ok, false);
    assert.equal(manifestOnly.code, 'manifest_sidecar_missing');

    fs.writeFileSync(paths.blockerEvidencePath, '{}\n', 'utf8');
    const incomplete = evaluateSidecarCanonicalInvariant(paths);
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.code, 'manifest_sidecar_missing');

    fs.writeFileSync(paths.attemptLedgerPath, '{}\n', 'utf8');
    const canonical = evaluateSidecarCanonicalInvariant(paths);
    assert.equal(canonical.ok, true);
    assert.equal(canonical.mode, 'sidecar_canonical');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
