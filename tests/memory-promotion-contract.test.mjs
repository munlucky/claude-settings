import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

const root = process.cwd();
const tempRoots = [];
const fixturePath = path.join(root, 'tests', 'fixtures', 'harness-control-plane', 'memory-promotion-fixture.json');

const makeEnv = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-memory-promotion-'));
  tempRoots.push(dir);
  return {
    PHASE_RUNTIME_DB: path.join(dir, 'runtime-state.sqlite'),
  };
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runtimeState = (args, env) => spawnSync(process.execPath, [
  'scripts/runtime-state.mjs',
  ...args,
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...env,
  },
});

const json = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const readFixture = async () => JSON.parse(await readFile(fixturePath, 'utf8'));

const recordPromotion = (env, extraArgs = []) => json(runtimeState([
  'record-memory-promotion',
  '--run-id',
  'run-memory-contract',
  '--goal-id',
  'goal-memory-contract',
  '--memory-id',
  'memory-contract',
  '--status',
  'promoted',
  ...extraArgs,
  '--json',
], env));

test('runtime-state schema includes memory promotion ledger table', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_promotion_decisions'").get());
  } finally {
    db.close();
  }
});

test('memory promotion without evidence, review, replay, rollback, or scope owner is rejected', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  const missingOwner = recordPromotion(env, [
    '--evidence-json',
    '{"fresh":true}',
    '--reviewer-json',
    '{"approved":true}',
    '--replay-json',
    '{"status":"passed"}',
    '--rollback-json',
    '{"strategy":"remove","removes":["memory-contract"]}',
  ]);
  assert.equal(missingOwner.status, 'rejected');
  assert.equal(missingOwner.decisionStatus, 'rejected');
  assert.equal(missingOwner.reason, 'memory promotion requires scope owner');

  const missingEvidence = recordPromotion(env, [
    '--scope-owner',
    'harness-control-plane',
    '--reviewer-json',
    '{"approved":true}',
    '--replay-json',
    '{"status":"passed"}',
    '--rollback-json',
    '{"strategy":"remove","removes":["memory-contract"]}',
  ]);
  assert.equal(missingEvidence.decisionStatus, 'rejected');
  assert.equal(missingEvidence.reason, 'memory promotion requires fresh evidence');

  const missingReview = recordPromotion(env, [
    '--scope-owner',
    'harness-control-plane',
    '--evidence-json',
    '{"fresh":true}',
    '--replay-json',
    '{"status":"passed"}',
    '--rollback-json',
    '{"strategy":"remove","removes":["memory-contract"]}',
  ]);
  assert.equal(missingReview.decisionStatus, 'rejected');
  assert.equal(missingReview.reason, 'memory promotion requires reviewer approval');

  const missingReplay = recordPromotion(env, [
    '--scope-owner',
    'harness-control-plane',
    '--evidence-json',
    '{"fresh":true}',
    '--reviewer-json',
    '{"approved":true}',
    '--rollback-json',
    '{"strategy":"remove","removes":["memory-contract"]}',
  ]);
  assert.equal(missingReplay.decisionStatus, 'rejected');
  assert.equal(missingReplay.reason, 'memory promotion requires passing replay evidence');

  const missingRollback = recordPromotion(env, [
    '--scope-owner',
    'harness-control-plane',
    '--evidence-json',
    '{"fresh":true}',
    '--reviewer-json',
    '{"approved":true}',
    '--replay-json',
    '{"status":"passed"}',
  ]);
  assert.equal(missingRollback.decisionStatus, 'rejected');
  assert.equal(missingRollback.reason, 'memory promotion requires rollback plan');
});

test('valid memory promotion records ledger entry and stale read-model warning', async () => {
  const env = await makeEnv();
  const fixture = await readFixture();
  json(runtimeState(['init', '--json'], env));

  const promoted = recordPromotion(env, [
    '--memory-id',
    fixture.promotion.memoryId,
    '--evidence-json',
    JSON.stringify(fixture.promotion.evidence),
    '--reviewer-json',
    JSON.stringify(fixture.promotion.reviewer),
    '--replay-json',
    JSON.stringify(fixture.promotion.replay),
    '--rollback-json',
    JSON.stringify(fixture.promotion.rollbackPlan),
    '--scope-owner',
    fixture.promotion.scopeOwner,
    '--stale-after',
    '2000-01-01T00:00:00.000Z',
  ]);
  assert.equal(promoted.status, 'recorded');
  assert.equal(promoted.decisionStatus, 'promoted');

  const status = json(runtimeState([
    'status',
    '--run-id',
    'run-memory-contract',
    '--goal-id',
    'goal-memory-contract',
    '--json',
  ], env));
  assert.ok(status.compactStatus.staleWarnings.includes(`stale memory promotion: ${fixture.promotion.memoryId}`));
  assert.deepEqual(status.resumeBrief.memoryWarnings, [`stale memory promotion: ${fixture.promotion.memoryId}`]);
});

