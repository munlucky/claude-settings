import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, writeAtomicJsonl, projectKnowledgeDirectory } from '../scripts/kernel/knowledge/store.mjs';
import { resolveTacitPractices } from '../scripts/kernel/knowledge/tacit-resolve.mjs';

test('resolveTacitPractices requires >= 2 distinct runs and verification evidence', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-tacit-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('proj-tacit', { env });

  const root = projectKnowledgeDirectory('proj-tacit', { env });
  await writeAtomicJsonl(path.join(root, 'knowledge', 'episodic', 'observations.jsonl'), [
    { id: 'o1', runId: 'run-1', projectId: 'proj-tacit', type: 'episodic_observation', statement: 'Always use atomic rename for JSONL files', status: 'verified', evidence: { pass: true }, trustTier: 'quarantined', createdAt: '2026-07-23T00:00:00.000Z' },
    { id: 'o2', runId: 'run-2', projectId: 'proj-tacit', type: 'episodic_observation', statement: 'Always use atomic rename for JSONL files', status: 'observed', trustTier: 'quarantined', createdAt: '2026-07-23T00:00:00.000Z' },
  ]);

  const practices = await resolveTacitPractices({ projectId: 'proj-tacit', env });
  assert.equal(practices.length, 1);
  assert.equal(practices[0].statement, 'Always use atomic rename for JSONL files');
  assert.equal(practices[0].observedRuns.length, 2);
});
