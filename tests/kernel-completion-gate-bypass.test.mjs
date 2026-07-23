import test from 'node:test';
import assert from 'node:assert/strict';
import { commitProjectKnowledge, KernelKnowledgeCommitError } from '../scripts/kernel/knowledge/commit.mjs';

test('commitProjectKnowledge fails closed when completion is not accepted or OCC revision mismatches', async () => {
  const mockBlockedStore = {
    getRun: () => ({ runId: 'run-gate-1', projectId: 'test-project', sourceIdentity: 'source-1', mutationRevision: 1 }),
    getCompletionDecision: () => ({ decision: 'blocked', sourceIdentity: 'source-1', mutationRevision: 1 }),
  };

  // Test 1: Fail closed when completion is blocked
  await assert.rejects(
    async () =>
      commitProjectKnowledge({
        runId: 'run-gate-1',
        projectId: 'test-project',
        stateStore: mockBlockedStore,
      }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'COMPLETION_NOT_ACCEPTED'
  );

  const mockAcceptedStore = {
    getRun: () => ({ runId: 'run-gate-2', projectId: 'test-project', sourceIdentity: 'source-2', mutationRevision: 1 }),
    getCompletionDecision: () => ({ decision: 'accepted', sourceIdentity: 'source-2', mutationRevision: 1 }),
  };

  // Test 2: Reject STALE_KNOWLEDGE_REVISION when OCC revision mismatches
  await assert.rejects(
    async () =>
      commitProjectKnowledge({
        runId: 'run-gate-2',
        projectId: 'test-project',
        stateStore: mockAcceptedStore,
        expectedKnowledgeRevision: '9999', // Mismatched revision
      }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'STALE_KNOWLEDGE_REVISION'
  );
});
