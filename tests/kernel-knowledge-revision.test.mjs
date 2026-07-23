import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories } from '../scripts/kernel/knowledge/store.mjs';
import { advanceProjectRevision } from '../scripts/kernel/knowledge/revision.mjs';

test('advanceProjectRevision increments revision counter atomically', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-rev-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  const res1 = await advanceProjectRevision('test-proj', { env });
  assert.equal(res1.revisionBefore, '1');
  assert.equal(res1.revisionAfter, '2');

  const res2 = await advanceProjectRevision('test-proj', { env });
  assert.equal(res2.revisionBefore, '2');
  assert.equal(res2.revisionAfter, '3');
});
