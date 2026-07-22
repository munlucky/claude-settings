import path from 'node:path';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { SWITCHER_PRODUCT_ID } from './constants.mjs';
import { switcherHome } from './paths.mjs';
import { writeTrackShortcuts, removeTrackShortcuts } from './shortcuts.mjs';
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
export const SWITCHER_PAYLOAD = ['bin/moon-harness-switcher.mjs', 'scripts/switcher', 'schemas/harness-switcher.selection.schema.json', 'schemas/harness-switcher.journal.schema.json', 'schemas/harness-switcher.receipt.schema.json', 'schemas/harness-switcher.state.schema.json', 'schemas/harness-switcher.app-discovery.schema.json', 'package/switcher/manifest.json'];
export const SWITCHER_RUNTIME_STATE = ['receipts', 'state'];
export async function installSwitcher({ sourceRoot = process.cwd(), targetRoot = switcherHome(), shortcutRoot: shortcutDir = null } = {}) {
  const target = path.resolve(targetRoot); await mkdir(target, { recursive: true });
  const marker = path.join(target, '.moon-harness-switcher-marker.json');
  if (await exists(marker)) { const current = JSON.parse(await readFile(marker, 'utf8')); if (current.productId !== SWITCHER_PRODUCT_ID) throw new Error('target_collision: foreign switcher marker'); }
  const payloadRoot = path.resolve(sourceRoot);
  for (const rel of SWITCHER_PAYLOAD) { const from = path.join(payloadRoot, rel); if (!(await exists(from))) throw new Error(`application_not_resolved: missing switcher payload ${rel}`); await cp(from, path.join(target, rel), { recursive: true, force: true }); }
  await writeFile(marker, JSON.stringify({ schemaVersion: 1, productId: SWITCHER_PRODUCT_ID, ownership: 'manifest-owned-static-only', installedAt: new Date().toISOString() }, null, 2));
  const shortcuts = await writeTrackShortcuts({ root: shortcutDir || undefined });
  return { status: 'installed', productId: SWITCHER_PRODUCT_ID, targetRoot: target, shortcuts, installId: `${Date.now()}-${process.pid}` };
}
export async function uninstallSwitcherPackage({ targetRoot = switcherHome(), shortcutRoot: shortcutDir = null } = {}) {
  const target = path.resolve(targetRoot);
  const removed = [];
  for (const rel of SWITCHER_PAYLOAD) { await rm(path.join(target, rel), { recursive: true, force: true }); removed.push(path.join(target, rel)); }
  for (const rel of SWITCHER_RUNTIME_STATE) { await rm(path.join(target, rel), { recursive: true, force: true }); removed.push(path.join(target, rel)); }
  await rm(path.join(target, '.moon-harness-switcher-marker.json'), { force: true });
  const shortcuts = await removeTrackShortcuts({ root: shortcutDir || undefined });
  return { status: 'uninstalled', targetRoot: target, removed, shortcuts, preserved: ['provider roots', 'provider-created data', 'unknown user files'] };
}
