import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const probeFailed = (error) => Object.assign(new Error(`process_probe_failed: ${error.message}`), { code: 'process_probe_failed', cause: error });

const DEFAULT_PATTERNS = {
  claude_cli: ['Claude'],
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
  const name = row.name.replaceAll('\\', '/').split('/').pop().toLowerCase();
  if (name.includes('chatgpt') || name.includes('codex')) return row.mainWindowHandle === undefined || Number(row.mainWindowHandle) >= 0;
  return false;
};
const isClaudeDesktopProcess = (row) => {
  const name = row.name.replaceAll('\\', '/').split('/').pop().toLowerCase();
  return name === 'claude' && (row.mainWindowHandle === undefined || Number(row.mainWindowHandle) > 0);
};
const isAntigravityDesktopProcess = (row) => {
  const name = row.name.toLowerCase();
  if (name === 'antigravity') return row.mainWindowHandle === undefined || Number(row.mainWindowHandle) > 0;
  return false;
};
export async function listProviderProcesses({ surface, processProvider, platform = process.platform, execProvider = execFileAsync } = {}) {
  if (processProvider) return (await processProvider(surface)).map(normalize);
  if (platform === 'darwin') {
    try {
      const { stdout } = await execProvider('ps', ['-axo', 'pid=,comm=,args='], { timeout: 10000 });
      const rows = stdout.split(/\r?\n/).map((line) => {
        const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
        return match ? normalize({ pid: match[1], name: match[2], executable: match[3] }) : null;
      }).filter(Boolean);
      const isBundle = (row, names) => names.some((name) => `${row.name} ${row.executable || ''}`.toLowerCase().includes(`.app/contents/macos/${name}`));
      if (surface === 'claude_cli') return rows.filter((row) => isBundle(row, ['claude']));
      if (surface === 'codex_desktop') return rows.filter((row) => isBundle(row, ['codex', 'chatgpt']));
      if (surface === 'antigravity_desktop') return rows.filter((row) => isBundle(row, ['antigravity', 'gemini']));
      return [];
    } catch (error) { throw probeFailed(error); }
  }
  if (platform !== 'win32') return [];
  try {
    const { stdout } = await execProvider('powershell.exe', ['-NoProfile', '-Command', "Get-Process | Select-Object Id,ProcessName,Path,MainWindowHandle | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10000 });
    const parsed = JSON.parse(stdout || '[]');
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const normalized = rows.map(normalize);
    if (surface === 'claude_cli') return normalized.filter(isClaudeDesktopProcess);
    if (surface === 'codex_desktop') return normalized.filter(isCodexDesktopProcess);
    if (surface === 'antigravity_desktop') return normalized.filter(isAntigravityDesktopProcess);
    const patterns = DEFAULT_PATTERNS[surface] || [];
    return normalized.filter((row) => patterns.some((pattern) => `${row.name} ${row.executable || ''}`.toLowerCase().includes(pattern.toLowerCase())));
  } catch (error) { throw probeFailed(error); }
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
export async function waitForProcessPresence({ surface, processProvider, timeoutMs = 10000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const processSet = await listProviderProcesses({ surface, processProvider });
    if (processSet.length) return { status: 'process_observed', processSet };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { status: 'process_not_observed', processSet: [] };
}
export const processGuardError = (processSet) => Object.assign(new Error('process_active: relevant provider process remains alive'), { code: 'process_active', processSet });
