import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
  resolveReconciliationIntentPath,
  scrubCompatibilityProjection,
  validateReconciliationIntent,
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

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeReconciliationFixture(rootDir, overrides = {}) {
  const stateRunId = overrides.stateRunId ?? 'run-reconcile';
  const attemptId = overrides.attemptId ?? 'attempt-01';
  const transactionId = overrides.transactionId ?? 'tx-reconcile';
  const blockerEvidenceId = overrides.blockerEvidenceId ?? 'blocker-reconcile';
  const runRoot = resolveRunRoot(stateRunId, { rootDir });
  const blockerEvidencePath = path.join(runRoot, 'BLOCKER_EVIDENCE.jsonl');
  const projectionManifestPath = path.join(runRoot, 'projection-manifest.json');
  fs.mkdirSync(runRoot, { recursive: true });
  const blockerEvidenceRecords = overrides.blockerEvidenceRecords ?? [{
    id: blockerEvidenceId,
    status: 'resolved',
    transactionId,
    attemptId,
    stateRunId,
  }];
  fs.writeFileSync(
    blockerEvidencePath,
    blockerEvidenceRecords.map((record) => JSON.stringify(record)).join('\n') + '\n',
    'utf8',
  );
  writeJson(projectionManifestPath, {
    transactionId,
    blockerEvidenceIds: [blockerEvidenceId],
  });
  const intent = {
    intent: 'resume_blocked_attempt',
    resumeReason: 'blocker_resolved',
    stateRunId,
    attemptId,
    transactionId,
    blockerEvidenceId,
    projectionManifestSha256: sha256File(projectionManifestPath),
    ...overrides.intentPatch,
  };
  const runsRoot = path.join(rootDir, 'runs');
  const intentPath = overrides.intentPath ?? resolveReconciliationIntentPath(stateRunId, { rootDir, runsRoot });
  writeJson(intentPath, intent);
  return {
    rootDir,
    runsRoot,
    stateRunId,
    attemptId,
    transactionId,
    blockerEvidenceId,
    blockerEvidencePath,
    projectionManifestPath,
    intentPath,
    runRoot,
  };
}

function assertThrowsCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
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
  const result = readState({ rootDir });

  assert.equal(result.exists, false);
  assert.equal(result.startupClassification, 'resume-state-missing');
  assert.equal(classifyStartupState(result), 'resume-state-missing');
});

test('default current board path is workflow-enforcement STATE.md and runRoot is run-scoped', () => {
  const rootDir = tempRoot();
  const stateRunId = 'run-global-board';
  const state = baseState({ rootDir, stateRunId });
  const result = writeState(state, { rootDir, stateRunId });
  const expectedStatePath = path.join(rootDir, '.claude', 'logs', 'workflow-enforcement', 'STATE.md');
  const legacyStatePath = path.join(rootDir, '.claude', 'logs', 'simple-run-state', stateRunId, 'STATE.md');

  assert.equal(result.statePath, expectedStatePath);
  assert.equal(result.state.runRoot, path.join(rootDir, '.claude', 'logs', 'workflow-enforcement', 'runs', stateRunId));
  assert.equal(fs.existsSync(expectedStatePath), true);
  assert.equal(fs.existsSync(legacyStatePath), false);

  const recovered = readState({ rootDir });
  assert.equal(recovered.exists, true);
  assert.equal(recovered.state.stateRunId, stateRunId);
  assert.equal(recovered.statePath, expectedStatePath);
});

test('transition rules reject unsafe terminal and same-attempt blocked restarts', () => {
  assert.throws(
    () => assertCanTransition(baseState({ status: 'complete' }), baseState({ status: 'active', attempt: 'attempt-02' })),
    /complete -> active/,
  );
  assert.throws(
    () => assertCanTransition(baseState({ status: 'blocked', attempt: 'attempt-01' }), baseState({ status: 'active', attempt: 'attempt-01' })),
    /reconciliation intent/,
  );
  assert.equal(
    assertCanTransition(baseState({ status: 'blocked', attempt: 'attempt-01' }), baseState({ status: 'active', attempt: 'attempt-02' })),
    true,
  );
  assert.equal(
    assertCanTransition(baseState({ status: 'active' }), baseState({ status: 'paused' })),
    true,
  );
});

