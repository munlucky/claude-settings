import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const root = process.cwd();
const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runContext = (stage, env = {}) => {
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
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).projectKnowledgeContext;
};

const projectIdentity = (env = {}) => {
  const result = spawnSync(process.execPath, [
    'scripts/project-identity.mjs',
    '--cwd',
    root,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const writeJsonl = async (filePath, records) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
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

test('knowledge-context-build supports memory control-plane stages', () => {
  for (const stage of ['init', 'requirements', 'design', 'validate-plan', 'prepare', 'review', 'score', 'replan', 'close']) {
    const context = runContext(stage);
    assert.equal(context.stage, stage);
    assert.equal(context.contextPack.stage, stage);
    assert.equal(context.contextPack.promptFacingAuthority, 'projectKnowledgeContext.promptBlock');
    assert.equal(context.promptBlock.includes('candidateMemory'), false);
  }
});

test('knowledge-context-build enforces stage-scoped retrieval omissions', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'knowledge-stage-policy-'));
  tempRoots.push(stateRoot);
  const env = { MOONSHOT_RELAY_STATE_ROOT: stateRoot };
  const identity = projectIdentity(env);
  const projectId = identity.identity.projectId;
  const knowledgeRoot = identity.namespaces.knowledgeRoot;

  await mkdir(knowledgeRoot, { recursive: true });
  await writeFile(path.join(knowledgeRoot, 'revision.json'), JSON.stringify({
    revision: 'stage-policy-test',
    updatedAt: '2026-07-09T00:00:00.000Z',
  }), 'utf8');
  await writeJsonl(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), [{
    type: 'semantic_fact',
    id: 'fact:solution-memory',
    projectId,
    status: 'verified',
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    statement: 'prior solution patch must not be used as a subjective score',
    sourceType: 'test',
    sourceRef: 'tests/knowledge-context-build-contract.test.mjs',
    trustTier: 'verified',
    provenanceRef: 'cmd:stage-policy',
    verifiedBy: 'test:stage-policy',
    verifiedAt: '2026-07-09T00:00:00.000Z',
    supersedes: [],
  }]);
  await writeJsonl(path.join(knowledgeRoot, 'graph', 'kg-relations.jsonl'), [{
    type: 'kg_relation',
    id: 'kg:design-conclusion',
    projectId,
    status: 'verified',
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    from: 'design',
    to: 'requirement',
    relation: 'CONCLUDED_AS',
    sourceRef: 'tests/knowledge-context-build-contract.test.mjs',
    trustTier: 'verified',
    supersedes: [],
  }]);
  await writeJsonl(path.join(knowledgeRoot, 'ontology', 'constraints.jsonl'), [{
    type: 'ontology_constraint',
    id: 'constraint:evidence-only-score',
    projectId,
    status: 'verified',
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    scope: 'score',
    appliesTo: ['memory_quality'],
    severity: 'blocking',
    enforcedBy: 'scripts/verification-plane.mjs',
    sourceRef: 'docs/public/guidelines/memory-control-plane.md',
    supersedes: [],
  }]);

  const requirements = runContext('requirements', env);
  assert.equal(requirements.semanticFacts.length, 1);
  assert.equal(requirements.graphSynopsis.length, 0);
  assert.ok(requirements.omittedByPolicy.some((item) => item.reason === 'stage_requirements_forbids_kg_relation'));

  const score = runContext('score', env);
  assert.equal(score.semanticFacts.length, 0);
  assert.equal(score.graphSynopsis.length, 0);
  assert.ok(score.ontologyConstraints.some((item) => item.id === 'ontology:constraint:evidence-only-score'));
  assert.ok(score.omittedByPolicy.some((item) => item.reason === 'stage_score_forbids_semantic_fact'));
  assert.equal(score.promptBlock.includes('prior solution patch'), false);
});
