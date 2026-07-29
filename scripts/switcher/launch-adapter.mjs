import path from 'node:path';
import { spawn } from 'node:child_process';
import { SURFACE_ENV } from './constants.mjs';
import { resolveTrackRoots } from './paths.mjs';

export function buildProcessEnvironment({ surface, track, roots, workspaceRoot = null, runId = null, projectId = null, sessionId = null, baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  if (SURFACE_ENV[surface]) env[SURFACE_ENV[surface]] = roots.providerHome;
  if (track === 'kernel') {
    env.MOON_RELAY_KERNEL_HOME = roots.runtimeHome;
    env.PATH = `${path.join(roots.runtimeHome, 'bin')}${path.delimiter}${env.PATH || ''}`;
    if (runId) env.MOON_RELAY_KERNEL_RUN_ID = String(runId);
    if (projectId) env.MOON_RELAY_KERNEL_PROJECT_ID = String(projectId);
    if (sessionId) env.MOON_RELAY_KERNEL_SESSION_ID = String(sessionId);
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
  if (surface === 'claude_cli') return process.platform === 'win32' ? 'claude.cmd' : 'claude';
  if (surface === 'qwen_cli') return process.platform === 'win32' ? 'qwen.cmd' : 'qwen';
  if (surface === 'codex_cli') return process.platform === 'win32' ? 'codex.cmd' : 'codex';
  return surface;
};

export function buildLaunchSpec({ surface, track, sourceRoot = process.cwd(), workspaceRoot = null, runId = null, projectId = null, sessionId = null, command, args = [], roots = resolveTrackRoots({ track, surface, sourceRoot }) } = {}) {
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
    env: buildProcessEnvironment({ surface, track, roots, workspaceRoot: resolvedWorkspace, runId, projectId, sessionId }),
  };
}

export function spawnTrack(spec, { spawnImpl = spawn } = {}) {
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
        child = spawnImpl('cmd.exe', ['/d', '/s', '/c', 'start', '', shellTarget, ...spec.args], { ...options, env });
        const focusScript = "$ErrorActionPreference='SilentlyContinue'; try { $shell=New-Object -ComObject WScript.Shell; for ($i=0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if ($shell.AppActivate($env:MOON_SWITCHER_WINDOW_TITLE)) { break } } } catch {}";
        spawnImpl('powershell.exe', ['-NoProfile', '-Command', focusScript], { ...options, env });
      } else {
        const psScript = "$ErrorActionPreference='SilentlyContinue'; $envHash = @{}; Get-ChildItem env: | ForEach-Object { $envHash[$_.Name] = $_.Value }; try { Start-Process -FilePath $env:MOON_SWITCHER_TARGET -ArgumentList (@($env:MOON_SWITCHER_ARGS_JSON | ConvertFrom-Json)) -Environment $envHash -WindowStyle Normal } catch { Start-Process -FilePath $env:MOON_SWITCHER_TARGET -ArgumentList (@($env:MOON_SWITCHER_ARGS_JSON | ConvertFrom-Json)) -WindowStyle Normal }";
        child = spawnImpl('powershell.exe', ['-NoProfile', '-Command', psScript], { ...options, env });
        child.unref?.();
      }
      return { pid: null, status: 'launch_requested', child, launcher: aumid ? 'cmd_shell_activation' : 'powershell_start_process' };
    }
    throw error;
  }
}