test('same-attempt blocked restart accepts matching run-scoped reconciliation intent', () => {
  const rootDir = tempRoot();
  const fixture = writeReconciliationFixture(rootDir);

  assert.equal(
    assertCanTransition(
      baseState({ rootDir, stateRunId: fixture.stateRunId, runRoot: fixture.runRoot, status: 'blocked', attempt: 'attempt-01' }),
      baseState({ rootDir, stateRunId: fixture.stateRunId, runRoot: fixture.runRoot, status: 'active', attempt: 'attempt-01' }),
      { reconciliationIntentOptions: fixture },
    ),
    true,
  );
});

test('reconciliation intent requires attempt context in options and intent payload', () => {
  const rootDir = tempRoot();
  const fixture = writeReconciliationFixture(rootDir);
  const { attemptId: _attemptId, ...missingAttemptOptions } = fixture;
  assertThrowsCode(
    () => validateReconciliationIntent(missingAttemptOptions),
    'reconciliation_intent_attemptId_mismatch',
  );

  const missingIntentAttempt = writeReconciliationFixture(tempRoot(), {
    intentPatch: { attemptId: '' },
  });
  assertThrowsCode(
    () => validateReconciliationIntent(missingIntentAttempt),
    'reconciliation_intent_attemptId_mismatch',
  );
});

test('reconciliation intent requires explicit intent type and resume reason', () => {
  const wrongIntent = writeReconciliationFixture(tempRoot(), {
    intentPatch: { intent: 'resume' },
  });
  assertThrowsCode(
    () => validateReconciliationIntent(wrongIntent),
    'reconciliation_intent_type_mismatch',
  );

  const wrongResumeReason = writeReconciliationFixture(tempRoot(), {
    intentPatch: { resumeReason: 'operator_override' },
  });
  assertThrowsCode(
    () => validateReconciliationIntent(wrongResumeReason),
    'reconciliation_intent_resume_reason_mismatch',
  );
});

test('open-only blocker evidence rejects same-attempt reconciliation', () => {
  const rootDir = tempRoot();
  const fixture = writeReconciliationFixture(rootDir, {
    blockerEvidenceRecords: [{
      id: 'blocker-reconcile',
      status: 'open',
      transactionId: 'tx-reconcile',
      attemptId: 'attempt-01',
      stateRunId: 'run-reconcile',
    }],
  });

  assertThrowsCode(
    () => validateReconciliationIntent(fixture),
    'reconciliation_intent_blocker_not_resolved',
  );
});

test('missing blocker evidence rejects same-attempt reconciliation', () => {
  const fixture = writeReconciliationFixture(tempRoot(), {
    blockerEvidenceRecords: [],
  });

  assertThrowsCode(
    () => validateReconciliationIntent(fixture),
    'reconciliation_intent_blocker_evidence_missing',
  );
});

test('multiple blocker records pass only when one resolved record matches the full context', () => {
  const fixture = writeReconciliationFixture(tempRoot(), {
    blockerEvidenceRecords: [
      {
        id: 'blocker-reconcile',
        status: 'open',
        transactionId: 'tx-reconcile',
        attemptId: 'attempt-01',
        stateRunId: 'run-reconcile',
      },
      {
        id: 'blocker-reconcile',
        status: 'resolved',
        transactionId: 'wrong-tx',
        attemptId: 'attempt-01',
        stateRunId: 'run-reconcile',
      },
      {
        id: 'blocker-reconcile',
        status: 'resolved',
        transactionId: 'tx-reconcile',
        attemptId: 'attempt-01',
        stateRunId: 'run-reconcile',
      },
    ],
  });

  assert.equal(validateReconciliationIntent(fixture).ok, true);
});

