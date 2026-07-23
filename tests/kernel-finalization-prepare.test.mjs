import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';

test('prepareFinalization calculates ready aggregate without writing completion decision', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-prep-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'prep-r1', objective: 'prepare test', sourceIdentity: 'src-p1' });
  store.transition('prep-r1', 'SHAPE');
  store.transition('prep-r1', 'EXECUTE');
  store.transition('prep-r1', 'PROVE');

  store.recordVerification('prep-r1', {
    status: 'passed',
    evidenceRef: 'ev-p1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    sourceIdentity: 'src-p1',
  });

  const snapshot = await prepareFinalization('prep-r1', {
    observations: [
      {
        proposedType: 'semantic_fact',
        statement: 'Prepare test passed cleanly.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-p1'],
      },
    ],
  }, { stateStore: store });

  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.reviewStatus, 'passed');

  // Verify that completion_decision is NOT created and run status remains active
  assert.equal(store.getCompletionDecision('prep-r1'), null);
  assert.equal(store.getRun('prep-r1').status, 'active');

  store.close();
});
