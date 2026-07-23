import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, readProjectRevision } from '../scripts/kernel/knowledge/store.mjs';
import { commitProjectKnowledge, KernelKnowledgeCommitError } from '../scripts/kernel/knowledge/commit.mjs';

test('commitProjectKnowledge rejects write when completion is not accepted', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-cmt-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  await assert.rejects(
    async () =>
      commitProjectKnowledge({
        runId: 'run-1',
        projectId: 'test-proj',
        isCompletionAccepted: false,
        candidates: [{ candidateId: 'c1', status: 'verified', statement: 'Test' }],
        env,
      }),
    KernelKnowledgeCommitError
  );
});

test('commitProjectKnowledge performs atomic commit and advances revision when accepted', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-cmt-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  const revBefore = await readProjectRevision('test-proj', { env });
  const receipt = await commitProjectKnowledge({
    runId: 'run-1',
    projectId: 'test-proj',
    isCompletionAccepted: true,
    candidates: [{ candidateId: 'c1', status: 'verified', statement: 'Verified commitment', evidenceRefs: ['ev-1'] }],
    env,
  });

  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.revisionBefore, revBefore);
  assert.equal(receipt.revisionAfter, '2');

  const revAfter = await readProjectRevision('test-proj', { env });
  assert.equal(revAfter, '2');
});
