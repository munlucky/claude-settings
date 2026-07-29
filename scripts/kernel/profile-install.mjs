import path from 'node:path';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { KERNEL_PROFILE_RUNTIMES } from './profile-build.mjs';

export const PROFILE_PRODUCT_ID = 'moon-relay-kernel-profile';
export const PROFILE_MANIFEST_NAME = '.moon-relay-kernel-profile-manifest.json';
export const PROFILE_MARKER_NAME = '.moon-relay-kernel-profile.json';
export const KERNEL_ENTRYPOINT_SKILL = 'moon-relay-kernel';
export const KERNEL_SKILL_INSTALL_REL = `skills/${KERNEL_ENTRYPOINT_SKILL}`;
export const canonicalKernelSkillDir = (sourceRoot) => path.resolve(sourceRoot, 'skills', KERNEL_ENTRYPOINT_SKILL);

const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const atomicWrite = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, value, 'utf8');
  await rename(tmp, file);
};
const copyTree = async (from, to) => { await mkdir(path.dirname(to), { recursive: true }); await cp(from, to, { recursive: true, force: true }); };
const files = async (root, rel = '') => {
  const target = path.join(root, rel);
  if (!(await exists(target))) return [];
  const info = await stat(target);
  if (info.isFile()) return [rel.replaceAll('\\', '/')];
  const result = [];
  for (const entry of await readdir(target, { withFileTypes: true })) result.push(...await files(root, path.join(rel, entry.name)));
  return result;
};
const rejectSymlink = async (file) => {
  try { if ((await lstat(file)).isSymbolicLink()) throw new Error(`unsafe_target: symlink ${file}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
};
const safeJoin = (root, rel) => {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, rel);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`unsafe_target: ${rel}`);
  return resolved;
};

export const profileManifestPath = (targetRoot) => path.join(path.resolve(targetRoot), PROFILE_MANIFEST_NAME);
export const profileMarkerPath = (targetRoot) => path.join(path.resolve(targetRoot), PROFILE_MARKER_NAME);

export async function inspectProfile(targetRoot) {
  const root = path.resolve(targetRoot);
  const manifestPath = profileManifestPath(root);
  if (!(await exists(manifestPath))) return { status: 'not_installed', targetRoot: root };
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const checks = [];
  for (const entry of manifest.files || []) {
    const file = safeJoin(root, entry.path);
    const present = await exists(file);
    checks.push({ path: entry.path, present, checksum: present ? await sha256(file) : null, expected: entry.checksum });
  }
  return { status: checks.every((item) => item.present && item.checksum === item.expected) ? 'ready' : 'drift', targetRoot: root, manifest, checks };
}

export async function installKernelProfile({ sourceRoot = process.cwd(), runtime, targetRoot, skillsRoot = null } = {}) {
  if (!KERNEL_PROFILE_RUNTIMES.includes(runtime)) throw new Error(`unsupported_profile: ${runtime}`);
  const root = path.resolve(targetRoot);
  const source = path.resolve(sourceRoot, 'package', 'kernel', 'profiles', runtime);
  if (!(await exists(source))) throw new Error(`application_not_resolved: profile source missing for ${runtime}`);
  await mkdir(root, { recursive: true });
  await rejectSymlink(root);
  const markerPath = profileMarkerPath(root);
  const manifestPath = profileManifestPath(root);
  const prior = await exists(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
  if (await exists(markerPath) && !prior) throw new Error('target_collision: marker without trusted manifest');
  if (prior && prior.productId !== PROFILE_PRODUCT_ID) throw new Error('target_collision: foreign profile manifest');
  const backupPath = prior ? path.join(root, '.moon-relay-kernel-backups', `backup-${Date.now()}`) : null;
  if (prior) {
    for (const entry of prior.files || []) {
      const file = safeJoin(root, entry.path);
      await rejectSymlink(file);
      if (await exists(file) && await sha256(file) !== entry.checksum) throw new Error(`target_collision: modified owned file ${entry.path}`);
      if (await exists(file)) await copyTree(file, safeJoin(backupPath, entry.path));
    }
    await atomicWrite(path.join(backupPath, PROFILE_MANIFEST_NAME), JSON.stringify(prior, null, 2));
  }
  const canonicalSkill = canonicalKernelSkillDir(sourceRoot);
  if (!(await exists(canonicalSkill))) throw new Error(`skill_source_missing: ${canonicalSkill}`);

  const staged = [];
  const stagedPaths = new Set();
  const stage = async (rel) => {
    const normalized = rel.replaceAll('\\', '/');
    if (stagedPaths.has(normalized)) return;
    stagedPaths.add(normalized);
    staged.push({ path: normalized, checksum: await sha256(safeJoin(root, normalized)) });
  };
  try {
    await copyTree(source, root);
    // Every Kernel provider home serves the public entrypoint skill from the
    // single canonical skill root, applied after the profile tree so a
    // profile-local duplicate can never win. Launch-time mutation of the
    // operator's account-root skills directory is not a substitute for this.
    await copyTree(canonicalSkill, safeJoin(root, KERNEL_SKILL_INSTALL_REL));
    const marker = { schemaVersion: 1, productId: PROFILE_PRODUCT_ID, track: 'kernel', runtime, ownership: 'manifest-owned-static-only' };
    await atomicWrite(markerPath, JSON.stringify(marker, null, 2));
    if (skillsRoot && runtime === 'antigravity') {
      await copyTree(canonicalSkill, path.resolve(skillsRoot, 'skills', KERNEL_ENTRYPOINT_SKILL));
    }
    for (const rel of await files(source)) await stage(rel);
    for (const rel of await files(canonicalSkill)) await stage(`${KERNEL_SKILL_INSTALL_REL}/${rel}`);
    await stage(PROFILE_MARKER_NAME);
    const manifest = { schemaVersion: 1, productId: PROFILE_PRODUCT_ID, track: 'kernel', runtime, targetRoot: root, installedAt: new Date().toISOString(), backupPath, files: staged };
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
    return { status: prior ? 'reinstalled' : 'installed', runtime, targetRoot: root, manifestPath, backupPath, installedFilesCount: staged.length };
  } catch (error) {
    if (prior && backupPath && await exists(backupPath)) {
      for (const rel of await files(backupPath)) await copyTree(safeJoin(backupPath, rel), safeJoin(root, rel));
      await atomicWrite(manifestPath, JSON.stringify(prior, null, 2));
    }
    throw error;
  }
}

export async function uninstallKernelProfile({ targetRoot } = {}) {
  const root = path.resolve(targetRoot);
  const manifestPath = profileManifestPath(root);
  if (!(await exists(manifestPath))) return { status: 'not_installed', targetRoot: root };
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.productId !== PROFILE_PRODUCT_ID) throw new Error('wrong_harness: foreign profile manifest');
  for (const entry of manifest.files || []) {
    const file = safeJoin(root, entry.path);
    await rejectSymlink(file);
    if (await exists(file) && await sha256(file) !== entry.checksum) return { status: 'collision', targetRoot: root, path: entry.path };
  }
  for (const entry of manifest.files || []) await rm(safeJoin(root, entry.path), { force: true, recursive: true });
  await rm(manifestPath, { force: true });
  return { status: 'uninstalled', targetRoot: root, preserved: ['provider-created auth/session/cache/db/log/user data'] };
}

export async function rollbackKernelProfile({ targetRoot, backupPath } = {}) {
  if (!backupPath || !(await exists(backupPath))) return { status: 'no_backup_found', targetRoot: path.resolve(targetRoot) };
  const root = path.resolve(targetRoot);
  const backup = path.resolve(backupPath);
  if (!backup.startsWith(`${root}${path.sep}`)) throw new Error('unsafe_target: backup outside profile root');
  const priorManifest = JSON.parse(await readFile(path.join(backup, PROFILE_MANIFEST_NAME), 'utf8'));
  const current = await inspectProfile(root);
  if (current.status === 'drift') return { status: 'collision', targetRoot: root };
  for (const rel of await files(backup)) await copyTree(safeJoin(backup, rel), safeJoin(root, rel));
  await atomicWrite(profileManifestPath(root), JSON.stringify(priorManifest, null, 2));
  return { status: 'rolled_back', targetRoot: root, backupPath: backup };
}
