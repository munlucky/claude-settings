import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import {
  assertRuntimeSurfaceUnexpanded,
  auditSkillsLock,
  buildSkillsLock,
  discoverSourceSkills,
} from '../scripts/lib/skills-lock.mjs';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const approvedLock = async () => {
  const lock = await buildSkillsLock({
    generatedAt: '2026-06-23T00:00:00.000Z',
    defaultLicense: 'MIT',
    defaultPermissions: [],
  });
  return {
    ...lock,
    skills: lock.skills.map((skill) => ({
      ...skill,
      permissionReview: { status: 'approved', reviewedAt: '2026-06-23T00:00:00.000Z', reviewer: 'test' },
    })),
  };
};

const createDoctorFixtureRoot = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-doctor-fixture-'));
  tempRoots.push(tempRoot);
  await mkdir(path.join(tempRoot, 'skills', 'fixture-skill'), { recursive: true });
  await mkdir(path.join(tempRoot, 'package'), { recursive: true });
  await writeFile(path.join(tempRoot, 'skills', 'fixture-skill', 'SKILL.md'), '# Fixture Skill\n');
  await writeFile(path.join(tempRoot, 'package', 'runtime-surface.json'), JSON.stringify({
    schemaVersion: 1,
    publicRuntimeSkills: ['fixture-skill'],
  }, null, 2));
  const lock = await buildSkillsLock({
    repoRoot: tempRoot,
    generatedAt: '2026-06-30T00:00:00.000Z',
    defaultLicense: 'MIT',
    defaultPermissions: [],
  });
  await writeFile(path.join(tempRoot, 'skills.lock.json'), JSON.stringify(lock, null, 2));
  return tempRoot;
};

const runDoctor = (args, options = {}) => spawnSync(process.execPath, [
  path.join(process.cwd(), 'scripts', 'doctor.mjs'),
  'check',
  ...args,
  '--json',
], {
  cwd: options.cwd || process.cwd(),
  encoding: 'utf8',
});

test('skills audit detects missing lock hash drift license and permission review gaps', async () => {
  const missing = await auditSkillsLock({ lock: null });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.findings[0].type, 'missing_lock');

  const lock = await approvedLock();
  lock.skills[0] = {
    ...lock.skills[0],
    contentHash: '0'.repeat(64),
    license: 'UNSPECIFIED',
    permissions: ['network'],
    permissionReview: { status: 'required' },
  };
  const audited = await auditSkillsLock({ lock, runtimeSurface: { publicRuntimeSkills: [] } });

  assert.equal(audited.status, 'blocked');
  assert.ok(audited.findings.some((finding) => finding.type === 'hash_drift'));
  assert.ok(audited.findings.some((finding) => finding.type === 'license_gap'));
  assert.ok(audited.findings.some((finding) => finding.type === 'permission_review_required'));
});

test('runtime surface expansion is blocked unless explicitly approved elsewhere', () => {
  assert.equal(assertRuntimeSurfaceUnexpanded({ before: ['a', 'b'], after: ['a'] }), true);
  assert.throws(() => assertRuntimeSurfaceUnexpanded({
    before: ['moonshot-phase-runner'],
    after: ['moonshot-phase-runner', 'internal-skill'],
  }), /explicit approval/);
});

