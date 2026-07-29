import { readFile, stat, mkdir, rename, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { GUI_SURFACES, SURFACES, TRACKS } from './constants.mjs';
import { resolveApplication } from './app-resolver/index.mjs';
import { buildLaunchSpec, spawnTrack } from './launch-adapter.mjs';
import { listProviderProcesses, processGuardError, waitForQuiescence } from './process-guard.mjs';
import { assertSafeTarget, resolveTrackRoots } from './paths.mjs';
import { createReceipt } from './receipt.mjs';
import { clearJournal, readJournal, readState, updateState } from './state-store.mjs';
import { uninstallSwitcherPackage } from './installer.mjs';
import { advanceTransaction, commitTransaction, prepareTransaction, recoverTransaction } from './transaction.mjs';
import { inspectProfile } from '../kernel/profile-install.mjs';

const validate = (surface, track) => {
  if (!SURFACES.includes(surface)) throw new Error(`wrong_harness: unsupported surface ${surface}`);
  if (!TRACKS.includes(track)) throw new Error(`wrong_harness: unsupported track ${track}`);
};

const protectedRoots = ({ kernelRuntimeHome = null } = {}) => {
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const roots = [
    process.env.MOONSHOT_RELAY_HOME || path.join(userHome, '.moonshot-relay'),
    process.env.CODEX_HOME || path.join(userHome, '.codex'),
    process.env.CLAUDE_CONFIG_DIR || path.join(userHome, '.claude'),
    process.env.QWEN_HOME || path.join(userHome, '.qwen'),
    process.env.ANTIGRAVITY_HOME || path.join(userHome, '.gemini', 'antigravity'),
  ];
  if (process.env.MOON_RELAY_TRACK !== 'kernel' || !kernelRuntimeHome) return roots;

  const kernelRoot = path.resolve(kernelRuntimeHome);
  // A Kernel-launched surface legitimately inherits its process-scoped
  // provider home beneath the Kernel runtime. Those paths are not Relay roots
  // and must not make a subsequent Kernel surface collide with itself.
  return roots.filter((root) => {
    const candidate = path.resolve(root);
    return candidate !== kernelRoot && !candidate.startsWith(`${kernelRoot}${path.sep}`);
  });
};

const exists = async (file) => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

const SURFACE_SKILLS_DIR = {
  codex_desktop: '.codex',
  codex_cli: '.codex',
  claude_cli: '.claude',
  qwen_cli: '.qwen',
  antigravity_desktop: path.join('.gemini', 'antigravity'),
};

export const KERNEL_ENTRYPOINT_SKILL = 'moon-relay-kernel';

// Exact stub that pre-K-1 switcher builds wrote into the account-root skills
// directory. Matched byte-for-byte so the repair below can only remove our own
// damage, never a skill the operator authored.
const LEGACY_ACCOUNT_ROOT_STUB = '---\nname: moon-relay-kernel\ndescription: Single public entrypoint for Moon Relay Kernel task routing.\n---\n\n# Moon Relay Kernel\n';

const globalSkillsPaths = (surface) => {
  const dirName = SURFACE_SKILLS_DIR[surface];
  if (!dirName) return null;
  const baseDir = path.join(process.env.USERPROFILE || process.env.HOME || '', dirName);
  return { userSkills: path.join(baseDir, 'skills'), backupSkills: path.join(baseDir, '.skills-relay-backup') };
};

const isLegacyAccountRootStub = async (skillDir) => {
  let entries;
  try {
    entries = await readdir(skillDir);
  } catch {
    return false;
  }
  if (entries.length !== 1 || entries[0] !== 'SKILL.md') return false;
  try {
    return (await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')) === LEGACY_ACCOUNT_ROOT_STUB;
  } catch {
    return false;
  }
};

/**
 * Repairs an account-root skills directory that an earlier switcher build
 * replaced with a Kernel stub. Kernel isolation is process-scoped through the
 * provider home, so the account root owns the operator's Relay skills in both
 * tracks. Nothing is blind-deleted: only the exact legacy stub is removed, and
 * an entry that already exists under the account root always wins over its
 * backup copy. Failures are reported, never swallowed.
 */
export async function restoreGlobalSkillsBackup({ surface } = {}) {
  const paths = globalSkillsPaths(surface);
  if (!paths) return { status: 'not_applicable', restored: [], conflicts: [], errors: [] };
  const { userSkills, backupSkills } = paths;
  if (!(await exists(backupSkills))) return { status: 'noop', restored: [], conflicts: [], errors: [] };

  const restored = [];
  const conflicts = [];
  const errors = [];
  const record = (target, error) => errors.push({ path: target, code: error.code || 'unknown' });

  const stubDir = path.join(userSkills, KERNEL_ENTRYPOINT_SKILL);
  if (await isLegacyAccountRootStub(stubDir)) {
    try {
      await rm(stubDir, { force: true, recursive: true });
    } catch (error) {
      record(stubDir, error);
    }
  }

  await mkdir(userSkills, { recursive: true });
  for (const entry of await readdir(backupSkills)) {
    const target = path.join(userSkills, entry);
    if (await exists(target)) {
      conflicts.push(entry);
      continue;
    }
    try {
      await rename(path.join(backupSkills, entry), target);
      restored.push(entry);
    } catch (error) {
      record(target, error);
    }
  }

  if (!conflicts.length && !errors.length) {
    try {
      await rm(backupSkills, { force: true, recursive: true });
    } catch (error) {
      record(backupSkills, error);
    }
  }

  const status = errors.length ? 'restore_incomplete' : conflicts.length ? 'partial' : 'restored';
  return { status, restored, conflicts, errors, userSkills, backupSkills };
}

export async function discoverProviderSkills(providerHome) {
  if (!providerHome) return [];
  try {
    const entries = await readdir(path.join(providerHome, 'skills'), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function inspectKernelLaunchReadiness({ runtimeHome, providerHome, projectRoot = null, appDataRoot = null, sourceRoot = process.cwd() } = {}) {
  const runtimeManifestExists = (await exists(path.join(runtimeHome, '.moon-relay', 'install-manifest.json'))) || (await exists(path.join(runtimeHome, 'install-manifest.json')));
  if (!runtimeHome || !runtimeManifestExists) {
    return { status: 'kernel_not_installed', reason: 'runtime_package_missing' };
  }
  const entrypoint = path.join(runtimeHome, '.moon-relay', 'kernel-payload', 'bin', 'moon-relay-kernel.mjs');
  const fallbackEntrypoint = path.join(runtimeHome, 'kernel-payload', 'bin', 'moon-relay-kernel.mjs');
  const sourceEntrypoint = path.join(sourceRoot, 'bin', 'moon-relay-kernel.mjs');
  if (!(await exists(entrypoint)) && !(await exists(fallbackEntrypoint)) && !(await exists(sourceEntrypoint))) {
    return { status: 'kernel_not_installed', reason: 'entrypoint_missing' };
  }

  if (!providerHome) {
    return { status: 'kernel_profile_not_ready', reason: 'provider_home_missing' };
  }
  const userCodexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
  if (path.resolve(providerHome) === path.resolve(userCodexHome)) {
    return { status: 'unsafe_target', reason: 'provider_home_aliased_to_relay' };
  }
  const profileInspect = await inspectProfile(providerHome);
  if (profileInspect.status !== 'ready') {
    return { status: 'kernel_profile_not_ready', reason: profileInspect.status };
  }

  if (!appDataRoot) {
    return { status: 'unsafe_target', reason: 'app_data_root_missing' };
  }

  // The public Kernel surface is exactly one entrypoint skill. Read what the
  // provider home actually serves instead of asserting the expected answer.
  const discoveredSkills = await discoverProviderSkills(providerHome);
  if (!discoveredSkills.includes(KERNEL_ENTRYPOINT_SKILL)) {
    return { status: 'kernel_profile_not_ready', reason: 'skill_discovery_missing', discoveredSkills };
  }
  const foreignSkills = discoveredSkills.filter((name) => name !== KERNEL_ENTRYPOINT_SKILL);
  if (foreignSkills.length) {
    return { status: 'shared_mutable_surface', reason: 'shared_mutable_surface', discoveredSkills, foreignSkills };
  }

  return { status: 'launch_candidate', ready: true, discoveredSkills };
}

export async function switchStatus({ surface = null } = {}) {
  const state = await readState();
  return { schemaVersion: 1, productId: 'moon-harness-switcher', status: 'ready', surface, surfaces: surface ? { [surface]: state.surfaces[surface] } : state.surfaces, lastCommitted: state.lastCommitted, journal: state.journal, sensitiveContentRead: false };
}

export async function switchDoctor({ surface = null, processProvider } = {}) {
  const state = await readState();
  const journal = await readJournal();
  const surfaces = surface ? [surface] : SURFACES;
  const reports = {};
  for (const item of surfaces) {
    const active = await listProviderProcesses({ surface: item, processProvider });
    const selected = state.surfaces[item];
    reports[item] = { status: journal && journal.surface === item && journal.state !== 'committed' ? 'recovery_required' : active.length ? 'process_active' : selected?.effectiveTrack === 'kernel' || selected?.effectiveTrack === 'relay' ? 'ready' : 'unknown', effectiveTrack: selected?.effectiveTrack || 'unknown', processSet: active, sensitiveContentRead: false, recovery: active.length ? 'close the relevant process before mutation' : journal ? 'run switch recover after approved graceful close' : null };
  }
  return { schemaVersion: 1, status: Object.values(reports).some((r) => r.status === 'recovery_required') ? 'recovery_required' : 'ready', reports, sensitiveContentRead: false };
}

export async function launchSwitch({ surface, track, sourceRoot = process.cwd(), projectRoot = null, workspaceRoot = null, processProvider, closeApproval = false, closeHandler = null, launchSpec = null, spawnImpl = null, dryRun = true } = {}) {
  validate(surface, track);
  const targetProjectRoot = projectRoot || workspaceRoot || (track === 'kernel' ? sourceRoot : null);
  const defaultRoots = resolveTrackRoots({ track, surface, sourceRoot });
  const roots = launchSpec?.roots || defaultRoots;

  const state = await readState();
  const previous = state.surfaces[surface];
  const active = await listProviderProcesses({ surface, processProvider });

  if (active.length && GUI_SURFACES.has(surface)) {
    if (previous?.effectiveTrack === track) return createReceipt({ operation: 'launch', status: 'already_effective', surface, track, effective: { activated: true, processSet: active } });
    if (!closeApproval || !closeHandler) return createReceipt({ operation: 'launch', status: 'close_incomplete', surface, track: previous?.effectiveTrack || 'unknown', errorCode: 'operator_approval_missing', effective: { processSet: active } });
    const closed = await closeHandler({ surface, processSet: active });
    if (!closed) return createReceipt({ operation: 'launch', status: 'close_incomplete', surface, track: previous?.effectiveTrack || 'unknown', errorCode: 'close_incomplete', effective: { processSet: active } });
    const quiescent = await waitForQuiescence({ surface, processProvider });
    if (quiescent.status !== 'quiescent') return createReceipt({ operation: 'launch', status: 'close_incomplete', surface, track: previous?.effectiveTrack || 'unknown', errorCode: 'process_active', effective: quiescent });
  }

  let readiness = null;
  if (track === 'kernel') {
    for (const root of [roots.runtimeHome, roots.providerHome, roots.appDataRoot].filter(Boolean)) {
      await assertSafeTarget(root, { protectedRoots: protectedRoots({ kernelRuntimeHome: roots.runtimeHome }) });
    }
    readiness = await inspectKernelLaunchReadiness({
      runtimeHome: roots.runtimeHome,
      providerHome: roots.providerHome,
      projectRoot: targetProjectRoot,
      appDataRoot: roots.appDataRoot || roots.providerHome,
      sourceRoot,
    });
    if (readiness.status !== 'launch_candidate') {
      // Refused before the journal exists and before anything is spawned, so a
      // rejected launch leaves no partial transaction behind.
      return createReceipt({ operation: 'launch', status: readiness.status, surface, track, errorCode: readiness.reason || readiness.status, effective: { discoveredSkills: readiness.discoveredSkills || [] } });
    }
  }

  const journal = await prepareTransaction({ surface, requestedTrack: track, roots, previousSelection: previous, processSet: active });
  const globalSkillsRestore = await restoreGlobalSkillsBackup({ surface });
  await advanceTransaction(journal, 'old_app_stopped', { globalSkillsRestore });

  let spec = launchSpec;
  if (!spec && GUI_SURFACES.has(surface)) {
    const application = await resolveApplication(surface);
    if (!application.executable) return createReceipt({ operation: 'launch', status: 'error', surface, track, errorCode: 'application_not_resolved', effective: { warnings: application.warnings || [] } });
    const args = roots.appDataRoot ? [`--user-data-dir=${roots.appDataRoot}`] : [];
    spec = { ...buildLaunchSpec({ surface, track, sourceRoot, workspaceRoot: targetProjectRoot, roots, command: application.executable, args }), aumid: application.aumid || null };
  }
  spec ||= buildLaunchSpec({ surface, track, sourceRoot, workspaceRoot: targetProjectRoot, roots });

  await advanceTransaction(journal, 'launch_requested', { launch: { commandName: spec.command, argCount: spec.args.length } });
  const started = dryRun ? { status: 'launch_requested', pid: null } : spawnTrack(spec, { spawnImpl: spawnImpl || undefined });

  await advanceTransaction(journal, 'process_observed', { pid: started.pid || null });
  await advanceTransaction(journal, 'provider_home_verified', { providerHome: roots.providerHome });
  await advanceTransaction(journal, 'workspace_verified', { workspaceRoot: spec.workspaceRoot });

  const discoveredSkills = readiness?.discoveredSkills || await discoverProviderSkills(roots.providerHome);
  await advanceTransaction(journal, 'skill_discovery_verified', { discoveredSkills });

  const effective = {
    track,
    runtimeHome: roots.runtimeHome,
    providerHome: roots.providerHome,
    appDataRoot: roots.appDataRoot || null,
    workspaceRoot: spec.workspaceRoot || null,
    discoveredSkills,
    globalSkillsRestore,
    pid: started.pid || null,
    processScoped: true,
  };

  await advanceTransaction(journal, 'effective_verified', { effective });
  const committed = await commitTransaction({ ...journal, effective });
  await updateState((next) => {
    next.surfaces[surface] = { requestedTrack: track, effectiveTrack: track, requested: { track, roots }, effective, lastCommitted: effective };
    next.lastCommitted[surface] = effective;
    next.journal = null;
    return next;
  });

  return createReceipt({ operation: 'launch', status: 'committed', surface, track, effective });
}

export async function recoverSwitch({ surface, processProvider, closeApproval = false, closeHandler = null } = {}) {
  const journal = await readJournal();
  if (!journal || (surface && journal.surface !== surface)) return createReceipt({ operation: 'recover', status: 'idle', surface: surface || 'unknown', track: 'unknown' });
  const active = await listProviderProcesses({ surface: journal.surface, processProvider });
  if (active.length) {
    if (!closeApproval || !closeHandler) return createReceipt({ operation: 'recover', status: 'recovery_required', surface: journal.surface, track: journal.requestedTrack, errorCode: 'operator_approval_missing' });
    if (!(await closeHandler({ surface: journal.surface, processSet: active }))) return createReceipt({ operation: 'recover', status: 'close_incomplete', surface: journal.surface, track: journal.requestedTrack, errorCode: 'close_incomplete' });
  }
  await recoverTransaction();
  await clearJournal();
  return createReceipt({ operation: 'recover', status: 'recovered', surface: journal.surface, track: journal.previousSelection?.effectiveTrack || 'relay', effective: { previousSelectionRestored: true } });
}

export async function rollbackSwitch({ surface, processProvider } = {}) {
  const state = await readState();
  const selected = state.lastCommitted[surface] || state.surfaces[surface]?.lastCommitted;
  const active = await listProviderProcesses({ surface, processProvider });
  if (active.length && GUI_SURFACES.has(surface)) return createReceipt({ operation: 'rollback', status: 'process_active', surface, track: selected?.track || 'unknown', errorCode: 'process_active' });
  if (!selected) return createReceipt({ operation: 'rollback', status: 'not_found', surface, track: 'unknown' });
  return createReceipt({ operation: 'rollback', status: 'metadata_only', surface, track: selected.track, effective: { restored: true, providerCreatedData: 'preserved' } });
}

export async function uninstallSwitcher({ home = null } = {}) {
  const target = home ? path.resolve(home) : null;
  if (!target) return { status: 'uninstalled', removed: [], preserved: ['provider-created data', 'Relay roots'] };
  return uninstallSwitcherPackage({ targetRoot: target });
}
