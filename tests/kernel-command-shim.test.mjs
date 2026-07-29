import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { materializeKernelCommandShim } from '../scripts/kernel/installer.mjs';
import { buildProcessEnvironment } from '../scripts/switcher/launch-adapter.mjs';

test('process-scoped kernel shim executes without changing the parent PATH', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-shim-'));
  const entrypoint = path.join(runtimeHome, 'entrypoint.mjs');
  await writeFile(entrypoint, 'console.log(JSON.stringify({ argv: process.argv.slice(2) }))');
  const originalPath = process.env.PATH;
  const installed = await materializeKernelCommandShim({ runtimeHome, entrypoint });
  const env = buildProcessEnvironment({
    surface: 'codex_cli',
    track: 'kernel',
    roots: { runtimeHome, providerHome: path.join(runtimeHome, 'providers', 'codex') },
    runId: 'run-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    baseEnv: { PATH: originalPath },
  });
  assert.equal(process.env.PATH, originalPath);
  assert.equal(env.PATH.split(path.delimiter)[0], path.join(runtimeHome, 'bin'));
  assert.equal(env.MOON_RELAY_KERNEL_RUN_ID, 'run-1');
  if (process.platform !== 'win32') {
    const shim = installed.written[0];
    await access(shim, constants.X_OK);
    assert.match(await readFile(shim, 'utf8'), /^#!\/bin\/sh/);
    const result = spawnSync(shim, ['next'], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result.stdout).argv, ['next']);
  }
});
