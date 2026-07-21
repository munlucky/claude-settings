import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

const validDigest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('natural PROVE -> verification -> CLOSE workflow results in accepted completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r1', objective: 'x', sourceIdentity: 'src-1' });
  s.transition('r1', 'SHAPE');
  s.transition('r1', 'EXECUTE');
  s.transition('r1', 'PROVE');

  // Verification recorded during PROVE stage
  s.recordVerification('r1', {
    status: 'passed',
    evidenceRef: 'evidence://test/1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-1',
  });

  // Transition to CLOSE after verification
  s.transition('r1', 'CLOSE');

  const comp = s.assessCompletion('r1', { expectedSourceIdentity: 'src-1' });
  assert.equal(comp.decision, 'accepted');
  assert.equal(comp.run.status, 'completed');
  assert.equal(comp.verification.command, 'npm test');

  // Idempotency check: repeated assessCompletion returns accepted
  const comp2 = s.assessCompletion('r1', { expectedSourceIdentity: 'src-1' });
  assert.equal(comp2.decision, 'accepted');
  assert.equal(comp2.run.status, 'completed');

  s.close();
});

test('state transition optimistic concurrency control prevents stale revision update', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-occ-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-occ', objective: 'occ', sourceIdentity: 'src-1' });
  s.transition('r-occ', 'SHAPE');

  // Stale revision transition attempt
  assert.throws(
    () => s.transition('r-occ', 'EXECUTE', { expectedRevision: 0 }),
    /STALE_RUN_REVISION/
  );

  // Stale state transition attempt
  assert.throws(
    () => s.transition('r-occ', 'EXECUTE', { expectedState: 'FRAME' }),
    /STATE_CONFLICT/
  );

  s.close();
});

test('createRun requires valid sourceIdentity', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-nosrc-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  assert.throws(() => s.createRun({ runId: 'r-nosrc', objective: 'test' }), /sourceIdentity is required/);
  assert.throws(() => s.createRun({ runId: 'r-badsrc', objective: 'test', sourceIdentity: 'invalid identity space!' }), /sourceIdentity is required/);
  s.close();
});

test('invalid digest format blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-baddigest-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-baddigest', objective: 'baddigest', sourceIdentity: 'src-valid' });
  s.transition('r-baddigest', 'EXECUTE');
  s.transition('r-baddigest', 'PROVE');

  s.recordVerification('r-baddigest', {
    status: 'passed',
    evidenceRef: 'evidence://test/bad',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'invalid-digest-format',
    sourceIdentity: 'src-valid',
  });

  s.transition('r-baddigest', 'CLOSE');
  assert.equal(s.assessCompletion('r-baddigest').decision, 'blocked');
  s.close();
});

test('exitCode=1 or source identity mismatch blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-bad-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-bad', objective: 'bad-eval', sourceIdentity: 'src-valid' });
  s.transition('r-bad', 'EXECUTE');
  s.transition('r-bad', 'PROVE');

  s.recordVerification('r-bad', {
    status: 'passed',
    evidenceRef: 'evidence://test/bad',
    command: 'npm test',
    exitCode: 1,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-valid',
  });

  s.transition('r-bad', 'CLOSE');
  assert.equal(s.assessCompletion('r-bad').decision, 'blocked');
  s.close();
});

test('source identity mismatch blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-idmismatch-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-idmismatch', objective: 'idmismatch', sourceIdentity: 'src-expected' });
  s.transition('r-idmismatch', 'EXECUTE');
  s.transition('r-idmismatch', 'PROVE');

  s.recordVerification('r-idmismatch', {
    status: 'passed',
    evidenceRef: 'evidence://test/idmismatch',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-other',
  });

  s.transition('r-idmismatch', 'CLOSE');
  assert.equal(s.assessCompletion('r-idmismatch', { expectedSourceIdentity: 'src-expected' }).decision, 'blocked');
  s.close();
});

test('invalid state transitions throw errors', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-trans-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r2', objective: 'y', sourceIdentity: 'src-1' });
  assert.throws(() => s.transition('r2', 'PROVE'), /Invalid Kernel transition/);
  s.close();
});
