// K1: the Execution Capsule is the bounded context a fresh worker session gets.
// It must carry the work unit, the repository seam, and the required evidence —
// and nothing else.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { normalizeExecutionCapsule } from '../scripts/kernel/run/execution-capsule.mjs';
import { isSensitivePath, rankRelevantFiles } from '../scripts/kernel/run/capsule-selection.mjs';

const SCRIPTS = { 'test:ok': 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' };

const setup = async ({ files = {} } = {}) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-cap-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-cap-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'cap-fixture', version: '0.0.1', main: 'src/auth/index.mjs', scripts: SCRIPTS }, null, 2));
  for (const [relative, body] of Object.entries(files)) {
    const target = path.join(projectRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  spawnSync('git', ['add', '--all'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-m', 'fixture', '--quiet'], { cwd: projectRoot, encoding: 'utf8' });
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

const AUTH_FILES = {
  'src/auth/index.mjs': 'export const verify = () => true;\n',
  'src/auth/service.mjs': 'export class AuthService {}\nexport const verifyToken = () => true;\nconst privateHelper = () => 0;\n',
  'src/billing/invoice.mjs': 'export const invoice = () => 0;\n',
  '.env': 'SECRET=do-not-leak\n',
  'src/auth/credentials.pem': 'not-a-real-key\n',
};

test('K1-1: a brownfield capsule carries the seam, the work unit, and the required evidence', async () => {
  const fixture = await setup({ files: AUTH_FILES });
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-cap',
      objective: 'Validate token expiry',
      taskContract: {
        acceptance: ['expired tokens are rejected'],
        constraints: ['keep the public response shape'],
        nonGoals: ['do not redesign sessions'],
        behaviorChanging: true,
        allowedPaths: ['src/auth/**'],
        forbiddenPaths: ['src/billing/**'],
      },
    });

    const capsule = await cp.buildCapsule('r-cap');
    assert.match(capsule.capsuleId, /^capsule-[a-f0-9]{24}$/);
    assert.equal(capsule.role, 'implementer');
    assert.equal(capsule.permissions.filesystem, 'workspace_write');
    assert.equal(capsule.permissions.canCommit, false);
    assert.equal(capsule.permissions.canDelegate, false);

    // What to do, and where it may be done.
    assert.equal(capsule.objective, 'Validate token expiry');
    assert.deepEqual(capsule.workUnit.allowedPaths, ['src/auth/**']);
    assert.deepEqual(capsule.workUnit.forbiddenPaths, ['src/billing/**']);
    assert.deepEqual(capsule.constraints, ['keep the public response shape']);
    assert.deepEqual(capsule.nonGoals, ['do not redesign sessions']);

    // Which code to read first, and what proves the work.
    const files = capsule.repositoryContext.relevantFiles.map((file) => file.path);
    assert.ok(files.includes('src/auth/service.mjs'), JSON.stringify(files));
    assert.ok(!files.includes('src/billing/invoice.mjs'), 'out-of-scope files are not context');
    assert.ok(capsule.repositoryContext.manifests.includes('package.json'));
    assert.ok(capsule.repositoryContext.knownCommands.length > 0);
    assert.ok(capsule.repositoryContext.baseline.status);
    const unitTest = capsule.verification.obligations.find((entry) => entry.obligationId === 'unit-test');
    assert.deepEqual(unitTest.allowedCommandRefs, ['test:ok']);
    assert.equal(unitTest.evidenceClass, 'hard');

    // Declared symbols index the seam by name and path, so a fresh worker knows
    // where to start reading rather than having to grep for it.
    const symbols = capsule.repositoryContext.relevantSymbols;
    assert.ok(symbols.length > 0, JSON.stringify(symbols));
    assert.deepEqual(symbols.find((entry) => entry.symbol === 'AuthService'), { symbol: 'AuthService', path: 'src/auth/service.mjs' });
    assert.ok(symbols.some((entry) => entry.symbol === 'verifyToken'));
    assert.ok(!symbols.some((entry) => entry.symbol === 'privateHelper'), 'a private helper is not a seam');
    assert.ok(symbols.every((entry) => files.includes(entry.path)), 'symbols only come from files already in the capsule');
    assert.deepEqual(
      symbols.map((entry) => `${entry.path}#${entry.symbol}`),
      [...symbols.map((entry) => `${entry.path}#${entry.symbol}`)].sort(),
      'symbol order is deterministic',
    );

    // Provenance binds it to the state it was built from.
    assert.match(capsule.provenance.capsuleDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(capsule.provenance.workspaceIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.equal(capsule.mutationRevision, (await cp.getRun('r-cap')).mutationRevision);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K1-2: a greenfield capsule carries the walking skeleton instead of a repository seam', async () => {
  // Greenfield means no manifest, negligible source, and no history at all.
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-cap-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-cap-green-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  const fixture = { runtimeHome, projectRoot };
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-green', objective: 'Start a service', taskContract: { acceptance: ['it boots'], projectType: 'service' } });
    const run = await cp.getRun('r-green');
    assert.equal(run.projectMode, 'greenfield');
    const capsule = await cp.buildCapsule('r-green');
    assert.equal(capsule.repositoryContext.projectMode, 'greenfield');
    assert.ok(capsule.repositoryContext.walkingSkeleton, 'a greenfield worker needs the minimal runnable slice');
    assert.deepEqual(capsule.repositoryContext.relevantFiles, []);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K1-3/4: unrelated knowledge is excluded and secret-bearing paths never enter a capsule', async () => {
  const fixture = await setup({ files: AUTH_FILES });
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-secret', objective: 'x', taskContract: { acceptance: ['works'], allowedPaths: ['src/**'] } });
    const capsule = await cp.buildCapsule('r-secret');
    const serialized = JSON.stringify(capsule);
    assert.ok(!serialized.includes('.env'), 'an env file is never named');
    assert.ok(!serialized.includes('credentials.pem'), 'a key file is never named');
    assert.ok(!serialized.includes('do-not-leak'), 'no file body ever enters a capsule');

    // The classifier itself is explicit about what it treats as secret-bearing.
    for (const candidate of ['.env', 'config/.env.local', 'certs/server.pem', 'deploy/id_rsa', 'secrets/app.json']) {
      assert.equal(isSensitivePath(candidate), true, candidate);
    }
    assert.equal(isSensitivePath('src/auth/service.mjs'), false);

    // A capsule assembled with a secret path is refused rather than trimmed.
    assert.throws(
      () => normalizeExecutionCapsule({
        runId: 'r', role: 'implementer', mutationRevision: 0,
        permissions: { filesystem: 'workspace_write' },
        provenance: { workspaceIdentity: `sha256:${'a'.repeat(64)}` },
        repositoryContext: { relevantFiles: [{ path: '.env' }] },
      }),
      /must not name secret-bearing paths/,
    );
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K1-5: a change outside the capsule work unit is refused at report time', async () => {
  const fixture = await setup({ files: AUTH_FILES });
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-scope',
      objective: 'x',
      taskContract: { acceptance: ['works'], allowedPaths: ['src/auth/**'], forbiddenPaths: ['src/billing/**'] },
    });
    await cp.buildCapsule('r-scope');
    await writeFile(path.join(fixture.projectRoot, 'src/auth/service.mjs'), 'export class AuthService { verify() { return true; } }\n');

    const outside = await cp.report('r-scope', {
      summary: 'also touched billing',
      changedPaths: ['src/auth/service.mjs', 'src/billing/invoice.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['works'] }],
    });
    assert.equal(outside.status, 'scope-rejected');
    assert.equal(outside.executed.length, 0, 'a scope violation must not execute evidence');
    assert.match(outside.failures[0].errorSummary, /inside a forbidden path/);

    const inside = await cp.report('r-scope', {
      summary: 'auth only',
      changedPaths: ['src/auth/service.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['works'] }],
    });
    assert.equal(inside.status, 'completed');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K1: file ranking is deterministic and tiered by scope, acceptance, then adjacency', () => {
  const ranked = rankRelevantFiles({
    candidates: ['src/billing/invoice.mjs', 'src/auth/service.mjs', 'src/auth/index.mjs', 'docs/readme.md', '.env'],
    allowedPaths: ['src/auth/**'],
    acceptancePaths: ['docs/readme.md'],
    changedPaths: ['src/billing/invoice.mjs'],
    projectRoot: process.cwd(),
  });
  assert.deepEqual(ranked.map((entry) => entry.path), [
    'src/auth/index.mjs',
    'src/auth/service.mjs',
    'docs/readme.md',
    'src/billing/invoice.mjs',
  ]);
  assert.equal(ranked[0].reason, 'inside the work unit scope');
  assert.equal(ranked[2].reason, 'named by the acceptance criteria');
  assert.equal(ranked[3].reason, 'adjacent to a changed path');
});
