import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
export async function hashExecutable(file) { try { return createHash('sha256').update(await readFile(file)).digest('hex'); } catch { return null; } }
export async function resolveExecutable(candidates = []) { for (const candidate of candidates) if (candidate && await exists(candidate)) return path.resolve(candidate); return null; }
export async function resolveCommand(name) {
  try { const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { windowsHide: true, timeout: 5000 }); return String(stdout).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null; } catch { return null; }
}
export const baseDiscovery = ({ application, executable, launchKind = executable ? 'direct_executable' : 'unknown', warnings = [] }) => ({ schemaVersion: 1, application, status: executable ? 'resolved' : 'not_found', launchKind, aumid: null, packageFamily: null, executable, publisher: null, version: null, appDataRootMode: 'unknown', appServerEffectiveHomeProbe: 'not_run', environmentInheritance: 'unknown', gracefulCloseMechanism: 'window_close_then_quiescence', processSet: [], warnings });
