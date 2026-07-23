import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from '../scripts/kernel/runtime-home.mjs';
import { resolveKernelProjectIdentity } from '../scripts/kernel/project-identity.mjs';

test('assertIsolatedRuntimeHomes fails closed when Kernel home equals or overlaps Relay home', () => {
  const relayHome = path.join(os.homedir(), '.moonshot-relay');
  assert.throws(() => assertIsolatedRuntimeHomes(relayHome, relayHome), /isolated/);
  assert.throws(() => assertIsolatedRuntimeHomes(path.join(relayHome, 'nested'), relayHome), /isolated/);
});

test('resolveKernelProjectIdentity generates isolated namespaces without reading Relay home', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-iso-test-'));
  const kernelHome = path.join(tmp, '.moon-relay-kernel');
  const relayHome = path.join(tmp, '.moonshot-relay');

  const result = resolveKernelProjectIdentity({ cwd: tmp, env: { MOON_RELAY_KERNEL_HOME: kernelHome, MOONSHOT_RELAY_HOME: relayHome } });
  assert.ok(result.namespaces.kernelStateRoot.startsWith(kernelHome));
  assert.ok(result.namespaces.projectKnowledgeRoot.startsWith(kernelHome));
  assert.ok(!result.namespaces.projectKnowledgeRoot.includes('.moonshot-relay'));
});
