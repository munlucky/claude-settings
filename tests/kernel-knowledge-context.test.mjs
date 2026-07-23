import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { buildProjectKnowledgeContext } from '../scripts/kernel/knowledge/context-load.mjs';

test('buildProjectKnowledgeContext returns deterministic context and digest', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-ctx-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmp, 'kernel'), relayHome: path.join(tmp, 'relay') });

  const record = {
    id: 'fact-1',
    type: 'policy_anchor',
    status: 'committed',
    trustTier: 'verified',
    statement: 'System uses UTC timestamping.',
    scope: [],
    revision: 1,
  };

  // Use the state store API to persist a knowledge record
  store.saveKnowledgeRecord('test-proj', 'fact-1', {
    recordType: 'policy_anchor',
    status: 'committed',
    trustTier: 'verified',
    recordJson: record,
    revision: 1,
  });
  store.updateProjectKnowledgeRevision('test-proj', 1, 1);

  const ctx1 = await buildProjectKnowledgeContext({ projectId: 'test-proj', stateStore: store, stage: 'FRAME' });
  const ctx2 = await buildProjectKnowledgeContext({ projectId: 'test-proj', stateStore: store, stage: 'FRAME' });

  assert.equal(ctx1.digest, ctx2.digest);
  assert.equal(ctx1.stage, 'FRAME');
  assert.equal(ctx1.status, 'ready');
  assert.ok(ctx1.promptBlock.includes('System uses UTC timestamping.'));

  store.close();
});
