import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  DEFAULT_SUITES,
  compareStableCandidate,
  shouldExcludeGuardPath,
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

async function makeLabEnv(label) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `moonshot-harness-lab-env-${label}-`));
  tempRoots.push(dir);
  return {
    ...process.env,
    MOONSHOT_RELAY_HOME: path.join(dir, 'moonshot-relay'),
    CODEX_HOME: path.join(dir, 'codex'),
    CLAUDE_HOME: path.join(dir, 'claude'),
  };
}

async function writeConfig(suites) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-harness-lab-config-'));
  tempRoots.push(dir);
  const configPath = path.join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({ schemaVersion: 1, suites }, null, 2));
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
    env: await makeLabEnv('contract-pass'),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.issuedBy, 'harness-bootstrap-lab');
  assert.equal(payload.authority, 'external-bootstrap-lab');
  assert.equal(payload.status, 'passed');
  assert.equal(payload.promotable, true);
  assert.equal(payload.schemaVersion, 'moonshot-harness-lab-result.v1');
  assert.equal(payload.accountRootGuard.status, 'passed');
  assert.equal(payload.promotion.status, 'smoke_only');
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
    env: await makeLabEnv('contract-fail'),
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'failed');
  assert.equal(payload.promotable, false);
  assert.equal(payload.candidate.results[0].exitCode, 7);
  assert.equal(payload.candidate.results[0].failureClass, 'command_exit');
});

test('default control-plane suite declares quantitative metrics', () => {
  const controlPlane = DEFAULT_SUITES.find((suite) => suite.id === 'harness-control-plane-eval');

  assert.ok(controlPlane);
  assert.deepEqual(controlPlane.metrics.map((metric) => metric.id), [
    'score',
    'passedCount',
    'failedCount',
    'totalCount',
  ]);
});

test('metric threshold failure blocks lab promotion even when command exits zero', async () => {
  const candidateRoot = await makeFixtureRepo();
  await writeFile(
    path.join(candidateRoot, 'check.mjs'),
    'console.log(JSON.stringify({score:0.5, passedCount:1, failedCount:1, totalCount:2}));\n',
  );
  const configPath = await writeConfig([
    {
      id: 'metric-contract',
      command: ['<node>', 'check.mjs'],
      timeoutMs: 30_000,
      metrics: [
        { id: 'score', path: 'score', direction: 'higher', min: 1, maxRegression: 0, required: true },
      ],
    },
  ]);
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
    'metric-threshold-fail',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: await makeLabEnv('metric-threshold-fail'),
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const suite = payload.candidate.results[0];
  assert.equal(payload.status, 'failed');
  assert.equal(payload.promotable, false);
  assert.equal(suite.exitCode, 0);
  assert.equal(suite.failureClass, 'metric_threshold');
  assert.equal(suite.metricFailures[0].id, 'score');
  assert.equal(payload.quantitative.candidate.failedMetricCount, 1);
});

test('required metric parse failure is classified separately from command exit', async () => {
  const candidateRoot = await makeFixtureRepo();
  await writeFile(path.join(candidateRoot, 'check.mjs'), 'console.log("not json");\n');
  const configPath = await writeConfig([
    {
      id: 'metric-parse-contract',
      command: ['<node>', 'check.mjs'],
      timeoutMs: 30_000,
      metrics: [
        { id: 'score', path: 'score', direction: 'higher', min: 1, required: true },
      ],
    },
  ]);
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
    'metric-parse-fail',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: await makeLabEnv('metric-parse-fail'),
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.candidate.results[0].failureClass, 'stdout_json_parse');
});

test('suite child environment is redirected to lab run homes', async () => {
  const candidateRoot = await makeFixtureRepo();
  await writeFile(path.join(candidateRoot, 'check.mjs'), `
const required = ['MOONSHOT_RELAY_HOME', 'PHASE_RUNTIME_DB', 'CODEX_HOME', 'CLAUDE_HOME', 'HOME', 'USERPROFILE'];
console.log(JSON.stringify(Object.fromEntries(required.map((key) => [key, process.env[key] || '']))));
`);
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
    'env-override',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: await makeLabEnv('env-override'),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const stdout = JSON.parse(await readFile(path.join(payload.runRoot, payload.candidate.results[0].stdout.path), 'utf8'));
  for (const [key, value] of Object.entries(stdout)) {
    assert.match(value, /env-override/);
    assert.match(value, /homes/);
    assert.equal(value.startsWith(payload.runRoot), true, `${key} should stay inside the lab run root`);
  }
});

