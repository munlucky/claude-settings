import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, writeAtomicJsonl, projectKnowledgeDirectory } from '../scripts/kernel/knowledge/store.mjs';
import { resolveArchitectureKnowledge } from '../scripts/kernel/knowledge/architecture-resolve.mjs';

test('resolveArchitectureKnowledge resolves active ADRs and ranks by path relevance', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-arch-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('proj-arch', { env });

  const root = projectKnowledgeDirectory('proj-arch', { env });
  await writeAtomicJsonl(path.join(root, 'knowledge', 'semantic', 'verified-facts.jsonl'), [
    { id: 'f1', projectId: 'proj-arch', type: 'semantic_fact', statement: 'ADR-0001: Use SQLite for state persistence', sourceRef: 'ADR/ADR-0001.md', status: 'verified', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
    { id: 'f2', projectId: 'proj-arch', type: 'semantic_fact', statement: 'ADR-0002: Superseded choice', sourceRef: 'ADR/ADR-0002.md', status: 'superseded', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
  ]);

  const res = await resolveArchitectureKnowledge({ projectId: 'proj-arch', objective: 'SQLite persistence', env });
  assert.equal(res.architectureDecisions.length, 1);
  assert.equal(res.architectureDecisions[0].id, 'f1');
});
