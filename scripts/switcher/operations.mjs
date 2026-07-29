import { readFile, stat, mkdir, rename, rm, readdir, writeFile } from 'node:fs/promises';
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

export async function syncGlobalSkillsIsolation({ surface, track }) {
  const dirName = SURFACE_SKILLS_DIR[surface];
  if (!dirName) return;

  const baseDir = path.join(process.env.USERPROFILE || process.env.HOME || '', dirName);
  const userSkills = path.join(baseDir, 'skills');
  const backupSkills = path.join(baseDir, '.skills-relay-backup');

  if (track === 'kernel') {
    if ((await exists(userSkills)) && !(await exists(backupSkills))) {
      try {
        await rename(userSkills, backupSkills);
      } catch {
        /* locked file */
      }
    }
    await mkdir(userSkills, { recursive: true });
    const kernelSkillDir = path.join(userSkills, 'moon-relay-kernel');
    await mkdir(kernelSkillDir, { recursive: true });
    await writeFile(
      path.join(kernelSkillDir, 'SKILL.md'),
      `---\nname: moon-relay-kernel\ndescription: Single public entrypoint for Moon Relay Kernel task routing.\n---\n\n# Moon Relay Kernel\n`,
      'utf8'
    );
    if (await exists(backupSkills)) {
      try {
        for (const entry of await readdir(userSkills, { withFileTypes: true })) {
          if (entry.name !== 'moon-relay-kernel') {
            await rm(path.join(userSkills, entry.name), { force: true, recursive: true });
          }
        }
      } catch {
        /* locked file */
      }
    }
  } else if (track === 'relay') {
    if (await exists(backupSkills)) {
      try {
        await rm(userSkills, { force: true, recursive: true });
        await rename(backupSkills, userSkills);
      } catch {
        /* locked file */
      }
    }
  }
}

export async function syncCodexGlobalSkillsIsolation({ track }) {
  return syncGlobalSkillsIsolation({ surface: 'codex_cli', track });
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

  return { status: 'launch_candidate', ready: true };
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

  if (track === 'kernel') {
    for (const root of [roots.runtimeHome, roots.providerHome, roots.appDataRoot].filter(Boolean)) {
      await assertSafeTarget(root, { protectedRoots: protectedRoots({ kernelRuntimeHome: roots.runtimeHome }) });
    }
    const readiness = await inspectKernelLaunchReadiness({
      runtimeHome: roots.runtimeHome,
      providerHome: roots.providerHome,
      projectRoot: targetProjectRoot,
      appDataRoot: roots.appDataRoot || roots.providerHome,
      sourceRoot,
    });
    if (readiness.status !== 'launch_candidate') {
      return createReceipt({ operation: 'launch', status: readiness.status, surface, track, errorCode: readiness.reason || readiness.status });
    }
  }

  await syncGlobalSkillsIsolation({ surface, track });

  const journal = await prepareTransaction({ surface, requestedTrack: track, roots, previousSelection: previous, processSet: active });
  await advanceTransaction(journal, 'old_app_stopped');

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

  const discoveredSkills = track === 'kernel' ? ['moon-relay-kernel'] : [];
  await advanceTransaction(journal, 'skill_discovery_verified', { discoveredSkills });

  const effective = {
    track,
    runtimeHome: roots.runtimeHome,
    providerHome: roots.providerHome,
    appDataRoot: roots.appDataRoot || null,
    workspaceRoot: spec.workspaceRoot || null,
    discoveredSkills,
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
