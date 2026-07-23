import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ensureKnowledgeStoreDirectories, writeAtomicJsonl, projectKnowledgeDirectory } from '../scripts/kernel/knowledge/store.mjs';
import { evaluateOntologyConstraints } from '../scripts/kernel/knowledge/ontology-evaluate.mjs';

test('evaluateOntologyConstraints handles never, ask_first, and invariant severity rules', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-ont-gate-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };
  await ensureKnowledgeStoreDirectories('proj-ont-gate', { env });

  const root = projectKnowledgeDirectory('proj-ont-gate', { env });
  await writeAtomicJsonl(path.join(root, 'knowledge', 'ontology', 'constraints.jsonl'), [
    { id: 'c1', projectId: 'proj-ont-gate', type: 'ontology_constraint', statement: 'Never mutate Relay state', pattern: 'mutate Relay state', severity: 'never', scope: ['scripts/kernel/**'], status: 'verified', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
    { id: 'c2', projectId: 'proj-ont-gate', type: 'ontology_constraint', statement: 'Ask before modifying core schemas', severity: 'ask_first', scope: ['schemas/**'], status: 'verified', trustTier: 'verified', createdAt: '2026-07-23T00:00:00.000Z' },
  ]);

  const evalRes = await evaluateOntologyConstraints({
    projectId: 'proj-ont-gate',
    paths: ['scripts/kernel/state.mjs', 'schemas/test.json'],
    statements: ['mutate Relay state'],
    env,
  });

  assert.equal(evalRes.passed, false);
  assert.equal(evalRes.violations.length, 1);
  assert.equal(evalRes.approvalRequired.length, 1);
});
