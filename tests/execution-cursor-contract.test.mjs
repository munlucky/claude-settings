import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

import { advanceExecutionCursor, checkExecutionStep, diagnoseExecutionCursor, nextExecutionSlice, normalizeSlices, resolveExecutionCursor } from '../scripts/lib/execution-cursor.mjs';
import { buildRuntimeStatusReadModel, initRuntimeState, migrateRuntimeStateV2, rehearseRuntimeStateRestore } from '../scripts/lib/runtime-state-store.mjs';

const identity = { branch: 'fixture', worktree: 'cursor' };
const base = (extra = {}) => ({ runId: 'run-cursor', goalId: 'goal-cursor', workspaceId: 'workspace-cursor', identity, ...extra });
const withTempDb = async (work) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonshot-cursor-'));
  const previous = process.env.PHASE_RUNTIME_DB;
  process.env.PHASE_RUNTIME_DB = path.join(root, 'runtime-state.sqlite');
  try {
    await initRuntimeState();
    await migrateRuntimeStateV2({ confirmTempDb: true });
    await work(root);
  } finally {
    if (previous === undefined) delete process.env.PHASE_RUNTIME_DB;
    else process.env.PHASE_RUNTIME_DB = previous;
  }
};

test('legacy phase resolves to one synthetic slice and resumes deterministically', async () => withTempDb(async () => {
  const resolved = await resolveExecutionCursor(base({ planId: 'plan-1', phaseId: 'P03', objective: 'legacy objective', ownedPaths: ['scripts/**'], evidenceCommand: 'node --test', evidencePath: 'runtime/eval/p03.json' }));
  assert.equal(resolved.currentSlice.synthetic, true);
  const resumed = await nextExecutionSlice(base());
  assert.equal(resumed.currentSlice.sliceId, 'P03:synthetic');
  assert.equal(resumed.cursorRevision, 0);
  const resolvedAgain = await resolveExecutionCursor(base({ planId: 'plan-1', phaseId: 'P03' }));
  assert.equal(resolvedAgain.status, 'resumed');
  assert.equal(resolvedAgain.currentSlice.sliceId, 'P03:synthetic');
}));

test('advance is an evidence CAS, rejects stale evidence, and is idempotent', async () => withTempDb(async () => {
  await resolveExecutionCursor(base({ planId: 'plan-1', phaseId: 'P03', slices: [
    { id: 'S1', objective: 'one', ownedPaths: ['scripts/a.mjs'], requiredReads: [], procedure: 'tdd', evidence: { command: 'node --test a', passSignal: { exitCode: 0 }, path: 'a.json' } },
    { id: 'S2', objective: 'two', ownedPaths: ['scripts/b.mjs'], requiredReads: [], procedure: 'tdd', evidence: { command: 'node --test b', passSignal: { exitCode: 0 }, path: 'b.json' } },
  ] }));
  const current = await nextExecutionSlice(base());
  const stale = await advanceExecutionCursor(base({ expectedCursorRevision: 0, evidence: { sliceId: 'S1', sliceDigest: current.currentSlice.sliceDigest, fresh: false, passed: true, command: 'node --test a', path: 'a.json', result: { exitCode: 0 } } }));
  assert.equal(stale.reason, 'stale_evidence');
  const evidence = { sliceId: 'S1', sliceDigest: current.currentSlice.sliceDigest, fresh: true, passed: true, command: 'node --test a', path: 'a.json', result: { exitCode: 0 } };
  const advanced = await advanceExecutionCursor(base({ expectedCursorRevision: 0, evidence }));
  assert.equal(advanced.currentSlice.sliceId, 'S2');
  const duplicate = await advanceExecutionCursor(base({ expectedCursorRevision: 0, evidence }));
  assert.equal(duplicate.status, 'already_advanced');
  assert.equal((await checkExecutionStep(base({ expectedCursorRevision: 0, evidence }))).reason, 'cursor_revision_mismatch');
  const replay = await advanceExecutionCursor(base({ expectedCursorRevision: 1, evidence }));
  assert.equal(replay.reason, 'evidence_slice_mismatch');
}));

test('identity mismatch cannot inspect or mutate another cursor', async () => withTempDb(async () => {
  await resolveExecutionCursor(base({ planId: 'plan-1', phaseId: 'P03', evidenceCommand: 'node --test identity', evidencePath: 'identity.json' }));
  await assert.rejects(() => nextExecutionSlice(base({ workspaceId: 'other' })), /identity mismatch/);
  await assert.rejects(() => diagnoseExecutionCursor(base({ expectedCursorRevision: 0, identity: { branch: 'other' } })), /identity mismatch/);
}));

test('v2 migration is identified, idempotent, backed up, and restorable separately', async () => withTempDb(async (root) => {
  const first = await initRuntimeState();
  assert.equal(first.schemaVersion, 2);
  assert.deepEqual(first.migrations.map((row) => row.version), [1, 2]);
  const snapshotPath = `${process.env.PHASE_RUNTIME_DB}.pre-v2.snapshot`;
  assert.ok((await readFile(snapshotPath)).length > 0);
  assert.deepEqual((await initRuntimeState()).migrations, first.migrations);
  const restored = await rehearseRuntimeStateRestore({ snapshotPath, restorePath: path.join(root, 'restored-v1.sqlite') });
  assert.equal(restored.integrity, 'ok');
  assert.equal(restored.v1ReadModel, 'open');
}));

