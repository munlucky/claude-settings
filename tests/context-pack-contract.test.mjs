import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

const runKnowledgeContext = (args = []) => {
  const result = spawnSync(process.execPath, [
    'scripts/knowledge-context-build.mjs',
    '--cwd',
    root,
    '--stage',
    'execute',
    '--json',
    ...args,
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).projectKnowledgeContext;
};

test('ContextPackV1 is additive and preserves promptBlock-facing contract', async () => {
  const context = runKnowledgeContext([
    '--run-id',
    'run-context-pack-contract',
    '--goal-id',
    'goal-context-pack-contract',
  ]);
  const topLevelFields = [
    'schemaVersion',
    'projectId',
    'namespace',
    'knowledgeRevision',
    'status',
    'strictness',
    'stage',
    'policyAnchors',
    'semanticFacts',
    'graphSynopsis',
    'ontologyConstraints',
    'staleOrUnavailable',
    'omittedByPolicy',
    'promptBlock',
  ];

  for (const field of topLevelFields) {
    assert.ok(Object.hasOwn(context, field), `missing compatibility field ${field}`);
  }
  assert.equal(typeof context.promptBlock, 'string');
  assert.match(context.promptBlock, /^## Project Knowledge Context/m);
  assert.equal(context.contextPack.promptFacingAuthority, 'projectKnowledgeContext.promptBlock');
  assert.equal(context.contextPack.compatibility.additiveOnly, true);
  assert.deepEqual(context.contextPack.runtimeAuthorityRef, {
    runId: 'run-context-pack-contract',
    goalId: 'goal-context-pack-contract',
  });
  assert.equal(context.metadata.contextPackRef, context.contextPack.contextPackRef);
  assert.equal(context.metadata.packId, context.contextPack.packId);
  assert.equal(context.metadata.contextPackSchemaVersion, 1);
});

test('ContextPackV1 does not rename semanticFacts or render candidate memory as verified facts', () => {
  const context = runKnowledgeContext();
  assert.ok(Array.isArray(context.semanticFacts));
  assert.equal(Object.hasOwn(context, 'verifiedFacts'), false);
  assert.ok(Array.isArray(context.contextPack.projectSlice.semanticFacts));
  assert.equal(Object.hasOwn(context.contextPack.projectSlice, 'verifiedFacts'), false);
  assert.deepEqual(context.contextPack.candidateMemory, []);
  assert.equal(context.promptBlock.includes('candidateMemory'), false);
  assert.equal(context.promptBlock.includes('verifiedFacts'), false);
});

test('context pack schema is present and names the stable status vocabulary', async () => {
  const schemaPath = path.join(root, 'schemas', 'context-pack.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  assert.equal(schema.title, 'ContextPackV1');
  assert.ok(schema.properties.stage.enum.includes('requirements'));
  assert.ok(schema.properties.stage.enum.includes('replan'));
  assert.deepEqual(schema.properties.status.enum, [
    'ready',
    'stale',
    'degraded_read',
    'degraded_write',
    'not_configured',
  ]);
  assert.equal(schema.properties.promptFacingAuthority.const, 'projectKnowledgeContext.promptBlock');
});

test('ContextPackV2 candidate is additive over promptBlock authority', async () => {
  const schemaPath = path.join(root, 'schemas', 'context-pack-v2.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  assert.equal(schema.title, 'ContextPackV2 Candidate');
  assert.equal(schema.properties.promptFacingAuthority.const, 'projectKnowledgeContext.promptBlock');
  assert.equal(schema.properties.compatibility.properties.extendsContextPackV1.const, true);
  assert.equal(schema.properties.compatibility.properties.additiveOnly.const, true);
});
