import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';

test('commitFinalizationAuthority writes completion decision, run status, records, revision, receipts atomically', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-atom-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'atom-r1', objective: 'atomic transaction test', sourceIdentity: 'src-at1', projectId: 'munlucky-moonshot-relay' });
  store.transition('atom-r1', 'SHAPE');
  store.transition('atom-r1', 'EXECUTE');
  store.transition('atom-r1', 'PROVE');

  store.recordVerification('atom-r1', {
    status: 'passed',
    evidenceRef: 'ev-at1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    sourceIdentity: 'src-at1',
  });

  const snapshot = await prepareFinalization('atom-r1', {
    observations: [
      {
        candidateId: 'cand-at1',
        proposedType: 'semantic_fact',
        statement: 'Atomic finalization fact.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-at1'],
      },
    ],
  }, { stateStore: store });

  assert.equal(snapshot.status, 'ready');

  const authorityReceipt = await commitFinalizationAuthority('atom-r1', snapshot, {}, { stateStore: store });

  assert.equal(authorityReceipt.status, 'committed');
  assert.equal(store.getRun('atom-r1').status, 'completed');
  assert.equal(store.getRun('atom-r1').state, 'CLOSE');
  assert.equal(store.getCompletionDecision('atom-r1').decision, 'accepted');

  const records = store.listKnowledgeRecords({ projectId: 'munlucky-moonshot-relay', statuses: ['committed'] });
  assert.equal(records.length, 1);
  assert.equal(records[0].statement, 'Atomic finalization fact.');

  store.close();
});
