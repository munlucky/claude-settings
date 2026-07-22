import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
export async function hashExecutable(file) { try { return createHash('sha256').update(await readFile(file)).digest('hex'); } catch { return null; } }
export async function resolveExecutable(candidates = []) { for (const candidate of candidates) if (candidate && await exists(candidate)) return path.resolve(candidate); return null; }
export async function resolveLatestWindowsAppsExecutable({ root, packagePrefix, executableRelativePath }) {
  if (process.platform !== 'win32' || !root || !packagePrefix || !executableRelativePath) return null;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(packagePrefix.toLowerCase()))
      .map((entry) => ({ name: entry.name, executable: path.join(root, entry.name, executableRelativePath) }))
      .filter(({ name, executable }) => /_[0-9]+(?:\.[0-9]+)+_[^_]+__[^_]+$/i.test(name) && executable)
      .sort((left, right) => comparePackageVersions(right.name, left.name));
    return await resolveExecutable(candidates.map(({ executable }) => executable));
  } catch {
    return null;
  }
}
function comparePackageVersions(left, right) {
  const version = (value) => {
    const match = value.match(/_[0-9]+(?:\.[0-9]+)+_/);
    return match ? match[0].slice(1, -1).split('.').map(Number) : [];
  };
  const a = version(left); const b = version(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta;
  }
  return left.localeCompare(right);
}
export async function resolveCommand(name) {
  try { const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { windowsHide: true, timeout: 5000 }); return String(stdout).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null; } catch { return null; }
}
export const baseDiscovery = ({ application, executable, launchKind = executable ? 'direct_executable' : 'unknown', warnings = [] }) => ({ schemaVersion: 1, application, status: executable ? 'resolved' : 'not_found', launchKind, aumid: null, packageFamily: null, executable, publisher: null, version: null, appDataRootMode: 'unknown', appServerEffectiveHomeProbe: 'not_run', environmentInheritance: 'unknown', gracefulCloseMechanism: 'window_close_then_quiescence', processSet: [], warnings });
