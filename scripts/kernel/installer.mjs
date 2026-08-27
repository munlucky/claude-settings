import path from 'node:path';
import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { buildRuntimeManifest } from './runtime-resolver.mjs';
import { canonicalPath } from './runtime-home.mjs';
import { atomicWriteText } from './durable-write.mjs';

const PRODUCT_ID = 'moon-relay-kernel';
const TRACK_CONTENT = 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n';
const PAYLOAD_ENTRIES = [
  'scripts/switcher/app-resolver/common.mjs',
  'bin/moon-relay-kernel.mjs',
  'bin/moon-relay-kernel-host.mjs',
  'bin/moon-relay-standalone.mjs',
  'kernel',
  'scripts/kernel',
  'scripts/host/kernel',
  'scripts/lib/candidate-identity.mjs',
  'scripts/lib/git-safe.mjs',
  'schemas/kernel.track.schema.json',
  'schemas/kernel.runtime-state.schema.json',
  'catalog/kernel-skills.json',
  'catalog/standalone-skills.json',
  'skills/project-memory',
  'skills/kernel-commit',
  'skills/codebase-understanding',
  'skills/explain-diff-html',
  'skills/ui-audit',
  'skills/product-definition',
  'skills/architecture-artifacts',
  'package/kernel',
  'package/profile-templates/codex',
];

const exists = async (target) => {
  try { await stat(target); return true; } catch { return false; }
};
const sha256File = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const isWithin = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);
const assertContained = (root, target) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isWithin(resolvedRoot, resolvedTarget)) throw new Error(`Kernel installer path escapes target root: ${target}`);
  return resolvedTarget;
};
const rejectSymlink = async (target, label) => {
  try {
    if ((await lstat(target)).isSymbolicLink()) throw new Error(`Kernel installer refuses symlinked ${label}: ${target}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
const COMMON_SYSTEM_SYMLINKS = new Set(['/tmp', '/var', '/etc']);
const safeInstallRoot = async (target, label = 'target directory') => {
  const lexical = path.resolve(target);
  let cursor = lexical;
  while (true) {
    try {
      if ((await lstat(cursor)).isSymbolicLink() && !COMMON_SYSTEM_SYMLINKS.has(cursor.replaceAll('\\', '/'))) {
        throw new Error(`unsafe_target: symlinked ${label}: ${cursor}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return canonicalPath(lexical);
};

const atomicWrite = async (target, content) => atomicWriteText(target, content);
const copyTree = async (source, target) => {
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
};

const collectFiles = async (root, rel = '') => {
  const target = path.join(root, rel);
  if (!(await exists(target))) return [];
  const info = await stat(target);
  if (info.isFile()) return [rel.replaceAll('\\', '/')];
  const files = [];
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(root, child));
    else files.push(child.replaceAll('\\', '/'));
  }
  return files;
};

const readManifest = async (manifestPath) => JSON.parse(await readFile(manifestPath, 'utf8'));

export const materializeKernelCommandShim = async ({ runtimeHome, entrypoint } = {}) => {
  if (!runtimeHome || !entrypoint) throw new Error('Kernel command shim requires runtimeHome and entrypoint');
  const root = await safeInstallRoot(runtimeHome);
  const cli = path.resolve(entrypoint);
  const hostCli = path.join(path.dirname(cli), 'moon-relay-kernel-host.mjs');
  const binDir = path.join(root, 'bin');
  await mkdir(binDir, { recursive: true });
  const written = [];
  if (process.platform === 'win32') {
    const cmd = path.join(binDir, 'kernel.cmd');
    const ps1 = path.join(binDir, 'kernel.ps1');
    const hostCmd = path.join(binDir, 'kernel-host.cmd');
    const hostPs1 = path.join(binDir, 'kernel-host.ps1');
    await atomicWrite(cmd, `@echo off\r\nnode "${cli}" %*\r\n`);
    await atomicWrite(ps1, `& node "${cli}" @args\r\n`);
    await atomicWrite(hostCmd, `@echo off\r\nnode "${hostCli}" %*\r\n`);
    await atomicWrite(hostPs1, `& node "${hostCli}" @args\r\n`);
    written.push(cmd, ps1, hostCmd, hostPs1);
  } else {
    const shim = path.join(binDir, 'kernel');
    const hostShim = path.join(binDir, 'kernel-host');
    await atomicWrite(shim, `#!/bin/sh\nexec node "${cli}" "$@"\n`);
    await chmod(shim, 0o755);
    await atomicWrite(hostShim, `#!/bin/sh\nexec node "${hostCli}" "$@"\n`);
    await chmod(hostShim, 0o755);
    written.push(shim, hostShim);
  }
  return { status: 'installed', runtimeHome: root, entrypoint: cli, written };
};

