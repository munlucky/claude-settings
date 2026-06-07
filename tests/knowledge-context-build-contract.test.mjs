import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = process.cwd();

const runContext = (stage) => {
  const result = spawnSync(process.execPath, [
    'scripts/knowledge-context-build.mjs',
    '--cwd',
    root,
    '--stage',
    stage,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).projectKnowledgeContext;
};

test('knowledge-context-build keeps promptBlock usable when contextPack is ignored', () => {
  const context = runContext('execute');
  const { contextPack, metadata, ...legacyConsumerView } = context;

  assert.ok(contextPack);
  assert.ok(metadata);
  assert.equal(typeof legacyConsumerView.promptBlock, 'string');
  assert.equal(legacyConsumerView.stage, 'execute');
  assert.ok(Array.isArray(legacyConsumerView.semanticFacts));
  assert.ok(Array.isArray(legacyConsumerView.graphSynopsis));
  assert.ok(Array.isArray(legacyConsumerView.ontologyConstraints));
});

test('knowledge-context-build keeps runtimeAuthorityRef optional for intake and plan contexts', () => {
  const intake = runContext('intake');
  const plan = runContext('plan');

  assert.equal(intake.contextPack.runtimeAuthorityRef, null);
  assert.equal(plan.contextPack.runtimeAuthorityRef, null);
  assert.equal(intake.metadata.servingMode, intake.strictness);
  assert.equal(plan.metadata.servingMode, plan.strictness);
});
