import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

const root = process.cwd();
const tempRoots = [];

const makeEnv = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-completion-authority-'));
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

const recordEvidence = (env, runId, goalId, payload) => json(runtimeState([
  'record-event',
  '--run-id',
  runId,
  '--goal-id',
  goalId,
  '--event-type',
  'verification.evidence',
  '--payload-json',
  JSON.stringify(payload),
  '--json',
], env));

const fullPassingPlanes = () => ({
  requiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
  planes: [
    { plane: 'unit', status: 'passed', command: 'npm test' },
    { plane: 'package', status: 'passed', command: 'npm run test:package' },
    { plane: 'installer', status: 'passed', command: 'installer dry-run' },
    { plane: 'browser', status: 'passed', tracePath: '.moonshot-relay/browser-artifacts/run/goal/smoke/trace-metadata.json' },
    { plane: 'security', status: 'passed', blockers: [] },
    { plane: 'quality', status: 'passed', command: 'git diff --check' },
  ],
});

const assess = (env, runId, goalId) => json(runtimeState([
  'assess-completion',
  '--run-id',
  runId,
  '--goal-id',
  goalId,
  '--json',
], env));

test('phase-status-only completion is not accepted without DB authority', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  const result = assess(env, 'run-phase-status-only', 'goal-phase-status-only');

  assert.equal(result.status, 'needs_more_evidence');
  assert.equal(result.authoritySource, 'runtime-state.sqlite');
});

test('stale or superseded verifier evidence is rejected', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-stale', 'goal-stale', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    identityMatches: true,
    stale: true,
    staleReason: 'superseded-verdict',
  });
  const stale = assess(env, 'run-stale', 'goal-stale');
  assert.equal(stale.status, 'rejected');
  assert.equal(stale.reason, 'superseded-verdict');

  recordEvidence(env, 'run-superseded', 'goal-superseded', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    identityMatches: true,
    superseded: true,
  });
  const superseded = assess(env, 'run-superseded', 'goal-superseded');
  assert.equal(superseded.status, 'rejected');
});

test('missing identity while active identity exists is rejected', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-identity', 'goal-identity', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    activeIdentityPresent: true,
    identityMatches: false,
  });
  const result = assess(env, 'run-identity', 'goal-identity');

  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'identity mismatch');
});

test('fresh verifier evidence without active identity cannot produce accepted authority', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-missing-active-identity', 'goal-missing-active-identity', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    identityMatches: true,
  });
  const result = assess(env, 'run-missing-active-identity', 'goal-missing-active-identity');

  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'missing active identity');
});

test('fresh verifier evidence can produce an accepted DB decision', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-fresh', 'goal-fresh', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    activeIdentityPresent: true,
    identityMatches: true,
    reason: 'fresh verifier contract evidence',
    identity: { runLeaseId: 'lease-fresh' },
  });
  const result = assess(env, 'run-fresh', 'goal-fresh');
  const status = json(runtimeState(['status', '--run-id', 'run-fresh', '--goal-id', 'goal-fresh', '--json'], env));

  assert.equal(result.status, 'accepted');
  assert.match(result.decisionId, /^[0-9a-f-]{36}$/);
  assert.equal(status.compactStatus.latestVerdict.status, 'accepted');
  assert.equal(status.compactStatus.latestVerdict.authoritySource, 'runtime-state.sqlite');
  assert.equal(status.compactStatus.latestVerdict.decisionId, result.decisionId);
  assert.equal(status.compactStatus.latestVerdict.stale, false);
  assert.match(status.compactStatus.latestVerdict.evidenceHash, /^[a-f0-9]{64}$/);
});

test('lowered requiredPlanes payload cannot weaken accepted completion authority', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-lowered-required-planes', 'goal-lowered-required-planes', {
    fresh: true,
    requiredChecksPassed: true,
    activeIdentityPresent: true,
    identityMatches: true,
    identity: { runLeaseId: 'lease-lowered' },
    requiredPlanes: ['quality'],
    planes: [
      { plane: 'quality', status: 'passed', command: 'git diff --check' },
    ],
  });
  const result = assess(env, 'run-lowered-required-planes', 'goal-lowered-required-planes');

  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'missing verification plane: unit');
});

