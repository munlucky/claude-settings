import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';

const MANIFEST = '.moon-harness-profile-overlay.json', BACKUP = '.moon-harness-profile-backup';
const STAGING = '.moon-harness-profile-staging', RETIRED = '.moon-harness-profile-retired';
const TARGETS = {
  codex_desktop: [
    { live: 'skills', source: 'skills' }, { live: 'AGENTS.md', source: 'AGENTS.override.md' },
    { live: 'config.toml', source: '.codex/config.toml' }, { live: 'hooks.json', source: '.codex/hooks.json' },
  ],
  claude_cli: [{ live: 'skills', source: 'skills' }, { live: 'CLAUDE.md', source: 'CLAUDE.md' }, { live: 'settings.json', source: 'settings.json' }],
};
const exists = async (target) => { try { await lstat(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const accountRootFor = (surface, home) => surface === 'codex_desktop'
  ? path.join(home, '.codex')
  : surface === 'claude_cli' ? path.join(home, '.claude') : null;
export const requiresAccountSkillsOverlay = (surface, platform = process.platform) =>
  surface === 'codex_desktop' || (surface === 'claude_cli' && ['win32', 'darwin'].includes(platform));

const assertPlain = async (target) => {
  const info = await lstat(target); if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw fail('unsafe_target', `unsafe_target: ${target}`);
};
const assertSafeOverlayPaths = async (paths) => {
  let cursor = paths.root;
  while (cursor && cursor !== path.dirname(cursor)) {
    if (await exists(cursor)) { const info = await lstat(cursor); if (info.isSymbolicLink()) throw fail('unsafe_target', `symlink ancestry: ${cursor}`); } cursor = path.dirname(cursor);
  }
  for (const target of [paths.backup, paths.staging, paths.retired]) {
    if (await exists(target)) { const info = await lstat(target); if (info.isSymbolicLink() || !info.isDirectory()) throw fail('unsafe_target', `unsafe overlay directory: ${target}`); }
  }
};
const inventory = async (root) => {
  const info = await lstat(root); if (info.isSymbolicLink()) throw fail('unsafe_target', `unsafe_target: ${root}`);
  if (info.isFile()) { const bytes = await readFile(root); return [{ path: '.', type: 'file', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]; }
  const rows = []; const visit = async (current, relative = '') => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const rel = path.join(relative, entry.name).replaceAll('\\', '/'); const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw fail('unsafe_target', `unsafe_target: symlink ${rel}`);
      if (entry.isDirectory()) { rows.push({ path: `${rel}/`, type: 'directory' }); await visit(full, rel); }
      else if (entry.isFile()) { const bytes = await readFile(full); rows.push({ path: rel, type: 'file', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
      else throw fail('unsafe_target', `unsafe_target: unsupported entry ${rel}`);
    }
  };
  await visit(root); return rows;
};
const inspect = async (target) => {
  if (!(await exists(target))) return { exists: false, digest: null }; await assertPlain(target);
  return { exists: true, digest: createHash('sha256').update(JSON.stringify(await inventory(target))).digest('hex') };
};
const pathsFor = ({ surface, accountHome = null }) => {
  const resolvedHome = accountHome ? (realpathSync(accountHome)) : (process.env.USERPROFILE || process.env.HOME || os.homedir());
  const root = accountRootFor(surface, path.resolve(resolvedHome)); return { surface, root, manifest: path.join(root, MANIFEST), backup: path.join(root, BACKUP), staging: path.join(root, STAGING), retired: path.join(root, RETIRED) };
};
const writeManifest = async (file, value, exclusive = false) => {
  const temp = `${file}.tmp`; await rm(temp, { force: true });
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, exclusive ? { encoding: 'utf8', flag: 'wx' } : 'utf8'); await rename(temp, file);
};
const readManifest = async (file, surface) => {
  if (!(await exists(file))) return null; await assertPlain(file); const value = JSON.parse(await readFile(file, 'utf8'));
  const expected = TARGETS[surface] || []; const validTargets = Array.isArray(value.targets) && value.targets.length === expected.length && value.targets.every((item, index) =>
    item.live === expected[index].live && item.source === expected[index].source && typeof item.originalExists === 'boolean'
    && (item.originalDigest === null || typeof item.originalDigest === 'string') && typeof item.overlayDigest === 'string');
  if (value.schemaVersion !== 1 || value.productId !== 'moon-harness-switcher' || value.kind !== 'account-profile-overlay'
    || value.surface !== surface || !path.isAbsolute(value.providerHome || '') || !['prepared', 'staged', 'originals_moved', 'applied', 'restoring'].includes(value.state)
    || !validTargets) throw fail('target_collision', `invalid overlay manifest: ${file}`);
  return value;
};
const liveState = async (paths, target) => ({
  live: await inspect(path.join(paths.root, target.live)),
  backup: await inspect(path.join(paths.backup, target.live)),
  retired: await inspect(path.join(paths.retired, target.live)),
});

async function rollbackToOriginal(paths, manifest, { force = false } = {}) {
  await assertSafeOverlayPaths(paths);
  for (const target of manifest.targets) {
    const livePath = path.join(paths.root, target.live), backupPath = path.join(paths.backup, target.live), retiredPath = path.join(paths.retired, target.live);
    const state = await liveState(paths, target);
    if (target.originalExists) {
      if (state.backup.digest === target.originalDigest || force) {
        if (state.live.exists) {
          if (state.live.digest !== target.overlayDigest && !force) throw fail('overlay_recovery_required', `changed live target: ${target.live}`);
          await mkdir(path.dirname(retiredPath), { recursive: true }); await rm(retiredPath, { recursive: true, force: true }); await rename(livePath, retiredPath);
        } else if (state.retired.exists && state.retired.digest !== target.overlayDigest && !force) throw fail('overlay_recovery_required');
        if (state.backup.exists) {
          await rm(livePath, { recursive: true, force: true }); await mkdir(path.dirname(livePath), { recursive: true }); await rename(backupPath, livePath);
        }
      } else if (state.live.digest !== target.originalDigest) {
        throw fail('overlay_backup_drift', `original unavailable: ${target.live}`);
      }
    } else if (state.live.exists) {
      if (state.live.digest !== target.overlayDigest && !force) throw fail('overlay_recovery_required', `unexpected live target: ${target.live}`);
      await mkdir(path.dirname(retiredPath), { recursive: true }); await rm(retiredPath, { recursive: true, force: true }); await rename(livePath, retiredPath);
    }
  }
  await rm(paths.retired, { recursive: true, force: true }); await rm(paths.staging, { recursive: true, force: true });
  await rm(paths.backup, { recursive: true, force: true }); await rm(paths.manifest, { force: true });
}
function deepMergeJson(target, source) {
  if (typeof target !== 'object' || target === null || typeof source !== 'object' || source === null) {
    return source !== undefined ? source : target;
  }
  if (Array.isArray(target) || Array.isArray(source)) {
    return Array.isArray(source) ? source : target;
  }
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key in target && typeof target[key] === 'object' && typeof source[key] === 'object' && !Array.isArray(target[key]) && !Array.isArray(source[key])) {
      result[key] = deepMergeJson(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

async function verifyApplied(paths, manifest) {
  for (const target of manifest.targets) {
    const live = await inspect(path.join(paths.root, target.live));
    if (live.digest !== target.overlayDigest) {
      if (target.live.endsWith('.json') && live.exists) {
        try {
          const content = JSON.parse(await readFile(path.join(paths.root, target.live), 'utf8'));
          if (content && typeof content === 'object') continue;
        } catch {}
      }
      return false;
    }
  }
  return true;
}

export async function inspectAccountSkillsOverlay({ surface, platform = process.platform, accountHome } = {}) {
  if (!requiresAccountSkillsOverlay(surface, platform)) return { status: 'not_required' };
  const paths = pathsFor({ surface, accountHome }); await assertSafeOverlayPaths(paths); const manifest = await readManifest(paths.manifest, paths.surface);
  if (!manifest) {
    const orphaned = await exists(paths.backup) || await exists(paths.staging) || await exists(paths.retired);
    return { status: orphaned ? 'recovery_required' : 'inactive', accountRoot: paths.root };
  }
  if (manifest.state !== 'applied') return { status: 'recovery_required', state: manifest.state, accountRoot: paths.root };
  return { status: await verifyApplied(paths, manifest) ? 'active' : 'drifted', state: manifest.state, accountRoot: paths.root };
}

export async function applyAccountSkillsOverlay({ surface, providerHome, platform = process.platform, accountHome } = {}) {
  if (!requiresAccountSkillsOverlay(surface, platform)) return { status: 'not_required' };
  const paths = pathsFor({ surface, accountHome }); await mkdir(paths.root, { recursive: true }); await assertPlain(paths.root); await assertSafeOverlayPaths(paths);
  let manifest = await readManifest(paths.manifest, paths.surface);
  if (manifest && manifest.state !== 'applied') { await rollbackToOriginal(paths, manifest); manifest = null; }
  if (manifest) {
    if (!(await verifyApplied(paths, manifest))) throw fail('overlay_drift', 'account profile changed while Kernel overlay was active');
    if (path.resolve(manifest.providerHome) !== path.resolve(providerHome)) throw fail('target_collision', 'overlay belongs to another provider home');
    return { status: 'already_applied', accountRoot: paths.root, discoveredSkills: manifest.discoveredSkills };
  }
  if (await exists(paths.backup) || await exists(paths.staging) || await exists(paths.retired)) throw fail('target_collision', 'orphaned overlay artifacts exist');
  const targets = [];
  for (const target of TARGETS[surface]) {
    const source = path.join(providerHome, target.source); const sourceState = await inspect(source);
    if (!sourceState.exists) throw fail('kernel_profile_not_ready', `missing provider profile target: ${target.source}`);
    const original = await inspect(path.join(paths.root, target.live)); targets.push({ ...target, originalExists: original.exists, originalDigest: original.digest, overlayDigest: sourceState.digest });
  }
  const discoveredSkills = (await readdir(path.join(providerHome, 'skills'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  const base = { schemaVersion: 1, productId: 'moon-harness-switcher', kind: 'account-profile-overlay', surface, providerHome: path.resolve(providerHome), state: 'prepared', targets, discoveredSkills };
  await writeManifest(paths.manifest, base, true);
  try {
    for (const target of targets) {
      const destination = path.join(paths.staging, target.live); await mkdir(path.dirname(destination), { recursive: true });
      const sourcePath = path.join(providerHome, target.source);
      if (target.live.endsWith('.json') && target.originalExists) {
        try {
          const origContent = JSON.parse(await readFile(path.join(paths.root, target.live), 'utf8'));
          const overlayContent = JSON.parse(await readFile(sourcePath, 'utf8'));
          const merged = deepMergeJson(origContent, overlayContent);
          await writeFile(destination, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
        } catch {
          await cp(sourcePath, destination, { recursive: true, errorOnExist: true, force: false });
        }
      } else {
        await cp(sourcePath, destination, { recursive: true, errorOnExist: true, force: false });
      }
      target.overlayDigest = (await inspect(destination)).digest;
    }
    await writeManifest(paths.manifest, { ...base, state: 'staged' });
    for (const target of targets.filter((item) => item.originalExists)) {
      const destination = path.join(paths.backup, target.live); await mkdir(path.dirname(destination), { recursive: true });
      await rename(path.join(paths.root, target.live), destination);
    }
    await writeManifest(paths.manifest, { ...base, state: 'originals_moved' });
    for (const target of targets) {
      await mkdir(path.dirname(path.join(paths.root, target.live)), { recursive: true }); await rename(path.join(paths.staging, target.live), path.join(paths.root, target.live));
    }
    await rm(paths.staging, { recursive: true, force: true });
    await writeManifest(paths.manifest, { ...base, state: 'applied' });
  } catch (error) {
    const current = await readManifest(paths.manifest, paths.surface).catch(() => base);
    await rollbackToOriginal(paths, current).catch(() => {});
    throw error;
  }
  return { status: 'applied', accountRoot: paths.root, discoveredSkills };
}

export async function restoreAccountSkillsOverlay({ surface, platform = process.platform, accountHome, force = false } = {}) {
  if (!requiresAccountSkillsOverlay(surface, platform)) return { status: 'not_required' };
  const paths = pathsFor({ surface, accountHome }); await assertSafeOverlayPaths(paths); const manifest = await readManifest(paths.manifest, paths.surface);
  if (!manifest) {
    if (await exists(paths.backup) || await exists(paths.staging) || await exists(paths.retired)) {
      if (force) {
        await rm(paths.backup, { recursive: true, force: true });
        await rm(paths.staging, { recursive: true, force: true });
        await rm(paths.retired, { recursive: true, force: true });
        return { status: 'cleaned', accountRoot: paths.root };
      }
      throw fail('target_collision', 'orphaned overlay artifacts exist');
    }
    return { status: 'noop' };
  }
  if (manifest.state === 'applied' && !(await verifyApplied(paths, manifest)) && !force) throw fail('overlay_drift', 'refusing to overwrite changed account profile');
  await writeManifest(paths.manifest, { ...manifest, state: 'restoring' }); await rollbackToOriginal(paths, { ...manifest, state: 'restoring' }, { force });
  return { status: 'restored', accountRoot: paths.root };
}
