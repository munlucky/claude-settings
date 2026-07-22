import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { SWITCHER_PRODUCT_ID, SWITCHER_SCHEMA_VERSION, SURFACES } from './constants.mjs';
import { journalPath, statePath, switcherHome } from './paths.mjs';

const blankState = () => ({ schemaVersion: SWITCHER_SCHEMA_VERSION, productId: SWITCHER_PRODUCT_ID, surfaces: Object.fromEntries(SURFACES.map((surface) => [surface, { requestedTrack: 'relay', effectiveTrack: 'unknown', requested: null, effective: null, lastCommitted: null }])), lastCommitted: {}, leases: {}, journal: null });
const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } };
const atomicWrite = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8'); await rename(tmp, file); };
export async function ensureSwitcherHome() { await mkdir(path.join(switcherHome(), 'state'), { recursive: true }); await mkdir(path.join(switcherHome(), 'receipts'), { recursive: true }); return switcherHome(); }
export async function readState() { await ensureSwitcherHome(); const state = await readJson(statePath(), null); return state?.productId === SWITCHER_PRODUCT_ID ? state : blankState(); }
export async function writeState(state) { await ensureSwitcherHome(); await atomicWrite(statePath(), state); return state; }
export async function updateState(mutator) { const state = await readState(); const next = await mutator(structuredClone(state)); return writeState(next); }
export async function readJournal() { return readJson(journalPath(), null); }
export async function writeJournal(journal) { await ensureSwitcherHome(); return atomicWrite(journalPath(), journal); }
export async function clearJournal() { try { await writeFile(journalPath(), 'null', 'utf8'); } catch { /* absent */ } }
