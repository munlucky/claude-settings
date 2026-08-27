import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planKernelPackage, materializeKernelPackage } from '../scripts/kernel/package-build.mjs';

const sourceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

test('Kernel package dry plan contains only Kernel payload roots and includes required schemas and skills', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'kernel-pkg-'));
  const plan = await planKernelPackage({ sourceRoot, outputRoot: out });
  assert.equal(plan.manifest.productId, 'moon-relay-kernel');
  assert.ok(plan.planned.every((p) => !p.target.includes('.moonshot-relay')));
  assert.ok(plan.planned.some((p) => p.rel.includes('schemas/kernel.track.schema.json')));
  assert.ok(plan.planned.some((p) => p.rel.includes('skills/kernel-minimal-correct-change')));
  assert.ok(plan.planned.some((p) => p.rel === 'bin/moon-relay-kernel-host.mjs'));
  assert.ok(plan.planned.some((p) => p.rel.replace(/\/$/, '') === 'scripts/host/kernel'));
});

test('Kernel package materialization creates files on disk, validates mandatory files, and executes doctor cleanly', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'kernel-pkg-mat-'));
  const result = await materializeKernelPackage({ sourceRoot, outputRoot: out, dryRun: false });
  assert.equal(result.dryRun, false);

  const reqFiles = [
    'schemas/kernel.track.schema.json',
    'schemas/kernel.runtime-state.schema.json',
    'skills/kernel-minimal-correct-change/SKILL.md',
    'skills/kernel-verification-before-completion/SKILL.md',
    'package/kernel/skills.lock.json',
    'scripts/lib/skills-lock.mjs',
    'scripts/lib/candidate-identity.mjs',
    'scripts/kernel/run/host-session.mjs',
    'scripts/kernel/run/invocation-resolver.mjs',
    'scripts/kernel/run/successor-key.mjs',
    'scripts/switcher/app-resolver/common.mjs',
    'bin/moon-relay-kernel-host.mjs',
    'scripts/host/kernel/codex-review-host.mjs',
    'package/profile-templates/codex/AGENTS.md',
  ];

  for (const file of reqFiles) {
    const s = await stat(path.join(out, file));
    assert.ok(s.isFile(), `Expected file ${file} to exist in materialized package`);
  }

  // Execute doctor command directly inside materialized package output directory to verify ESM dependency closure
  const binPath = path.join(out, 'bin', 'moon-relay-kernel.mjs');
  const doctorOutput = execSync(`node "${binPath}" doctor --json`, {
    cwd: out,
    encoding: 'utf8',
    env: {
      ...process.env,
      MOON_RELAY_TRACK: '',
      MOON_RELAY_KERNEL_HOME: path.join(out, 'non-kernel-runtime'),
      MOON_RELAY_KERNEL_SESSION_ID: '',
      MOON_RELAY_KERNEL_RUN_ID: '',
      CODEX_THREAD_ID: '',
    },
  });
  const doctorJson = JSON.parse(doctorOutput);
  assert.equal(doctorJson.productId, 'moon-relay-kernel');
  assert.equal(doctorJson.status, 'wrong_harness');
});
