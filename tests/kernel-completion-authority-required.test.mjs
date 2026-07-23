import test from 'node:test';
import assert from 'node:assert/strict';
import { commitProjectKnowledge, KernelKnowledgeCommitError } from '../scripts/kernel/knowledge/commit.mjs';

test('commitProjectKnowledge fails closed without stateStore authority', async () => {
  // Test 1: Calling without stateStore
  await assert.rejects(
    async () => commitProjectKnowledge({ runId: 'r1', projectId: 'p1' }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'COMPLETION_AUTHORITY_REQUIRED'
  );

  // Test 2: Blocked completion decision
  const blockedStore = {
    getRun: () => ({ runId: 'r1', projectId: 'p1', sourceIdentity: 's1', mutationRevision: 1 }),
    getCompletionDecision: () => ({ decision: 'blocked', sourceIdentity: 's1', mutationRevision: 1 }),
  };
  await assert.rejects(
    async () => commitProjectKnowledge({ runId: 'r1', projectId: 'p1', stateStore: blockedStore }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'COMPLETION_NOT_ACCEPTED'
  );

  // Test 3: Project ID mismatch
  const mismatchStore = {
    getRun: () => ({ runId: 'r1', projectId: 'other-proj', sourceIdentity: 's1', mutationRevision: 1 }),
    getCompletionDecision: () => ({ decision: 'accepted', sourceIdentity: 's1', mutationRevision: 1 }),
  };
  await assert.rejects(
    async () => commitProjectKnowledge({ runId: 'r1', projectId: 'p1', stateStore: mismatchStore }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'PROJECT_ID_MISMATCH'
  );

  // Test 4: Stale mutation revision
  const staleStore = {
    getRun: () => ({ runId: 'r1', projectId: 'p1', sourceIdentity: 's1', mutationRevision: 2 }),
    getCompletionDecision: () => ({ decision: 'accepted', sourceIdentity: 's1', mutationRevision: 1 }),
  };
  await assert.rejects(
    async () => commitProjectKnowledge({ runId: 'r1', projectId: 'p1', stateStore: staleStore }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'STALE_COMPLETION_DECISION'
  );
});
