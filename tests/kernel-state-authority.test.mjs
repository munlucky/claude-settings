import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

test('fresh evidence and CLOSE are both required for accepted completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r1', objective: 'x', sourceIdentity: 'src-1' });
  assert.equal(s.assessCompletion('r1').decision, 'blocked');

  s.transition('r1', 'EXECUTE');
  s.transition('r1', 'PROVE');
  s.transition('r1', 'CLOSE');
  s.recordVerification('r1', {
    status: 'passed',
    evidenceRef: 'evidence://test/1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:digest123',
    sourceIdentity: 'src-1',
  });

  const comp = s.assessCompletion('r1');
  assert.equal(comp.decision, 'accepted');
  assert.equal(comp.verification.command, 'npm test');

  // Idempotency check: repeated assessCompletion returns accepted without changing status
  const comp2 = s.assessCompletion('r1');
  assert.equal(comp2.decision, 'accepted');
  assert.equal(comp2.run.status, 'completed');

  s.close();
});

test('exitCode=1 or missing digest or source identity mismatch blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-bad-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-bad', objective: 'bad-eval', sourceIdentity: 'src-valid' });
  s.transition('r-bad', 'EXECUTE');
  s.transition('r-bad', 'PROVE');
  s.transition('r-bad', 'CLOSE');

  // Failed exit code
  s.recordVerification('r-bad', {
    status: 'passed',
    evidenceRef: 'evidence://test/bad',
    command: 'npm test',
    exitCode: 1,
    evidenceDigest: 'sha256:digest',
    sourceIdentity: 'src-valid',
  });
  assert.equal(s.assessCompletion('r-bad').decision, 'blocked');

  s.close();
});

test('missing evidence digest blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-nodigest-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-nodigest', objective: 'nodigest', sourceIdentity: 'src-valid' });
  s.transition('r-nodigest', 'EXECUTE');
  s.transition('r-nodigest', 'PROVE');
  s.transition('r-nodigest', 'CLOSE');

  s.recordVerification('r-nodigest', {
    status: 'passed',
    evidenceRef: 'evidence://test/nodigest',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: null,
    sourceIdentity: 'src-valid',
  });
  assert.equal(s.assessCompletion('r-nodigest').decision, 'blocked');
  s.close();
});

test('source identity mismatch blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-idmismatch-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r-idmismatch', objective: 'idmismatch', sourceIdentity: 'src-expected' });
  s.transition('r-idmismatch', 'EXECUTE');
  s.transition('r-idmismatch', 'PROVE');
  s.transition('r-idmismatch', 'CLOSE');

  s.recordVerification('r-idmismatch', {
    status: 'passed',
    evidenceRef: 'evidence://test/idmismatch',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:digest',
    sourceIdentity: 'src-other',
  });
  assert.equal(s.assessCompletion('r-idmismatch', { expectedSourceIdentity: 'src-expected' }).decision, 'blocked');
  s.close();
});

test('invalid state transitions throw errors', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-trans-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r2', objective: 'y' });
  assert.throws(() => s.transition('r2', 'PROVE'), /Invalid Kernel transition/);
  s.close();
});

test('stale verification post mutation blocks completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-stale-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r3', objective: 'z' });
  s.transition('r3', 'EXECUTE');
  s.transition('r3', 'PROVE');

  s.recordVerification('r3', {
    status: 'passed',
    evidenceRef: 'evidence://test/3',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:d3',
  });

  s.transition('r3', 'SHAPE');
  s.transition('r3', 'EXECUTE');
  s.transition('r3', 'PROVE');
  s.transition('r3', 'CLOSE');

  assert.equal(s.assessCompletion('r3').decision, 'blocked');
  s.close();
});
