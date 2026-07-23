import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';

test('MG-03 Fault Rollback: fault injection at transaction points rolls back all changes cleanly', async () => {
  const faultPoints = [
    'after_completion_decision',
    'after_run_close',
    'after_first_knowledge_record',
    'after_revision_cas',
    'after_knowledge_receipt',
    'before_finalization_receipt',
  ];

  for (const faultPoint of faultPoints) {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-fault-test-'));
    const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

    const runId = `fault-r-${faultPoint}`;
    store.createRun({ runId, objective: 'fault rollback test', sourceIdentity: 'src-fault', projectId: 'munlucky-moonshot-relay' });
    store.transition(runId, 'SHAPE');
    store.transition(runId, 'EXECUTE');
    store.transition(runId, 'PROVE');

    store.recordVerification(runId, {
      status: 'passed',
      evidenceRef: `ev-fault-${faultPoint}`,
      command: 'npm test',
      exitCode: 0,
      evidenceDigest: 'sha256:' + '5'.repeat(64),
      sourceIdentity: 'src-fault',
    });

    const snapshot = await prepareFinalization(runId, {
      observations: [
        {
          candidateId: `cand-fault-${faultPoint}`,
          proposedType: 'semantic_fact',
          statement: 'Fault candidate statement.',
          scope: ['scripts/**'],
          evidenceRefs: [`ev-fault-${faultPoint}`],
        },
      ],
    }, { stateStore: store });

    const faultInjector = (point) => {
      if (point === faultPoint) {
        throw new Error(`INJECTED_FAULT: ${faultPoint}`);
      }
    };

    await assert.rejects(
      async () => {
        await commitFinalizationAuthority(runId, snapshot, {}, { stateStore: store, faultInjector });
      },
      { message: new RegExp(`INJECTED_FAULT: ${faultPoint}`) }
    );

    // Verify 0 partial rows remain
    assert.equal(store.getRun(runId).status, 'active');
    assert.equal(store.getRun(runId).state, 'PROVE');
    assert.equal(store.getCompletionDecision(runId), null);
    assert.equal(store.listKnowledgeRecords({ projectId: 'munlucky-moonshot-relay', statuses: ['committed'] }).length, 0);

    store.close();
  }
});
