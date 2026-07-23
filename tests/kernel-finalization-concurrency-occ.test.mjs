import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';

test('multi-connection OCC prevents duplicate finalization on completed run', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-occ-test-'));
  const store1 = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store1.createRun({ runId: 'occ-r1', objective: 'OCC test', sourceIdentity: 'src-occ1', projectId: 'munlucky-moonshot-relay' });
  store1.transition('occ-r1', 'SHAPE');
  store1.transition('occ-r1', 'EXECUTE');
  store1.transition('occ-r1', 'PROVE');

  store1.recordVerification('occ-r1', {
    status: 'passed',
    evidenceRef: 'ev-occ1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'c'.repeat(64),
    sourceIdentity: 'src-occ1',
  });

  const snapshot = await prepareFinalization('occ-r1', {}, { stateStore: store1 });
  assert.equal(snapshot.status, 'ready');

  // First commit succeeds
  await commitFinalizationAuthority('occ-r1', snapshot, {}, { stateStore: store1 });

  // Second commit fails with ALREADY_COMPLETED
  await assert.rejects(
    async () => {
      await commitFinalizationAuthority('occ-r1', snapshot, {}, { stateStore: store1 });
    },
    { message: /ALREADY_COMPLETED/ }
  );

  store1.close();
});
