import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

import { resolveDbPath } from '../scripts/lib/runtime-state-db-path.mjs';
import { activeGate } from './helpers/active-gate.mjs';

const root = process.cwd();
const tempRoots = [];

const makeTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-runtime-state-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runRuntimeState = (args, env = {}) => spawnSync(process.execPath, [
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

const parseJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

test('runtime-state init is idempotent and configures sqlite pragmas', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };

  const first = parseJson(runRuntimeState(['init', '--json'], env));
  const second = parseJson(runRuntimeState(['init', '--json'], env));

  assert.equal(first.status, 'initialized');
  assert.equal(second.status, 'initialized');
  assert.equal(first.dbPath, resolveDbPath(dbPath));
  assert.equal(second.dbPath, resolveDbPath(dbPath));
  assert.equal(existsSync(dbPath), true);

  const db = new Database(dbPath);
  try {
    const migrations = db.prepare('select version, name from schema_migrations order by version').all();
    assert.deepEqual(migrations, [{ version: 1, name: 'runtime-control-plane-v1' }]);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);

    for (const table of [
      'runs',
      'goals',
      'runtime_events',
      'completion_decisions',
      'resume_snapshots',
      'tool_calls',
      'eval_results',
      'memory_promotion_decisions',
    ]) {
      assert.ok(db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table), `${table} should exist`);
    }
  } finally {
    db.close();
  }
});

test('runtime-state cli commands return parseable durable json', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const runId = 'run-cli-contract';
  const goalId = 'goal-cli-contract';

  parseJson(runRuntimeState(['init', '--json'], env));
  const lease = parseJson(runRuntimeState([
    'acquire-run-lease',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--workspace-id',
    'workspace-cli-contract',
    '--json',
  ], env));
  const event = parseJson(runRuntimeState([
    'record-event',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--event-type',
    'contract.started',
    '--payload-json',
    '{"phase":"02"}',
    '--workspace-id',
    'workspace-cli-contract',
    '--json',
  ], env));
  const completion = parseJson(runRuntimeState([
    'record-completion',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--status',
    'needs_more_evidence',
    '--reason',
    'contract red path',
    '--evidence-json',
    '{"command":"node --test"}',
    '--identity-json',
    '{"agent":"contract"}',
    '--json',
  ], env));
  const snapshot = parseJson(runRuntimeState([
    'snapshot-resume',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--status-json',
    '{"phase":"02","status":"running"}',
    '--resume-brief-json',
    '{"nextAction":"continue","currentBlocker":"","lineage":["phase-02"]}',
    '--json',
  ], env));
  const assessed = parseJson(runRuntimeState([
    'assess-completion',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));
  const status = parseJson(runRuntimeState([
    'status',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));

  assert.match(event.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(lease.status, 'acquired');
  assert.equal(lease.workspaceId, 'workspace-cli-contract');
  assert.equal(event.eventSequence, 1);
  assert.match(completion.decisionId, /^[0-9a-f-]{36}$/);
  assert.equal(completion.decisionSequence, 1);
  assert.match(snapshot.snapshotId, /^[0-9a-f-]{36}$/);
  assert.equal(snapshot.snapshotSequence, 1);
  assert.equal(assessed.status, 'needs_more_evidence');
  assert.equal(status.runtimeCapabilityStatus.status, 'available');
  assert.ok(status.runtimeCapabilityStatus.activeRuns.some((run) => run.run_id === runId && run.workspace_id === 'workspace-cli-contract'));
  assert.equal(status.compactStatus.currentBlocker, 'contract red path');
  assert.equal(status.resumeBrief.nextAction, 'continue');
});

test('runtime-state records concurrent events with monotonic ordering', async () => {
  const tempRoot = await makeTempRoot();
  const dbPath = path.join(tempRoot, 'runtime-state.sqlite');
  const env = { PHASE_RUNTIME_DB: dbPath };
  const runId = 'run-concurrent-contract';
  const goalId = 'goal-concurrent-contract';

  parseJson(runRuntimeState(['init', '--json'], env));
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => new Promise((resolve) => {
    resolve(runRuntimeState([
      'record-event',
      '--run-id',
      runId,
      '--goal-id',
      goalId,
      '--event-type',
      'contract.concurrent',
      '--payload-json',
      `{"index":${index}}`,
      '--json',
    ], env));
  })));

  const sequences = results.map((result) => parseJson(result).eventSequence).sort((a, b) => a - b);
  assert.deepEqual(sequences, [1, 2, 3, 4, 5, 6]);
});

