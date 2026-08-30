import path from 'node:path';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { KERNEL_PROFILE_RUNTIMES } from './profile-build.mjs';
import { canonicalPath, resolveKernelRuntimeHome } from './runtime-home.mjs';
import { atomicWriteText } from './durable-write.mjs';
import { loadStandaloneCatalog, standaloneDescriptors } from './standalone/catalog.mjs';

export const PROFILE_PRODUCT_ID = 'moon-relay-kernel-profile';
export const PROFILE_MANIFEST_NAME = '.moon-relay-kernel-profile-manifest.json';
export const PROFILE_MARKER_NAME = '.moon-relay-kernel-profile.json';
export const KERNEL_ENTRYPOINT_SKILL = 'moon-relay-kernel';
export const KERNEL_SKILL_INSTALL_REL = `skills/${KERNEL_ENTRYPOINT_SKILL}`;
export const ACCOUNT_ROOT_PROFILE_LAYOUT = 'account-root-direct';
export const LEGACY_RELAY_SKILL_NAMES = Object.freeze([
  'commit-moonshot',
  'moonshot-architecture',
  'moonshot-orchestrator',
  'moonshot-phase-runner',
  'moonshot-plan-writer',
  'moonshot-relay-setup',
  'product-orchestrator',
  'session-logger',
]);
export const canonicalKernelSkillDir = (sourceRoot) => path.resolve(sourceRoot, 'skills', KERNEL_ENTRYPOINT_SKILL);
export const canonicalStandaloneSkillDirs = async (sourceRoot) => {
  let catalog;
  try {
    catalog = await loadStandaloneCatalog({ repoRoot: sourceRoot, validateSources: true });
  } catch (error) {
    // Older/minimal profile fixtures may intentionally contain only the
    // Kernel entrypoint. In that compatibility shape there is no standalone
    // surface to materialize; an existing catalog remains authoritative and
    // still fails closed when malformed.
    const missingCatalog = error?.code === 'ENOENT'
      && path.resolve(error.path || '') === path.resolve(sourceRoot, 'catalog', 'standalone-skills.json');
    if (!missingCatalog) throw error;
    return [];
  }
  return standaloneDescriptors(catalog, { enabledOnly: true }).map((entry) => ({ name: entry.name, dir: path.resolve(sourceRoot, entry.skillPath) }));
};

