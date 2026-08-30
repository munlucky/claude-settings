import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { KERNEL_RUNTIME_ID, SURFACES } from './constants.mjs';
import { shortcutRoot } from './paths.mjs';

export const shortcutManifest = (surface = 'codex_desktop') => ({
  schemaVersion: 1,
  productId: 'moon-harness-switcher',
  runtime: KERNEL_RUNTIME_ID,
  surface,
  ownership: 'manifest-owned-static-only',
  target: 'bin/moon-harness-switcher.mjs',
  args: ['launch', '--surface', surface],
});

export async function writeKernelShortcuts({ root = shortcutRoot(), executable = 'moon-harness-switcher', surfaces = ['codex_desktop'] } = {}) {
  const targetRoot = path.resolve(root);
  await mkdir(targetRoot, { recursive: true });
  const written = [];
  for (const surface of surfaces) {
    if (!SURFACES.includes(surface)) throw new Error('wrong_harness: unsupported surface ' + surface);
    const file = path.join(targetRoot, 'Moon Relay Kernel - ' + surface + '.json');
    await writeFile(file, JSON.stringify({ ...shortcutManifest(surface), executable }, null, 2));
    written.push(file);
  }
  return { status: 'written', runtime: KERNEL_RUNTIME_ID, root: targetRoot, shortcuts: written, versionedApplicationPath: false };
}

export async function removeKernelShortcuts({ root = shortcutRoot() } = {}) {
  const targetRoot = path.resolve(root);
  for (const surface of SURFACES) await rm(path.join(targetRoot, 'Moon Relay Kernel - ' + surface + '.json'), { force: true });
  return { status: 'removed', runtime: KERNEL_RUNTIME_ID, root: targetRoot };
}
