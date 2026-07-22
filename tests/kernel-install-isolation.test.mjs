import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { installKernel, uninstallKernel, rollbackKernel } from '../scripts/kernel/installer.mjs';

test('Kernel manifest explicitly excludes Relay state and profiles', async () => {
  const m = JSON.parse(await readFile(new URL('../package/kernel/manifest.json', import.meta.url), 'utf8'));
  assert.ok(m.exclude.includes('.moonshot-relay'));
  assert.ok(m.exclude.includes('runtime-state.sqlite'));
  assert.equal(m.runtimeHome, '~/.moon-relay-kernel');
});

test('Kernel installer protects Relay marker and owned-file collisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'krn-install-'));
  await writeFile(path.join(root, '.keep'), 'relay');
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: relay\nproduct: moonshot-relay\n');
  await assert.rejects(() => installKernel({ targetRoot: root, sourceRoot: process.cwd() }), /Relay marker is protected/);
});

test('Kernel installer creates a backup and rollback restores owned files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'krn-install-'));
  const first = await installKernel({ targetRoot: root, sourceRoot: process.cwd() });
  const second = await installKernel({ targetRoot: root, sourceRoot: process.cwd() });
  assert.ok(second.backupPath);
  const payload = path.join(root, '.moon-relay', 'kernel-payload', 'bin', 'moon-relay-kernel.mjs');
  await writeFile(payload, 'tampered');
  const result = await uninstallKernel({ targetRoot: root });
  assert.equal(result.status, 'collision');
  const blocked = await rollbackKernel({ targetRoot: root, backupPath: second.backupPath });
  assert.equal(blocked.status, 'collision');
  await writeFile(payload, await readFile(path.join(process.cwd(), 'bin', 'moon-relay-kernel.mjs')));
  const rollback = await rollbackKernel({ targetRoot: root, backupPath: second.backupPath });
  assert.equal(rollback.status, 'rolled_back');
  assert.ok(first.manifestPath);
});

test('Kernel rollback removes runtime files introduced by a later install and restores the prior manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'krn-install-extra-'));
  const runtimeOne = await mkdtemp(path.join(os.tmpdir(), 'krn-runtime-one-'));
  const runtimeTwo = await mkdtemp(path.join(os.tmpdir(), 'krn-runtime-two-'));
  const nodeRel = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');
  try {
    for (const runtime of [runtimeOne, runtimeTwo]) {
      await mkdir(path.join(runtime, 'runtime', 'current', path.dirname(nodeRel)), { recursive: true });
      await writeFile(path.join(runtime, 'runtime', 'current', nodeRel), 'managed-node');
    }
    await writeFile(path.join(runtimeTwo, 'runtime', 'current', 'added-runtime-file.txt'), 'added');
    const first = await installKernel({ targetRoot: root, sourceRoot: process.cwd(), runtimeSource: runtimeOne });
    const firstManifest = JSON.parse(await readFile(first.manifestPath, 'utf8'));
    const second = await installKernel({ targetRoot: root, sourceRoot: process.cwd(), runtimeSource: runtimeTwo });
    assert.ok(second.backupPath);
    const added = path.join(root, '.moon-relay', 'kernel-payload', 'runtime', 'current', 'added-runtime-file.txt');
    assert.equal(await readFile(added, 'utf8'), 'added');
    const rolled = await rollbackKernel({ targetRoot: root, backupPath: second.backupPath });
    assert.equal(rolled.status, 'rolled_back');
    assert.ok(rolled.removed.includes('kernel-payload/runtime/current/added-runtime-file.txt'));
    await assert.rejects(() => readFile(added, 'utf8'));
    const restoredManifest = JSON.parse(await readFile(first.manifestPath, 'utf8'));
    assert.deepEqual(restoredManifest.files, firstManifest.files);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(runtimeOne, { recursive: true, force: true });
    await rm(runtimeTwo, { recursive: true, force: true });
  }
});
