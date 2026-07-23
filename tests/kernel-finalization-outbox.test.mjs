import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { processGitCloseoutOutbox } from '../scripts/kernel/git/closeout-outbox.mjs';

test('git_closeout_jobs outbox queue enqueues and processes pending jobs cleanly', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-outbox-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'out-r1', objective: 'outbox test', sourceIdentity: 'src-out1', projectId: 'munlucky-moonshot-relay' });
  store.transition('out-r1', 'SHAPE');
  store.transition('out-r1', 'EXECUTE');
  store.transition('out-r1', 'PROVE');

  store.recordVerification('out-r1', {
    status: 'passed',
    evidenceRef: 'ev-out1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'f'.repeat(64),
    sourceIdentity: 'src-out1',
  });

  const snapshot = await prepareFinalization('out-r1', {}, { stateStore: store });
  await commitFinalizationAuthority('out-r1', snapshot, {
    gitCloseoutRequest: { requested: true, mode: 'commit', approvalReceipt: 'app-out-1' },
  }, { stateStore: store });

  const pending = store.getPendingGitCloseoutJobs();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].runId, 'out-r1');

  store.close();
});
