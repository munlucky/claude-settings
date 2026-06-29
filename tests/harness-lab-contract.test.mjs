import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  DEFAULT_SUITES,
  buildCompareReport,
  buildContainerPolicyAudit,
  compareStableCandidate,
  promoteBaseline,
  normalizePromotionPolicy,
  rollbackBaseline,
  shouldExcludeGuardPath,
  shouldRerunBaseline,
  sourceFingerprint,
} from '../tools/harness-lab/harness-lab.mjs';
import {
  buildCandidateSummaryArtifact,
  buildBaselineRefreshReadiness,
  buildCloseoutReceipt,
  closeoutExitCode,
  deriveInstallStatus,
  dockerScript,
  dockerRunHardeningArgs,
  dockerRunHardeningPolicy,
  normalizeCalibrationBaselineFixtureIdentity,
  normalizeInstalledRuntimeSmoke,
  patchDockerLabResult,
  prepareDockerScript,
  revalidateCloseoutReceipt,
  rewriteContainerPaths,
  scanAuthArtifacts,
  selectAutoLifecycle,
  shouldExcludeSourceSnapshotPath,
} from '../tools/harness-lab/harness-loop.mjs';

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

  assert.equal(differential.length, 1);
  assert.equal(differential[0].suite, 'contract');
  assert.equal(differential[0].status, 'failed');
  assert.equal(differential[0].failureClass, 'artifact_contract_break');
  assert.equal(differential[0].reason, 'exit code changed stable=0 candidate=7');
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
  assert.equal(metric.failureClass, 'score_drop');
  assert.equal(metric.metricId, 'score');
});

test('freeze writes immutable baseline artifact manifest contract', async () => {
  const sourceRoot = await makeFixtureRepo();
  await writeFile(path.join(sourceRoot, 'package.json'), '{"name":"fixture-freeze","version":"1.0.0","type":"module","files":["check.mjs"]}\n');
  const outRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-baseline-freeze-'));
  tempRoots.push(outRoot);

  const result = spawnSync(process.execPath, [
    'tools/harness-lab/harness-lab.mjs',
    'freeze',
    '--source-root',
    sourceRoot,
    '--out',
    outRoot,
    '--version',
    'baseline-0001',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: await makeLabEnv('freeze'),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'moonshot-harness-baseline-artifact.v1');
  assert.equal(payload.authority, 'external-bootstrap-lab');
  assert.equal(payload.baselineId, 'baseline-0001');
  assert.equal(payload.artifact.kind, 'npm_pack');
  assert.equal(payload.artifact.sha256.length, 64);
  assert.equal(existsSync(payload.releasePath), true);
});

test('fixture identity mismatch blocks improvement claim', () => {
  const differential = compareStableCandidate(
    {
      results: [
        {
          id: 'contract',
          exitCode: 0,
          metrics: [
            {
              id: 'score',
              numericValue: 1,
              direction: 'higher',
              maxRegression: { absolute: 0, percent: null },
              fixtureSetId: 'set-a',
              fixtureId: 'same-fixture',
              inputHash: 'sha256:a',
            },
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
            {
              id: 'score',
              numericValue: 1,
              direction: 'higher',
              maxRegression: { absolute: 0, percent: null },
              fixtureSetId: 'set-b',
              fixtureId: 'same-fixture',
              inputHash: 'sha256:a',
            },
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
  assert.equal(metric.failureClass, 'fixture_identity_mismatch');
});

test('normalized grader metadata is emitted for blocking metrics', async () => {
  const candidateRoot = await makeFixtureRepo();
  await writeFile(path.join(candidateRoot, 'check.mjs'), 'console.log(JSON.stringify({score:1}));\n');
  const configPath = await writeConfig([
    {
      id: 'grader-contract',
      command: ['<node>', 'check.mjs'],
      timeoutMs: 30_000,
      fixtureSetId: 'fixture-set-v1',
      fixtureId: 'fixture-001',
      inputHash: 'sha256:fixture',
      scorerVersion: 'scorer-v1',
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
    'grader-contract',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: await makeLabEnv('grader-contract'),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const metric = payload.candidate.results[0].metrics[0];
  assert.equal(metric.fixtureSetId, 'fixture-set-v1');
  assert.equal(metric.fixtureId, 'fixture-001');
  assert.equal(metric.inputHash, 'sha256:fixture');
  assert.equal(metric.normalizedScore, 1);
  assert.equal(metric.threshold, 1);
  assert.equal(metric.verdict, 'pass');
});

test('compare report classifies new failed task, score drop, and fixture mismatch', () => {
  const baseline = {
    runId: 'baseline-run',
    run: { candidateRunId: 'baseline-candidate', fixtureSetId: 'set-a', scorerVersion: 'scorer-v1' },
    candidate: {
      results: [
        {
          id: 'contract',
          exitCode: 0,
          status: 'passed',
          metrics: [
            {
              id: 'score',
              numericValue: 1,
              normalizedScore: 1,
              direction: 'higher',
              maxRegression: { absolute: 0, percent: null },
              fixtureSetId: 'set-a',
              fixtureId: 'fixture',
              inputHash: 'sha256:a',
              scorerVersion: 'scorer-v1',
              status: 'passed',
            },
          ],
        },
      ],
    },
    suites: [{ id: 'contract' }],
  };
  const candidate = {
    runId: 'candidate-run',
    run: { candidateRunId: 'candidate-candidate', fixtureSetId: 'set-b', scorerVersion: 'scorer-v1' },
    candidate: {
      results: [
        {
          id: 'contract',
          exitCode: 7,
          status: 'failed',
          metrics: [
            {
              id: 'score',
              numericValue: 0.5,
              normalizedScore: 0.5,
              direction: 'higher',
              maxRegression: { absolute: 0, percent: null },
              fixtureSetId: 'set-b',
              fixtureId: 'fixture',
              inputHash: 'sha256:a',
              scorerVersion: 'scorer-v1',
              status: 'passed',
            },
          ],
        },
      ],
    },
    suites: [{ id: 'contract' }],
    accountRootGuard: { status: 'passed' },
  };

  const report = buildCompareReport({ baselineResult: baseline, candidateResult: candidate });
  const failureClasses = report.regressions.map((entry) => entry.failureClass);
  assert.equal(report.status, 'failed');
  assert.equal(failureClasses.includes('new_failed_task'), true);
  assert.equal(failureClasses.includes('score_drop'), true);
  assert.equal(failureClasses.includes('fixture_identity_mismatch'), true);
});

test('compare report normalizes legacy metric counts without false score drop', () => {
  const baseline = {
    runId: 'legacy-baseline-run',
    run: { candidateRunId: 'legacy-baseline' },
    candidate: {
      results: [
        {
          id: 'harness-control-plane-eval',
          exitCode: 0,
          status: 'passed',
          metrics: [
            { id: 'score', numericValue: 1, direction: 'higher', min: 1, status: 'passed', failureClass: 'none' },
            { id: 'passedCount', numericValue: 14, direction: 'higher', status: 'passed', failureClass: 'none' },
            { id: 'failedCount', numericValue: 0, direction: 'lower', max: 0, status: 'passed', failureClass: 'none' },
            { id: 'totalCount', numericValue: 14, direction: 'higher', status: 'passed', failureClass: 'none' },
          ],
        },
      ],
    },
    suites: [{ id: 'harness-control-plane-eval' }],
  };
  const candidate = {
    runId: 'candidate-run',
    run: { candidateRunId: 'candidate' },
    candidate: {
      results: [
        {
          id: 'harness-control-plane-eval',
          exitCode: 0,
          status: 'passed',
          metrics: [
            { id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', min: 1, status: 'passed', failureClass: 'none' },
            { id: 'passedCount', numericValue: 14, normalizedScore: 1, direction: 'higher', status: 'passed', failureClass: 'none' },
            { id: 'failedCount', numericValue: 0, normalizedScore: 1, direction: 'lower', max: 0, status: 'passed', failureClass: 'none' },
            { id: 'totalCount', numericValue: 14, normalizedScore: 1, direction: 'higher', status: 'passed', failureClass: 'none' },
          ],
        },
      ],
    },
    suites: [{ id: 'harness-control-plane-eval' }],
    accountRootGuard: { status: 'passed' },
  };

  const report = buildCompareReport({ baselineResult: baseline, candidateResult: candidate });

  assert.equal(report.status, 'passed');
  assert.equal(report.regressions.some((entry) => entry.failureClass === 'score_drop'), false);
});

test('fixture identity completeness blocks one-sided identity evidence', () => {
  const baseline = {
    runId: 'baseline-run',
    run: { candidateRunId: 'baseline-id' },
    candidate: {
      results: [{
        id: 'contract',
        exitCode: 0,
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', status: 'passed' }],
      }],
    },
    suites: [{ id: 'contract' }],
  };
  const candidate = {
    runId: 'candidate-run',
    run: { candidateRunId: 'candidate-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      results: [{
        id: 'contract',
        exitCode: 0,
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', fixtureSetId: 'set', fixtureId: 'fixture', inputHash: 'sha256:fixture', scorerVersion: 'scorer', status: 'passed' }],
      }],
    },
    suites: [{ id: 'contract' }],
    accountRootGuard: { status: 'passed' },
  };

  const report = buildCompareReport({ baselineResult: baseline, candidateResult: candidate });

  assert.equal(report.status, 'failed');
  assert.equal(report.fixtureIdentity.matches, false);
  assert.equal(report.fixtureIdentity.completeness.complete, false);
  assert.equal(report.regressions.some((entry) => entry.failureClass === 'fixture_identity_incomplete'), true);
});

test('fixture identity completeness passes matching complete identity', () => {
  const baseline = {
    runId: 'baseline-run',
    run: { candidateRunId: 'baseline-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      results: [{
        id: 'contract',
        exitCode: 0,
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', fixtureSetId: 'set', fixtureId: 'fixture', inputHash: 'sha256:fixture', scorerVersion: 'scorer', status: 'passed' }],
      }],
    },
    suites: [{ id: 'contract' }],
  };
  const candidate = structuredClone(baseline);
  candidate.runId = 'candidate-run';
  candidate.run.candidateRunId = 'candidate-id';
  candidate.accountRootGuard = { status: 'passed' };

  const report = buildCompareReport({ baselineResult: baseline, candidateResult: candidate });

  assert.equal(report.status, 'passed');
  assert.equal(report.fixtureIdentity.matches, true);
  assert.equal(report.fixtureIdentity.completeness.complete, true);
});

test('fixture identity completeness requires input hash on both sides', () => {
  const baseline = {
    runId: 'baseline-run',
    run: { candidateRunId: 'baseline-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      results: [{
        id: 'contract',
        exitCode: 0,
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', fixtureSetId: 'set', fixtureId: 'fixture', scorerVersion: 'scorer', status: 'passed' }],
      }],
    },
    suites: [{ id: 'contract' }],
  };
  const candidate = structuredClone(baseline);
  candidate.runId = 'candidate-run';
  candidate.run.candidateRunId = 'candidate-id';
  candidate.accountRootGuard = { status: 'passed' };

  const report = buildCompareReport({ baselineResult: baseline, candidateResult: candidate });

  assert.equal(report.status, 'failed');
  assert.equal(report.fixtureIdentity.completeness.complete, false);
  assert.deepEqual(report.fixtureIdentity.completeness.baseline.missingFields, ['inputHash']);
  assert.equal(report.regressions.some((entry) => entry.failureClass === 'fixture_identity_incomplete'), true);
});

test('promotion policy separates no-regression from strict improvement', () => {
  const baseline = {
    runId: 'baseline-run',
    run: { candidateRunId: 'baseline-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      results: [{
        id: 'contract',
        exitCode: 0,
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', fixtureSetId: 'set', fixtureId: 'fixture', inputHash: 'sha256:fixture', scorerVersion: 'scorer', status: 'passed' }],
      }],
    },
    suites: [{ id: 'contract' }],
  };
  const candidate = {
    runId: 'candidate-run',
    run: { candidateRunId: 'candidate-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      results: [{
        id: 'contract',
        exitCode: 0,
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, normalizedScore: 1, direction: 'higher', fixtureSetId: 'set', fixtureId: 'fixture', inputHash: 'sha256:fixture', scorerVersion: 'scorer', status: 'passed' }],
      }],
    },
    suites: [{ id: 'contract' }],
    accountRootGuard: { status: 'passed' },
  };

  const noRegression = buildCompareReport({ baselineResult: baseline, candidateResult: candidate });
  assert.equal(noRegression.status, 'passed');
  assert.equal(noRegression.promotionPolicy.mode, 'no_regression');
  assert.equal(noRegression.promotionPolicy.minDelta, 0);

  const strict = buildCompareReport({
    baselineResult: baseline,
    candidateResult: candidate,
    promotionPolicy: { mode: 'strict_improvement', configSource: 'test' },
  });
  assert.equal(strict.status, 'failed');
  assert.equal(strict.promotionPolicy.mode, 'strict_improvement');
  assert.equal(strict.regressions.some((entry) => entry.failureClass === 'insufficient_improvement'), true);

  const positiveBaseline = structuredClone(baseline);
  positiveBaseline.candidate.results[0].metrics[0].normalizedScore = 0.98;
  positiveBaseline.candidate.results[0].metrics[0].numericValue = 0.98;
  const positive = structuredClone(candidate);
  positive.candidate.results[0].metrics[0].normalizedScore = 1.02;
  positive.candidate.results[0].metrics[0].numericValue = 1.02;
  const strictPass = buildCompareReport({
    baselineResult: positiveBaseline,
    candidateResult: positive,
    promotionPolicy: { mode: 'strict_improvement', minDelta: 0.01, configSource: 'test' },
  });
  assert.equal(strictPass.status, 'passed');
  assert.equal(strictPass.promotionPolicy.scoreDelta > 0.01, true);
  assert.equal(normalizePromotionPolicy({ mode: 'strict_improvement' }).minDelta, 0.01);
  assert.throws(
    () => normalizePromotionPolicy({ mode: 'strict_improvement', minDelta: 0 }),
    /positive min delta/,
  );
});

