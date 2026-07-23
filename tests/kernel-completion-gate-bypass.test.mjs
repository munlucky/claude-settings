import test from 'node:test';
import assert from 'node:assert/strict';
import { commitProjectKnowledge, KernelKnowledgeCommitError } from '../scripts/kernel/knowledge/commit.mjs';

test('commitProjectKnowledge fails closed when completion is not accepted or OCC revision mismatches', async () => {
  // Test 1: Fail closed when isCompletionAccepted is false
  await assert.rejects(
    async () =>
      commitProjectKnowledge({
        runId: 'run-gate-1',
        projectId: 'test-project',
        isCompletionAccepted: false,
      }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'COMPLETION_NOT_ACCEPTED'
  );

  // Test 2: Reject STALE_KNOWLEDGE_REVISION when OCC revision mismatches
  await assert.rejects(
    async () =>
      commitProjectKnowledge({
        runId: 'run-gate-2',
        projectId: 'test-project',
        isCompletionAccepted: true,
        expectedKnowledgeRevision: '9999', // Mismatched revision
      }),
    (err) => err instanceof KernelKnowledgeCommitError && err.code === 'STALE_KNOWLEDGE_REVISION'
  );
});
