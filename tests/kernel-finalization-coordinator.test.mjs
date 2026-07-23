import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { finalizeRunCoordinator } from '../scripts/kernel/finalization/coordinator.mjs';

test('finalizeRunCoordinator coordinates prepare, commit, and returns finalization receipt', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-coord-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'coord-r1', objective: 'coordinator test', sourceIdentity: 'src-co1', projectId: 'munlucky-moonshot-relay' });
  store.transition('coord-r1', 'SHAPE');
  store.transition('coord-r1', 'EXECUTE');
  store.transition('coord-r1', 'PROVE');

  store.recordVerification('coord-r1', {
    status: 'passed',
    evidenceRef: 'ev-co1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'b'.repeat(64),
    sourceIdentity: 'src-co1',
  });

  const receipt = await finalizeRunCoordinator('coord-r1', {
    observations: [
      {
        candidateId: 'cand-co1',
        proposedType: 'semantic_fact',
        statement: 'Coordinator fact.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-co1'],
      },
    ],
  }, { stateStore: store });

  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.authorityReceipt.status, 'committed');
  assert.equal(store.getRun('coord-r1').status, 'completed');

  store.close();
});
