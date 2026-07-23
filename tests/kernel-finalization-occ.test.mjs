import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';

test('MG-03 OCC: two independent SQLite store handles on same file ensure exactly one commit succeeds', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-mg3-occ-'));
  const runtimeHome = path.join(tmpRoot, 'kernel');
  const relayHome = path.join(tmpRoot, 'relay');

  const store1 = await openKernelStateStore({ runtimeHome, relayHome });
  const store2 = await openKernelStateStore({ runtimeHome, relayHome });

  store1.createRun({ runId: 'occ-mg3-r1', objective: 'OCC independent handles test', sourceIdentity: 'src-occ-mg3', projectId: 'munlucky-moonshot-relay' });
  store1.transition('occ-mg3-r1', 'SHAPE');
  store1.transition('occ-mg3-r1', 'EXECUTE');
  store1.transition('occ-mg3-r1', 'PROVE');

  store1.recordVerification('occ-mg3-r1', {
    status: 'passed',
    evidenceRef: 'ev-occ-mg3',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + '4'.repeat(64),
    sourceIdentity: 'src-occ-mg3',
  });

  const snap1 = await prepareFinalization('occ-mg3-r1', {}, { stateStore: store1 });

  const results = await Promise.allSettled([
    commitFinalizationAuthority('occ-mg3-r1', snap1, {}, { stateStore: store1 }),
    commitFinalizationAuthority('occ-mg3-r1', snap1, {}, { stateStore: store2 }),
  ]);

  const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = results.filter((r) => r.status === 'rejected').length;

  assert.equal(fulfilledCount, 1);
  assert.equal(rejectedCount, 1);
  assert.equal(store1.getRun('occ-mg3-r1').status, 'completed');

  store1.close();
  store2.close();
});