test('container policy audit forbids baseline output, docker socket, live roots, and publishing', () => {
  const report = buildContainerPolicyAudit();

  assert.equal(report.schemaVersion, 'moonshot-harness-container-policy.v1');
  assert.equal(report.status, 'passed');
  assert.equal(report.imagePublication.attempted, false);
  assert.equal(report.candidateContainer.forbiddenMounts.includes('host docker socket'), true);
  assert.equal(report.candidateContainer.forbiddenMounts.includes('baselines/**'), true);
  assert.equal(report.candidateContainer.forbiddenMounts.includes('live account roots'), true);
  assert.equal(report.candidateContainer.forbiddenMounts.includes('host Codex auth'), true);
  assert.equal(report.checks.some((entry) => entry.id === 'candidate_no_host_codex_auth_mount'), true);
});

test('docker prepare script copies source and installs dependencies before strict run', () => {
  const script = prepareDockerScript();

  assert.match(script, /tar --exclude="\.\//);
  assert.match(script, /--exclude="\.\/node_modules"/);
  assert.match(script, /--exclude="\.\/\.moonshot-relay"/);
  assert.match(script, /-C '\/harness-source' -cf - \. \| tar -C '\/prepared\/workspace' -xf -/);
  assert.match(script, /cd '\/prepared\/workspace'/);
  assert.match(script, /npm ci --no-audit --no-fund/);
  assert.match(script, /npm install --prefix '\/prepared\/codex-cli' '\/codex-cache\/openai-codex-0\.128\.0\.tgz' '@openai\/codex-linux-x64@file:\/codex-cache\/openai-codex-0\.128\.0-linux-x64\.tgz'/);
  assert.match(script, /'\/prepared\/codex-cli\/node_modules\/\.bin\/codex' --version > '\/prepared\/codex-cli-version\.txt'/);
});

test('docker loop script runs the lab from prepared read-only workspace', () => {
  const script = dockerScript('candidate-contract');

  assert.match(script, /test -d \/workspace\/node_modules/);
  assert.match(script, /test -x '\/harness-codex-cli\/node_modules\/\.bin\/codex'/);
  assert.match(script, /export PATH='\/harness-codex-cli\/node_modules\/\.bin':\$PATH/);
  assert.match(script, /export HARNESS_LAB_CODEX_BIN='\/harness-codex-cli\/node_modules\/\.bin\/codex'/);
  assert.doesNotMatch(script, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(script, /npm install -g/);
  assert.doesNotMatch(script, /tar --exclude/);
  assert.match(script, /codex --version > '\/harness-run\/output\/candidate-contract\/codex-cli-version\.txt'/);
  assert.match(script, /bin\/moonshot-relay\.mjs install --runtime all/);
  assert.match(script, /--moonshot-home '\/harness-run\/homes\/candidate-contract\/candidate\/moonshot-relay'/);
  assert.match(script, /--codex-home '\/harness-run\/homes\/candidate-contract\/candidate\/codex'/);
  assert.match(script, /--claude-home '\/harness-run\/homes\/candidate-contract\/candidate\/claude'/);
  assert.match(script, /> '\/harness-run\/output\/candidate-contract\/install-result\.json'/);
  assert.match(script, /cp package\/profile-templates\/codex\/\.codex\/config\.toml '\/harness-run\/homes\/candidate-contract\/candidate\/codex\/config\.toml'/);
  assert.match(script, /export MOONSHOT_RELAY_HOME='\/harness-run\/homes\/candidate-contract\/candidate\/moonshot-relay'/);
  assert.match(script, /export CODEX_HOME='\/harness-run\/homes\/candidate-contract\/candidate\/codex'/);
  assert.match(script, /export PHASE_RUNTIME_DB='\/harness-run\/homes\/candidate-contract\/candidate\/runtime-state\.sqlite'/);
  assert.match(script, /export NODE_PATH='\/workspace\/node_modules'/);
  assert.match(script, /export HARNESS_LAB_REQUIRE_CODEX_CONFIG='1'/);
  assert.match(script, /moonshot-relay\/scripts\/runtime-state\.mjs' status --json > '\/harness-run\/output\/candidate-contract\/installed-runtime-smoke\.json'/);
  assert.match(script, /codex-cli-smoke\.mjs --out '\/harness-run\/output\/candidate-contract\/codex-cli-smoke\.json'/);
  assert.match(script, /harness-lab\.mjs run --candidate-root \/workspace/);
  assert.match(script, /--out \/harness-run\/output/);
  assert.match(script, /--run-id 'candidate-contract'/);
});

test('docker loop auth mode copies host Codex credentials only into ephemeral container home', () => {
  const script = dockerScript('auth-contract', { useHostCodexAuth: true, codexDevSmoke: true, runHarnessLab: false });

  assert.match(script, /cp '\/codex-auth-source\/auth\.json' '\/harness-run\/homes\/auth-contract\/candidate\/codex\/auth\.json'/);
  assert.match(script, /chmod 600 '\/harness-run\/homes\/auth-contract\/candidate\/codex\/auth\.json'/);
  assert.match(script, /awk 'BEGIN\{in_root=1\}/);
  assert.match(script, /model\|model_provider\|model_reasoning_effort/);
  assert.match(script, /'\/codex-auth-source\/config\.toml' > '\/harness-run\/homes\/auth-contract\/candidate\/codex\/config\.toml'/);
  assert.match(script, /cat package\/profile-templates\/codex\/\.codex\/config\.toml >> '\/harness-run\/homes\/auth-contract\/candidate\/codex\/config\.toml'/);
  assert.match(script, /export HARNESS_LAB_REQUIRE_CODEX_AUTH='1'/);
  assert.doesNotMatch(script, /harness-lab\.mjs run --candidate-root/);
  assert.match(script, /auth-smoke-summary\.json/);
  assert.doesNotMatch(script, /\/harness-run\/output\/auth-contract\/homes\/candidate\/codex\/auth\.json/);
});

test('docker run hardening applies executable defaults and records policy exceptions', () => {
  const args = dockerRunHardeningArgs();
  assert.deepEqual(args.slice(0, 3), ['--init', '--read-only', '--cap-drop']);
  assert.equal(args.includes('ALL'), true);
  assert.equal(args.includes('--cap-add'), true);
  assert.equal(args.includes('CHOWN'), true);
  assert.equal(args.includes('FOWNER'), true);
  assert.equal(args.includes('no-new-privileges'), true);
  assert.equal(args.includes('--pids-limit'), true);
  assert.equal(args.includes('/tmp:rw,nosuid,nodev,size=512m'), true);
  assert.equal(args.includes('/harness-run/homes:rw,exec,nosuid,nodev,size=1024m'), true);
  assert.deepEqual(args.slice(-2), ['--network', 'none']);

  const onlineArgs = dockerRunHardeningArgs({ networkMode: 'bridge' });
  assert.deepEqual(onlineArgs.slice(-2), ['--network', 'bridge']);

  const policy = dockerRunHardeningPolicy();
  assert.equal(policy.schemaVersion, 'moonshot-harness-docker-hardening.v1');
  assert.equal(policy.readOnlyRootFilesystem, true);
  assert.equal(policy.noNewPrivileges, true);
  assert.deepEqual(policy.capDrop, ['ALL']);
  assert.deepEqual(policy.capAdd, ['CHOWN', 'FOWNER']);
  assert.equal(policy.networkMode, 'none');
  assert.equal(policy.networkIsolation, true);
  assert.match(policy.networkIsolationReason, /separate prepare container/);
  assert.match(policy.readOnlyRootFilesystemReason, /native runtime modules/);
  assert.equal(policy.preparePhase.readOnlyRootFilesystem, false);
  assert.match(policy.preparePhase.purpose, /npm ci/);
});

test('docker loop dev smoke runs model-backed codex exec only when requested', () => {
  const defaultScript = dockerScript('candidate-contract');
  assert.doesNotMatch(defaultScript, /codex-dev-smoke\.json/);
  assert.doesNotMatch(defaultScript, /dangerously-bypass-approvals-and-sandbox/);

  const script = dockerScript('auth-contract', { useHostCodexAuth: true, codexDevSmoke: true, runHarnessLab: false });
  assert.match(script, /codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox/);
  assert.match(script, /codex-dev-smoke\.log/);
  assert.match(script, /codex-dev-smoke\.json/);
  assert.match(script, /model-backed-codex-exec-can-write-in-container-workspace/);
  assert.match(script, /separate auth-smoke stage/);
  assert.doesNotMatch(script, /auth\.json.*harness-run\/output/);
});

test('candidate loop summary artifact captures compare and promotion authority paths', () => {
  const summary = buildCandidateSummaryArtifact({
    status: 'passed',
    promotable: true,
    lifecyclePath: 'candidate_only',
    previousBaselineId: 'baseline-0001',
    backend: { type: 'docker', image: 'moonshot-relay-harness-lab:local' },
    runId: 'candidate-0002',
    candidateResultPath: 'runs/candidate-0002/lab-result.json',
    compareReportPath: 'compare/candidate-0002-vs-baseline-0001.json',
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
    calibration: { status: 'baseline_reuse_allowed', rerunBaseline: false, reasons: [] },
    closeoutReceiptPath: 'runs/candidate-0002/lab-closeout-receipt.json',
    promotion: {
      status: 'promoted',
      baselineId: 'baseline-0002',
      manifestPath: 'baselines/baseline-0002/manifest.json',
      currentPointerPath: 'baselines/current.json',
      copiedFiles: ['lab-result.json'],
    },
  }, { createdAt: '2026-06-25T00:00:00.000Z' });

  assert.equal(summary.schemaVersion, 'moonshot-harness-loop-candidate-summary.v1');
  assert.equal(summary.createdAt, '2026-06-25T00:00:00.000Z');
  assert.equal(summary.status, 'passed');
  assert.equal(summary.promotable, true);
  assert.equal(summary.lifecyclePath, 'candidate_only');
  assert.equal(summary.previousBaselineId, 'baseline-0001');
  assert.equal(summary.runId, 'candidate-0002');
  assert.equal(summary.candidateResultPath, 'runs/candidate-0002/lab-result.json');
  assert.equal(summary.compareReportPath, 'compare/candidate-0002-vs-baseline-0001.json');
  assert.equal(summary.promotionPolicy.mode, 'no_regression');
  assert.equal(summary.calibration.status, 'baseline_reuse_allowed');
  assert.equal(summary.closeoutReceiptPath, 'runs/candidate-0002/lab-closeout-receipt.json');
  assert.equal(summary.promotion.status, 'promoted');
  assert.equal(summary.promotion.baselineId, 'baseline-0002');
  assert.equal(summary.promotion.copiedFiles, undefined);
});

test('auto lifecycle promotes initial bootstrap only when no current baseline exists', () => {
  const initial = selectAutoLifecycle(null);
  assert.equal(initial.command, 'init');
  assert.equal(initial.lifecyclePath, 'initial_bootstrap');
  assert.equal(initial.promoteInitial, true);

  const existing = selectAutoLifecycle({ baselineId: 'baseline-0008' });
  assert.equal(existing.command, 'candidate');
  assert.equal(existing.lifecyclePath, 'candidate_only');
  assert.equal(existing.promoteInitial, false);
});

test('codex cli smoke accepts an installed profile env contract without desktop app runtime', async () => {
  if (process.env.HARNESS_LAB_SKIP_NESTED_CODEX_SMOKE === '1') {
    return;
  }
  const installRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-codex-cli-smoke-'));
  tempRoots.push(installRoot);
  const moonshotHome = path.join(installRoot, 'moonshot-relay');
  const codexHome = path.join(installRoot, 'codex');
  const claudeHome = path.join(installRoot, 'claude');
  await mkdir(path.join(codexHome, 'skills', 'moonshot-orchestrator'), { recursive: true });
  await mkdir(path.join(codexHome, 'skills', 'moonshot-phase-runner'), { recursive: true });
  await mkdir(path.join(moonshotHome, 'scripts'), { recursive: true });
  await mkdir(path.join(moonshotHome, 'docs', 'public', 'guidelines'), { recursive: true });
  await writeFile(path.join(codexHome, 'AGENTS.md'), '# Moonshot Relay Codex Profile TOC\n\nUses MOONSHOT_RELAY_HOME.\n');
  await writeFile(path.join(codexHome, 'verification.contract.yaml'), 'schemaVersion: 1\n');
  await writeFile(path.join(codexHome, 'skills', 'moonshot-orchestrator', 'SKILL.md'), '# skill\n');
  await writeFile(path.join(codexHome, 'skills', 'moonshot-phase-runner', 'SKILL.md'), '# skill\n');
  await writeFile(path.join(codexHome, 'config.toml'), 'args = ["codex-mcp-singleton.mjs"]\n');
  await writeFile(path.join(moonshotHome, 'scripts', 'codex-mcp-singleton.mjs'), 'export {};\n');
  await writeFile(path.join(moonshotHome, 'scripts', 'runtime-state.mjs'), 'export {};\n');
  await writeFile(path.join(moonshotHome, 'docs', 'public', 'guidelines', 'harness-bootstrap-lab.md'), '# guide\n');
  const binDir = path.join(installRoot, 'bin');
  await mkdir(binDir, { recursive: true });
  const fakeCodexSh = path.join(binDir, 'codex');
  await writeFile(fakeCodexSh, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "codex-cli 0.128.0"; exit 0; fi',
    'if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then echo "Run Codex non-interactively"; exit 0; fi',
    'exit 2',
    '',
  ].join('\n'));
  await chmod(fakeCodexSh, 0o755);
  await writeFile(path.join(binDir, 'codex.cmd'), `@echo off
if "%1"=="--version" echo codex-cli 0.128.0& exit /b 0
if "%1"=="exec" if "%2"=="--help" echo Run Codex non-interactively& exit /b 0
exit /b 2
`);
  const outPath = path.join(installRoot, 'codex-cli-smoke.json');

  const result = spawnSync(process.execPath, [
    'tools/harness-lab/codex-cli-smoke.mjs',
    '--out',
    outPath,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MOONSHOT_RELAY_HOME: moonshotHome,
      CODEX_HOME: codexHome,
      CLAUDE_HOME: claudeHome,
      PHASE_RUNTIME_DB: path.join(installRoot, 'runtime-state.sqlite'),
      HOME: path.join(installRoot, 'home'),
      USERPROFILE: path.join(installRoot, 'userprofile'),
      HARNESS_LAB_REQUIRE_CODEX_CONFIG: '1',
      HARNESS_LAB_CODEX_BIN: process.platform === 'win32' ? path.join(binDir, 'codex.cmd') : fakeCodexSh,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(payload.status, 'passed');
  assert.equal(payload.criterion, 'codex-cli-installed-profile-env-contract');
  assert.equal(payload.configContract.status, 'passed');
  assert.equal(payload.configContract.required, true);
  assert.equal(payload.authContract.status, 'absent');
  assert.equal(payload.authContract.required, false);
  assert.equal(payload.codexCli.version.status, 'passed');
  assert.match(payload.codexCli.version.stdout, /codex-cli \d+\.\d+\.\d+/);
  assert.equal(payload.codexCli.execHelp.status, 'passed');
});

test('docker source snapshot excludes generated lab state and live dependency roots', () => {
  const excluded = [
    '.git/config',
    '.moonshot-relay/harness-lab/baselines/current.json',
    'node_modules/better-sqlite3/package.json',
    'package/claude/profile/CLAUDE.md',
    'package/codex/profile/AGENTS.md',
    'state/runtime.sqlite',
    'moonshot-relay-0.1.0.tgz',
  ];
  for (const relativePath of excluded) {
    assert.equal(shouldExcludeSourceSnapshotPath(relativePath), true, `${relativePath} should be excluded`);
  }

  const included = [
    'tools/harness-lab/harness-loop.mjs',
    'tools/harness-lab/harness-lab.mjs',
    'docs/public/guidelines/harness-bootstrap-lab.md',
    'Dockerfile.harness-lab',
  ];
  for (const relativePath of included) {
    assert.equal(shouldExcludeSourceSnapshotPath(relativePath), false, `${relativePath} should be included`);
  }
});

test('docker loop rewrites container artifact paths back to host paths', () => {
  const sourceRoot = path.join(root, 'source');
  const outRoot = path.join(root, '.moonshot-relay', 'harness-lab', 'runs');
  const rewritten = rewriteContainerPaths({
    resultPath: '/harness-run/output/candidate-0001/lab-result.json',
    runRoot: '/harness-run/output/candidate-0001',
    candidate: {
      root: '/workspace',
      results: [
        {
          cwd: '/workspace/tests',
          stdout: { path: '/harness-run/output/candidate-0001/candidate/suite/stdout.txt' },
        },
      ],
    },
  }, { sourceRoot, outRoot });

  assert.equal(rewritten.resultPath, path.join(outRoot, 'candidate-0001', 'lab-result.json'));
  assert.equal(rewritten.runRoot, path.join(outRoot, 'candidate-0001'));
  assert.equal(rewritten.candidate.root, sourceRoot);
  assert.equal(rewritten.candidate.results[0].cwd, path.join(sourceRoot, 'tests'));
  assert.equal(
    rewritten.candidate.results[0].stdout.path,
    path.join(outRoot, 'candidate-0001', 'candidate', 'suite', 'stdout.txt'),
  );
});

test('docker result patch derives and writes top-level install status', async () => {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-docker-install-status-'));
  tempRoots.push(runRoot);
  const runId = 'candidate-0001';
  const resultPath = path.join(runRoot, runId, 'lab-result.json');
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-lab-result.v1',
    status: 'passed',
    runId,
    run: { runId },
    candidate: { root: '/workspace', results: [] },
  }, null, 2));
  await writeFile(path.join(runRoot, runId, 'install-result.json'), JSON.stringify({
    installId: 'install-1',
    verification: [{ runtime: 'codex', missing: [], mismatch: [] }],
    profileSurfaceParity: [{ runtime: 'codex', missingPublicSkills: [], extraPublicSkills: [] }],
  }, null, 2));
  await writeFile(path.join(runRoot, runId, 'installed-runtime-smoke.json'), JSON.stringify({
    runtimeCapabilityStatus: { status: 'available' },
    operationalMetrics: { blockerMetrics: [], releaseBlockerMetrics: [] },
    compactStatus: { staleWarnings: [] },
  }, null, 2));
  await writeFile(path.join(runRoot, runId, 'codex-cli-smoke.json'), JSON.stringify({
    status: 'passed',
    codexCli: { version: { stdout: 'codex-cli 0.128.0' } },
  }, null, 2));

  assert.equal(deriveInstallStatus({
    verification: [{ missing: [], mismatch: [] }],
    profileSurfaceParity: [{ missingPublicSkills: [], extraPublicSkills: [] }],
  }), 'installed');

  const patched = await patchDockerLabResult({
    resultPath,
    sourceRoot: root,
    sourceSnapshotRoot: root,
    sourceFingerprintResult: { digest: 'abc' },
    outRoot: runRoot,
    role: 'candidate',
    image: 'image',
    imageMetadata: { imageId: 'sha256:image-id', imageDigest: 'sha256:image-id', repoDigests: [] },
  });
  const normalizedInstall = JSON.parse(await readFile(path.join(runRoot, runId, 'install-result.json'), 'utf8'));
  assert.equal(patched.executionBackend.installStatus, 'installed');
  assert.equal(normalizedInstall.status, 'installed');
  assert.equal(patched.executionBackend.imageDigest, 'sha256:image-id');
});

test('docker result patch hard-fails degraded installed runtime smoke', async () => {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-docker-patch-'));
  tempRoots.push(runRoot);
  const runId = 'candidate-0001';
  const resultPath = path.join(runRoot, runId, 'lab-result.json');
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-lab-result.v1',
    runId,
    run: { runId },
    candidate: { root: '/workspace', results: [] },
  }, null, 2));
  await writeFile(path.join(runRoot, runId, 'install-result.json'), JSON.stringify({ status: 'installed' }, null, 2));
  await writeFile(path.join(runRoot, runId, 'installed-runtime-smoke.json'), JSON.stringify({
    runtimeCapabilityStatus: { status: 'degraded' },
  }, null, 2));
  await writeFile(path.join(runRoot, runId, 'codex-cli-smoke.json'), JSON.stringify({ status: 'passed' }, null, 2));

  await assert.rejects(
    () => patchDockerLabResult({
      resultPath,
      sourceRoot: root,
      sourceSnapshotRoot: root,
      sourceFingerprintResult: { digest: 'abc' },
      outRoot: runRoot,
      role: 'candidate',
      image: 'image',
    }),
    /installed runtime smoke failed hard gate \(degraded\)/,
  );
});