test('account-root guard ignores live Codex volatile runtime files only', () => {
  const volatilePaths = [
    'models_cache.json',
    '.codex-global-state.json',
    '.codex-global-state.json.tmp',
    'logs_2.sqlite',
    'logs_2.sqlite-wal',
    'logs_2.sqlite-shm',
    'state_5.sqlite',
    'state_5.sqlite-wal',
    'state_5.sqlite-shm',
    'state/cache.sqlite-journal',
  ];
  for (const relativePath of volatilePaths) {
    assert.equal(shouldExcludeGuardPath(relativePath), true, `${relativePath} should be volatile`);
  }

  const durablePaths = [
    'config.toml',
    'AGENTS.md',
    'rules/policy.md',
    'profiles/codex/settings.json',
  ];
  for (const relativePath of durablePaths) {
    assert.equal(shouldExcludeGuardPath(relativePath), false, `${relativePath} should stay protected`);
  }
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

test('stable and candidate differential detects metric regression', () => {
  const differential = compareStableCandidate(
    {
      results: [
        {
          id: 'contract',
          exitCode: 0,
          metrics: [
            { id: 'score', numericValue: 1, direction: 'higher', maxRegression: { absolute: 0, percent: null } },
          ],
        },
      ],
    },
    {
      results: [
        {
          id: 'contract',
          exitCode: 0,
          metrics: [
            { id: 'score', numericValue: 0.5, direction: 'higher', maxRegression: { absolute: 0, percent: null } },
          ],
        },
      ],
    },
    [
      { id: 'contract' },
    ],
  );

  const metric = differential.find((entry) => entry.kind === 'metric');
  assert.equal(metric.status, 'failed');
  assert.equal(metric.failureClass, 'metric_regression');
  assert.equal(metric.metricId, 'score');
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
  assert.match(docs, /Quantitative Gate/);
  assert.match(docs, /Account-Root Isolation/);
  assert.match(docs, /SWE-bench Adapter Contract/);
  assert.match(manifest.scripts['test:lab'], /tools\/harness-lab\/harness-lab\.mjs run --candidate-root \. --json/);
});

test('artifact scorer reports deterministic pass and missing artifact failure', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-artifact-scorer-output-'));
  tempRoots.push(outputRoot);
  await mkdir(path.join(outputRoot, 'planning-loop'), { recursive: true });
  await writeFile(path.join(outputRoot, '00-master-plan-v1.md'), '# Fixture Master Plan\n\n## Objective\n\nPass.\n');
  await writeFile(path.join(outputRoot, '01-phase-v1.md'), '# Fixture Phase 01\n\n## Acceptance Criteria\n\nPass.\n');
  await writeFile(path.join(outputRoot, 'planning-loop', 'plan-quality-review-iter-01.yaml'), 'schemaVersion: 1\nreviewedPackageRoot: fixture\n');

  const pass = spawnSync(process.execPath, [
    'tools/evals/artifact-scorer.mjs',
    'score',
    '--manifest',
    'tests/fixtures/harness-improvement-loop/fixture-manifest.json',
    '--fixture-id',
    'plan-package-minimal-valid',
    '--output-root',
    outputRoot,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(pass.status, 0, pass.stderr || pass.stdout);
  const passPayload = JSON.parse(pass.stdout);
  assert.equal(passPayload.schemaVersion, 'moonshot-artifact-scorer-result.v1');
  assert.equal(passPayload.fixtureId, 'plan-package-minimal-valid');
  assert.equal(passPayload.metrics.missingRequiredCount, 0);

  const fail = spawnSync(process.execPath, [
    'tools/evals/artifact-scorer.mjs',
    'score',
    '--manifest',
    'tests/fixtures/harness-improvement-loop/fixture-manifest.json',
    '--fixture-id',
    'plan-package-missing-scorecard',
    '--output-root',
    outputRoot,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(fail.status, 1, fail.stderr || fail.stdout);
  const failPayload = JSON.parse(fail.stdout);
  assert.equal(failPayload.failures[0].failureClass, 'artifact_missing');
});

test('SWE-bench adapter fake contract records real execution deferral', async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-swe-adapter-'));
  tempRoots.push(outRoot);

  const result = spawnSync(process.execPath, [
    'tools/adapters/swe-bench-adapter.mjs',
    'run-fake',
    '--fixture',
    'tests/fixtures/harness-improvement-loop/fake-swe-bench-task.json',
    '--out',
    outRoot,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'moonshot-swe-bench-adapter-result.v1');
  assert.equal(payload.realExecutionEnabled, false);
  assert.equal(payload.phaseStatus, 'phase_gated_real_execution_deferred');
  assert.equal(payload.metrics.resolved, 1);
});
