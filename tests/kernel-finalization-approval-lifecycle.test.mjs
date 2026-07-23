import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization, approveKnowledgeCandidate } from '../scripts/kernel/finalization/prepare.mjs';

test('approveKnowledgeCandidate enables two-step approval lifecycle', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-app-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'app-r1', objective: 'approval test', sourceIdentity: 'src-a1', projectId: 'munlucky-moonshot-relay' });
  store.transition('app-r1', 'SHAPE');
  store.transition('app-r1', 'EXECUTE');
  store.transition('app-r1', 'PROVE');

  store.recordVerification('app-r1', {
    status: 'passed',
    evidenceRef: 'ev-a1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    sourceIdentity: 'src-a1',
  });

  // Store ontology constraint requiring approval
  store.transition('app-r1', 'CLOSE');
  const evalRes = store.evaluateCompletion('app-r1');
  store.persistCompletionDecision('app-r1', evalRes);
  store.commitKnowledgeTransaction({
    transactionId: 'tx-ont-1',
    runId: 'app-r1',
    projectId: 'munlucky-moonshot-relay',
    records: [
      {
        id: 'ont-1',
        type: 'ontology_constraint',
        statement: 'Ask first before mutating core state.',
        scope: ['scripts/**'],
        status: 'committed',
        trustTier: 'verified',
        constraintJson: { rule: 'ask_first', scope: ['scripts/**'] },
      },
    ],
  });

  const initialSnap = await prepareFinalization('app-r1', {
    observations: [
      {
        candidateId: 'cand-app-1',
        proposedType: 'semantic_fact',
        statement: 'Ask first candidate.',
        scope: ['scripts/**'],
        evidenceRefs: ['ev-a1'],
      },
    ],
  }, { stateStore: store });

  assert.equal(initialSnap.status, 'blocked');
  assert.equal(initialSnap.reviewStatus, 'needs_approval');

  // Perform separate approval call
  approveKnowledgeCandidate('app-r1', 'cand-app-1', {
    approvedBy: 'lead-dev',
    approvalReceipt: 'receipt-app-1',
  }, { stateStore: store });

  // Re-run prepare without resending observations
  const secondSnap = await prepareFinalization('app-r1', {}, { stateStore: store });
  assert.equal(secondSnap.status, 'ready');
  assert.equal(secondSnap.reviewStatus, 'passed');

  store.close();
});