test('installed runtime smoke normalizes available with no blockers to healthy', () => {
  const normalized = normalizeInstalledRuntimeSmoke({
    runtimeCapabilityStatus: { status: 'available', dbPath: '/tmp/runtime.sqlite' },
    operationalMetrics: { blockerMetrics: [], releaseBlockerMetrics: [] },
    compactStatus: { staleWarnings: [] },
  });
  assert.equal(normalized.runtimeCapabilityStatus.status, 'healthy');
  assert.equal(normalized.runtimeCapabilityStatus.normalizedFrom, 'available');

  const degraded = normalizeInstalledRuntimeSmoke({
    runtimeCapabilityStatus: { status: 'available' },
    operationalMetrics: { blockerMetrics: ['x'], releaseBlockerMetrics: [] },
    compactStatus: { staleWarnings: [] },
  });
  assert.equal(degraded.runtimeCapabilityStatus.status, 'available');
});

test('auth artifact scan blocks copied auth files and token-like payloads', async () => {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-auth-scan-'));
  tempRoots.push(runRoot);
  await writeFile(path.join(runRoot, 'summary.json'), JSON.stringify({ status: 'passed' }, null, 2));
  let scan = await scanAuthArtifacts(runRoot);
  assert.equal(scan.status, 'passed');

  await writeFile(path.join(runRoot, 'auth.json'), '{"access_token":"secret"}\n');
  scan = await scanAuthArtifacts(runRoot);
  assert.equal(scan.status, 'failed');
  assert.equal(scan.findings.some((entry) => entry.failureClass === 'auth_file_copied_to_artifact'), true);
});

