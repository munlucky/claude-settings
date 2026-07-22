import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installKernel } from '../scripts/kernel/installer.mjs';

const cliPath = fileURLToPath(new URL('../bin/moon-relay-kernel.mjs', import.meta.url));

test('doctor reports wrong_harness with exit code 0 outside a Kernel project', async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), 'krn-cli-'));
  const r = spawnSync(process.execPath, [cliPath, 'doctor', '--json'], { cwd: d, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).status, 'wrong_harness');
});

test('assert-track reports wrong_harness with exit code 1 outside a Kernel project', async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), 'krn-cli-assert-'));
  const r = spawnSync(process.execPath, [cliPath, 'assert-track', '--json'], { cwd: d, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, 'wrong_harness');
});

test('doctor and assert-track are ready in a Kernel project, including nested subdirectories', async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), 'krn-cli2-'));
  const sub = path.join(d, 'nested', 'sub', 'dir');
  await mkdir(path.join(d, '.moon-relay'), { recursive: true });
  await mkdir(sub, { recursive: true });
  await writeFile(path.join(d, '.moon-relay', 'track.yaml'), 'track: kernel\nproduct: moon-relay-kernel\n');

  const rDoc = spawnSync(process.execPath, [cliPath, 'doctor', '--json'], { cwd: sub, encoding: 'utf8' });
  assert.equal(rDoc.status, 0);
  assert.equal(JSON.parse(rDoc.stdout).status, 'ready');

  const rAssert = spawnSync(process.execPath, [cliPath, 'assert-track', '--json'], { cwd: sub, encoding: 'utf8' });
  assert.equal(rAssert.status, 0);
  assert.equal(JSON.parse(rAssert.stdout).status, 'ready');
});

test('uninstall validates the target project track when invoked from another directory', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'krn-cli-target-'));
  const caller = await mkdtemp(path.join(os.tmpdir(), 'krn-cli-caller-'));
  await installKernel({ targetRoot: target, sourceRoot: process.cwd() });
  const result = spawnSync(process.execPath, [cliPath, 'uninstall', '--target-root', target, '--project-root', target, '--json'], { cwd: caller, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'uninstalled');
  await rm(caller, { recursive: true, force: true });
  await rm(target, { recursive: true, force: true });
});
