import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { GUI_SURFACES, SURFACES, TRACKS } from './constants.mjs';
import { resolveApplication } from './app-resolver/index.mjs';
import { buildLaunchSpec, spawnTrack } from './launch-adapter.mjs';
import { listProviderProcesses, processGuardError, waitForProcessPresence, waitForQuiescence } from './process-guard.mjs';
import { assertSafeTarget, resolveTrackRoots } from './paths.mjs';
import { createReceipt } from './receipt.mjs';
import { clearJournal, readJournal, readState, updateState } from './state-store.mjs';
import { uninstallSwitcherPackage } from './installer.mjs';
import { advanceTransaction, commitTransaction, prepareTransaction, recoverTransaction } from './transaction.mjs';
import { inspectProfile, installKernelProfile } from '../kernel/profile-install.mjs';
import { cleanupLegacyKernelHydration } from '../kernel/legacy-hydration-cleanup.mjs';
import { inspectKernelProjectIdentity } from '../kernel/project-identity-preflight.mjs';
import { applyAccountSkillsOverlay, inspectAccountSkillsOverlay, restoreAccountSkillsOverlay, requiresAccountSkillsOverlay } from './account-skills-overlay.mjs';
import { loadStandaloneCatalog, standaloneDescriptors } from '../kernel/standalone/catalog.mjs';

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
  const filtered = roots.filter((root) => {
    const candidate = path.resolve(root);
    return candidate !== kernelRoot && !candidate.startsWith(`${kernelRoot}${path.sep}`);
  });
  return filtered;
};

const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };

export const KERNEL_ENTRYPOINT_SKILL = 'moon-relay-kernel';

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