const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const COMMON_SYSTEM_SYMLINKS = new Set(['/tmp', '/var', '/etc']);
const normalizeWin32NamespacePath = (value) => {
  const raw = String(value || '');
  if (process.platform !== 'win32') return raw;
  if (raw.startsWith('\\\\?\\UNC\\')) return `\\\\${raw.slice('\\\\?\\UNC\\'.length)}`;
  if (raw.startsWith('\\\\?\\')) return raw.slice('\\\\?\\'.length);
  return raw;
};
const safeProfileRoot = async (target, label = 'profile root') => {
  const lexical = path.resolve(normalizeWin32NamespacePath(target));
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
const atomicWrite = async (file, value) => atomicWriteText(file, value);
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

export function deepMergeJson(target, source) {
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

export async function inspectProfile(targetRoot) {
  const root = await safeProfileRoot(targetRoot);
  const manifestPath = profileManifestPath(root);
  if (!(await exists(manifestPath))) return { status: 'not_installed', targetRoot: root };
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const checks = [];
  for (const entry of manifest.files || []) {
    const file = safeJoin(root, entry.path);
    const present = await exists(file);
    let checksum = present ? await sha256(file) : null;
    let contentMatch = false;
    if (present && entry.requiredContent) {
      try { contentMatch = (await readFile(file, 'utf8')).includes(entry.requiredContent); } catch {}
    }
    let isOk = present && (checksum === entry.checksum || contentMatch);
    if (present && !isOk && !entry.requiredContent && entry.path.endsWith('.json')) {
      try {
        const content = JSON.parse(await readFile(file, 'utf8'));
        if (content && typeof content === 'object') isOk = true;
      } catch {}
    }
    checks.push({ path: entry.path, present, checksum, expected: entry.checksum, requiredContent: entry.requiredContent || null, contentMatch, isOk });
  }
  return { status: checks.every((item) => item.present && (item.checksum === item.expected || item.isOk)) ? 'ready' : 'drift', targetRoot: root, manifest, checks };
}

const extractDeveloperInstruction = (text) => {
  const match = String(text || '').match(/^\s*developer_instructions\s*=\s*(?:"""[\s\S]*?"""|'''[\s\S]*?'''|[^\r\n]*)/m);
  if (!match) throw new Error('profile_source_invalid: Kernel Codex profile is missing developer_instructions');
  return match[0].trim();
};

const mergeKernelDeveloperInstructions = (existing, incoming) => {
  const target = String(existing || '');
  const directive = extractDeveloperInstruction(incoming);
  const assignment = /^\s*developer_instructions\s*=\s*(?:"""[\s\S]*?"""|'''[\s\S]*?'''|[^\r\n]*)\r?\n?/m;
  if (assignment.test(target)) return target.replace(assignment, `${directive}\n`);
  const firstTable = target.search(/^\s*\[/m);
  if (firstTable < 0) return `${target.trimEnd()}${target.trim() ? '\n\n' : ''}${directive}\n`;
  const before = target.slice(0, firstTable).trimEnd();
  const after = target.slice(firstTable);
  return `${before}\n\n${directive}\n\n${after}`;
};

const isKernelProjectHook = (value) => Array.isArray(value?.hooks)
  && value.hooks.some((hook) => typeof hook?.command === 'string' && /assert-track\b/.test(hook.command));

const rewriteKernelProjectHook = (value, command) => {
  if (Array.isArray(value)) return value.map((item) => rewriteKernelProjectHook(item, command));
  if (!value || typeof value !== 'object') return value;
  const result = { ...value };
  if (typeof result.command === 'string' && /assert-track\b/.test(result.command)) result.command = command;
  for (const [key, child] of Object.entries(result)) if (key !== 'command') result[key] = rewriteKernelProjectHook(child, command);
  return result;
};

const mergeKernelHooks = (existing, incoming, command) => {
  const merged = deepMergeJson(existing || {}, incoming || {});
  const existingEvents = existing?.hooks && typeof existing.hooks === 'object' ? existing.hooks : {};
  const incomingEvents = incoming?.hooks && typeof incoming.hooks === 'object' ? incoming.hooks : {};
  merged.hooks = { ...existingEvents, ...incomingEvents };
  for (const event of new Set([...Object.keys(existingEvents), ...Object.keys(incomingEvents)])) {
    if (event !== 'SessionStart') continue;
    const retained = Array.isArray(existingEvents[event]) ? existingEvents[event].filter((item) => !isKernelProjectHook(item)) : [];
    const kernelHooks = Array.isArray(incomingEvents[event]) ? rewriteKernelProjectHook(incomingEvents[event], command) : [];
    merged.hooks[event] = [...retained, ...kernelHooks];
  }
  return merged;
};

const quoteShellPath = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const sameFile = async (left, right) => {
  if (!(await exists(left)) || !(await exists(right))) return false;
  return (await sha256(left)) === (await sha256(right));
};

const accountRootProjectionIsCurrent = async ({ root, sourceRoot, runtimeHome } = {}) => {
  const source = path.resolve(sourceRoot);
  const profileSource = path.join(source, 'package', 'kernel', 'profiles', 'codex');
  if (!(await sameFile(path.join(root, 'AGENTS.md'), path.join(profileSource, 'AGENTS.override.md')))) return false;

  const sourceConfig = await readFile(path.join(profileSource, '.codex', 'config.toml'), 'utf8');
  const targetConfig = await readFile(path.join(root, 'config.toml'), 'utf8').catch(() => '');
  try {
    if (extractDeveloperInstruction(targetConfig) !== extractDeveloperInstruction(sourceConfig)) return false;
  } catch {
    return false;
  }

  const expectedHookCommand = `${quoteShellPath(path.join(canonicalPath(runtimeHome), 'bin', 'kernel'))} assert-track --project-only --allow-non-kernel --json`;
  let hooks;
  try {
    hooks = JSON.parse(await readFile(path.join(root, 'hooks.json'), 'utf8'));
  } catch {
    return false;
  }
  const commands = [];
  const collectCommands = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) collectCommands(item);
    } else if (value && typeof value === 'object') {
      if (typeof value.command === 'string') commands.push(value.command);
      for (const child of Object.values(value)) collectCommands(child);
    }
  };
  collectCommands(hooks);
  if (!commands.includes(expectedHookCommand)) return false;

  const compareTree = async (sourceDir, targetDir) => {
    const sourceFiles = (await files(sourceDir)).sort();
    const targetFiles = (await files(targetDir)).sort();
    if (sourceFiles.length !== targetFiles.length || sourceFiles.some((file, index) => file !== targetFiles[index])) return false;
    for (const relativePath of sourceFiles) {
      if (!(await sameFile(path.join(sourceDir, relativePath), path.join(targetDir, relativePath)))) return false;
    }
    return true;
  };

  if (!(await compareTree(canonicalKernelSkillDir(source), path.join(root, KERNEL_SKILL_INSTALL_REL)))) return false;
  for (const { name, dir } of await canonicalStandaloneSkillDirs(source)) {
    if (!(await compareTree(dir, path.join(root, 'skills', name)))) return false;
  }
  return true;
};