test('runtime-state reports typed degraded status when native sqlite support is unavailable', async () => {
  const tempRoot = await makeTempRoot();
  const result = parseJson(runRuntimeState([
    'status',
    '--run-id',
    'run-native-missing-contract',
    '--goal-id',
    'goal-native-missing-contract',
    '--json',
  ], {
    PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite'),
    MOONSHOT_RUNTIME_STATE_DISABLE_NATIVE: '1',
  }));

  assert.equal(result.runtimeCapabilityStatus.status, 'degraded');
  assert.equal(result.runtimeCapabilityStatus.reason, 'missing_native_module');
  assert.match(result.runtimeCapabilityStatus.recoveryHint, /runtime dependencies/i);
  assert.equal(result.resumeBrief.nextAction, result.runtimeCapabilityStatus.recoveryHint);
  assert.equal(result.compactStatus.currentBlocker, 'runtime-state unavailable: missing_native_module');
});

test('runtime-state source is packaged and generated sqlite files are excluded', async () => {
  const packageResult = spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'all',
    '--dry-run',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  const payload = parseJson(packageResult);
  const plannedFrom = payload.runtimes.flatMap((runtime) => runtime.planned.map((entry) => entry.from));
  const plannedTo = payload.runtimes.flatMap((runtime) => runtime.planned.map((entry) => entry.to));

  assert.ok(plannedFrom.includes('scripts/runtime-state.mjs'));
  assert.ok(plannedFrom.includes('scripts/lib/runtime-state-store.mjs'));
  assert.ok(plannedFrom.includes('scripts/lib/runtime-state-db-path.mjs'));
  assert.equal(plannedTo.some((target) => /runtime-state\.sqlite(?:-wal|-shm)?$/.test(target)), false);
});

test('materialized runtime-state support has native sqlite authority when runtime dependencies are packaged', async () => {
  const materializedRoot = await makeTempRoot();
  const moonshotHome = await makeTempRoot();
  const packageResult = spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'moonshot-relay',
    '--out',
    materializedRoot,
    '--clean',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(packageResult.status, 0, packageResult.stderr || packageResult.stdout);

  const runtimeStateScript = path.join(materializedRoot, 'moonshot-relay', 'profile', 'scripts', 'runtime-state.mjs');
  const result = spawnSync(process.execPath, [
    runtimeStateScript,
    'status',
    '--run-id',
    'run-materialized-contract',
    '--goal-id',
    'goal-materialized-contract',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MOONSHOT_RELAY_HOME: moonshotHome,
      PHASE_RUNTIME_DB: '',
      NODE_PATH: '',
    },
  });
  const payload = parseJson(result);
  const expectedDbPath = path.join(
    moonshotHome,
    'state',
    'projects',
    'munlucky-moonshot-relay',
    'knowledge',
    'runtime-state.sqlite',
  );

  assert.equal(payload.runtimeCapabilityStatus.status, 'available');
  assert.equal(payload.runtimeCapabilityStatus.dbPath, expectedDbPath);
  assert.equal(existsSync(expectedDbPath), true);
  assert.equal(payload.compactStatus.latestVerdict, null);
});

test('runtime control-plane contract is included in the active npm gate', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(activeGate(manifest), /tests\/runtime-control-plane-contract\.test\.mjs/);
});