test('promotion atomically updates current pointer only after successful bound compare copy', async () => {
  const baselineRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-baselines-'));
  const runRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-candidate-run-'));
  tempRoots.push(baselineRoot, runRoot);
  const oldBaselineRoot = path.join(baselineRoot, 'baseline-0000');
  await mkdir(oldBaselineRoot, { recursive: true });
  const oldLabResultPath = path.join(oldBaselineRoot, 'lab-result.json');
  await writeFile(oldLabResultPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-lab-result.v1',
    authority: 'external-bootstrap-lab',
    runId: 'baseline-0000-run',
    run: { candidateRunId: 'baseline-run-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: { results: [], sourceFingerprint: { digest: 'old' } },
  }, null, 2));
  const oldManifest = {
    schemaVersion: 'moonshot-harness-baseline-artifact.v1',
    baselineId: 'baseline-0000',
    artifact: {
      kind: 'lab_result',
      path: oldLabResultPath,
      sha256: '',
    },
  };
  oldManifest.artifact.sha256 = await (async () => {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(await readFile(oldLabResultPath)).digest('hex');
  })();
  const oldManifestPath = path.join(oldBaselineRoot, 'manifest.json');
  await writeFile(oldManifestPath, JSON.stringify(oldManifest, null, 2));
  await writeFile(path.join(baselineRoot, 'current.json'), JSON.stringify({
    schemaVersion: 'moonshot-harness-baseline-pointer.v1',
    baselineId: 'baseline-0000',
    manifestPath: oldManifestPath,
  }, null, 2));

  const candidateRunPath = path.join(runRoot, 'lab-result.json');
  const compareReportPath = path.join(runRoot, 'compare-report.json');
  const completeFixtureIdentity = {
    matches: true,
    completeness: {
      complete: true,
      baseline: {
        requiredFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'],
        missingFields: [],
      },
      candidate: {
        requiredFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'],
        missingFields: [],
      },
    },
  };
  await writeFile(candidateRunPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-lab-result.v1',
    authority: 'external-bootstrap-lab',
    runId: 'candidate-0001',
    run: { runId: 'candidate-0001', candidateRunId: 'candidate-run-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    suites: [{ id: 'contract' }],
    executionBackend: {
      type: 'docker',
      image: 'harness-lab:test',
      imageId: 'sha256:image-id',
      imageDigest: 'sha256:image-id',
      repoDigests: [],
      codexCliVersion: 'codex-cli 0.128.0',
      runtimeGate: { status: 'healthy', artifact: 'installed-runtime-smoke.json', hardGate: true },
      containerHardening: {
        schemaVersion: 'moonshot-harness-docker-hardening.v1',
        networkMode: 'none',
        readOnlyRootFilesystem: true,
        capDrop: ['ALL'],
      },
    },
    candidate: {
      sourceFingerprint: { digest: 'abc' },
      results: [{
        id: 'contract',
        status: 'passed',
        metrics: [{
          id: 'score',
          numericValue: 1,
          normalizedScore: 1,
          direction: 'higher',
          fixtureSetId: 'set',
          fixtureId: 'fixture',
          inputHash: 'sha256:fixture',
          scorerVersion: 'scorer',
          status: 'passed',
        }],
      }],
    },
    promotion: { status: 'eligible' },
  }, null, 2));
  await writeFile(compareReportPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-compare-report.v1',
    status: 'passed',
    promotable: true,
    baselineRunId: 'baseline-run-id',
    candidateRunId: 'candidate-run-id',
    fixtureIdentity: { matches: true },
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
  }, null, 2));

  await assert.rejects(
    () => promoteBaseline({
      candidateRun: candidateRunPath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-legacy',
    }),
    /fixture identity is incomplete/,
  );

  await writeFile(compareReportPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-compare-report.v1',
    status: 'passed',
    promotable: true,
    baselineRunId: 'baseline-run-id',
    candidateRunId: 'candidate-run-id',
    fixtureIdentity: completeFixtureIdentity,
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
  }, null, 2));

  const candidateRun = JSON.parse(await readFile(candidateRunPath, 'utf8'));
  const missingImageDigestPath = path.join(runRoot, 'lab-result-missing-image-digest.json');
  const missingImageDigestRun = structuredClone(candidateRun);
  delete missingImageDigestRun.executionBackend.imageDigest;
  await writeFile(missingImageDigestPath, JSON.stringify(missingImageDigestRun, null, 2));
  await assert.rejects(
    () => promoteBaseline({
      candidateRun: missingImageDigestPath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-missing-image-digest',
    }),
    /missing image digest/,
  );

  const degradedRuntimePath = path.join(runRoot, 'lab-result-degraded-runtime.json');
  const degradedRuntimeRun = structuredClone(candidateRun);
  degradedRuntimeRun.executionBackend.runtimeGate.status = 'degraded';
  await writeFile(degradedRuntimePath, JSON.stringify(degradedRuntimeRun, null, 2));
  await assert.rejects(
    () => promoteBaseline({
      candidateRun: degradedRuntimePath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-degraded-runtime',
    }),
    /runtime gate is not healthy/,
  );

  const promoted = await promoteBaseline({
    candidateRun: candidateRunPath,
    baselineRoot,
    compareReport: compareReportPath,
    baselineId: 'baseline-0001',
  });
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.previousBaselineId, 'baseline-0000');
  assert.equal(promoted.pointerEvidence.previousBaselineId, 'baseline-0000');
  assert.equal(typeof promoted.finalManifestSha256, 'string');
  assert.equal(promoted.finalManifestSha256.length, 64);
  assert.equal(typeof promoted.manifestPrePointerEvidenceSha256, 'string');
  assert.equal(promoted.pointerEvidence.manifestSha256Meaning, 'pre_pointer_evidence_manifest_hash');
  assert.equal(promoted.pointerEvidence.manifestPrePointerEvidenceSha256, promoted.manifestPrePointerEvidenceSha256);
  const current = JSON.parse(await readFile(path.join(baselineRoot, 'current.json'), 'utf8'));
  assert.equal(current.baselineId, 'baseline-0001');
  const promotedManifest = JSON.parse(await readFile(promoted.manifestPath, 'utf8'));
  assert.equal(promotedManifest.runtimeGate.status, 'healthy');
  assert.equal(promotedManifest.runtimeGate.hardGate, true);
  assert.equal(promotedManifest.fixtureIdentity.inputHash, 'sha256:fixture');
  assert.equal(promotedManifest.runtimeIdentity.type, 'docker');
  assert.equal(promotedManifest.runtimeIdentity.imageDigest, 'sha256:image-id');
  assert.equal(promotedManifest.artifact.imageDigest, 'sha256:image-id');
  assert.equal(promotedManifest.pointerEvidence.manifestSha256Meaning, 'pre_pointer_evidence_manifest_hash');

  await writeFile(compareReportPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-compare-report.v1',
    status: 'passed',
    promotable: true,
    baselineRunId: 'calibrated-baseline-run-id',
    candidateRunId: 'candidate-run-id',
    fixtureIdentity: completeFixtureIdentity,
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
  }, null, 2));
  await assert.rejects(
    () => promoteBaseline({
      candidateRun: candidateRunPath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-calibration-without-opt-in',
    }),
    /baseline run id does not match/,
  );
  await assert.rejects(
    () => promoteBaseline({
      candidateRun: candidateRunPath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-calibration-opt-in',
      allowCalibratedBaseline: true,
      simulatePartialCopyFailure: true,
    }),
    /Simulated partial copy failure/,
  );
  const afterCalibratedDryRun = JSON.parse(await readFile(path.join(baselineRoot, 'current.json'), 'utf8'));
  assert.equal(afterCalibratedDryRun.baselineId, 'baseline-0001');

  await writeFile(compareReportPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-compare-report.v1',
    status: 'passed',
    promotable: true,
    baselineRunId: 'candidate-run-id',
    candidateRunId: 'candidate-run-id',
    fixtureIdentity: completeFixtureIdentity,
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
  }, null, 2));
  await assert.rejects(
    () => promoteBaseline({
      candidateRun: candidateRunPath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-0002',
      simulatePartialCopyFailure: true,
    }),
    /Simulated partial copy failure/,
  );
  const afterFailedPromotion = JSON.parse(await readFile(path.join(baselineRoot, 'current.json'), 'utf8'));
  assert.equal(afterFailedPromotion.baselineId, 'baseline-0001');

  await writeFile(compareReportPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-compare-report.v1',
    status: 'passed',
    promotable: true,
    baselineRunId: 'candidate-run-id',
    candidateRunId: 'other-candidate',
    fixtureIdentity: { matches: true },
  }, null, 2));
  await assert.rejects(
    () => promoteBaseline({
      candidateRun: candidateRunPath,
      baselineRoot,
      compareReport: compareReportPath,
      baselineId: 'baseline-0003',
    }),
    /candidate run id does not match/,
  );
});

