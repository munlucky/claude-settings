import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { writeKernelShortcuts, removeKernelShortcuts } from '../scripts/switcher/shortcuts.mjs';
test('Kernel shortcuts are owned, surface-specific, and unversioned', async () => {
  const root = path.join(os.tmpdir(), `switcher-shortcuts-${Date.now()}`);
  const result = await writeKernelShortcuts({ root, executable: 'moon-harness-switcher' });
  assert.equal(result.versionedApplicationPath, false);
  const kernel = JSON.parse(await readFile(path.join(root, 'Moon Relay Kernel - codex_desktop.json'), 'utf8'));
  assert.equal(kernel.runtime, 'moon-relay-kernel'); assert.equal(kernel.productId, 'moon-harness-switcher');
  await removeKernelShortcuts({ root }); await rm(root, { recursive: true, force: true });
});
