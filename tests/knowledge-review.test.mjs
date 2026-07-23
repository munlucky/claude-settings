import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewKnowledgeCandidates } from '../scripts/kernel/knowledge/candidate-review.mjs';

test('Knowledge Review - verifies knowledge candidates with valid evidence pack', async () => {
  const candidates = [
    {
      candidateId: 'cand-rev-1',
      proposedType: 'semantic_fact',
      statement: 'Project uses SQLite for runtime persistence',
      evidenceRefs: ['sha256:' + 'a'.repeat(64)],
    },
  ];

  const evidencePack = {
    status: 'passed',
    digest: 'a'.repeat(64),
  };

  const res = await reviewKnowledgeCandidates({
    projectId: 'proj-rev-1',
    runId: 'run-rev-1',
    candidates,
    evidencePack,
  });

  assert.equal(res.status, 'passed');
  assert.equal(res.verifiedCandidates.length, 1);
});