test('profile evidence with full authority planes can still produce accepted completion', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-profile-authority', 'goal-profile-authority', {
    fresh: true,
    requiredChecksPassed: true,
    profile: 'runtime_adapter',
    profileRequiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
    completionAuthorityRequiredPlanes: ['unit', 'package', 'installer', 'browser', 'security', 'quality'],
    ...fullPassingPlanes(),
    activeIdentityPresent: true,
    identityMatches: true,
    identity: { runLeaseId: 'lease-profile-authority' },
  });
  const result = assess(env, 'run-profile-authority', 'goal-profile-authority');

  assert.equal(result.status, 'accepted');
});

test('fresh verifier evidence can supersede earlier needs-more-evidence decision', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  json(runtimeState([
    'record-completion',
    '--run-id',
    'run-recovered',
    '--goal-id',
    'goal-recovered',
    '--status',
    'needs_more_evidence',
    '--reason',
    'initial evidence gap',
    '--evidence-json',
    '{}',
    '--identity-json',
    '{"runLeaseId":"lease-recovered"}',
    '--json',
  ], env));
  recordEvidence(env, 'run-recovered', 'goal-recovered', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    activeIdentityPresent: true,
    identityMatches: true,
    identity: { runLeaseId: 'lease-recovered' },
  });

  const result = assess(env, 'run-recovered', 'goal-recovered');
  assert.equal(result.status, 'accepted');
});

test('blocking workflow warnings and worsened evals block accepted completion', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-blocked', 'goal-blocked', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    activeIdentityPresent: true,
    identityMatches: true,
  });
  json(runtimeState([
    'record-event',
    '--run-id',
    'run-blocked',
    '--goal-id',
    'goal-blocked',
    '--event-type',
    'workflow.warning',
    '--severity',
    'blocking',
    '--payload-json',
    '{"reason":"approval-required operation missing approval"}',
    '--json',
  ], env));
  assert.equal(assess(env, 'run-blocked', 'goal-blocked').status, 'rejected');

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    db.prepare(`
      INSERT INTO runs(run_id) VALUES ('run-eval')
      ON CONFLICT(run_id) DO NOTHING
    `).run();
    db.prepare(`
      INSERT INTO goals(run_id, goal_id) VALUES ('run-eval', 'goal-eval')
      ON CONFLICT(run_id, goal_id) DO NOTHING
    `).run();
    db.prepare(`
      INSERT INTO eval_results(eval_id, run_id, goal_id, suite, status, regression_worsened)
      VALUES ('eval-worse', 'run-eval', 'goal-eval', 'completion-authority', 'failed', 1)
    `).run();
  } finally {
    db.close();
  }
  assert.equal(assess(env, 'run-eval', 'goal-eval').status, 'rejected');
});

test('manual accepted writes without approval are downgraded', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  const result = json(runtimeState([
    'record-completion',
    '--run-id',
    'run-manual',
    '--goal-id',
    'goal-manual',
    '--status',
    'accepted',
    '--reason',
    'manual claim',
    '--evidence-json',
    '{"fresh":true}',
    '--identity-json',
    '{"runLeaseId":"manual"}',
    '--json',
  ], env));
  const assessed = assess(env, 'run-manual', 'goal-manual');

  assert.equal(result.status, 'downgraded');
  assert.equal(result.decisionStatus, 'needs_more_evidence');
  assert.equal(assessed.status, 'needs_more_evidence');
});

test('superseded accepted decision no longer satisfies clean finish', async () => {
  const env = await makeEnv();
  json(runtimeState(['init', '--json'], env));

  recordEvidence(env, 'run-super', 'goal-super', {
    fresh: true,
    requiredChecksPassed: true,
    ...fullPassingPlanes(),
    activeIdentityPresent: true,
    identityMatches: true,
    identity: { runLeaseId: 'lease-super' },
  });
  const accepted = assess(env, 'run-super', 'goal-super');
  assert.equal(accepted.status, 'accepted');

  json(runtimeState([
    'supersede-completion',
    '--decision-id',
    accepted.decisionId,
    '--reason',
    'stale evidence',
    '--json',
  ], env));
  const assessed = assess(env, 'run-super', 'goal-super');

  assert.notEqual(assessed.status, 'accepted');
});
