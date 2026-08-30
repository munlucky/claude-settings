import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { SWITCHER_PRODUCT_ID, SWITCHER_SCHEMA_VERSION, SURFACES } from './constants.mjs';
import { atomicWriteText } from './durable-write.mjs';
import { journalPath, statePath, switcherHome } from './paths.mjs';

const blankState = () => ({ schemaVersion: SWITCHER_SCHEMA_VERSION, productId: SWITCHER_PRODUCT_ID, runtime: 'moon-relay-kernel', surfaces: Object.fromEntries(SURFACES.map((surface) => [surface, { requestedRuntime: 'moon-relay-kernel', effectiveRuntime: 'unknown', requested: null, effective: null, lastCommitted: null }])), lastCommitted: {}, leases: {}, journal: null });
const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } };
const atomicWrite = async (file, value) => atomicWriteText(file, JSON.stringify(value, null, 2));
export async function ensureSwitcherHome() { await mkdir(path.join(switcherHome(), 'state'), { recursive: true }); await mkdir(path.join(switcherHome(), 'receipts'), { recursive: true }); return switcherHome(); }
export async function readState() {
  await ensureSwitcherHome();
  const state = await readJson(statePath(), null);
  if (state?.productId !== SWITCHER_PRODUCT_ID) return blankState();
  const normalized = blankState();
  normalized.lastCommitted = state.lastCommitted || {};
  normalized.leases = state.leases || {};
  normalized.journal = state.journal || null;
  for (const surface of SURFACES) {
    const current = state.surfaces?.[surface] || {};
    normalized.surfaces[surface] = {
      requestedRuntime: current.requestedRuntime || 'moon-relay-kernel',
      effectiveRuntime: current.effectiveRuntime || 'unknown',
      requested: current.requested || null,
      effective: current.effective || null,
      lastCommitted: current.lastCommitted || null,
    };
  }
  return normalized;
}
export async function writeState(state) { await ensureSwitcherHome(); await atomicWrite(statePath(), state); return state; }
export async function updateState(mutator) { const state = await readState(); const next = await mutator(structuredClone(state)); return writeState(next); }
export async function readJournal() { return readJson(journalPath(), null); }
export async function writeJournal(journal) { await ensureSwitcherHome(); return atomicWrite(journalPath(), journal); }
export async function clearJournal() { try { await atomicWriteText(journalPath(), 'null'); } catch { /* absent */ } }
