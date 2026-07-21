import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

test('fresh evidence and CLOSE are both required for accepted completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({ runId: 'r1', objective: 'x' });
  assert.equal(s.assessCompletion('r1').decision, 'blocked');

  s.transition('r1', 'EXECUTE');
  s.transition('r1', 'PROVE');
  s.transition('r1', 'CLOSE');
  s.recordVerification('r1', { status: 'passed', evidenceRef: 'evidence://test/1', command: 'npm test', exitCode: 0 });

  const comp = s.assessCompletion('r1');
  assert.equal(comp.decision, 'accepted');
  assert.equal(comp.verification.command, 'npm test');
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

  // Verification recorded at PROVE state
  s.recordVerification('r3', { status: 'passed', evidenceRef: 'evidence://test/3' });

  // Transition to SHAPE post verification (mutation)
  s.transition('r3', 'SHAPE');
  s.transition('r3', 'EXECUTE');
  s.transition('r3', 'PROVE');
  s.transition('r3', 'CLOSE');

  // Assessed without new verification -> must be blocked!
  assert.equal(s.assessCompletion('r3').decision, 'blocked');
  s.close();
});
