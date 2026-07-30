import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { SURFACE_ENV } from './constants.mjs';
import { resolveTrackRoots } from './paths.mjs';

function resolveClaudeDesktopAumid() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-AppxPackage *Claude*).PackageFamilyName'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const familyName = out.trim();
    if (familyName) return `${familyName}!Claude`;
  } catch {}
  return 'Claude_pzs8sxrjxfjjc!Claude';
}

function resolveCommandPath(command) {
  if (!command || path.isAbsolute(command)) return command;
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('where.exe', [command], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      const found = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (found) return found;
    } catch {}
  }
  return command;
}

export function buildProcessEnvironment({ surface, track, roots, workspaceRoot = null, workspaceId = null, runId = null, projectId = null, sessionId = null, baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  if (SURFACE_ENV[surface]) env[SURFACE_ENV[surface]] = roots.providerHome;
  if (track === 'kernel') {
    env.MOON_RELAY_KERNEL_HOME = roots.runtimeHome;
    env.PATH = `${path.join(roots.runtimeHome, 'bin')}${path.delimiter}${env.PATH || ''}`;
    if (runId) env.MOON_RELAY_KERNEL_RUN_ID = String(runId);
    if (projectId) env.MOON_RELAY_KERNEL_PROJECT_ID = String(projectId);
    if (sessionId) env.MOON_RELAY_KERNEL_SESSION_ID = String(sessionId);
    if (workspaceId) env.MOON_RELAY_KERNEL_WORKSPACE_ID = String(workspaceId);
    // Older switcher builds incorrectly exported the Kernel runtime through
    // MOONSHOT_RELAY_HOME. Do not propagate that poisoned alias into another
    // Kernel surface, while preserving a genuinely distinct custom Relay home.
    if (env.MOONSHOT_RELAY_HOME && path.resolve(env.MOONSHOT_RELAY_HOME) === path.resolve(roots.runtimeHome)) {
      delete env.MOONSHOT_RELAY_HOME;
    }
  } else {
    env.MOONSHOT_RELAY_HOME = roots.runtimeHome;
  }
  env.MOON_RELAY_TRACK = track;
  if (workspaceRoot) env.MOON_RELAY_WORKSPACE_ROOT = workspaceRoot;
  if (surface === 'antigravity_desktop') env.GEMINI_HOME = roots.providerHome;
  return env;
}

const defaultCommand = (surface) => {
  if (surface === 'claude_cli') return 'claude';
  if (surface === 'qwen_cli') return 'qwen';
  if (surface === 'codex_cli') return 'codex';
  return surface;
};

export function buildLaunchSpec({ surface, track, sourceRoot = process.cwd(), workspaceRoot = null, workspaceId = null, runId = null, projectId = null, sessionId = null, command, args = [], roots = resolveTrackRoots({ track, surface, sourceRoot }) } = {}) {
  const resolvedWorkspace = workspaceRoot ? path.resolve(workspaceRoot) : (track === 'kernel' ? path.resolve(sourceRoot) : null);
  const expectedPublicSkills = track === 'kernel' ? ['moon-relay-kernel'] : null;
  return {
    schemaVersion: 1,
    surface,
    track,
    command: command || defaultCommand(surface),
    args: [...args],
    aumid: null,
    roots,
    workspaceRoot: resolvedWorkspace,
    cwd: resolvedWorkspace || process.cwd(),
    expectedPublicSkills,
    env: buildProcessEnvironment({ surface, track, roots, workspaceRoot: resolvedWorkspace, workspaceId, runId, projectId, sessionId }),
  };
}

export function spawnTrack(spec, { spawnImpl = spawn } = {}) {
  if (process.platform === 'win32' && (spec.surface === 'claude_cli' || spec.surface === 'claude')) {
    const cmdExecutable = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
    const aumid = resolveClaudeDesktopAumid();
    if (aumid) {
      const shellTarget = `shell:AppsFolder\\${aumid}`;
      const child = spawnImpl(cmdExecutable, ['/c', 'start', shellTarget, ...spec.args], {
        env: spec.env,
        cwd: spec.cwd || process.cwd(),
        windowsHide: false,
        detached: true,
        stdio: 'ignore',
      });
      child.on?.('error', () => {});
      child.unref?.();
      return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'cmd_shell_activation' };
    }
  }
  if (process.platform === 'darwin' && (spec.surface === 'claude_cli' || spec.surface === 'claude')) {
    const openArgs = ['-a', 'Claude'];
    if (spec.args.length) openArgs.push('--args', ...spec.args);
    const child = spawnImpl('open', openArgs, {
      env: spec.env,
      cwd: spec.cwd || process.cwd(),
      detached: true,
      stdio: 'ignore',
    });
    child.on?.('error', () => {});
    child.unref?.();
    return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'macos_open' };
  }
  if (process.platform === 'win32' && spec.surface?.endsWith('_cli')) {
    const cmdExecutable = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
    const resolvedTarget = resolveCommandPath(spec.command);
    const child = spawnImpl(cmdExecutable, ['/d', '/s', '/c', 'start', '', resolvedTarget, ...spec.args], {
      env: spec.env,
      cwd: spec.cwd || process.cwd(),
      windowsHide: false,
      detached: true,
      stdio: 'ignore',
    });
    child.on?.('error', () => {});
    child.unref?.();
    return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'cmd_start_cli' };
  }

  const isCmdOrBat = process.platform === 'win32' && (/\.(cmd|bat)$/i.test(spec.command) || spec.surface?.endsWith('_cli'));
  const options = {
    env: spec.env,
    cwd: spec.cwd || process.cwd(),
    windowsHide: true,
    detached: false,
    stdio: 'ignore',
    ...(isCmdOrBat ? { shell: true } : {}),
  };

  try {
    const child = spawnImpl(spec.command, spec.args, options);
    child.unref?.();
    return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'direct' };
  } catch (error) {
    const useWindowsAppsFallback = process.platform === 'win32' && /[\\/]WindowsApps[\\/]/i.test(spec.command);
    if (useWindowsAppsFallback) {
      const env = {
        ...spec.env,
        MOON_SWITCHER_TARGET: spec.command,
        MOON_SWITCHER_ARGS_JSON: JSON.stringify(spec.args),
      };
      const aumid = spec.aumid || null;
      env.MOON_SWITCHER_AUMID = aumid || '';
      env.MOON_SWITCHER_WINDOW_TITLE = spec.surface === 'antigravity_desktop' ? 'Antigravity' : 'ChatGPT';
      const shellTarget = `shell:AppsFolder\\${aumid}`;
      let child;
      if (aumid) {
        const cmdExecutable = process.env.ComSpec || (process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe') : 'cmd.exe');
        child = spawnImpl(cmdExecutable, ['/c', 'start', shellTarget, ...spec.args], { ...options, env });
        child.on?.('error', () => {});
        const focusScript = "$ErrorActionPreference='SilentlyContinue'; try { $shell=New-Object -ComObject WScript.Shell; for ($i=0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if ($shell.AppActivate($env:MOON_SWITCHER_WINDOW_TITLE)) { break } } } catch {}";
        const psExec = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell';
        const focusChild = spawnImpl(psExec, ['-NoProfile', '-Command', focusScript], { ...options, env });
        focusChild.on?.('error', () => {});
      } else {
        const psScript = "$ErrorActionPreference='SilentlyContinue'; $envHash = @{}; Get-ChildItem env: | ForEach-Object { $envHash[$_.Name] = $_.Value }; try { Start-Process -FilePath $env:MOON_SWITCHER_TARGET -ArgumentList (@($env:MOON_SWITCHER_ARGS_JSON | ConvertFrom-Json)) -Environment $envHash -WindowStyle Normal } catch { Start-Process -FilePath $env:MOON_SWITCHER_TARGET -ArgumentList (@($env:MOON_SWITCHER_ARGS_JSON | ConvertFrom-Json)) -WindowStyle Normal }";
        const psExec = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell';
        child = spawnImpl(psExec, ['-NoProfile', '-Command', psScript], { ...options, env });
        child.on?.('error', () => {});
        child.unref?.();
      }
      return { pid: null, status: 'launch_requested', child, launcher: aumid ? 'cmd_shell_activation' : 'powershell_start_process' };
    }
    throw error;
  }
}