test('resolved blocker evidence mismatch codes follow transaction, attempt, then stateRun priority', () => {
  const wrongTransaction = writeReconciliationFixture(tempRoot(), {
    blockerEvidenceRecords: [{
      id: 'blocker-reconcile',
      status: 'resolved',
      transactionId: 'wrong-tx',
      attemptId: 'attempt-01',
      stateRunId: 'run-reconcile',
    }],
  });
  assertThrowsCode(
    () => validateReconciliationIntent(wrongTransaction),
    'reconciliation_intent_blocker_transaction_mismatch',
  );

  const wrongAttempt = writeReconciliationFixture(tempRoot(), {
    blockerEvidenceRecords: [{
      id: 'blocker-reconcile',
      status: 'resolved',
      transactionId: 'tx-reconcile',
      attemptId: 'attempt-02',
      stateRunId: 'run-reconcile',
    }],
  });
  assertThrowsCode(
    () => validateReconciliationIntent(wrongAttempt),
    'reconciliation_intent_blocker_attempt_mismatch',
  );

  const wrongStateRun = writeReconciliationFixture(tempRoot(), {
    blockerEvidenceRecords: [{
      id: 'blocker-reconcile',
      status: 'resolved',
      transactionId: 'tx-reconcile',
      attemptId: 'attempt-01',
      stateRunId: 'other-run',
    }],
  });
  assertThrowsCode(
    () => validateReconciliationIntent(wrongStateRun),
    'reconciliation_intent_blocker_state_run_mismatch',
  );
});

test('wrong intent attemptId rejects with stable mismatch code', () => {
  const fixture = writeReconciliationFixture(tempRoot(), {
    intentPatch: { attemptId: 'attempt-02' },
  });

  assertThrowsCode(
    () => validateReconciliationIntent(fixture),
    'reconciliation_intent_attemptId_mismatch',
  );
});

test('reconciliation intent rejects identity and manifest mismatches', () => {
  const rootDir = tempRoot();
  const mismatch = writeReconciliationFixture(rootDir, {
    intentPatch: { transactionId: 'wrong-tx' },
  });

  assert.throws(
    () => validateReconciliationIntent(mismatch),
    /transactionId mismatch/,
  );

  const manifestMismatch = writeReconciliationFixture(tempRoot(), {
    intentPatch: { projectionManifestSha256: '0'.repeat(64) },
  });
  assert.throws(
    () => validateReconciliationIntent(manifestMismatch),
    /projectionManifestSha256 mismatch/,
  );

  const blockerMismatch = writeReconciliationFixture(tempRoot(), {
    intentPatch: { blockerEvidenceId: 'wrong-blocker' },
  });
  assert.throws(
    () => validateReconciliationIntent(blockerMismatch),
    /blockerEvidenceId mismatch/,
  );
});

