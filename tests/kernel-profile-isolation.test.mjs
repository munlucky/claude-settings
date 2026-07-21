import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKernelProfile, inspectKernelProfile } from '../scripts/kernel/profile-build.mjs';

test('Codex profile materializes Kernel marker without Relay catalog and configures installed launcher hook', async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), 'krn-profile-'));
  const sourceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  await buildKernelProfile({ sourceRoot, runtime: 'codex', targetRoot: d });

  const marker = await inspectKernelProfile(d);
  assert.equal(marker.track, 'kernel');

  const agents = await readFile(path.join(d, 'AGENTS.override.md'), 'utf8');
  assert.doesNotMatch(agents, /moonshot-orchestrator/);

  const hooksText = await readFile(path.join(d, '.codex', 'hooks.json'), 'utf8');
  const hooks = JSON.parse(hooksText);
  assert.ok(Array.isArray(hooks.SessionStart));
  assert.match(hooks.SessionStart[0].command, /^moon-relay-kernel\s+assert-track/);

  // Test executing assert-track command in non-repo directory via node launcher (expects exit code 1)
  const binLauncher = path.join(sourceRoot, 'bin', 'moon-relay-kernel.mjs');
  try {
    execSync(`node "${binLauncher}" assert-track --json`, { cwd: d, encoding: 'utf8' });
    assert.fail('Expected assert-track to exit with code 1 in non-kernel directory');
  } catch (err) {
    assert.equal(err.status, 1);
    const parsed = JSON.parse(err.stdout);
    assert.equal(parsed.status, 'wrong_harness');
  }
});
