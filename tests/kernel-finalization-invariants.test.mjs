import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { finalizeRunCoordinator } from '../scripts/kernel/finalization/coordinator.mjs';

test('FAR-REQ-001 ~ FAR-REQ-010 Real Resource Invariants: finalizeRun is all-or-nothing', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-inv-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'inv-r1', objective: 'invariants test', sourceIdentity: 'src-inv1', projectId: 'munlucky-moonshot-relay' });
  store.transition('inv-r1', 'SHAPE');
  store.transition('inv-r1', 'EXECUTE');
  store.transition('inv-r1', 'PROVE');

  // Blocked run: missing verification -> status = 'blocked', run remains in PROVE
  const blockedRes = await finalizeRunCoordinator('inv-r1', {
    observations: [
      {
        candidateId: 'cand-inv-1',
        proposedType: 'semantic_fact',
        statement: 'Blocked candidate without verification.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-missing'],
      },
    ],
  }, { stateStore: store });

  assert.equal(blockedRes.status, 'blocked');
  assert.equal(store.getRun('inv-r1').status, 'active');
  assert.equal(store.getRun('inv-r1').state, 'PROVE');
  assert.equal(store.getCompletionDecision('inv-r1'), null);

  // Fulfill verification -> finalize succeeds
  store.recordVerification('inv-r1', {
    status: 'passed',
    evidenceRef: 'ev-missing',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'e'.repeat(64),
    sourceIdentity: 'src-inv1',
  });

  const readyRes = await finalizeRunCoordinator('inv-r1', {}, { stateStore: store });
  assert.equal(readyRes.status, 'completed');
  assert.equal(store.getRun('inv-r1').status, 'completed');
  assert.equal(store.getRun('inv-r1').state, 'CLOSE');

  store.close();
});
