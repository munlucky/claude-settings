import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  compareStableCandidate,
  sourceFingerprint,
} from '../tools/harness-lab/harness-lab.mjs';

const root = process.cwd();
const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeFixtureRepo({ fail = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-harness-lab-fixture-'));
  tempRoots.push(dir);
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
  await writeFile(
    path.join(dir, 'check.mjs'),
    fail
      ? 'console.error("candidate failure"); process.exit(7);\n'
      : 'console.log(JSON.stringify({status:"ok"}));\n',
  );
  return dir;
}

async function makeConfig() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-harness-lab-config-'));
  tempRoots.push(dir);
  const configPath = path.join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    suites: [
      {
        id: 'fixture-contract',
        command: ['<node>', 'check.mjs'],
        timeoutMs: 30_000,
      },
    ],
  }, null, 2));
  return configPath;
}

test('harness lab CLI exposes run and freeze commands', () => {
  const result = spawnSync(process.execPath, ['tools/harness-lab/harness-lab.mjs', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /harness-lab\.mjs run/);
  assert.match(result.stdout, /harness-lab\.mjs freeze/);
});

test('candidate run writes external lab-result authority outside candidate root', async () => {
  const candidateRoot = await makeFixtureRepo();
  const configPath = await makeConfig();
  const outRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-harness-lab-runs-'));
  tempRoots.push(outRoot);

  const result = spawnSync(process.execPath, [
    'tools/harness-lab/harness-lab.mjs',
    'run',
    '--candidate-root',
    candidateRoot,
    '--config',
    configPath,
    '--out',
    outRoot,
    '--run-id',
    'contract-pass',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.issuedBy, 'harness-bootstrap-lab');
  assert.equal(payload.authority, 'external-bootstrap-lab');
  assert.equal(payload.status, 'passed');
  assert.equal(payload.promotable, true);
  assert.equal(payload.candidate.results[0].status, 'passed');
  assert.equal(payload.resultPath.startsWith(candidateRoot), false);
  assert.equal(existsSync(payload.resultPath), true);

  const persisted = JSON.parse(await readFile(payload.resultPath, 'utf8'));
  assert.equal(persisted.runId, 'contract-pass');
  assert.equal(persisted.candidate.results[0].stdout.bytes > 0, true);
});

test('candidate command failure blocks lab promotion', async () => {
  const candidateRoot = await makeFixtureRepo({ fail: true });
  const configPath = await makeConfig();
  const outRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-harness-lab-runs-'));
  tempRoots.push(outRoot);

  const result = spawnSync(process.execPath, [
    'tools/harness-lab/harness-lab.mjs',
    'run',
    '--candidate-root',
    candidateRoot,
    '--config',
    configPath,
    '--out',
    outRoot,
    '--run-id',
    'contract-fail',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'failed');
  assert.equal(payload.promotable, false);
  assert.equal(payload.candidate.results[0].exitCode, 7);
  assert.equal(payload.candidate.results[0].failureClass, 'command_exit');
});

test('stable and candidate differential detects exit-code drift', () => {
  const differential = compareStableCandidate(
    {
      results: [
        { id: 'contract', exitCode: 0 },
      ],
    },
    {
      results: [
        { id: 'contract', exitCode: 7 },
      ],
    },
    [
      { id: 'contract' },
    ],
  );

  assert.deepEqual(differential, [
    {
      suite: 'contract',
      status: 'failed',
      reason: 'exit code changed stable=0 candidate=7',
    },
  ]);
});

test('source fingerprint is available without importing candidate harness modules', async () => {
  const fixtureRoot = await makeFixtureRepo();
  const fingerprint = await sourceFingerprint(fixtureRoot);

  assert.equal(typeof fingerprint.digest, 'string');
  assert.equal(fingerprint.digest.length, 64);
  assert.equal(fingerprint.gitAvailable, false);
});

test('package contract and docs expose the bootstrap lab as shared tooling', async () => {
  const contract = await readFile(path.join(root, 'package', 'package-contract.yaml'), 'utf8');
  const docs = await readFile(path.join(root, 'docs', 'public', 'guidelines', 'harness-bootstrap-lab.md'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assert.match(contract, /tools\/harness-lab\/harness-lab\.mjs/);
  assert.match(docs, /external-bootstrap-lab/);
  assert.match(docs, /npm run test:lab/);
  assert.match(manifest.scripts['test:lab'], /tools\/harness-lab\/harness-lab\.mjs run --candidate-root \. --json/);
});
