import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';

test('evidence binding requires candidate FK and matching verification in same run', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-ev-bind-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'bind-r1', objective: 'evidence binding test', sourceIdentity: 'src-b1' });
  store.transition('bind-r1', 'SHAPE');
  store.transition('bind-r1', 'EXECUTE');
  store.transition('bind-r1', 'PROVE');

  // Candidate with missing verification
  const snap1 = await prepareFinalization('bind-r1', {
    observations: [
      {
        candidateId: 'cand-bind-1',
        proposedType: 'semantic_fact',
        statement: 'Statement without verification.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-missing'],
      },
    ],
  }, { stateStore: store });

  assert.equal(snap1.status, 'blocked');
  assert.equal(snap1.reviewStatus, 'failed');

  // Record verification for same run
  store.recordVerification('bind-r1', {
    status: 'passed',
    evidenceRef: 'ev-missing',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'c'.repeat(64),
    sourceIdentity: 'src-b1',
  });

  const snap2 = await prepareFinalization('bind-r1', {}, { stateStore: store });
  assert.equal(snap2.status, 'ready');
  assert.equal(snap2.reviewStatus, 'passed');

  store.close();
});
