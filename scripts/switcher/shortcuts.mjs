import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { shortcutRoot } from './paths.mjs';

export const shortcutManifest = (track) => ({ schemaVersion: 1, productId: 'moon-harness-switcher', track, ownership: 'manifest-owned-static-only', target: 'bin/moon-harness-switcher.mjs', args: ['launch', '--track', track, '--surface', 'codex_desktop'] });
export async function writeTrackShortcuts({ root = shortcutRoot(), executable = 'moon-harness-switcher', tracks = ['relay', 'kernel'] } = {}) {
  const targetRoot = path.resolve(root); await mkdir(targetRoot, { recursive: true }); const written = [];
  for (const track of tracks) { const file = path.join(targetRoot, `Moon Harness - ${track}.json`); await writeFile(file, JSON.stringify({ ...shortcutManifest(track), executable }, null, 2)); written.push(file); }
  return { status: 'written', root: targetRoot, shortcuts: written, versionedApplicationPath: false };
}
export async function removeTrackShortcuts({ root = shortcutRoot() } = {}) { const targetRoot = path.resolve(root); for (const track of ['relay', 'kernel']) await rm(path.join(targetRoot, `Moon Harness - ${track}.json`), { force: true }); return { status: 'removed', root: targetRoot }; }