export async function inspectKernelLaunchReadiness({ runtimeHome, providerHome, projectRoot = null, appDataRoot = null, sourceRoot = process.cwd(), checkProjectIdentity = true } = {}) {
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
  const expectedKernelCodexHome = path.resolve(path.join(runtimeHome, 'providers', 'codex'));
  const currentProcessIsKernelScoped = process.env.MOON_RELAY_TRACK === 'kernel'
    && path.resolve(providerHome) === expectedKernelCodexHome;
  if (path.resolve(providerHome) === path.resolve(userCodexHome) && !currentProcessIsKernelScoped) {
    return { status: 'unsafe_target', reason: 'provider_home_aliased_to_relay' };
  }
  const profileInspect = await inspectProfile(providerHome);
  if (profileInspect.status !== 'ready') {
    return { status: 'kernel_profile_not_ready', reason: profileInspect.status };
  }

  if (!appDataRoot) {
    return { status: 'unsafe_target', reason: 'app_data_root_missing' };
  }

  const discoveredSkills = await discoverProviderSkills(providerHome);
  // Standalone utilities are installed in the isolated provider home but are
  // not part of the Kernel workflow's public skill surface. Keep them out of
  // the shared-mutable-surface check while still serving their files locally.
  let standaloneCatalog;
  try {
    standaloneCatalog = await loadStandaloneCatalog({ repoRoot: sourceRoot, validateSources: true });
  } catch (error) {
    return { status: 'kernel_profile_not_ready', reason: 'standalone_catalog_invalid', findings: error.findings || [] };
  }
  const standaloneNames = new Set(standaloneDescriptors(standaloneCatalog, { enabledOnly: true }).map((entry) => entry.name));
  const workflowSkills = discoveredSkills.filter((name) => !standaloneNames.has(name));
  if (!workflowSkills.includes(KERNEL_ENTRYPOINT_SKILL)) {
    return { status: 'kernel_profile_not_ready', reason: 'skill_discovery_missing', discoveredSkills: workflowSkills };
  }
  const foreignSkills = workflowSkills.filter((name) => name !== KERNEL_ENTRYPOINT_SKILL);
  if (foreignSkills.length) {
    return { status: 'shared_mutable_surface', reason: 'shared_mutable_surface', discoveredSkills: workflowSkills, foreignSkills };
  }

  let projectIdentity = null;
  if (checkProjectIdentity) {
    try {
      projectIdentity = await inspectKernelProjectIdentity({ projectRoot: projectRoot || sourceRoot, runtimeHome });
    } catch (error) {
      return {
        status: 'kernel_project_identity_not_ready',
        reason: error.code || 'project_identity_preflight_failed',
        message: error.message,
      };
    }
    if (projectIdentity.status !== 'ready') {
      return {
        status: 'kernel_project_identity_not_ready',
        reason: 'project_identity_preflight_required',
        projectIdentity,
      };
    }
  }

  return { status: 'launch_candidate', ready: true, discoveredSkills: workflowSkills, projectIdentity };
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

export async function cleanupLegacyProject({ projectRoot, providerHome } = {}) {
  const profile = await inspectProfile(providerHome);
  return cleanupLegacyKernelHydration({ projectRoot, profileReady: profile.status === 'ready' });
}

export async function launchSwitch({ surface, track, sourceRoot = process.cwd(), projectRoot = null, workspaceRoot = null, taskBinding = null, processProvider, closeApproval = false, closeHandler = null, launchSpec = null, spawnImpl = null, dryRun = true, platform = process.platform, accountHome = null, applicationResolver = resolveApplication, force = false } = {}) {
  validate(surface, track);
  const targetProjectRoot = projectRoot || workspaceRoot || (track === 'kernel' ? sourceRoot : null);
  const defaultRoots = resolveTrackRoots({ track, surface, sourceRoot });
  const roots = launchSpec?.roots || defaultRoots;

  const state = await readState();
  const previous = state.surfaces[surface];
  const active = await listProviderProcesses({ surface, processProvider });

  if (active.length && GUI_SURFACES.has(surface)) {
    let previousIsEffective = previous?.effectiveTrack === track;
    if (previousIsEffective && requiresAccountSkillsOverlay(surface, platform)) {
      const overlay = await inspectAccountSkillsOverlay({ surface, platform, accountHome });
      previousIsEffective = track === 'kernel' ? overlay.status === 'active' : overlay.status === 'inactive';
    }
    if (previousIsEffective) return createReceipt({ operation: 'launch', status: 'already_effective', surface, track, effective: { activated: true, processSet: active } });
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
      checkProjectIdentity: !dryRun,
    });
    if (readiness.status !== 'launch_candidate') {
      if (readiness.status === 'kernel_profile_not_ready' && readiness.reason === 'drift' && force) {
        const runtime = surface === 'claude_cli' ? 'claude' : surface === 'codex_desktop' || surface === 'codex_cli' ? 'codex' : surface === 'qwen_cli' ? 'qwen' : surface === 'antigravity_desktop' ? 'antigravity' : null;
        if (runtime) {
          await installKernelProfile({ sourceRoot, runtime, targetRoot: roots.providerHome, force: true });
          readiness = await inspectKernelLaunchReadiness({
            runtimeHome: roots.runtimeHome,
            providerHome: roots.providerHome,
            projectRoot: targetProjectRoot,
            appDataRoot: roots.appDataRoot || roots.providerHome,
            sourceRoot,
          });
        }
      }
      if (readiness.status !== 'launch_candidate') {
        return createReceipt({
          operation: 'launch',
          status: readiness.status,
          surface,
          track,
          errorCode: readiness.reason || readiness.status,
          effective: {
            discoveredSkills: readiness.discoveredSkills || [],
            projectIdentity: readiness.projectIdentity || null,
            remediation: readiness.projectIdentity?.remediation || null,
          },
        });
      }
    }
  }

  let spec = launchSpec;
  if (!spec && GUI_SURFACES.has(surface) && surface !== 'claude_cli') {
    const application = await applicationResolver(surface);
    if (!application.executable) return createReceipt({ operation: 'launch', status: 'error', surface, track, errorCode: 'application_not_resolved', effective: { warnings: application.warnings || [] } });
    const args = (roots.appDataRoot && surface !== 'codex_desktop') ? [`--user-data-dir=${roots.appDataRoot}`] : [];
    spec = { ...buildLaunchSpec({ surface, track, sourceRoot, workspaceRoot: targetProjectRoot, roots, command: application.executable, args, ...taskBinding }), aumid: application.aumid || null };
  }
  spec ||= buildLaunchSpec({ surface, track, sourceRoot, workspaceRoot: targetProjectRoot, roots, ...taskBinding });

  const journal = await prepareTransaction({ surface, requestedTrack: track, roots, previousSelection: previous, processSet: active });
  let accountSkillsOverlay = { status: 'not_required', reason: 'process_scoped_provider_home' };
  if (!dryRun && requiresAccountSkillsOverlay(surface, platform)) {
    try {
      accountSkillsOverlay = track === 'kernel'
        ? await applyAccountSkillsOverlay({ surface, providerHome: roots.providerHome, platform, accountHome, force })
        : await restoreAccountSkillsOverlay({ surface, platform, accountHome, force });
    } catch (error) {
      await clearJournal();
      return createReceipt({ operation: 'launch', status: 'error', surface, track, errorCode: error.code || 'account_skills_overlay_failed', effective: { accountSkillsOverlay: { status: 'refused', reason: error.message } } });
    }
  }
  await advanceTransaction(journal, 'old_app_stopped', { accountSkillsOverlay });

  await advanceTransaction(journal, 'launch_requested', { launch: { commandName: spec.command, argCount: spec.args.length } });
  let started;
  try {
    started = dryRun ? { status: 'launch_requested', pid: null } : spawnTrack(spec, { spawnImpl: spawnImpl || undefined });
  } catch (error) {
    if (track === 'kernel' && accountSkillsOverlay.status === 'applied') {
      await restoreAccountSkillsOverlay({ surface, platform, accountHome }).catch(() => {});
    }
    await clearJournal();
    return createReceipt({ operation: 'launch', status: 'error', surface, track, errorCode: error.code || 'launch_failed' });
  }

  let observed = { status: 'not_required', processSet: [] };
  if (!dryRun && GUI_SURFACES.has(surface) && !spawnImpl) {
    observed = await waitForProcessPresence({ surface, processProvider });
    if (observed.status !== 'process_observed') {
      if (track === 'kernel' && accountSkillsOverlay.status === 'applied') {
        await restoreAccountSkillsOverlay({ surface, platform, accountHome }).catch(() => {});
      }
      await clearJournal();
      return createReceipt({ operation: 'launch', status: 'error', surface, track, errorCode: 'launch_unverified' });
    }
  }
  await advanceTransaction(journal, 'process_observed', { pid: started.pid || null, processSet: observed.processSet });
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
    projectIdentity: readiness?.projectIdentity || null,
    accountSkillsOverlay,
    pid: started.pid || null,
    processScoped: !requiresAccountSkillsOverlay(surface, platform),
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