test('baseline refresh readiness allows only legacy or incomplete baseline evidence', () => {
  const completeLabResult = {
    run: { fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      results: [{
        metrics: [{ fixtureSetId: 'set', fixtureId: 'fixture', inputHash: 'sha256:fixture', scorerVersion: 'scorer' }],
      }],
    },
  };
  const completeCompare = {
    fixtureIdentity: {
      completeness: {
        complete: true,
        baseline: { requiredFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'] },
        candidate: { requiredFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'] },
      },
    },
  };
  const completeManifest = {
    promotionPolicy: { mode: 'no_regression' },
    runtimeGate: { status: 'healthy' },
    runtimeIdentity: {
      type: 'docker',
      image: 'image',
      imageId: 'sha256:image-id',
      imageDigest: 'sha256:image-id',
      codexCliVersion: 'codex-cli 0.128.0',
    },
    artifact: { imageDigest: 'sha256:image-id' },
    candidateRunSha256: 'candidate-sha',
    compareReport: { sha256: 'compare-sha' },
    pointerEvidence: {
      newPointerSha256: 'pointer-sha',
      manifestSha256: 'manifest-sha',
      labResultSha256: 'lab-sha',
      compareReportSha256: 'compare-sha',
    },
    fixtureIdentity: {
      fixtureSetId: 'set',
      fixtureId: 'fixture',
      inputHash: 'sha256:fixture',
      scorerVersion: 'scorer',
    },
  };

  const ready = buildBaselineRefreshReadiness({
    manifest: completeManifest,
    labResult: completeLabResult,
    compareReport: completeCompare,
  });
  assert.equal(ready.refreshRequired, false);

  const legacy = buildBaselineRefreshReadiness({
    manifest: {
      ...completeManifest,
      runtimeIdentity: null,
      fixtureIdentity: { fixtureSetId: 'set', fixtureId: 'fixture', scorerVersion: 'scorer' },
    },
    labResult: completeLabResult,
    compareReport: {
      fixtureIdentity: {
        completeness: {
          complete: true,
          baseline: { requiredFields: ['fixtureSetId', 'fixtureId', 'scorerVersion'] },
          candidate: { requiredFields: ['fixtureSetId', 'fixtureId', 'scorerVersion'] },
        },
      },
    },
  });
  assert.equal(legacy.refreshRequired, true);
  assert.equal(legacy.reasons.includes('missing_runtime_identity'), true);
  assert.equal(legacy.reasons.includes('baseline_fixture_identity_incomplete'), true);
  assert.equal(legacy.reasons.includes('compare_report_uses_legacy_fixture_identity_contract'), true);

  const missingImageDigest = buildBaselineRefreshReadiness({
    manifest: {
      ...completeManifest,
      runtimeIdentity: { type: 'docker', image: 'image', codexCliVersion: 'codex-cli 0.128.0' },
      artifact: {},
    },
    labResult: completeLabResult,
    compareReport: completeCompare,
  });
  assert.equal(missingImageDigest.refreshRequired, true);
  assert.equal(missingImageDigest.reasons.includes('missing_runtime_image_digest'), true);
  assert.equal(missingImageDigest.reasons.includes('missing_artifact_image_digest'), true);
});

test('rollback validates baseline artifacts and writes audit evidence', async () => {
  const baselineRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-baselines-'));
  tempRoots.push(baselineRoot);
  await mkdir(path.join(baselineRoot, 'baseline-0001'), { recursive: true });
  await mkdir(path.join(baselineRoot, 'baseline-0002'), { recursive: true });
  const labResultPath = path.join(baselineRoot, 'baseline-0001', 'lab-result.json');
  await writeFile(labResultPath, '{"status":"passed"}\n');
  const crypto = await import('node:crypto');
  const labResultSha256 = crypto.createHash('sha256').update(await readFile(labResultPath)).digest('hex');
  await writeFile(path.join(baselineRoot, 'baseline-0001', 'manifest.json'), JSON.stringify({
    schemaVersion: 'moonshot-harness-baseline-artifact.v1',
    baselineId: 'baseline-0001',
    artifact: { path: labResultPath, sha256: labResultSha256 },
  }, null, 2));
  await writeFile(path.join(baselineRoot, 'baseline-0002', 'manifest.json'), JSON.stringify({
    schemaVersion: 'moonshot-harness-baseline-artifact.v1',
    baselineId: 'baseline-0002',
    artifact: { path: path.join(baselineRoot, 'baseline-0002', 'missing.json'), sha256: 'bad' },
  }, null, 2));
  await writeFile(path.join(baselineRoot, 'current.json'), JSON.stringify({ baselineId: 'baseline-0002' }, null, 2));

  const result = await rollbackBaseline({ baselineRoot, to: 'baseline-0001' });
  assert.equal(result.status, 'rolled_back');
  assert.equal(existsSync(result.auditPath), true);
  const current = JSON.parse(await readFile(path.join(baselineRoot, 'current.json'), 'utf8'));
  assert.equal(current.baselineId, 'baseline-0001');
  assert.equal(current.rollback, true);

  await assert.rejects(
    () => rollbackBaseline({ baselineRoot, to: 'baseline-0002' }),
    /Baseline artifact does not exist/,
  );
});

test('calibration decision fires for scorer version and near-threshold candidate score', () => {
  const decision = shouldRerunBaseline({
    baselineManifest: {
      scorerVersion: 'scorer-v1',
      createdAt: new Date().toISOString(),
      fixtureIdentity: {
        fixtureSetId: 'set',
        fixtureId: 'fixture',
        inputHash: 'sha256:old',
        scorerVersion: 'scorer-v1',
      },
      runtimeIdentity: { type: 'docker', image: 'old-image', codexCliVersion: 'codex-cli 0.128.0' },
    },
    candidateResult: {
      run: { scorerVersion: 'scorer-v2' },
      candidate: {
        results: [{
          metrics: [{ fixtureSetId: 'set', fixtureId: 'fixture', inputHash: 'sha256:new', scorerVersion: 'scorer-v2' }],
        }],
      },
      executionBackend: { type: 'docker', image: 'new-image', codexCliVersion: 'codex-cli 0.128.0' },
      quantitative: { candidate: { normalizedScore: 0.99 } },
    },
  });

  assert.equal(decision.rerunBaseline, true);
  assert.equal(decision.reasons.includes('scorer_version_changed'), true);
  assert.equal(decision.reasons.includes('fixture_identity_changed'), true);
  assert.equal(decision.reasons.includes('runtime_identity_changed'), true);
  assert.equal(decision.reasons.includes('near_threshold_candidate_score'), true);
});

test('calibration baseline normalization fills legacy fixture identity from manifest copy', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-calibration-normalize-'));
  tempRoots.push(tempRoot);
  const resultPath = path.join(tempRoot, 'lab-result.json');
  await writeFile(resultPath, JSON.stringify({
    runId: 'legacy-baseline',
    run: { candidateRunId: 'legacy-id' },
    candidate: {
      results: [{
        id: 'harness-control-plane-eval',
        status: 'passed',
        metrics: [{ id: 'score', numericValue: 1, direction: 'higher', status: 'passed' }],
      }],
    },
  }, null, 2));

  const normalized = await normalizeCalibrationBaselineFixtureIdentity({
    resultPath,
    manifest: {
      fixtureIdentity: {
        fixtureSetId: 'set',
        fixtureId: 'fixture',
        inputHash: 'sha256:fixture',
        scorerVersion: 'scorer',
      },
    },
  });

  assert.equal(normalized.normalized, true);
  assert.notEqual(normalized.resultPath, resultPath);
  const payload = JSON.parse(await readFile(normalized.resultPath, 'utf8'));
  assert.equal(payload.run.fixtureSetId, 'set');
  assert.equal(payload.run.scorerVersion, 'scorer');
  assert.equal(payload.candidate.results[0].metrics[0].inputHash, 'sha256:fixture');
  assert.equal(payload.calibrationFixtureIdentityNormalization.source, 'current_baseline_manifest');
});

test('closeout receipt statuses gate commit workflow consumption', async () => {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-closeout-'));
  tempRoots.push(runRoot);
  const candidatePath = path.join(runRoot, 'lab-result.json');
  const comparePath = path.join(runRoot, 'compare.json');
  await writeFile(candidatePath, JSON.stringify({
    runId: 'candidate-0002',
    run: { candidateRunId: 'candidate-id' },
    candidate: { sourceFingerprint: { digest: 'source-digest' } },
    executionBackend: {
      installedRuntimeSmokeStatus: 'healthy',
      installedRuntimeSmokePath: 'installed-runtime-smoke.json',
    },
  }, null, 2));
  await writeFile(comparePath, JSON.stringify({
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
  }, null, 2));

  const promoted = await buildCloseoutReceipt({
    status: 'promoted_ready_for_commit_workflow',
    decisionReason: 'compare_passed_and_promoted',
    runId: 'candidate-0002',
    candidateResultPath: candidatePath,
    compareReportPath: comparePath,
    promotion: { status: 'promoted', baselineId: 'baseline-0002' },
    previousBaselineId: 'baseline-0001',
    pointerBefore: { baselineId: 'baseline-0001', sha256: 'before' },
    pointerAfter: { baselineId: 'baseline-0002', sha256: 'after' },
  });
  assert.equal(promoted.schemaVersion, 'moonshot-harness-lab-closeout-receipt.v1');
  assert.equal(promoted.status, 'promoted_ready_for_commit_workflow');
  assert.equal(promoted.nextAction, 'run explicit commit workflow if source changes should be committed');
  assert.equal(promoted.runtimeGate.status, 'healthy');
  assert.equal(typeof promoted.candidateRunSha256, 'string');
  assert.equal(typeof promoted.compareReportSha256, 'string');
  assert.equal(closeoutExitCode({ consumableByCommitWorkflow: true }), 0);
  assert.equal(closeoutExitCode({ consumableByCommitWorkflow: false }), 1);

  const rejected = await buildCloseoutReceipt({
    status: 'rejected_no_commit',
    decisionReason: 'compare_failed',
    runId: 'candidate-0002',
    candidateResultPath: candidatePath,
    compareReportPath: comparePath,
  });
  assert.equal(rejected.status === 'promoted_ready_for_commit_workflow', false);
  assert.match(rejected.nextAction, /fix candidate/);
});

test('closeout revalidation rejects stale promoted receipts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-closeout-revalidate-'));
  tempRoots.push(tempRoot);
  const baselineRoot = path.join(tempRoot, 'baselines');
  const baselineDir = path.join(baselineRoot, 'baseline-0002');
  const sourceRoot = await makeFixtureRepo();
  await mkdir(baselineDir, { recursive: true });
  const candidatePath = path.join(baselineDir, 'lab-result.json');
  const comparePath = path.join(baselineDir, 'compare-report.json');
  const fingerprint = await sourceFingerprint(sourceRoot);
  const fixtureIdentity = {
    fixtureSetId: 'set',
    fixtureId: 'fixture',
    inputHash: 'sha256:fixture',
    scorerVersion: 'scorer',
  };
  const completeFixtureIdentity = {
    matches: true,
    completeness: {
      complete: true,
      baseline: {
        requiredFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'],
        presentFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'],
        missingFields: [],
      },
      candidate: {
        requiredFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'],
        presentFields: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'],
        missingFields: [],
      },
    },
  };
  const candidateArtifact = {
    runId: 'candidate-0002',
    run: { candidateRunId: 'candidate-id', fixtureSetId: 'set', scorerVersion: 'scorer' },
    candidate: {
      sourceFingerprint: fingerprint,
      results: [{
        id: 'contract',
        status: 'passed',
        metrics: [{
          id: 'score',
          numericValue: 1,
          normalizedScore: 1,
          direction: 'higher',
          status: 'passed',
          ...fixtureIdentity,
        }],
      }],
    },
    executionBackend: {
      type: 'docker',
      image: 'harness-lab:test',
      imageId: 'sha256:image-id',
      imageDigest: 'sha256:image-id',
      installedRuntimeSmokeStatus: 'healthy',
      installedRuntimeSmokePath: 'installed-runtime-smoke.json',
      runtimeGate: { status: 'healthy', artifact: 'installed-runtime-smoke.json', hardGate: true },
    },
  };
  await writeFile(candidatePath, JSON.stringify(candidateArtifact, null, 2));
  await writeFile(comparePath, JSON.stringify({
    status: 'passed',
    candidateRunId: 'candidate-id',
    fixtureIdentity: completeFixtureIdentity,
    promotionPolicy: { mode: 'no_regression', minDelta: 0 },
  }, null, 2));
  const candidateSha = createHash('sha256').update(await readFile(candidatePath)).digest('hex');
  const compareSha = createHash('sha256').update(await readFile(comparePath)).digest('hex');
  const manifestPath = path.join(baselineDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-baseline-artifact.v1',
    baselineId: 'baseline-0002',
    candidateRunId: 'candidate-id',
    candidateRunSha256: candidateSha,
    artifact: { path: candidatePath, sha256: candidateSha, imageDigest: 'sha256:image-id' },
    compareReport: { path: comparePath, sha256: compareSha },
    fixtureIdentity,
    runtimeGate: { status: 'healthy', artifact: 'installed-runtime-smoke.json', hardGate: true },
    runtimeIdentity: { type: 'docker', imageDigest: 'sha256:image-id' },
  }, null, 2));
  const pointerPath = path.join(baselineRoot, 'current.json');
  await writeFile(pointerPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-baseline-pointer.v1',
    baselineId: 'baseline-0002',
    manifestPath,
  }, null, 2));
  const pointerSha = createHash('sha256').update(await readFile(pointerPath)).digest('hex');
  const receipt = {
    schemaVersion: 'moonshot-harness-lab-closeout-receipt.v1',
    status: 'promoted_ready_for_commit_workflow',
    baselineId: 'baseline-0002',
    baselinePointerAfter: { baselineId: 'baseline-0002', sha256: pointerSha },
    candidateResultPath: candidatePath,
    candidateRunId: 'candidate-id',
    candidateRunSha256: candidateSha,
    compareReportPath: comparePath,
    compareReportSha256: compareSha,
    runtimeGate: { status: 'healthy' },
    sourceFingerprint: fingerprint,
  };

  const valid = await revalidateCloseoutReceipt(receipt, { baselineRoot, sourceRoot });
  assert.equal(valid.status, 'passed');
  assert.equal(valid.consumableByCommitWorkflow, true);

  const stalePointer = structuredClone(receipt);
  stalePointer.baselinePointerAfter.sha256 = 'bad';
  const stale = await revalidateCloseoutReceipt(stalePointer, { baselineRoot, sourceRoot });
  assert.equal(stale.consumableByCommitWorkflow, false);
  assert.equal(stale.blockingGates.some((gate) => gate.id === 'current_pointer_sha_matches_receipt'), true);

  const badRuntime = structuredClone(receipt);
  badRuntime.runtimeGate.status = 'degraded';
  const runtime = await revalidateCloseoutReceipt(badRuntime, { baselineRoot, sourceRoot });
  assert.equal(runtime.consumableByCommitWorkflow, false);
  assert.equal(runtime.blockingGates.some((gate) => gate.id === 'runtime_gate_matches_receipt'), true);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const degradedManifest = structuredClone(manifest);
  degradedManifest.runtimeGate.status = 'degraded';
  await writeFile(manifestPath, JSON.stringify(degradedManifest, null, 2));
  const artifactRuntime = await revalidateCloseoutReceipt(receipt, { baselineRoot, sourceRoot });
  assert.equal(artifactRuntime.consumableByCommitWorkflow, false);
  assert.equal(artifactRuntime.blockingGates.some((gate) => gate.id === 'runtime_gate_healthy'), true);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const missingDigestManifest = structuredClone(manifest);
  delete missingDigestManifest.artifact.imageDigest;
  await writeFile(manifestPath, JSON.stringify(missingDigestManifest, null, 2));
  const imageDigest = await revalidateCloseoutReceipt(receipt, { baselineRoot, sourceRoot });
  assert.equal(imageDigest.consumableByCommitWorkflow, false);
  assert.equal(imageDigest.blockingGates.some((gate) => gate.id === 'docker_image_digest_present'), true);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const incompleteFixtureManifest = structuredClone(manifest);
  delete incompleteFixtureManifest.fixtureIdentity.inputHash;
  await writeFile(manifestPath, JSON.stringify(incompleteFixtureManifest, null, 2));
  const fixture = await revalidateCloseoutReceipt(receipt, { baselineRoot, sourceRoot });
  assert.equal(fixture.consumableByCommitWorkflow, false);
  assert.equal(fixture.blockingGates.some((gate) => gate.id === 'fixture_identity_complete'), true);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const driftedSource = structuredClone(receipt);
  driftedSource.sourceFingerprint.digest = 'stale';
  const source = await revalidateCloseoutReceipt(driftedSource, { baselineRoot, sourceRoot });
  assert.equal(source.consumableByCommitWorkflow, false);
  assert.equal(source.blockingGates.some((gate) => gate.id === 'source_fingerprint_matches_receipt'), true);
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
  assert.match(manifest.scripts['lab:auto'], /harness-loop\.mjs auto --backend docker --json/);
  assert.match(manifest.scripts['lab:auto:promote'], /harness-loop\.mjs auto --backend docker --promote --json/);
  assert.match(manifest.scripts['lab:auto:promote:strict'], /--promotion-policy strict_improvement/);
  assert.match(manifest.scripts['lab:auto:promote:no-regression'], /--promotion-policy no_regression/);
  assert.match(manifest.scripts['lab:candidate:promote:strict'], /--promotion-policy strict_improvement/);
  assert.match(manifest.scripts['lab:candidate:promote:no-regression'], /--promotion-policy no_regression/);
  assert.match(manifest.scripts['lab:calibrate'], /harness-loop\.mjs calibrate --backend docker --json/);
  assert.match(manifest.scripts['lab:refresh-baseline'], /harness-loop\.mjs refresh-baseline --backend docker --json/);
  assert.match(manifest.scripts['lab:auth-smoke'], /harness-loop\.mjs auth-smoke --backend docker --json/);
  assert.match(manifest.scripts['lab:closeout'], /harness-loop\.mjs closeout --json/);
  assert.doesNotMatch(manifest.scripts['lab:candidate:codex-auth'], /candidate .*--use-host-codex-auth/);
  assert.match(manifest.scripts['lab:candidate:codex-auth'], /auth-smoke/);
  assert.match(docs, /manifestPrePointerEvidenceSha256/);
  assert.match(docs, /lab:candidate:promote:strict/);
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
