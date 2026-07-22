import { makeId } from './constants.mjs';
import { clearJournal, readJournal, writeJournal } from './state-store.mjs';
export const JOURNAL_STATES = ['prepared', 'old_app_stopped', 'launch_requested', 'effective_verified', 'committed', 'recovery_required', 'close_incomplete'];
export async function prepareTransaction({ surface, requestedTrack, roots, previousSelection = null, processSet = [] } = {}) {
  const journal = { schemaVersion: 1, journalId: makeId('journal'), surface, requestedTrack, state: 'prepared', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), roots, previousSelection, processSet, errorCode: null };
  await writeJournal(journal); return journal;
}
export async function advanceTransaction(journal, state, extra = {}) {
  if (!JOURNAL_STATES.includes(state)) throw new Error(`invalid journal state: ${state}`);
  const next = { ...journal, ...extra, state, updatedAt: new Date().toISOString() }; await writeJournal(next); return next;
}
export async function recoverTransaction() {
  const journal = await readJournal();
  if (!journal || journal.state === 'committed') return { status: 'idle', journal: null };
  const next = { ...journal, state: 'recovery_required', updatedAt: new Date().toISOString(), errorCode: 'journal_recovery_required' };
  await writeJournal(next); return { status: 'recovery_required', journal: next };
}
export async function commitTransaction(journal) { const next = await advanceTransaction(journal, 'committed'); await clearJournal(); return next; }
export function faultInjectionMatrix() {
  return ['rename_failure', 'access_denied', 'antivirus_handle', 'disk_full', 'stale_temp', 'unknown_target', 'unexpected_reparse', 'relaunch_race'].map((fault) => ({ fault, result: 'recovery_required', lastCommittedSelectionAuthoritative: true, broadMutation: false }));
}
