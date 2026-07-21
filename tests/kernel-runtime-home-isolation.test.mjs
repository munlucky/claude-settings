import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from '../scripts/kernel/runtime-home.mjs';

test('Kernel runtime home defaults to an isolated account-root path', () => {
  const home = resolveKernelRuntimeHome({ env: {}, home: '/tmp/alice' });
  assert.equal(home, path.join('/tmp/alice', '.moon-relay-kernel'));
  assert.equal(assertIsolatedRuntimeHomes(home, '/tmp/alice/.moonshot-relay'), true);
});

test('shared or nested Relay home is rejected', () => {
  assert.throws(() => assertIsolatedRuntimeHomes('/tmp/x/.moonshot-relay', '/tmp/x/.moonshot-relay'));
});