test('skills audit CLI generates and audits a lock file', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-skills-audit-'));
  tempRoots.push(tempRoot);
  const lockPath = path.join(tempRoot, 'skills.lock.json');

  const generated = spawnSync(process.execPath, [
    'scripts/skills-audit.mjs',
    'generate-lock',
    '--out',
    lockPath,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const generatedPayload = JSON.parse(generated.stdout);
  assert.equal(generatedPayload.status, 'generated');
  assert.ok((await readFile(lockPath, 'utf8')).includes('"skills"'));

  const audit = spawnSync(process.execPath, [
    'scripts/skills-audit.mjs',
    'audit',
    '--lock',
    lockPath,
    '--runtime-surface',
    'package/runtime-surface.json',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
  assert.equal(JSON.parse(audit.stdout).status, 'review_required');
});

test('doctor uses repository skills lock by default', () => {
  const result = runDoctor([]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'moonshot-doctor-readiness.v1');
  assert.equal(payload.status, 'pass');
  for (const key of [
    'runtimeSurface',
    'skillsLock',
    'labReadiness',
    'evalReadiness',
    'researchReadiness',
    'profileTrust',
    'generatedStateBoundary',
  ]) {
    assert.ok(payload.checks[key], `missing ${key}`);
  }
  assert.equal(payload.checks.runtimeSurface.status, 'pass');
  assert.equal(payload.checks.skillsLock.status, 'pass');
});

test('doctor can verify an explicit installed payload root', () => {
  const result = runDoctor([
    '--repo-root',
    process.cwd(),
    '--lock',
    'skills.lock.json',
    '--runtime-surface',
    'package/runtime-surface.json',
  ], {
    cwd: os.tmpdir(),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'pass');
  assert.equal(payload.checks.runtimeSettings, 'explicit_repo_root');
  assert.equal(payload.checks.profileTrust.mode, 'explicit_repo_root');
  assert.equal(payload.checks.profileTrust.installedInputs, 'explicit');
  assert.equal(payload.checks.repoRoot, process.cwd());
  assert.match(payload.checks.lockPath, /skills\.lock\.json$/);
  assert.match(payload.checks.runtimeSurfacePath, /package[\\/]runtime-surface\.json$/);
});

test('doctor blocks missing lock and runtime surface expansion', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-doctor-'));
  tempRoots.push(tempRoot);
  const runtimeSurfacePath = path.join(tempRoot, 'runtime-surface.json');
  await writeFile(runtimeSurfacePath, JSON.stringify({
    schemaVersion: 1,
    publicRuntimeSkills: ['moonshot-phase-runner', 'internal-skill'],
  }, null, 2));

  const result = runDoctor([
    '--runtime-surface',
    runtimeSurfacePath,
    '--expected-runtime-surface-json',
    JSON.stringify(['moonshot-phase-runner']),
  ], {
    cwd: tempRoot,
  });

  assert.equal(result.status, 2, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'moonshot-doctor-readiness.v1');
  assert.equal(payload.status, 'blocked');
  assert.equal(payload.checks.runtimeSurface.status, 'blocked');
  assert.equal(payload.checks.skillsLock.status, 'blocked');
  assert.ok(payload.findings.some((finding) => finding.type === 'runtime_surface_expanded'));
  assert.ok(payload.findings.some((finding) => finding.type === 'missing_lock'));
});

test('doctor treats missing optional readiness evidence as degraded not blocking', async () => {
  const tempRoot = await createDoctorFixtureRoot();
  const result = runDoctor([
    '--repo-root',
    tempRoot,
    '--lock',
    'skills.lock.json',
    '--runtime-surface',
    'package/runtime-surface.json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'degraded');
  assert.equal(payload.checks.runtimeSurface.status, 'pass');
  assert.equal(payload.checks.skillsLock.status, 'pass');
  assert.equal(payload.checks.labReadiness.status, 'not_initialized');
  assert.equal(payload.checks.evalReadiness.status, 'not_available');
  assert.equal(payload.checks.researchReadiness.status, 'not_available');
  assert.ok(payload.findings.every((finding) => finding.severity !== 'blocking'));
});

test('doctor blocks generated state selected for package payload', async () => {
  const tempRoot = await createDoctorFixtureRoot();
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({
    files: [
      'scripts/',
      '.moonshot-relay/**',
      'docs/implementation/example/execution/**',
    ],
  }, null, 2));

  const result = runDoctor([
    '--repo-root',
    tempRoot,
    '--lock',
    'skills.lock.json',
    '--runtime-surface',
    'package/runtime-surface.json',
  ]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'blocked');
  assert.equal(payload.checks.generatedStateBoundary.status, 'blocked');
  assert.ok(payload.findings.some((finding) => finding.type === 'generated_state_selected_for_package'));
});

test('skills lock schema is parseable and source skill discovery finds phase runner', async () => {
  const schema = JSON.parse(await readFile(path.join(process.cwd(), 'schemas', 'skills-lock.schema.json'), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const skills = await discoverSourceSkills();
  assert.ok(skills.some((skill) => skill.name === 'moonshot-phase-runner'));
});
