import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const root = process.cwd();
const tempRoots = [];

const makeEnv = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-verification-plane-'));
  tempRoots.push(dir);
  return {
    repoRoot: dir,
    env: {
      PHASE_RUNTIME_DB: path.join(dir, 'runtime-state.sqlite'),
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

const fullPassingPlanes = () => ([
  { plane: 'unit', status: 'passed', command: 'npm test', evidenceId: 'unit-pass' },
  { plane: 'package', status: 'passed', command: 'npm run test:package', evidenceId: 'package-pass' },
  { plane: 'installer', status: 'passed', command: 'node scripts/install-account-root-harness.mjs --runtime all --dry-run --json', evidenceId: 'installer-pass' },
  { plane: 'browser', status: 'passed', traceId: 'browser-trace-1', tracePath: '.moonshot-relay/browser-artifacts/run/goal/smoke/trace-metadata.json', evidenceDepth: 'smoke' },
  { plane: 'security', status: 'passed', scanStatus: 'passed', blockers: [] },
  { plane: 'quality', status: 'passed', command: 'git diff --check', evidenceId: 'quality-pass' },
]);

test('fresh verification plane evidence is required before accepted completion', async () => {
  const { env } = await makeEnv();
  json(run(['scripts/runtime-state.mjs', 'init', '--json'], env));

  const accepted = json(run([
    'scripts/verification-plane.mjs',
    'record-summary',
    '--run-id',
    'run-fresh-plane',
    '--goal-id',
    'goal-fresh-plane',
    '--planes-json',
    JSON.stringify(fullPassingPlanes()),
    '--identity-json',
    '{"runLeaseId":"lease-plane"}',
    '--json',
  ], env));
  const assessed = json(run([
    'scripts/runtime-state.mjs',
    'assess-completion',
    '--run-id',
    'run-fresh-plane',
    '--goal-id',
    'goal-fresh-plane',
    '--json',
  ], env));

  assert.equal(accepted.status, 'recorded');
  assert.equal(accepted.requiredChecksPassed, true);
  assert.equal(assessed.status, 'accepted');
  assert.equal(assessed.authoritySource, 'runtime-state.sqlite');
});

test('stale verification plane evidence cannot produce accepted completion', async () => {
  const { env } = await makeEnv();
  json(run(['scripts/runtime-state.mjs', 'init', '--json'], env));

  json(run([
    'scripts/verification-plane.mjs',
    'record-summary',
    '--run-id',
    'run-stale-plane',
    '--goal-id',
    'goal-stale-plane',
    '--planes-json',
    JSON.stringify(fullPassingPlanes()),
    '--identity-json',
    '{"runLeaseId":"lease-stale"}',
    '--produced-at',
    '2000-01-01T00:00:00.000Z',
    '--max-age-minutes',
    '1',
    '--json',
  ], env));
  const assessed = json(run([
    'scripts/runtime-state.mjs',
    'assess-completion',
    '--run-id',
    'run-stale-plane',
    '--goal-id',
    'goal-stale-plane',
    '--json',
  ], env));

  assert.equal(assessed.status, 'rejected');
  assert.match(assessed.reason, /stale verification evidence/);
});

test('missing required verification plane is rejected distinctly', async () => {
  const { env } = await makeEnv();
  json(run(['scripts/runtime-state.mjs', 'init', '--json'], env));
  const planes = fullPassingPlanes().filter((plane) => plane.plane !== 'security');

  const recorded = json(run([
    'scripts/verification-plane.mjs',
    'record-summary',
    '--run-id',
    'run-missing-security',
    '--goal-id',
    'goal-missing-security',
    '--planes-json',
    JSON.stringify(planes),
    '--identity-json',
    '{"runLeaseId":"lease-missing"}',
    '--json',
  ], env));
  const assessed = json(run([
    'scripts/runtime-state.mjs',
    'assess-completion',
    '--run-id',
    'run-missing-security',
    '--goal-id',
    'goal-missing-security',
    '--json',
  ], env));

  assert.equal(recorded.requiredChecksPassed, false);
  assert.deepEqual(recorded.missingPlanes, ['security']);
  assert.equal(assessed.status, 'rejected');
  assert.equal(assessed.reason, 'missing verification plane: security');
});

test('security high critical stale missing and secret scan findings block release claims', async () => {
  const { env } = await makeEnv();
  json(run(['scripts/runtime-state.mjs', 'init', '--json'], env));

  const cases = [
    {
      name: 'missing-codeql',
      scans: { codeql: { status: 'missing' }, dependencyReview: { status: 'passed' }, dependabot: { status: 'passed' }, secretScanning: { status: 'passed' } },
      expected: 'missing scan: codeql',
    },
    {
      name: 'stale-dependency-review',
      scans: { codeql: { status: 'passed' }, dependencyReview: { status: 'passed', producedAt: '2000-01-01T00:00:00.000Z' }, dependabot: { status: 'passed' }, secretScanning: { status: 'passed' } },
      expected: 'stale scan: dependencyReview',
    },
    {
      name: 'high-codeql',
      scans: { codeql: { status: 'passed', findings: [{ severity: 'high', ruleId: 'js/sql-injection' }] }, dependencyReview: { status: 'passed' }, dependabot: { status: 'passed' }, secretScanning: { status: 'passed' } },
      expected: 'high security finding: codeql',
    },
    {
      name: 'vulnerable-dependency',
      scans: { codeql: { status: 'passed' }, dependencyReview: { status: 'passed', findings: [{ severity: 'critical', package: 'demo' }] }, dependabot: { status: 'passed' }, secretScanning: { status: 'passed' } },
      expected: 'critical security finding: dependencyReview',
    },
    {
      name: 'secret-scan',
      scans: { codeql: { status: 'passed' }, dependencyReview: { status: 'passed' }, dependabot: { status: 'passed' }, secretScanning: { status: 'passed', findings: [{ severity: 'critical', type: 'token' }] } },
      expected: 'critical security finding: secretScanning',
    },
  ];

  for (const fixture of cases) {
    const result = json(run([
      'scripts/verification-plane.mjs',
      'assess-security',
      '--run-id',
      `run-${fixture.name}`,
      '--goal-id',
      `goal-${fixture.name}`,
      '--scans-json',
      JSON.stringify(fixture.scans),
      '--json',
    ], env));
    const assessed = json(run([
      'scripts/runtime-state.mjs',
      'assess-completion',
      '--run-id',
      `run-${fixture.name}`,
      '--goal-id',
      `goal-${fixture.name}`,
      '--json',
    ], env));

    assert.equal(result.releaseBlocked, true);
    assert.equal(result.blockers[0].reason, fixture.expected);
    assert.equal(assessed.status, 'rejected');
    assert.equal(assessed.reason, fixture.expected);
  }
});

test('owner-approved security exception is explicit evidence but remains visible', async () => {
  const { env } = await makeEnv();
  json(run(['scripts/runtime-state.mjs', 'init', '--json'], env));

  const result = json(run([
    'scripts/verification-plane.mjs',
    'assess-security',
    '--run-id',
    'run-security-exception',
    '--goal-id',
    'goal-security-exception',
    '--scans-json',
    JSON.stringify({
      codeql: { status: 'passed', findings: [{ severity: 'high', ruleId: 'js/path-injection' }] },
      dependencyReview: { status: 'passed' },
      dependabot: { status: 'passed' },
      secretScanning: { status: 'passed' },
    }),
    '--exception-json',
    '{"approvalId":"SEC-123","owner":"security-owner","reason":"accepted false positive"}',
    '--json',
  ], env));

  assert.equal(result.releaseBlocked, false);
  assert.equal(result.exceptionApplied, true);
  assert.equal(result.blockers[0].approvedException.approvalId, 'SEC-123');
});

test('browser trace evidence is normalized under excluded runtime artifact roots', async () => {
  const { env, repoRoot } = await makeEnv();

  const result = json(run([
    'scripts/verification-plane.mjs',
    'normalize-browser-trace',
    '--run-id',
    'run-browser-trace',
    '--goal-id',
    'goal-browser-trace',
    '--repo-root',
    repoRoot,
    '--url',
    'http://localhost:3000',
    '--flow',
    'smoke',
    '--json',
  ], env));
  const metadataPath = path.join(repoRoot, result.tracePath);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));

  assert.equal(result.status, 'recorded');
  assert.match(result.tracePath, /^\.moonshot-relay\/browser-artifacts\/run-browser-trace\/goal-browser-trace\/smoke\/trace-metadata\.json$/);
  assert.equal(metadata.runId, 'run-browser-trace');
  assert.equal(metadata.goalId, 'goal-browser-trace');
  assert.equal(metadata.reproducible, true);
  assert.ok(await stat(metadataPath));
});

test('package contract excludes generated verification traces and includes verification plane helper', async () => {
  const contract = await readFile(path.join(root, 'package', 'package-contract.yaml'), 'utf8');
  const packageTest = await readFile(path.join(root, 'tests', 'package-materialization.test.mjs'), 'utf8');

  assert.match(contract, /source: scripts\/verification-plane\.mjs/);
  assert.match(contract, /source: scripts\/lib\/verification-plane\.mjs/);
  assert.match(contract, /\.moonshot-relay\/browser-artifacts\/\*\*/);
  assert.match(contract, /\.moonshot-relay\/verification-reports\/\*\*/);
  assert.match(packageTest, /scripts\/verification-plane\.mjs/);
  assert.match(packageTest, /scripts\/lib\/verification-plane\.mjs/);
});