test('rollback supersedes promoted memory without deleting audit history', async () => {
  const env = await makeEnv();
  const fixture = await readFixture();
  json(runtimeState(['init', '--json'], env));
  const promoted = recordPromotion(env, [
    '--memory-id',
    fixture.promotion.memoryId,
    '--evidence-json',
    JSON.stringify(fixture.promotion.evidence),
    '--reviewer-json',
    JSON.stringify(fixture.promotion.reviewer),
    '--replay-json',
    JSON.stringify(fixture.promotion.replay),
    '--rollback-json',
    JSON.stringify(fixture.promotion.rollbackPlan),
    '--scope-owner',
    fixture.promotion.scopeOwner,
    '--stale-after',
    '2000-01-01T00:00:00.000Z',
  ]);
  const rolledBack = json(runtimeState([
    'rollback-memory-promotion',
    '--run-id',
    'run-memory-contract',
    '--goal-id',
    'goal-memory-contract',
    '--decision-id',
    promoted.decisionId,
    '--reason',
    'contract rollback',
    '--rollback-evidence-json',
    '{"command":"node --test tests/memory-promotion-contract.test.mjs","contextPackRef":"ctxpack:0123456789abcdef"}',
    '--json',
  ], env));
  assert.equal(rolledBack.status, 'rolled_back');
  assert.equal(rolledBack.supersedesDecisionId, promoted.decisionId);

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    const rows = db.prepare('SELECT decision_id, status, supersedes_decision_id FROM memory_promotion_decisions ORDER BY decision_sequence').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].decision_id, promoted.decisionId);
    assert.equal(rows[0].status, 'superseded');
    assert.equal(rows[1].status, 'rolled_back');
    assert.equal(rows[1].supersedes_decision_id, promoted.decisionId);
  } finally {
    db.close();
  }

  const status = json(runtimeState([
    'status',
    '--run-id',
    'run-memory-contract',
    '--goal-id',
    'goal-memory-contract',
    '--json',
  ], env));
  assert.equal(status.compactStatus.staleWarnings.includes(`stale memory promotion: ${fixture.promotion.memoryId}`), false);
  assert.ok(status.compactStatus.staleWarnings.includes(`stale context pack projection: ctxpack:0123456789abcdef from rolled back memory promotion: ${fixture.promotion.memoryId}`));
  assert.ok(status.resumeBrief.memoryWarnings.includes(`stale context pack projection: ctxpack:0123456789abcdef from rolled back memory promotion: ${fixture.promotion.memoryId}`));
});

test('memory-derived facts never become completion authority', async () => {
  const env = await makeEnv();
  const fixture = await readFixture();
  json(runtimeState(['init', '--json'], env));
  recordPromotion(env, [
    '--memory-id',
    fixture.promotion.memoryId,
    '--evidence-json',
    JSON.stringify(fixture.promotion.evidence),
    '--reviewer-json',
    JSON.stringify(fixture.promotion.reviewer),
    '--replay-json',
    JSON.stringify(fixture.promotion.replay),
    '--rollback-json',
    JSON.stringify(fixture.promotion.rollbackPlan),
    '--scope-owner',
    fixture.promotion.scopeOwner,
  ]);

  const assessed = json(runtimeState([
    'assess-completion',
    '--run-id',
    'run-memory-contract',
    '--goal-id',
    'goal-memory-contract',
    '--json',
  ], env));
  assert.equal(assessed.status, 'needs_more_evidence');
  assert.equal(assessed.authoritySource, 'runtime-state.sqlite');
});

test('raw MemoryGraph records are not copied into public plan or policy docs', async () => {
  const fixture = await readFixture();
  const rawSentinel = fixture.rawMemoryGraphRecords[0];
  const files = [
    'docs/public/roadmaps/harness-control-plane-modernization/09-memory-promotion-knowledge-and-decision-ledger-v2.md',
    'docs/public/guidelines/knowledge-repository-ops.md',
    'docs/public/guidelines/document-memory-policy.md',
    'skills/harness-memory-promoter/SKILL.md',
    'agents/harness-memory-promoter.md',
  ];

  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8');
    assert.equal(text.includes(rawSentinel), false, `${file} must not copy raw memory graph records`);
  }
});