const moveToBackup = async (root, relativePath, backupRoot) => {
  const source = safeJoin(root, relativePath);
  if (!(await exists(source))) return false;
  await rejectSymlink(source);
  const destination = safeJoin(backupRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  return true;
};

const copyToBackup = async (root, relativePath, backupRoot) => {
  const source = safeJoin(root, relativePath);
  if (!(await exists(source))) return false;
  await rejectSymlink(source);
  await copyTree(source, safeJoin(backupRoot, relativePath));
  return true;
};

const writeAccountRootManifest = async ({ root, sourceRoot, runtime, runtimeHome, backupPath, retiredRelaySkills, skillPaths }) => {
  const entries = [];
  const add = async (relativePath, requiredContent = null) => {
    const entry = { path: relativePath.replaceAll('\\', '/'), checksum: await sha256(safeJoin(root, relativePath)) };
    if (requiredContent) entry.requiredContent = requiredContent;
    entries.push(entry);
  };
  await add('AGENTS.md');
  await add('config.toml', 'This project runs under Moon Relay Kernel.');
  await add('hooks.json', 'assert-track');
  for (const relativePath of skillPaths) await add(path.join('skills', relativePath));
  await add(PROFILE_MARKER_NAME);
  return {
    schemaVersion: 1,
    productId: PROFILE_PRODUCT_ID,
    runtime,
    kernelRuntime: 'moon-relay-kernel',
    layout: ACCOUNT_ROOT_PROFILE_LAYOUT,
    targetRoot: root,
    runtimeHome: canonicalPath(runtimeHome),
    sourceRoot: path.resolve(sourceRoot),
    installedAt: new Date().toISOString(),
    backupPath,
    retiredRelaySkills,
    files: entries,
  };
};

export async function installKernelAccountRoot({ sourceRoot = process.cwd(), runtime = 'codex', targetRoot, runtimeHome = null, force = false } = {}) {
  if (runtime !== 'codex') throw new Error(`unsupported_account_root_profile: ${runtime}`);
  const root = await safeProfileRoot(targetRoot);
  const source = path.resolve(sourceRoot, 'package', 'kernel', 'profiles', runtime);
  const canonicalSkill = canonicalKernelSkillDir(sourceRoot);
  if (!(await exists(source))) throw new Error(`application_not_resolved: profile source missing for ${runtime}`);
  if (!(await exists(canonicalSkill))) throw new Error(`skill_source_missing: ${canonicalSkill}`);
  await mkdir(root, { recursive: true });
  await rejectSymlink(root);

  const manifestPath = profileManifestPath(root);
  const markerPath = profileMarkerPath(root);
  const prior = await exists(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
  if (prior && (prior.productId !== PROFILE_PRODUCT_ID || prior.layout !== ACCOUNT_ROOT_PROFILE_LAYOUT)) {
    throw new Error('target_collision: foreign or non-account-root Kernel profile manifest');
  }
  if (await exists(markerPath) && !prior) throw new Error('target_collision: marker without trusted manifest');

  // A healthy account-root projection is already the desired state. Returning
  // without touching the provider home keeps the operation idempotent and,
  // importantly, avoids treating our own Kernel-owned files as fresh user
  // backup material on every launch/adoption pass.
  if (prior) {
    const current = await inspectProfile(root);
    const projectionCurrent = !force
      && prior.sourceRoot === path.resolve(sourceRoot)
      && await accountRootProjectionIsCurrent({ root, sourceRoot, runtimeHome: runtimeHome || resolveKernelRuntimeHome() });
    if (current.status === 'ready'
      && current.manifest.kernelRuntime === 'moon-relay-kernel'
      && current.manifest.layout === ACCOUNT_ROOT_PROFILE_LAYOUT
      && projectionCurrent) {
      return {
        status: 'already_current',
        runtime,
        layout: ACCOUNT_ROOT_PROFILE_LAYOUT,
        targetRoot: root,
        manifestPath,
        backupPath: prior.backupPath || null,
        retiredRelaySkills: prior.retiredRelaySkills || [],
        installedFilesCount: prior.files?.length || 0,
      };
    }
  }

  const effectiveRuntimeHome = runtimeHome || resolveKernelRuntimeHome();
  const backupPath = path.join(root, '.moon-relay-kernel-backups', `account-root-${Date.now()}-${process.pid}`);
  const backupEntries = [];
  const recordBackup = async (relativePath, move = false) => {
    const preserved = move
      ? await moveToBackup(root, relativePath, backupPath)
      : await copyToBackup(root, relativePath, backupPath);
    if (preserved) backupEntries.push(relativePath.replaceAll('\\', '/'));
    return preserved;
  };

  await mkdir(root, { recursive: true });
  await recordBackup('AGENTS.md', true);
  await recordBackup('config.toml');
  await recordBackup('hooks.json');
  const retiredRelaySkills = [];
  for (const name of LEGACY_RELAY_SKILL_NAMES) {
    if (await recordBackup(path.join('skills', name), true)) retiredRelaySkills.push(name);
  }

  const agents = await readFile(path.join(source, 'AGENTS.override.md'), 'utf8');
  await atomicWrite(path.join(root, 'AGENTS.md'), agents);

  const configSource = await readFile(path.join(source, '.codex', 'config.toml'), 'utf8');
  const configPath = safeJoin(root, 'config.toml');
  const configExisting = await exists(configPath) ? await readFile(configPath, 'utf8') : '';
  await atomicWrite(configPath, mergeKernelDeveloperInstructions(configExisting, configSource));

  const hookSource = JSON.parse(await readFile(path.join(source, '.codex', 'hooks.json'), 'utf8'));
  const hookPath = safeJoin(root, 'hooks.json');
  const hookExisting = await exists(hookPath) ? JSON.parse(await readFile(hookPath, 'utf8')) : {};
  const hookCommand = `${quoteShellPath(path.join(canonicalPath(effectiveRuntimeHome), 'bin', 'kernel'))} assert-track --project-only --allow-non-kernel --json`;
  await atomicWrite(hookPath, `${JSON.stringify(mergeKernelHooks(hookExisting, hookSource, hookCommand), null, 2)}\n`);

  const installedSkillPaths = [];
  const installSkill = async (name, directory) => {
    const installRel = path.join('skills', name);
    await copyTree(directory, safeJoin(root, installRel));
    for (const relativePath of await files(directory)) {
      const target = safeJoin(root, path.join(installRel, relativePath));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(directory, relativePath), target, { force: true });
      installedSkillPaths.push(path.join(name, relativePath));
    }
  };
  await installSkill(KERNEL_ENTRYPOINT_SKILL, canonicalSkill);
  for (const { name, dir } of await canonicalStandaloneSkillDirs(sourceRoot)) {
    if (await exists(dir)) await installSkill(name, dir);
  }

  const marker = {
    schemaVersion: 1,
    productId: PROFILE_PRODUCT_ID,
    runtime: 'moon-relay-kernel',
    provider: runtime,
    layout: ACCOUNT_ROOT_PROFILE_LAYOUT,
  };
  await atomicWrite(markerPath, JSON.stringify(marker, null, 2));
  const manifest = await writeAccountRootManifest({
    root,
    sourceRoot,
    runtime,
    runtimeHome: effectiveRuntimeHome,
    backupPath: backupEntries.length ? backupPath : null,
    retiredRelaySkills,
    skillPaths: installedSkillPaths,
  });
  await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
  if (!backupEntries.length) await rm(backupPath, { recursive: true, force: true });
  else await atomicWrite(path.join(backupPath, 'account-root-backup.json'), JSON.stringify({ schemaVersion: 1, targetRoot: root, entries: backupEntries, retiredRelaySkills }, null, 2));
  return {
    status: prior ? 'reinstalled' : 'installed',
    runtime,
    layout: ACCOUNT_ROOT_PROFILE_LAYOUT,
    targetRoot: root,
    manifestPath,
    backupPath: backupEntries.length ? backupPath : null,
    retiredRelaySkills,
    installedFilesCount: manifest.files.length,
  };
}

export async function installKernelProfile({ sourceRoot = process.cwd(), runtime, targetRoot, skillsRoot = null, force = false } = {}) {
  if (!KERNEL_PROFILE_RUNTIMES.includes(runtime)) throw new Error(`unsupported_profile: ${runtime}`);
  const root = await safeProfileRoot(targetRoot);
  const source = path.resolve(sourceRoot, 'package', 'kernel', 'profiles', runtime);
  if (!(await exists(source))) throw new Error(`application_not_resolved: profile source missing for ${runtime}`);
  await mkdir(root, { recursive: true });
  await rejectSymlink(root);
  const markerPath = profileMarkerPath(root);
  const manifestPath = profileManifestPath(root);
  const prior = await exists(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
  if (await exists(markerPath) && !prior) throw new Error('target_collision: marker without trusted manifest');
  if (prior && prior.productId !== PROFILE_PRODUCT_ID) throw new Error('target_collision: foreign profile manifest');
  if (prior && !force) {
    const current = await inspectProfile(root);
    if (current.status === 'ready' && current.manifest.runtime === 'moon-relay-kernel') return { status: 'already_current', runtime, targetRoot: root, manifestPath, backupPath: null, installedFilesCount: prior.files?.length || 0 };
  }
  const backupPath = prior ? path.join(root, '.moon-relay-kernel-backups', `backup-${Date.now()}`) : null;
  if (prior) {
    for (const entry of prior.files || []) {
      const file = safeJoin(root, entry.path);
      await rejectSymlink(file);
      if (await exists(file) && await sha256(file) !== entry.checksum && !force && !entry.path.endsWith('.json')) {
        throw new Error(`target_collision: modified owned file ${entry.path}`);
      }
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
    for (const rel of await files(source)) {
      const srcFile = safeJoin(source, rel);
      const dstFile = safeJoin(root, rel);
      if (rel.endsWith('.json') && (await exists(dstFile))) {
        try {
          const existing = JSON.parse(await readFile(dstFile, 'utf8'));
          const incoming = JSON.parse(await readFile(srcFile, 'utf8'));
          const merged = deepMergeJson(existing, incoming);
          await atomicWrite(dstFile, `${JSON.stringify(merged, null, 2)}\n`);
        } catch {
          await copyTree(srcFile, dstFile);
        }
      } else {
        await copyTree(srcFile, dstFile);
      }
    }
    // Every Kernel provider home serves the public entrypoint skill from the
    // single canonical skill root, applied after the profile tree so a
    // profile-local duplicate can never win. Launch-time mutation of the
    // operator's account-root skills directory is not a substitute for this.
    await copyTree(canonicalSkill, safeJoin(root, KERNEL_SKILL_INSTALL_REL));
    // Copy each canonical file to its exact destination as well. This keeps
    // the manifest checksum bound to the canonical bytes when a profile ships
    // a stale duplicate directory and the platform's recursive copy behavior
    // does not replace an existing directory entry.
    for (const rel of await files(canonicalSkill)) {
      const target = safeJoin(root, path.join(KERNEL_SKILL_INSTALL_REL, rel));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(canonicalSkill, rel), target, { force: true });
    }
    // Standalone project utilities are public optional surfaces. They are
    // installed from the canonical source tree into every provider profile,
    // while their runtime state remains account-root and project-scoped.
    for (const { name, dir } of await canonicalStandaloneSkillDirs(sourceRoot)) {
      if (!(await exists(dir))) continue;
      const installRel = `skills/${name}`;
      await copyTree(dir, safeJoin(root, installRel));
      for (const rel of await files(dir)) {
        const target = safeJoin(root, path.join(installRel, rel));
        await mkdir(path.dirname(target), { recursive: true });
        await cp(path.join(dir, rel), target, { force: true });
      }
    }
    const marker = { schemaVersion: 1, productId: PROFILE_PRODUCT_ID, runtime: 'moon-relay-kernel', provider: runtime, ownership: 'manifest-owned-static-only' };
    await atomicWrite(markerPath, JSON.stringify(marker, null, 2));
    if (skillsRoot && runtime === 'antigravity') {
      await copyTree(canonicalSkill, path.resolve(skillsRoot, 'skills', KERNEL_ENTRYPOINT_SKILL));
    }
    for (const rel of await files(source)) await stage(rel);
    for (const rel of await files(canonicalSkill)) await stage(`${KERNEL_SKILL_INSTALL_REL}/${rel}`);
    for (const { name, dir } of await canonicalStandaloneSkillDirs(sourceRoot)) {
      if (!(await exists(dir))) continue;
      for (const rel of await files(dir)) await stage(`skills/${name}/${rel}`);
    }
    await stage(PROFILE_MARKER_NAME);
    const manifest = { schemaVersion: 1, productId: PROFILE_PRODUCT_ID, runtime: 'moon-relay-kernel', provider: runtime, targetRoot: root, installedAt: new Date().toISOString(), backupPath, files: staged };
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
    return { status: prior ? 'reinstalled' : 'installed', runtime, targetRoot: root, manifestPath, backupPath, installedFilesCount: staged.length };
  } catch (error) {
    if (prior && backupPath && await exists(backupPath)) {
      try {
        await rollbackKernelProfile({ targetRoot: root, backupPath });
      } catch {
        for (const rel of await files(backupPath)) await copyTree(safeJoin(backupPath, rel), safeJoin(root, rel));
        await atomicWrite(manifestPath, JSON.stringify(prior, null, 2));
      }
    } else if (!prior) {
      for (const rel of stagedPaths) {
        await rm(safeJoin(root, rel), { force: true, recursive: true });
      }
    }
    throw error;
  }
}

export async function uninstallKernelProfile({ targetRoot } = {}) {
  const root = await safeProfileRoot(targetRoot);
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
  const root = await safeProfileRoot(targetRoot);
  const backup = path.resolve(backupPath);
  if (!backup.startsWith(`${root}${path.sep}`)) throw new Error('unsafe_target: backup outside profile root');
  const priorManifest = JSON.parse(await readFile(path.join(backup, PROFILE_MANIFEST_NAME), 'utf8'));
  const current = await inspectProfile(root);
  if (current.status === 'drift') return { status: 'collision', targetRoot: root };

  const currentManifest = current.manifest || (await exists(profileManifestPath(root)) ? JSON.parse(await readFile(profileManifestPath(root), 'utf8')) : null);
  const priorFiles = new Set((priorManifest.files || []).map((f) => f.path));
  const currentFiles = currentManifest?.files || [];
  const introducedEntries = currentFiles.filter((f) => !priorFiles.has(f.path));

  for (const entry of introducedEntries) {
    const file = safeJoin(root, entry.path);
    if (await exists(file)) {
      await rejectSymlink(file);
      if (entry.checksum && (await sha256(file)) !== entry.checksum) {
        return { status: 'collision', targetRoot: root, path: entry.path };
      }
    }
  }

  for (const entry of introducedEntries) {
    const file = safeJoin(root, entry.path);
    await rm(file, { force: true, recursive: true });
  }

  for (const rel of await files(backup)) await copyTree(safeJoin(backup, rel), safeJoin(root, rel));
  await atomicWrite(profileManifestPath(root), JSON.stringify(priorManifest, null, 2));

  for (const entry of introducedEntries) {
    let dir = path.dirname(safeJoin(root, entry.path));
    while (dir !== root && dir.startsWith(root)) {
      try {
        const entries = await readdir(dir);
        if (entries.length === 0) {
          await rm(dir, { recursive: true, force: true });
          dir = path.dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  const postVerification = await inspectProfile(root);
  if (postVerification.status !== 'ready') {
    throw new Error(`rollback_failed: post-rollback inspectProfile status is ${postVerification.status}`);
  }

  return { status: 'rolled_back', targetRoot: root, backupPath: backup };
}
