import { readFile } from 'node:fs/promises';
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

const validate = (surface, track) => { if (!SURFACES.includes(surface)) throw new Error(`wrong_harness: unsupported surface ${surface}`); if (!TRACKS.includes(track)) throw new Error(`wrong_harness: unsupported track ${track}`); };
const protectedRoots = () => [process.env.MOONSHOT_RELAY_HOME || path.join(process.env.USERPROFILE || '', '.moonshot-relay'), process.env.CODEX_HOME || path.join(process.env.USERPROFILE || '', '.codex'), process.env.CLAUDE_CONFIG_DIR || path.join(process.env.USERPROFILE || '', '.claude'), process.env.QWEN_HOME || path.join(process.env.USERPROFILE || '', '.qwen'), process.env.ANTIGRAVITY_HOME || path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity')];

export async function switchStatus({ surface = null } = {}) {
  const state = await readState();
  return { schemaVersion: 1, productId: 'moon-harness-switcher', status: 'ready', surface, surfaces: surface ? { [surface]: state.surfaces[surface] } : state.surfaces, lastCommitted: state.lastCommitted, journal: state.journal, sensitiveContentRead: false };
}
export async function switchDoctor({ surface = null, processProvider } = {}) {
  const state = await readState(); const journal = await readJournal();
  const surfaces = surface ? [surface] : SURFACES;
  const reports = {};
  for (const item of surfaces) {
    const active = await listProviderProcesses({ surface: item, processProvider });
    const selected = state.surfaces[item];
    reports[item] = { status: journal && journal.surface === item && journal.state !== 'committed' ? 'recovery_required' : active.length ? 'process_active' : selected?.effectiveTrack === 'kernel' || selected?.effectiveTrack === 'relay' ? 'ready' : 'unknown', effectiveTrack: selected?.effectiveTrack || 'unknown', processSet: active, sensitiveContentRead: false, recovery: active.length ? 'close the relevant process before mutation' : journal ? 'run switch recover after approved graceful close' : null };
  }
  return { schemaVersion: 1, status: Object.values(reports).some((r) => r.status === 'recovery_required') ? 'recovery_required' : 'ready', reports, sensitiveContentRead: false };
}

export async function launchSwitch({ surface, track, sourceRoot = process.cwd(), processProvider, closeApproval = false, closeHandler = null, launchSpec = null, spawnImpl = null, dryRun = true } = {}) {
  validate(surface, track);
  const roots = resolveTrackRoots({ track, surface, sourceRoot });
  if (track === 'kernel') for (const root of [roots.runtimeHome, roots.providerHome, roots.appDataRoot].filter(Boolean)) await assertSafeTarget(root, { protectedRoots: protectedRoots() });
  const state = await readState(); const previous = state.surfaces[surface];
  const active = await listProviderProcesses({ surface, processProvider });
  if (active.length && GUI_SURFACES.has(surface)) {
    if (previous?.effectiveTrack === track) return createReceipt({ operation: 'launch', status: 'already_effective', surface, track, effective: { activated: true, processSet: active } });
    if (!closeApproval || !closeHandler) return createReceipt({ operation: 'launch', status: 'close_incomplete', surface, track: previous?.effectiveTrack || 'unknown', errorCode: 'operator_approval_missing', effective: { processSet: active } });
    const closed = await closeHandler({ surface, processSet: active });
    if (!closed) return createReceipt({ operation: 'launch', status: 'close_incomplete', surface, track: previous?.effectiveTrack || 'unknown', errorCode: 'close_incomplete', effective: { processSet: active } });
    const quiescent = await waitForQuiescence({ surface, processProvider });
    if (quiescent.status !== 'quiescent') return createReceipt({ operation: 'launch', status: 'close_incomplete', surface, track: previous?.effectiveTrack || 'unknown', errorCode: 'process_active', effective: quiescent });
  }
  const journal = await prepareTransaction({ surface, requestedTrack: track, roots, previousSelection: previous, processSet: active });
  await advanceTransaction(journal, 'old_app_stopped');
  let spec = launchSpec;
  if (!spec && GUI_SURFACES.has(surface)) {
    const application = await resolveApplication(surface);
    if (!application.executable) return createReceipt({ operation: 'launch', status: 'error', surface, track, errorCode: 'application_not_resolved', effective: { warnings: application.warnings || [] } });
    const args = roots.appDataRoot ? [`--user-data-dir=${roots.appDataRoot}`] : [];
    spec = buildLaunchSpec({ surface, track, sourceRoot, roots, command: application.executable, args });
  }
  spec ||= buildLaunchSpec({ surface, track, sourceRoot, roots });
  await advanceTransaction(journal, 'launch_requested', { launch: { commandName: spec.command, argCount: spec.args.length } });
  const started = dryRun ? { status: 'launch_requested', pid: null } : spawnTrack(spec, { spawnImpl: spawnImpl || undefined });
  const effective = { track, runtimeHome: roots.runtimeHome, providerHome: roots.providerHome, appDataRoot: roots.appDataRoot || null, pid: started.pid || null, processScoped: true };
  await advanceTransaction(journal, 'effective_verified', { effective });
  const committed = await commitTransaction({ ...journal, effective });
  await updateState((next) => { next.surfaces[surface] = { requestedTrack: track, effectiveTrack: track, requested: { track, roots }, effective, lastCommitted: effective }; next.lastCommitted[surface] = effective; next.journal = null; return next; });
  return createReceipt({ operation: 'launch', status: 'committed', surface, track, effective });
}

export async function recoverSwitch({ surface, processProvider, closeApproval = false, closeHandler = null } = {}) {
  const journal = await readJournal();
  if (!journal || (surface && journal.surface !== surface)) return createReceipt({ operation: 'recover', status: 'idle', surface: surface || 'unknown', track: 'unknown' });
  if (!closeApproval || !closeHandler) return createReceipt({ operation: 'recover', status: 'recovery_required', surface: journal.surface, track: journal.requestedTrack, errorCode: 'operator_approval_missing' });
  const active = await listProviderProcesses({ surface: journal.surface, processProvider });
  if (active.length && !(await closeHandler({ surface: journal.surface, processSet: active }))) return createReceipt({ operation: 'recover', status: 'close_incomplete', surface: journal.surface, track: journal.requestedTrack, errorCode: 'close_incomplete' });
  await recoverTransaction(); await clearJournal();
  return createReceipt({ operation: 'recover', status: 'recovered', surface: journal.surface, track: journal.previousSelection?.effectiveTrack || 'relay', effective: { previousSelectionRestored: true } });
}
export async function rollbackSwitch({ surface, processProvider } = {}) {
  const state = await readState(); const selected = state.lastCommitted[surface] || state.surfaces[surface]?.lastCommitted;
  const active = await listProviderProcesses({ surface, processProvider });
  if (active.length && GUI_SURFACES.has(surface)) return createReceipt({ operation: 'rollback', status: 'process_active', surface, track: selected?.track || 'unknown', errorCode: 'process_active' });
  if (!selected) return createReceipt({ operation: 'rollback', status: 'not_found', surface, track: 'unknown' });
  return createReceipt({ operation: 'rollback', status: 'metadata_only', surface, track: selected.track, effective: { restored: true, providerCreatedData: 'preserved' } });
}
export async function uninstallSwitcher({ home = null } = {}) { const target = home ? path.resolve(home) : null; if (!target) return { status: 'uninstalled', removed: [], preserved: ['provider-created data', 'Relay roots'] }; return uninstallSwitcherPackage({ targetRoot: target }); }