test('legacy synthetic slice requires an executable evidence contract and can complete', async () => withTempDb(async () => {
  await assert.rejects(() => resolveExecutionCursor(base({ planId: 'bad', phaseId: 'P03' })), /requires evidenceCommand/);
  const resolved = await resolveExecutionCursor(base({ planId: 'good', phaseId: 'P03', evidenceCommand: 'node --test legacy', evidencePath: 'legacy.json' }));
  const evidence = { sliceId: resolved.currentSlice.sliceId, sliceDigest: resolved.currentSlice.sliceDigest, fresh: true, passed: true, command: 'node --test legacy', path: 'legacy.json', result: { exitCode: 0 } };
  const complete = await advanceExecutionCursor(base({ expectedCursorRevision: 0, evidence }));
  assert.equal(complete.status, 'complete');
  assert.equal((await checkExecutionStep(base({ expectedCursorRevision: 1, evidence }))).reason, 'cursor_complete');
  assert.equal((await diagnoseExecutionCursor(base({ expectedCursorRevision: 1, failureClass: 'late' }))).reason, 'cursor_complete');
  assert.equal((await advanceExecutionCursor(base({ expectedCursorRevision: 1, evidence }))).reason, 'cursor_complete');
}));

test('normalizer uses only the supplied current phase slice set', () => {
  const slices = normalizeSlices({ phaseId: 'P03', slices: [{ id: 'S1', objective: 'current', ownedPaths: [], procedure: 'run', evidence: { command: 'x', path: 'x', passSignal: {} } }] });
  assert.equal(slices.length, 1);
  assert.equal(JSON.stringify(slices).includes('future phase'), false);
});

test('ordinary v1 status initialization does not auto-migrate and explicit migration requires confirmation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonshot-cursor-v1-'));
  const previous = process.env.PHASE_RUNTIME_DB;
  process.env.PHASE_RUNTIME_DB = path.join(root, 'runtime-state.sqlite');
  try {
    const v1 = await initRuntimeState();
    assert.equal(v1.schemaVersion, 1);
    assert.deepEqual(v1.migrations.map((row) => row.version), [1]);
    await assert.rejects(() => migrateRuntimeStateV2(), /restricted to explicitly confirmed temporary databases/);
    await assert.rejects(() => resolveExecutionCursor(base({ planId: 'plan', phaseId: 'P03', evidenceCommand: 'x', evidencePath: 'x.json' })), /migration required/);
    const afterRead = await initRuntimeState();
    assert.deepEqual(afterRead.migrations.map((row) => row.version), [1]);
    const status = await buildRuntimeStatusReadModel();
    assert.equal(status.runtimeCapabilityStatus.schemaVersion, 1);
    const db = new Database(process.env.PHASE_RUNTIME_DB, { readonly: true });
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='execution_cursors'").get(), undefined);
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version), [1]);
    db.close();
  } finally {
    if (previous === undefined) delete process.env.PHASE_RUNTIME_DB;
    else process.env.PHASE_RUNTIME_DB = previous;
  }
});

test('explicit migrate-v2 rejects a confirmed database outside the real temp root', async () => {
  const previous = process.env.PHASE_RUNTIME_DB;
  const root = await mkdtemp(path.join(process.cwd(), '.cursor-non-temp-'));
  process.env.PHASE_RUNTIME_DB = path.join(root, 'runtime.sqlite');
  try {
    await initRuntimeState();
    await assert.rejects(() => migrateRuntimeStateV2({ confirmTempDb: true }), /rejects non-temporary/);
    const db = new Database(process.env.PHASE_RUNTIME_DB, { readonly: true });
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version), [1]);
    db.close();
  } finally {
    if (previous === undefined) delete process.env.PHASE_RUNTIME_DB;
    else process.env.PHASE_RUNTIME_DB = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('v2 migration fails closed for active leases and partial migration state', async () => {
  const previous = process.env.PHASE_RUNTIME_DB;
  const activeRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-cursor-active-'));
  process.env.PHASE_RUNTIME_DB = path.join(activeRoot, 'runtime.sqlite');
  try {
    await initRuntimeState();
    const active = new Database(process.env.PHASE_RUNTIME_DB);
    active.prepare("INSERT INTO runs(run_id, status, lease_expires_at) VALUES ('active', 'running', '2999-01-01T00:00:00.000Z')").run();
    active.close();
    await assert.rejects(() => migrateRuntimeStateV2({ confirmTempDb: true }), /requires quiescence/);

    const partialRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-cursor-partial-'));
    process.env.PHASE_RUNTIME_DB = path.join(partialRoot, 'runtime.sqlite');
    await initRuntimeState();
    const partial = new Database(process.env.PHASE_RUNTIME_DB);
    partial.exec('CREATE TABLE execution_cursors(dummy TEXT)');
    partial.close();
    await assert.rejects(() => migrateRuntimeStateV2({ confirmTempDb: true }), /without v2 migration authority/);
  } finally {
    if (previous === undefined) delete process.env.PHASE_RUNTIME_DB;
    else process.env.PHASE_RUNTIME_DB = previous;
  }
});
