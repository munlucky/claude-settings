import path from 'node:path';
import { spawn } from 'node:child_process';
import { SURFACE_ENV } from './constants.mjs';
import { resolveTrackRoots } from './paths.mjs';

export function buildProcessEnvironment({ surface, track, roots, workspaceRoot = null, baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  if (SURFACE_ENV[surface]) env[SURFACE_ENV[surface]] = roots.providerHome;
  env.MOONSHOT_RELAY_HOME = roots.runtimeHome;
  env.MOON_RELAY_TRACK = track;
  if (workspaceRoot) env.MOON_RELAY_WORKSPACE_ROOT = workspaceRoot;
  if (surface === 'antigravity_desktop') env.GEMINI_HOME = roots.providerHome;
  return env;
}

export function buildLaunchSpec({ surface, track, sourceRoot = process.cwd(), workspaceRoot = null, command, args = [], roots = resolveTrackRoots({ track, surface, sourceRoot }) } = {}) {
  const resolvedWorkspace = workspaceRoot ? path.resolve(workspaceRoot) : (track === 'kernel' ? path.resolve(sourceRoot) : null);
  const expectedPublicSkills = track === 'kernel' ? ['moon-relay-kernel'] : null;
  return {
    schemaVersion: 1,
    surface,
    track,
    command: command || surface,
    args: [...args],
    aumid: null,
    roots,
    workspaceRoot: resolvedWorkspace,
    cwd: resolvedWorkspace || process.cwd(),
    expectedPublicSkills,
    env: buildProcessEnvironment({ surface, track, roots, workspaceRoot: resolvedWorkspace }),
  };
}

export function spawnTrack(spec, { spawnImpl = spawn } = {}) {
  const options = {
    env: spec.env,
    cwd: spec.cwd || process.cwd(),
    windowsHide: true,
    detached: false,
    stdio: 'ignore',
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