test('global reconciliation intent alias requires matching stateRunId', () => {
  const rootDir = tempRoot();
  const globalIntentPath = path.join(rootDir, 'reconciliation-intent.json');
  const fixture = writeReconciliationFixture(rootDir, {
    intentPath: globalIntentPath,
  });
  fs.rmSync(resolveReconciliationIntentPath(fixture.stateRunId, { rootDir, runsRoot: fixture.runsRoot }), { force: true });

  const { intentPath: _ignoredIntentPath, ...globalFixture } = fixture;
  const result = validateReconciliationIntent({ ...globalFixture, globalIntentPath });
  assert.equal(result.source, 'global_alias');

  const mismatchRoot = tempRoot();
  const mismatchGlobalPath = path.join(mismatchRoot, 'reconciliation-intent.json');
  const mismatch = writeReconciliationFixture(mismatchRoot, {
    intentPath: mismatchGlobalPath,
    intentPatch: { stateRunId: 'other-run' },
  });
  fs.rmSync(resolveReconciliationIntentPath(mismatch.stateRunId, { rootDir: mismatchRoot, runsRoot: mismatch.runsRoot }), { force: true });
  const { intentPath: _ignoredMismatchIntentPath, ...mismatchFixture } = mismatch;
  assert.throws(
    () => validateReconciliationIntent({ ...mismatchFixture, globalIntentPath: mismatchGlobalPath }),
    /stateRunId mismatch/,
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
      fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
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

test('paused state is supported and classified as requiring explicit resume', () => {
  const rootDir = tempRoot();
  const stateRunId = 'run-paused';
  const runRoot = resolveRunRoot(stateRunId, { rootDir });

  writeState(baseState({ rootDir, stateRunId, runRoot, status: 'paused', reason: 'operator_pause' }), { rootDir, stateRunId, runRoot });
  const recovered = readState({ rootDir });

  assert.equal(recovered.state.status, 'paused');
  assert.equal(recovered.startupClassification, 'resume-required');
});

test('scrubCompatibilityProjection keeps paused projections non-running', () => {
  const paused = scrubCompatibilityProjection(
    { activeExecutionStatus: 'running', childAlive: true, liveness: { childAlive: true } },
    baseState({ status: 'paused', reason: 'operator_pause' }),
    { targetKind: 'current-run' },
  );

  assert.equal(paused.activeExecutionStatus, 'paused');
  assert.equal(paused.completionStatus, 'paused');
  assert.equal(paused.attemptOutcome, 'paused');
  assert.equal(paused.childAlive, false);
  assert.equal(paused.liveness.childAlive, false);
});

test('scrubCompatibilityProjection applies blocked, active, and complete field rules', () => {
  const blocked = scrubCompatibilityProjection(
    { stale: true },
    baseState({ status: 'blocked', reason: 'verification_failed' }),
    { targetKind: 'current-run' },
  );
  assert.equal(blocked.activeExecutionStatus, 'blocked');
  assert.equal(blocked.stopReasonCode, 'verification_failed');
  assert.equal(blocked.childAlive, false);

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
  assert.equal(complete.completionStatus, 'completed');
  assert.equal(complete.childAlive, false);
  assert.equal(complete.finalVerdict, 'complete');
  assert.equal(complete.stopReasonCode, 'old');
});

test('scrubCompatibilityProjection canonicalizes current and active phase terminal vocabulary', () => {
  const currentRunComplete = scrubCompatibilityProjection(
    {
      status: 'completed',
      activeExecutionStatus: 'failed',
      attemptOutcome: 'in_progress',
      childAlive: true,
      liveness: { childAlive: true },
      finalVerdict: 'failed',
    },
    baseState({ status: 'completed' }),
    { targetKind: 'current-run' },
  );
  assert.equal(currentRunComplete.status, 'completed');
  assert.equal(currentRunComplete.completionStatus, 'completed');
  assert.equal(currentRunComplete.attemptOutcome, 'completed');
  assert.equal(currentRunComplete.activeExecutionStatus, undefined);
  assert.equal(currentRunComplete.childAlive, false);
  assert.equal(currentRunComplete.liveness.childAlive, false);
  assert.equal(currentRunComplete.finalVerdict, 'complete');

  const activePhaseComplete = scrubCompatibilityProjection(
    { status: 'completed', activeExecutionStatus: 'running', attemptOutcome: 'in_progress', childAlive: true },
    baseState({ status: 'completed' }),
    { targetKind: 'active-phase-run' },
  );
  assert.equal(activePhaseComplete.status, 'finished');
  assert.equal(activePhaseComplete.completionStatus, 'completed');
  assert.equal(activePhaseComplete.attemptOutcome, 'completed');
  assert.equal(activePhaseComplete.activeExecutionStatus, undefined);
  assert.equal(activePhaseComplete.childAlive, false);

  const failed = scrubCompatibilityProjection(
    { status: 'failed', completionStatus: 'failed', finalVerdict: 'complete', childAlive: true },
    baseState({ status: 'failed' }),
    { targetKind: 'current-run' },
  );
  assert.equal(failed.status, 'failed');
  assert.equal(failed.completionStatus, 'failed');
  assert.equal(failed.attemptOutcome, 'failed');
  assert.equal(failed.finalVerdict, 'failed');
  assert.equal(failed.childAlive, false);
});
