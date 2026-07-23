import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, writeAtomicJsonl, projectKnowledgeDirectory } from '../scripts/kernel/knowledge/store.mjs';
import { buildProjectKnowledgeContext } from '../scripts/kernel/knowledge/context-load.mjs';

test('buildProjectKnowledgeContext returns deterministic context and digest', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-ctx-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('test-proj', { env });

  const root = projectKnowledgeDirectory('test-proj', { env });
  await writeAtomicJsonl(path.join(root, 'knowledge', 'semantic', 'verified-facts.jsonl'), [
    { id: 'fact-1', projectId: 'test-proj', type: 'policy_anchor', statement: 'System uses UTC timestamping.', status: 'verified', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
  ]);

  const ctx1 = await buildProjectKnowledgeContext({ projectId: 'test-proj', stage: 'FRAME', env });
  const ctx2 = await buildProjectKnowledgeContext({ projectId: 'test-proj', stage: 'FRAME', env });

  assert.equal(ctx1.digest, ctx2.digest);
  assert.equal(ctx1.stage, 'FRAME');
  assert.equal(ctx1.status, 'ready');
  assert.ok(ctx1.promptBlock.includes('System uses UTC timestamping.'));
});
