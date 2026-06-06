import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import Database from 'better-sqlite3';

const root = process.cwd();
const tempRoots = [];

const makeTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-sandbox-plane-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runSandbox = (args, env = {}) => spawnSync(process.execPath, [
  'tools/sandbox/policy.mjs',
  ...args,
  '--json',
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...env,
  },
});

const runRuntimeState = (args, env = {}) => spawnSync(process.execPath, [
  'scripts/runtime-state.mjs',
  ...args,
  '--json',
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

test('protected path writes are blocked and recorded as runtime blockers', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const blocked = parseJson(runSandbox([
    'check',
    '--operation',
    'write',
    '--path',
    path.join(tempRoot, '.claude', 'settings.json'),
    '--run-id',
    'run-sandbox-protected',
    '--goal-id',
    'goal-sandbox-protected',
  ], env));

  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.protectedPath, true);
  assert.match(blocked.reason, /protected path fragment/);

  const assessed = parseJson(runRuntimeState([
    'assess-completion',
    '--run-id',
    'run-sandbox-protected',
    '--goal-id',
    'goal-sandbox-protected',
  ], env));
  assert.equal(assessed.status, 'rejected');
  assert.match(assessed.reason, /protected path fragment/);
});

test('approval-required operations block without approval and pass with approval id', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const categories = [
    'destructive_file',
    'dependency_install',
    'network',
    'external_write',
    'account_root_install_sync',
    'generated_state_promotion',
  ];

  for (const category of categories) {
    const blocked = parseJson(runSandbox([
      'check',
      '--operation',
      category,
      '--path',
      path.join(tempRoot, 'workspace', `${category}.txt`),
      '--run-id',
      `run-${category}`,
      '--goal-id',
      `goal-${category}`,
    ], env));
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.approvalRequired, true);
    assert.match(blocked.reason, new RegExp(`missing approval for ${category}`));

    const allowed = parseJson(runSandbox([
      'check',
      '--operation',
      category,
      '--path',
      path.join(tempRoot, 'workspace', `${category}.txt`),
      '--approval-id',
      `approval-${category}`,
    ], env));
    assert.equal(allowed.status, 'allowed');
  }
}
);

test('leased sandbox cleanup discards compute state while runtime evidence remains', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const lease = parseJson(runSandbox([
    'lease',
    '--root',
    path.join(tempRoot, 'leases'),
    '--run-id',
    'run-sandbox-lease',
  ], env));
  const artifact = path.join(lease.artifactRoot, 'evidence.txt');
  await writeFile(artifact, 'sandbox evidence\n', 'utf8');

  parseJson(runRuntimeState([
    'record-event',
    '--run-id',
    'run-sandbox-lease',
    '--goal-id',
    'goal-sandbox-lease',
    '--event-type',
    'sandbox.artifact',
    '--payload-json',
    JSON.stringify({ artifact: 'evidence.txt', leaseRoot: lease.leaseRoot }),
  ], env));
  assert.equal(existsSync(artifact), true);

  const cleaned = parseJson(runSandbox([
    'cleanup',
    '--lease-root',
    lease.leaseRoot,
  ], env));
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(existsSync(lease.leaseRoot), false);

  const db = new Database(env.PHASE_RUNTIME_DB);
  try {
    const event = db.prepare("SELECT * FROM runtime_events WHERE event_type = 'sandbox.artifact'").get();
    assert.ok(event);
  } finally {
    db.close();
  }
});

test('sandbox artifacts are excluded from package payloads', async () => {
  const contract = await readFile(path.join(root, 'package/package-contract.yaml'), 'utf8');
  const dryRun = parseJson(spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'all',
    '--dry-run',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  }));
  const plannedTo = dryRun.runtimes.flatMap((runtime) => runtime.planned.map((entry) => entry.to));

  assert.match(contract, /sandbox-artifacts/);
  assert.equal(plannedTo.some((target) => target.includes('sandbox-artifacts')), false);
});
