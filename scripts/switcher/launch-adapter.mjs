import { spawn } from 'node:child_process';
import { SURFACE_ENV } from './constants.mjs';
import { resolveTrackRoots } from './paths.mjs';
export function buildProcessEnvironment({ surface, track, roots, baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  if (SURFACE_ENV[surface]) env[SURFACE_ENV[surface]] = roots.providerHome;
  env.MOONSHOT_RELAY_HOME = roots.runtimeHome;
  env.MOON_RELAY_TRACK = track;
  if (surface === 'antigravity_desktop') env.GEMINI_HOME = roots.providerHome;
  return env;
}
export function buildLaunchSpec({ surface, track, sourceRoot = process.cwd(), command, args = [], roots = resolveTrackRoots({ track, surface, sourceRoot }) } = {}) {
  return { schemaVersion: 1, surface, track, command: command || surface, args: [...args], roots, env: buildProcessEnvironment({ surface, track, roots }) };
}
export function spawnTrack(spec, { spawnImpl = spawn } = {}) {
  const useWindowsAppsFallback = process.platform === 'win32' && /[\\/]WindowsApps[\\/]/i.test(spec.command);
  if (useWindowsAppsFallback) {
    const env = {
      ...spec.env,
      MOON_SWITCHER_TARGET: spec.command,
      MOON_SWITCHER_ARGS_JSON: JSON.stringify(spec.args),
    };
    const script = "$target=$env:MOON_SWITCHER_TARGET; $args=@($env:MOON_SWITCHER_ARGS_JSON | ConvertFrom-Json); Start-Process -FilePath $target -ArgumentList $args -WindowStyle Hidden";
    const child = spawnImpl('powershell.exe', ['-NoProfile', '-Command', script], { env, windowsHide: true, detached: false, stdio: 'ignore' });
    child.unref?.();
    return { pid: null, status: 'launch_requested', child, launcher: 'powershell_start_process' };
  }
  const child = spawnImpl(spec.command, spec.args, { env: spec.env, windowsHide: true, detached: false, stdio: 'ignore' });
  child.unref?.();
  return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'direct' };
}