export const installKernel = async ({ targetRoot = process.cwd(), sourceRoot = process.cwd(), runtimeSource, trackHome } = {}) => {
  const root = await safeInstallRoot(targetRoot);
  const source = path.resolve(sourceRoot);
  const kernelDir = assertContained(root, path.join(root, '.moon-relay'));
  const trackPath = path.join(kernelDir, 'track.yaml');
  const manifestPath = path.join(kernelDir, 'install-manifest.json');
  await rejectSymlink(kernelDir, 'target directory');

  if (await exists(trackPath)) {
    const current = await readFile(trackPath, 'utf8');
    const currentTrack = current.match(/^track:\s*(relay|kernel)\s*$/m)?.[1];
    if (currentTrack === 'relay') throw new Error('Kernel install refused: existing Relay marker is protected');
    if (currentTrack !== 'kernel') throw new Error('Kernel install refused: unknown existing track marker');
    if (!(await exists(manifestPath))) throw new Error('Kernel install refused: existing Kernel marker has no trusted install manifest');
  }

  const backupId = `backup-${Date.now()}`;
  const backupPath = path.join(kernelDir, 'backups', backupId);
  const snapshotRoot = path.join(backupPath, 'snapshot');
  const existingManifest = await exists(manifestPath) ? await readManifest(manifestPath) : null;
  if (existingManifest && existingManifest.productId !== PRODUCT_ID) throw new Error('Kernel install refused: manifest belongs to another product');

  const planned = [];
  for (const rel of PAYLOAD_ENTRIES) {
    const sourcePath = path.join(source, rel);
    if (!(await exists(sourcePath))) continue;
    const targetRel = path.join('kernel-payload', rel).replaceAll('\\', '/');
    planned.push({ sourcePath, targetRel, targetPath: assertContained(kernelDir, path.join(kernelDir, targetRel)) });
  }
  if (planned.length === 0) throw new Error(`Kernel payload source is empty: ${source}`);

  const existingFiles = existingManifest?.files || [];
  const collisions = [];
  for (const file of existingFiles) {
    const target = assertContained(kernelDir, path.join(kernelDir, file.path));
    await rejectSymlink(target, 'owned file');
    if (await exists(target)) {
      const actual = await sha256File(target);
      if (actual !== file.checksum) collisions.push({ path: file.path, reason: 'modified-owned-file', expected: file.checksum, actual });
      else {
        const snapshot = path.join(snapshotRoot, file.path);
        await copyTree(target, snapshot);
      }
    }
  }
  if (collisions.length) return { status: 'collision', targetRoot: root, collisions };

  try {
    await mkdir(kernelDir, { recursive: true });
    await atomicWrite(trackPath, TRACK_CONTENT);
    const installed = [{ path: 'track.yaml', checksum: await sha256File(trackPath) }];
    for (const item of planned) {
      await copyTree(item.sourcePath, item.targetPath);
      for (const rel of await collectFiles(item.targetPath, '')) {
        const absolute = path.join(item.targetPath, rel);
        const manifestRel = path.join(item.targetRel, rel).replaceAll('\\', '/');
        installed.push({ path: manifestRel, checksum: await sha256File(absolute) });
      }
    }
    if (runtimeSource) {
      if (!(await exists(runtimeSource))) throw new Error(`Kernel managed runtime source does not exist: ${runtimeSource}`);
      const runtimeRoot = path.join(kernelDir, 'kernel-payload', 'runtime');
      const runtimeTarget = assertContained(kernelDir, path.join(runtimeRoot, 'current'));
      const sourceRootWithCurrent = path.join(runtimeSource, 'runtime', 'current');
      const sourceCurrent = await exists(sourceRootWithCurrent)
        ? sourceRootWithCurrent
        : (await exists(path.join(runtimeSource, 'current')) ? path.join(runtimeSource, 'current') : runtimeSource);
      await copyTree(sourceCurrent, runtimeTarget);
      const nodeRel = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');
      const nodeTarget = path.join(runtimeTarget, nodeRel);
      if (!(await exists(nodeTarget))) throw new Error(`Kernel managed runtime is missing ${nodeRel}`);
      await atomicWrite(path.join(runtimeTarget, 'runtime-manifest.json'), JSON.stringify(await buildRuntimeManifest({ runtimeHome: path.join(kernelDir, 'kernel-payload'), nodePath: nodeTarget }), null, 2));
      for (const rel of await collectFiles(runtimeRoot, '')) installed.push({ path: path.join('kernel-payload', 'runtime', rel).replaceAll('\\', '/'), checksum: await sha256File(path.join(runtimeRoot, rel)) });
    }

    const manifest = {
      schemaVersion: 2,
      productId: PRODUCT_ID,
      installedAt: new Date().toISOString(),
      targetRoot: root,
      sourceRoot: source,
      backupPath: existingFiles.length ? backupPath : null,
      files: installed,
    };
    if (existingFiles.length) {
      await atomicWrite(path.join(backupPath, 'backup-manifest.json'), JSON.stringify({ schemaVersion: 1, productId: PRODUCT_ID, manifest: existingManifest, files: existingFiles }, null, 2));
    }
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
    const runtimeHome = trackHome ? await safeInstallRoot(trackHome, 'track home') : null;
    const commandShim = runtimeHome
      ? await materializeKernelCommandShim({
        runtimeHome,
        entrypoint: path.join(kernelDir, 'kernel-payload', 'bin', 'moon-relay-kernel.mjs'),
      })
      : null;
    return { status: 'installed', targetRoot: root, installedFilesCount: installed.length, manifestPath, backupPath: existingFiles.length ? backupPath : null, commandShim };
  } catch (error) {
    await rm(path.join(kernelDir, 'kernel-payload'), { force: true, recursive: true });
    for (const file of existingFiles) {
      const snapshot = path.join(snapshotRoot, file.path);
      if (await exists(snapshot)) await copyTree(snapshot, assertContained(kernelDir, path.join(kernelDir, file.path)));
    }
    if (!existingManifest) await rm(trackPath, { force: true });
    throw error;
  }
};

