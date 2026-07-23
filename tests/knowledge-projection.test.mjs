import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildKnowledgeProjection } from '../scripts/kernel/knowledge/projection.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Knowledge Projection - rebuilds projection jsonl files from SQLite store', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'mr-test-kn-proj-'));
  const store = await openKernelStateStore({ runtimeHome: tmp });
  try {
    store.saveKnowledgeRecord('proj-p1', 'rec-p1', {
      recordType: 'semantic_fact',
      status: 'committed',
      trustTier: 'verified',
      statement: 'Project uses projection rebuild',
      revision: 1,
    });

    const res = await rebuildKnowledgeProjection('proj-p1', {
      stateStore: store,
      runtimeHome: tmp,
    });

    assert.equal(res.status, 'rebuilt');
    assert.equal(res.count, 1);
  } finally {
    store.close();
    await rm(tmp, { recursive: true, force: true });
  }
});
