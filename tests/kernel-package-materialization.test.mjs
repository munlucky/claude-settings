import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, stat } from 'node:fs/promises';
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
});

test('Kernel package materialization creates files on disk and validates mandatory files', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'kernel-pkg-mat-'));
  const result = await materializeKernelPackage({ sourceRoot, outputRoot: out, dryRun: false });
  assert.equal(result.dryRun, false);

  const reqFiles = [
    'schemas/kernel.track.schema.json',
    'schemas/kernel.runtime-state.schema.json',
    'skills/kernel-minimal-correct-change/SKILL.md',
    'skills/kernel-verification-before-completion/SKILL.md',
  ];

  for (const file of reqFiles) {
    const s = await stat(path.join(out, file));
    assert.ok(s.isFile(), `Expected file ${file} to exist in materialized package`);
  }
});
