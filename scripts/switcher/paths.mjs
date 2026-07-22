import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { SURFACES, TRACKS } from './constants.mjs';

const home = () => process.env.MOON_HARNESS_SWITCHER_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.moon-harness-switcher');
export const switcherHome = () => path.resolve(home());
export const statePath = () => path.join(switcherHome(), 'state', 'state.json');
export const receiptsPath = () => path.join(switcherHome(), 'receipts');
export const journalPath = () => path.join(switcherHome(), 'state', 'journal.json');
export const shortcutRoot = () => path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Moon Harness');

export function resolveTrackRoots({ track, surface, sourceRoot = process.cwd(), relayHome = process.env.MOONSHOT_RELAY_HOME, kernelHome = process.env.MOON_RELAY_KERNEL_HOME, platform = process.platform } = {}) {
  if (!TRACKS.includes(track)) throw new Error(`wrong_harness: unsupported track ${track}`);
  if (!SURFACES.includes(surface)) throw new Error(`wrong_harness: unsupported surface ${surface}`);
  const relay = path.resolve(relayHome || path.join(process.env.USERPROFILE || os.homedir(), '.moonshot-relay'));
  const kernel = path.resolve(kernelHome || path.join(process.env.USERPROFILE || os.homedir(), '.moon-relay-kernel'));
  const providerRelay = {
    claude_cli: path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(process.env.USERPROFILE || os.homedir(), '.claude')),
    codex_cli: path.resolve(process.env.CODEX_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.codex')),
    qwen_cli: path.resolve(process.env.QWEN_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.qwen')),
    codex_desktop: path.resolve(process.env.CODEX_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.codex')),
    antigravity_desktop: path.resolve(process.env.ANTIGRAVITY_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.gemini', 'antigravity')),
  };
  const providerKernel = {
    claude_cli: path.join(kernel, 'providers', 'claude'),
    codex_cli: path.join(kernel, 'providers', 'codex'),
    qwen_cli: path.join(kernel, 'providers', 'qwen'),
    codex_desktop: path.join(kernel, 'providers', 'codex'),
    antigravity_desktop: path.join(kernel, 'providers', 'antigravity'),
  };
  const roots = track === 'relay'
    ? { runtimeHome: relay, providerHome: providerRelay[surface] }
    : { runtimeHome: kernel, providerHome: providerKernel[surface] };
  if (surface === 'codex_desktop') {
    const appDataBase = platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'));
    roots.appDataRoot = path.join(appDataBase, 'OpenAI', track === 'relay' ? 'Codex-Relay' : 'Codex-Kernel');
  }
  if (surface === 'antigravity_desktop') roots.appDataRoot = track === 'relay'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Antigravity-Relay')
    : path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Antigravity-Kernel');
  return { ...roots, sourceRoot: path.resolve(sourceRoot), track, surface };
}

const isWithin = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);
export async function physicalTargetIdentity(target, { protectedRoots = [] } = {}) {
  const canonical = path.resolve(target);
  let info = null;
  let symlink = false;
  try { info = await stat(canonical); symlink = (await lstat(canonical)).isSymbolicLink(); } catch { /* typed absence below */ }
  const resolved = info ? canonical : canonical;
  const parentReparse = [];
  let cursor = path.dirname(resolved);
  while (cursor && cursor !== path.dirname(cursor)) {
    try { if ((await lstat(cursor)).isSymbolicLink()) parentReparse.push(cursor); } catch { /* missing parent */ }
    cursor = path.dirname(cursor);
  }
  const collision = protectedRoots.find((root) => {
    const resolvedRoot = path.resolve(root);
    return isWithin(resolvedRoot, resolved) || isWithin(resolved, resolvedRoot);
  });
  return {
    canonicalPath: canonical,
    finalResolvedPath: resolved,
    volumeId: info?.dev ?? null,
    fileId: info?.ino ?? null,
    reparseTag: symlink ? 'symlink' : null,
    parentChainReparse: parentReparse,
    ownerSid: 'unavailable',
    aclSummary: 'unavailable',
    filesystem: process.platform === 'win32' ? 'ntfs_or_windows_fs_unverified' : info ? 'posix' : 'unknown',
    exists: Boolean(info),
    safe: !symlink && parentReparse.length === 0 && !collision,
    collisionWith: collision || null,
  };
}

export async function assertSafeTarget(target, { protectedRoots = [], allowMissing = true } = {}) {
  const identity = await physicalTargetIdentity(target, { protectedRoots });
  if (!identity.safe) throw Object.assign(new Error(`unsafe_target: ${target}`), { code: 'unsafe_target', identity });
  if (!allowMissing && !identity.exists) throw Object.assign(new Error(`target_collision: missing target ${target}`), { code: 'target_collision', identity });
  return identity;
}

export const hashAllowlistedFile = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