export const uninstallKernel = async ({ targetRoot = process.cwd() } = {}) => {
  const root = await safeInstallRoot(targetRoot);
  const kernelDir = assertContained(root, path.join(root, '.moon-relay'));
  const manifestPath = path.join(kernelDir, 'install-manifest.json');
  if (!(await exists(manifestPath))) return { status: 'not_installed', targetRoot: root };
  const manifest = await readManifest(manifestPath);
  if (manifest.productId !== PRODUCT_ID) throw new Error('Kernel uninstall refused: foreign manifest');
  const conflicts = [];
  for (const file of manifest.files || []) {
    const target = assertContained(kernelDir, path.join(kernelDir, file.path));
    await rejectSymlink(target, 'owned file');
    if (await exists(target) && await sha256File(target) !== file.checksum) conflicts.push({ path: file.path, reason: 'modified-owned-file' });
  }
  if (conflicts.length) return { status: 'collision', targetRoot: root, conflicts };
  for (const file of manifest.files || []) await rm(assertContained(kernelDir, path.join(kernelDir, file.path)), { force: true, recursive: true });
  await rm(manifestPath, { force: true });
  return { status: 'uninstalled', targetRoot: root, preserved: ['Relay marker/profile/runtime outside Kernel manifest'] };
};

export const rollbackKernel = async ({ targetRoot = process.cwd(), backupPath } = {}) => {
  const root = await safeInstallRoot(targetRoot);
  if (!backupPath || !(await exists(backupPath))) return { status: 'no_backup_found', targetRoot: root };
  const backupRoot = path.resolve(backupPath);
  const snapshotRoot = path.join(backupRoot, 'snapshot');
  if (!isWithin(path.join(root, '.moon-relay'), backupRoot) || !(await exists(snapshotRoot))) throw new Error('Kernel rollback backup is outside the target root or incomplete');
  await rejectSymlink(backupRoot, 'rollback backup');
  const backupManifestPath = path.join(backupRoot, 'backup-manifest.json');
  if (!(await exists(backupManifestPath))) throw new Error('Kernel rollback backup has no manifest');
  const backupManifest = await readManifest(backupManifestPath);
  const priorManifest = backupManifest.manifest || {
    schemaVersion: 2,
    productId: PRODUCT_ID,
    files: backupManifest.files || [],
  };
  const currentManifestPath = path.join(root, '.moon-relay', 'install-manifest.json');
  if (!(await exists(currentManifestPath))) throw new Error('Kernel rollback target has no current install manifest');
  const currentManifest = await readManifest(currentManifestPath);
  const priorPaths = new Set((priorManifest.files || []).map((file) => file.path));
  const collisions = [];
  for (const file of currentManifest.files || []) {
    const target = assertContained(root, path.join(root, '.moon-relay', file.path));
    await rejectSymlink(target, 'current owned file');
    if (!(await exists(target))) collisions.push({ path: file.path, reason: 'missing-current-file' });
    else if (await sha256File(target) !== file.checksum) collisions.push({ path: file.path, reason: 'modified-current-file' });
  }
  if (collisions.length) return { status: 'collision', targetRoot: root, backupPath: backupRoot, collisions };
  for (const file of currentManifest.files || []) {
    if (!priorPaths.has(file.path)) await rm(assertContained(root, path.join(root, '.moon-relay', file.path)), { force: true, recursive: true });
  }
  const restored = [];
  for (const rel of await collectFiles(snapshotRoot, '')) {
    const source = path.join(snapshotRoot, rel);
    const target = assertContained(root, path.join(root, '.moon-relay', rel));
    await copyTree(source, target);
    restored.push(rel.replaceAll('\\', '/'));
  }
  await atomicWrite(currentManifestPath, JSON.stringify(priorManifest, null, 2));
  return { status: 'rolled_back', targetRoot: root, backupPath: backupRoot, restored, removed: (currentManifest.files || []).filter((file) => !priorPaths.has(file.path)).map((file) => file.path) };
};
