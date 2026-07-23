import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, writeAtomicJsonl, projectKnowledgeDirectory } from '../scripts/kernel/knowledge/store.mjs';
import { evaluateOntologyConstraints } from '../scripts/kernel/knowledge/ontology-evaluate.mjs';

test('evaluateOntologyConstraints detects never and ask_first violations', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-ont-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('proj-ont', { env });

  const root = projectKnowledgeDirectory('proj-ont', { env });
  await writeAtomicJsonl(path.join(root, 'knowledge', 'ontology', 'constraints.jsonl'), [
    { id: 'c1', projectId: 'proj-ont', type: 'ontology_constraint', statement: 'Never mutate Relay state', severity: 'never', scope: ['scripts/kernel/**'], status: 'verified', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
  ]);

  const evalRes = await evaluateOntologyConstraints({ projectId: 'proj-ont', paths: ['scripts/kernel/state.mjs'], env });
  assert.equal(evalRes.passed, false);
  assert.equal(evalRes.violations.length, 1);
});
