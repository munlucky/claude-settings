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
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-commit-closeout-'));
  tempRoots.push(dir);
  return {
    tempRoot: dir,
    env: {
      PHASE_RUNTIME_DB: path.join(dir, 'runtime-state.sqlite'),
      MOONSHOT_RELAY_HOME: dir,
    },
  };
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const run = (args, env = {}) => spawnSync(process.execPath, args, {
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

const readEvents = (dbPath) => {
  const db = new Database(dbPath);
  try {
    return db.prepare('SELECT event_type, severity, payload_json FROM runtime_events ORDER BY event_sequence').all()
      .map((row) => ({
        ...row,
        payload: JSON.parse(row.payload_json),
      }));
  } finally {
    db.close();
  }
};

const countCompletionDecisions = (dbPath) => {
  const db = new Database(dbPath);
  try {
    return db.prepare('SELECT COUNT(*) AS count FROM completion_decisions').get().count;
  } finally {
    db.close();
  }
};

test('commit memory refresh records sanitized runtime events with active identity', async () => {
  const { env } = await makeEnv();

  const result = json(run([
    'scripts/commit-moonshot-memory-refresh.mjs',
    '--project-id',
    'commit-events-project',
    '--mcp-status',
    'ok',
    '--run-id',
    'run-commit-events',
    '--goal-id',
    'goal-commit-events',
    '--workspace-id',
    'workspace-commit-events',
    '--json',
  ], env));
  const events = readEvents(env.PHASE_RUNTIME_DB);

  assert.equal(result.status, 'mcp_ok');
  assert.deepEqual(events.map((event) => event.event_type), [
    'commit.closeout.started',
    'commit.memory_refresh.completed',
  ]);
  assert.equal(events[0].severity, 'info');
  assert.equal(events[1].severity, 'info');
  assert.equal(events[0].payload.auditOnly, false);
  assert.equal(events[1].payload.projectId, 'commit-events-project');
  assert.equal(events[1].payload.status, 'mcp_ok');
  assert.equal(Object.hasOwn(events[1].payload, 'commands'), false);
  assert.equal(Object.hasOwn(events[1].payload, 'storePayload'), false);
});

test('commit promotion audit records counts without raw candidate payloads under audit-only identity', async () => {
  const { env, tempRoot } = await makeEnv();
  const candidatePath = path.join(tempRoot, 'missing-candidates.jsonl');
  const scorecardPath = path.join(tempRoot, 'scorecard.jsonl');

  const result = json(run([
    'scripts/commit-moonshot-promotion-audit.mjs',
    '--project-id',
    'commit-audit-project',
    '--candidate-path',
    candidatePath,
    '--scorecard-path',
    scorecardPath,
    '--json',
  ], env));
  const events = readEvents(env.PHASE_RUNTIME_DB);

  assert.equal(result.status, 'completed');
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'commit.promotion_audit.completed');
  assert.equal(events[0].severity, 'info');
  assert.equal(events[0].payload.auditOnly, true);
  assert.equal(events[0].payload.projectId, 'commit-audit-project');
  assert.deepEqual(events[0].payload.counts, result.counts);
  assert.equal(Object.hasOwn(events[0].payload, 'results'), false);
  assert.equal(Object.hasOwn(events[0].payload, 'candidates'), false);
});

test('commit promotion audit accepts active runtime identity arguments', async () => {
  const { env, tempRoot } = await makeEnv();
  const candidatePath = path.join(tempRoot, 'missing-candidates.jsonl');
  const scorecardPath = path.join(tempRoot, 'scorecard.jsonl');

  const result = json(run([
    'scripts/commit-moonshot-promotion-audit.mjs',
    '--project-id',
    'commit-audit-project',
    '--candidate-path',
    candidatePath,
    '--scorecard-path',
    scorecardPath,
    '--run-id',
    'run-commit-audit',
    '--goal-id',
    'goal-commit-audit',
    '--workspace-id',
    'workspace-commit-audit',
    '--json',
  ], env));
  const events = readEvents(env.PHASE_RUNTIME_DB);

  assert.equal(result.status, 'completed');
  assert.equal(events[0].event_type, 'commit.promotion_audit.completed');
  assert.equal(events[0].payload.auditOnly, false);
  assert.equal(events[0].payload.projectId, 'commit-audit-project');
});

test('commit closeout event helper records staging commit and push taxonomy without completion authority', async () => {
  const { env } = await makeEnv();
  const commonArgs = [
    'scripts/commit-moonshot-closeout-event.mjs',
    '--project-id',
    'commit-git-project',
    '--project-path',
    root,
    '--run-id',
    'run-commit-git',
    '--goal-id',
    'goal-commit-git',
    '--workspace-id',
    'workspace-commit-git',
    '--json',
  ];

  json(run([
    ...commonArgs,
    '--event-type',
    'commit.staging.selected',
    '--payload-json',
    '{"selectedCount":4,"status":"staged","commands":["git add ."],"candidates":[{"path":"raw"}]}',
  ], env));
  json(run([
    ...commonArgs,
    '--event-type',
    'commit.created',
    '--payload-json',
    '{"status":"created","commit":"abc123","message":"test commit","rawMemoryGraph":{"secret":"no"}}',
  ], env));
  json(run([
    ...commonArgs,
    '--event-type',
    'commit.push.skipped',
    '--payload-json',
    '{"reason":"push not requested","remote":"origin"}',
  ], env));
  json(run([
    ...commonArgs,
    '--event-type',
    'commit.push.failed',
    '--payload-json',
    '{"reason":"remote rejected","transcript":"raw git output"}',
  ], env));
  const events = readEvents(env.PHASE_RUNTIME_DB);

  assert.deepEqual(events.map((event) => event.event_type), [
    'commit.staging.selected',
    'commit.created',
    'commit.push.skipped',
    'commit.push.failed',
  ]);
  assert.deepEqual(events.map((event) => event.severity), ['info', 'info', 'info', 'blocking']);
  assert.equal(events[0].payload.auditOnly, false);
  assert.equal(events[0].payload.selectedCount, 4);
  assert.equal(Object.hasOwn(events[0].payload, 'commands'), false);
  assert.equal(Object.hasOwn(events[0].payload, 'candidates'), false);
  assert.equal(Object.hasOwn(events[1].payload, 'rawMemoryGraph'), false);
  assert.equal(Object.hasOwn(events[3].payload, 'transcript'), false);
  assert.equal(countCompletionDecisions(env.PHASE_RUNTIME_DB), 0);
});

test('commit closeout event helper rejects unknown taxonomy entries', async () => {
  const { env } = await makeEnv();
  const result = run([
    'scripts/commit-moonshot-closeout-event.mjs',
    '--project-id',
    'commit-git-project',
    '--event-type',
    'commit.unknown',
    '--json',
  ], env);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown commit closeout event type: commit\.unknown/);
});
