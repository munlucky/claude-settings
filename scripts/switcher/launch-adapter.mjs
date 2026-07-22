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
  return { schemaVersion: 1, surface, track, command: command || surface, args: [...args], aumid: null, roots, env: buildProcessEnvironment({ surface, track, roots }) };
}
export function spawnTrack(spec, { spawnImpl = spawn } = {}) {
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
    const quoteCmdArg = (value) => {
      const text = String(value);
      return /\s/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
    };
    const shellTarget = `shell:AppsFolder\\${aumid}`;
    const startCommand = ['start', '""', quoteCmdArg(shellTarget), ...spec.args.map(quoteCmdArg)].join(' ');
    const child = spawnImpl('cmd.exe', ['/d', '/s', '/c', startCommand], { env, windowsHide: true, detached: false, stdio: 'ignore' });
    child.unref?.();
    const focusScript = "$ErrorActionPreference='SilentlyContinue'; try { $shell=New-Object -ComObject WScript.Shell; for ($i=0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if ($shell.AppActivate($env:MOON_SWITCHER_WINDOW_TITLE)) { break } } } catch {}";
    const focusChild = spawnImpl('powershell.exe', ['-NoProfile', '-Command', focusScript], { env, windowsHide: true, detached: false, stdio: 'ignore' });
    focusChild.unref?.();
    return { pid: null, status: 'launch_requested', child, launcher: aumid ? 'cmd_shell_activation' : 'powershell_start_process' };
  }
  const child = spawnImpl(spec.command, spec.args, { env: spec.env, windowsHide: true, detached: false, stdio: 'ignore' });
  child.unref?.();
  return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'direct' };
}
