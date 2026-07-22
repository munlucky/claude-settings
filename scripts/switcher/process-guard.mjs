import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const DEFAULT_PATTERNS = {
  codex_desktop: ['ChatGPT', 'codex', 'codex-code-mode-host'],
  antigravity_desktop: ['Antigravity', 'language_server', 'gemini'],
};
const normalize = (row) => {
  const normalized = { pid: Number(row.pid || row.Id || 0), name: String(row.name || row.ProcessName || ''), executable: row.executable || row.Path || null, sessionId: row.sessionId || row.SessionId || null, userSid: row.userSid || null };
  const handle = row.mainWindowHandle ?? row.MainWindowHandle;
  if (handle !== undefined) normalized.mainWindowHandle = handle;
  return normalized;
};
const isCodexDesktopProcess = (row) => {
  const name = row.name.toLowerCase();
  if (name === 'chatgpt') return row.mainWindowHandle === undefined || Number(row.mainWindowHandle) > 0;
  return false;
};
const isAntigravityDesktopProcess = (row) => {
  const name = row.name.toLowerCase();
  if (name === 'antigravity') return row.mainWindowHandle === undefined || Number(row.mainWindowHandle) > 0;
  return false;
};
export async function listProviderProcesses({ surface, processProvider } = {}) {
  if (processProvider) return (await processProvider(surface)).map(normalize);
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', "Get-Process | Select-Object Id,ProcessName,Path,MainWindowHandle | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10000 });
    const parsed = JSON.parse(stdout || '[]');
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const normalized = rows.map(normalize);
    if (surface === 'codex_desktop') return normalized.filter(isCodexDesktopProcess);
    if (surface === 'antigravity_desktop') return normalized.filter(isAntigravityDesktopProcess);
    const patterns = DEFAULT_PATTERNS[surface] || [];
    return normalized.filter((row) => patterns.some((pattern) => `${row.name} ${row.executable || ''}`.toLowerCase().includes(pattern.toLowerCase())));
  } catch { return []; }
}
export async function processSetActive({ surface, processProvider } = {}) { return (await listProviderProcesses({ surface, processProvider })).length > 0; }
export async function waitForQuiescence({ surface, processProvider, quiescenceMs = 250, timeoutMs = 5000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let absentSince = null;
  let last = [];
  while (Date.now() < deadline) {
    last = await listProviderProcesses({ surface, processProvider });
    if (last.length === 0) { absentSince ??= Date.now(); if (Date.now() - absentSince >= quiescenceMs) return { status: 'quiescent', processSet: [] }; }
    else absentSince = null;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { status: 'process_active', processSet: last };
}
export const processGuardError = (processSet) => Object.assign(new Error('process_active: relevant provider process remains alive'), { code: 'process_active', processSet });
