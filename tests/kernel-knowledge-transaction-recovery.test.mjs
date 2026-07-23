import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories } from '../scripts/kernel/knowledge/store.mjs';
import { commitProjectKnowledge, KernelKnowledgeCommitError } from '../scripts/kernel/knowledge/commit.mjs';

test('commitProjectKnowledge rolls back transaction cleanly on fault injection and preserves revision', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-tx-fault-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('proj-fault', { env });

  const mockStore = {
    getRun: () => ({ runId: 'run-fault', projectId: 'proj-fault', sourceIdentity: 's1', mutationRevision: 1 }),
    getCompletionDecision: () => ({ decision: 'accepted', sourceIdentity: 's1', mutationRevision: 1 }),
    getProjectKnowledgeRevision: () => 1,
    commitKnowledgeTransaction: () => {
      throw new Error('FAULT_INJECTION_AFTER_RECORDS');
    },
  };

  await assert.rejects(
    async () =>
      commitProjectKnowledge({
        runId: 'run-fault',
        projectId: 'proj-fault',
        stateStore: mockStore,
        faultInjection: 'after_records_before_revision',
        candidates: [{ candidateId: 'c1', status: 'verified', statement: 'Fault test candidate', evidenceRefs: ['ev-1'] }],
        env,
      }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'TRANSACTION_FAILED'
  );
});
