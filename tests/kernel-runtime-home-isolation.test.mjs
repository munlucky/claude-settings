import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from '../scripts/kernel/runtime-home.mjs';

test('Kernel runtime home defaults to an isolated account-root path', () => {
  const home = resolveKernelRuntimeHome({ env: {}, home: '/tmp/alice' });
  assert.equal(home, path.join(realpathSync('/tmp'), 'alice', '.moon-relay-kernel'));
  assert.equal(assertIsolatedRuntimeHomes(home, '/tmp/alice/.moonshot-relay'), true);
});

test('shared or nested Relay home is rejected', () => {
  assert.throws(() => assertIsolatedRuntimeHomes('/tmp/x/.moonshot-relay', '/tmp/x/.moonshot-relay'));
});

test('runtime isolation follows symlinked homes before comparing ancestry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-home-symlink-'));
  const kernel = path.join(root, 'kernel');
  const alias = path.join(root, 'kernel-alias');
  try {
    await mkdir(kernel, { recursive: true });
    await symlink(kernel, alias, 'dir');
    assert.throws(() => assertIsolatedRuntimeHomes(kernel, alias), /isolated/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
