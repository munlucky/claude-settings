import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';

test('MG-03 Atomic Authority Transaction: commits all finalization state atomically', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-mg3-atom-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'atom-mg3-r1', objective: 'atomicity test', sourceIdentity: 'src-mg3-atom', projectId: 'munlucky-moonshot-relay' });
  store.transition('atom-mg3-r1', 'SHAPE');
  store.transition('atom-mg3-r1', 'EXECUTE');
  store.transition('atom-mg3-r1', 'PROVE');

  store.recordVerification('atom-mg3-r1', {
    status: 'passed',
    evidenceRef: 'ev-atom-mg3',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + '3'.repeat(64),
    sourceIdentity: 'src-mg3-atom',
  });

  const snapshot = await prepareFinalization('atom-mg3-r1', {}, { stateStore: store });
  assert.equal(snapshot.status, 'ready');

  const receipt = await commitFinalizationAuthority('atom-mg3-r1', snapshot, {}, { stateStore: store });
  assert.equal(receipt.status, 'committed');
  assert.equal(store.getRun('atom-mg3-r1').status, 'completed');
  assert.equal(store.getRun('atom-mg3-r1').state, 'CLOSE');

  store.close();
});
