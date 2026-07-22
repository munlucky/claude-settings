import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { writeTrackShortcuts, removeTrackShortcuts } from '../scripts/switcher/shortcuts.mjs';
test('phase 03 shortcuts are owned, visible by track, and unversioned', async () => {
  const root = path.join(os.tmpdir(), `switcher-shortcuts-${Date.now()}`);
  const result = await writeTrackShortcuts({ root, executable: 'moon-harness-switcher' });
  assert.equal(result.versionedApplicationPath, false);
  const kernel = JSON.parse(await readFile(path.join(root, 'Moon Harness - kernel.json'), 'utf8'));
  assert.equal(kernel.track, 'kernel'); assert.equal(kernel.productId, 'moon-harness-switcher');
  await removeTrackShortcuts({ root }); await rm(root, { recursive: true, force: true });
});
