import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';

test('dynamic obligations block prepare until fulfilled and resume cleanly', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-dyn-ob-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({
    runId: 'dyn-r1',
    objective: 'dynamic obligation test',
    sourceIdentity: 'src-d1',
    requiredObligations: ['sec-audit'],
  });

  store.transition('dyn-r1', 'SHAPE');
  store.transition('dyn-r1', 'EXECUTE');
  store.transition('dyn-r1', 'PROVE');

  const snap1 = await prepareFinalization('dyn-r1', {}, { stateStore: store });
  assert.equal(snap1.status, 'blocked');

  // Record required verification
  store.recordVerification('dyn-r1', {
    obligationId: 'sec-audit',
    status: 'passed',
    evidenceRef: 'ev-sec-1',
    command: 'npm run audit',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'b'.repeat(64),
    sourceIdentity: 'src-d1',
  });

  const snap2 = await prepareFinalization('dyn-r1', {}, { stateStore: store });
  assert.equal(snap2.status, 'ready');

  store.close();
});
