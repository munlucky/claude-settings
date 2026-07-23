import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories } from '../scripts/kernel/knowledge/store.mjs';
import { reviewKnowledgeCandidates } from '../scripts/kernel/knowledge/candidate-review.mjs';

test('reviewKnowledgeCandidates verifies valid candidates with passing evidence pack', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-rev-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  const result = await reviewKnowledgeCandidates({
    projectId: 'test-proj',
    candidates: [
      {
        candidateId: 'cand-1',
        runId: 'run-1',
        projectId: 'test-proj',
        proposedType: 'semantic_fact',
        statement: 'Valid verified statement',
        scope: ['scripts/test.mjs'],
        status: 'observed',
      },
    ],
    evidencePack: { status: 'pass', digest: 'ev-dig-1' },
    env,
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.verifiedCandidates.length, 1);
  assert.equal(result.rejectedCandidates.length, 0);
});

test('reviewKnowledgeCandidates rejects candidates when verification evidence is missing', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-rev-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  const result = await reviewKnowledgeCandidates({
    projectId: 'test-proj',
    candidates: [
      {
        candidateId: 'cand-1',
        runId: 'run-1',
        projectId: 'test-proj',
        proposedType: 'semantic_fact',
        statement: 'Statement without evidence',
        status: 'observed',
      },
    ],
    evidencePack: null,
    env,
  });

  assert.equal(result.verifiedCandidates.length, 0);
  assert.equal(result.rejectedCandidates.length, 1);
  assert.equal(result.rejectedCandidates[0].rejectionReasons[0], 'MISSING_VERIFICATION_EVIDENCE');
});