export async function recoverSwitch({ surface, processProvider, closeApproval = false, closeHandler = null, platform = process.platform, accountHome = null } = {}) {
  const journal = await readJournal();
  if (!journal || (surface && journal.surface !== surface)) return createReceipt({ operation: 'recover', status: 'idle', surface: surface || 'unknown', track: 'unknown' });
  const active = await listProviderProcesses({ surface: journal.surface, processProvider });
  if (active.length) {
    if (!closeApproval || !closeHandler) return createReceipt({ operation: 'recover', status: 'recovery_required', surface: journal.surface, track: journal.requestedTrack, errorCode: 'operator_approval_missing' });
    if (!(await closeHandler({ surface: journal.surface, processSet: active }))) return createReceipt({ operation: 'recover', status: 'close_incomplete', surface: journal.surface, track: journal.requestedTrack, errorCode: 'close_incomplete' });
  }
  if (requiresAccountSkillsOverlay(journal.surface, platform)) {
    try {
      const overlay = await inspectAccountSkillsOverlay({ surface: journal.surface, platform, accountHome });
      if (overlay.status !== 'inactive') await restoreAccountSkillsOverlay({ surface: journal.surface, platform, accountHome });
    } catch (error) {
      return createReceipt({ operation: 'recover', status: 'recovery_required', surface: journal.surface, track: journal.requestedTrack, errorCode: error.code || 'account_skills_overlay_failed' });
    }
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
