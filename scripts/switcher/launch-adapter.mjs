import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { pathsOverlap, resolveTrackRoots } from './paths.mjs';
import { canonicalPath } from '../kernel/runtime-home.mjs';
import { canonicalizeHostSessionId, providerForSurface } from '../kernel/run/host-session.mjs';
import { nativeProviderDescriptor } from './native-provider.mjs';

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
  const userHome = baseEnv.USERPROFILE || baseEnv.HOME || process.env.USERPROFILE || process.env.HOME || '';
  const kernelHome = canonicalPath(baseEnv.MOON_RELAY_KERNEL_HOME || path.join(userHome, '.moon-relay-kernel'));
  const activeProvider = {
    claude: surface === 'claude_cli' ? roots.providerHome : null,
    codex: ['codex_cli', 'codex_desktop'].includes(surface) ? roots.providerHome : null,
    qwen: surface === 'qwen_cli' ? roots.providerHome : null,
    antigravity: surface === 'antigravity_desktop' ? roots.providerHome : null,
  };
  const safeRelayPath = (candidate, fallback, label = 'provider') => {
    const selected = candidate ? canonicalPath(candidate) : fallback;
    if (pathsOverlap(kernelHome, fallback)) throw new Error(`unsafe_target: Relay ${label} fallback overlaps Kernel home`);
    return pathsOverlap(kernelHome, selected) ? fallback : selected;
  };
  const sanitizeRelayPath = (value) => {
    if (typeof value !== 'string') return value;
    return value
      .split(path.delimiter)
      .filter((entry) => !entry || !pathsOverlap(kernelHome, entry))
      .join(path.delimiter);
  };
  if (track === 'kernel') {
    const provider = providerForSurface(surface);
    env.MOON_RELAY_KERNEL_HOME = roots.runtimeHome;
    env.PATH = `${path.join(roots.runtimeHome, 'bin')}${path.delimiter}${env.PATH || ''}`;
    if (runId) env.MOON_RELAY_KERNEL_RUN_ID = String(runId);
    if (projectId) env.MOON_RELAY_KERNEL_PROJECT_ID = String(projectId);
    if (sessionId) env.MOON_RELAY_KERNEL_SESSION_ID = canonicalizeHostSessionId({ provider, sessionId });
    env.MOON_RELAY_KERNEL_PROVIDER = provider;
    if (workspaceId) env.MOON_RELAY_KERNEL_WORKSPACE_ID = String(workspaceId);
    // Older switcher builds incorrectly exported the Kernel runtime through
    // MOONSHOT_RELAY_HOME. Do not propagate that poisoned alias into another
    // Kernel surface, while preserving a genuinely distinct custom Relay home.
    if (env.MOONSHOT_RELAY_HOME && path.resolve(env.MOONSHOT_RELAY_HOME) === path.resolve(roots.runtimeHome)) {
      delete env.MOONSHOT_RELAY_HOME;
    }
    env.CLAUDE_HOME = activeProvider.claude || path.join(roots.runtimeHome, 'providers', 'claude');
    env.CLAUDE_CONFIG_DIR = env.CLAUDE_HOME;
    env.CODEX_HOME = activeProvider.codex || path.join(roots.runtimeHome, 'providers', 'codex');
    env.QWEN_HOME = activeProvider.qwen || path.join(roots.runtimeHome, 'providers', 'qwen');
    env.GEMINI_HOME = activeProvider.antigravity || path.join(roots.runtimeHome, 'providers', 'antigravity');
    env.ANTIGRAVITY_HOME = env.GEMINI_HOME;
    env.ANTIGRAVITY_SKILLS_HOME = path.join(env.GEMINI_HOME, 'skills');
  } else {
    env.MOONSHOT_RELAY_HOME = roots.runtimeHome;
    const inheritedPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1];
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
    env.PATH = sanitizeRelayPath(inheritedPath);
    for (const key of [
      'MOON_RELAY_KERNEL_HOME',
      'MOON_RELAY_KERNEL_RUN_ID',
      'MOON_RELAY_KERNEL_PROJECT_ID',
      'MOON_RELAY_KERNEL_SESSION_ID',
      'MOON_RELAY_KERNEL_LEGACY_SESSION_ID',
      'MOON_RELAY_KERNEL_PROVIDER',
      'MOON_RELAY_KERNEL_WORKSPACE_ID',
      'MOON_RELAY_WORKSPACE_ROOT',
    ]) delete env[key];
    const relayClaudeHome = safeRelayPath(activeProvider.claude || env.CLAUDE_HOME || path.join(userHome, '.claude'), path.join(userHome, '.claude'), 'Claude');
    const relayClaudeConfig = safeRelayPath(activeProvider.claude || env.CLAUDE_CONFIG_DIR || path.join(userHome, '.claude'), path.join(userHome, '.claude'), 'Claude config');
    const relayCodexHome = safeRelayPath(activeProvider.codex || env.CODEX_HOME || path.join(userHome, '.codex'), path.join(userHome, '.codex'), 'Codex');
    const relayQwenHome = safeRelayPath(activeProvider.qwen || env.QWEN_HOME || path.join(userHome, '.qwen'), path.join(userHome, '.qwen'), 'Qwen');
    const relayAntigravityFallback = path.join(roots.runtimeHome, 'providers', 'antigravity');
    const relayAntigravitySkillsFallback = path.join(roots.runtimeHome, 'providers', 'antigravity-skills');
    const relayAntigravityHome = safeRelayPath(
      activeProvider.antigravity || env.ANTIGRAVITY_HOME || path.join(userHome, '.gemini', 'antigravity'),
      relayAntigravityFallback,
      'Antigravity',
    );
    const relayAntigravitySkillsHome = safeRelayPath(
      env.ANTIGRAVITY_SKILLS_HOME || path.join(userHome, '.gemini', 'config'),
      relayAntigravitySkillsFallback,
      'Antigravity skills',
    );
    env.CLAUDE_HOME = relayClaudeHome;
    env.CLAUDE_CONFIG_DIR = relayClaudeConfig;
    env.CODEX_HOME = relayCodexHome;
    env.QWEN_HOME = relayQwenHome;
    env.GEMINI_HOME = relayAntigravityHome;
    env.ANTIGRAVITY_HOME = relayAntigravityHome;
    env.ANTIGRAVITY_SKILLS_HOME = relayAntigravitySkillsHome;
  }
  env.MOON_RELAY_TRACK = track;
  if (workspaceRoot) env.MOON_RELAY_WORKSPACE_ROOT = workspaceRoot;
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
  const nativeProvider = nativeProviderDescriptor({ surface, command, runtimeHome: roots.runtimeHome });
  return {
    schemaVersion: 1,
    surface,
    track,
    command: command || nativeProvider.command || defaultCommand(surface),
    args: [...args],
    aumid: null,
    roots,
    workspaceRoot: resolvedWorkspace,
    cwd: resolvedWorkspace || process.cwd(),
    expectedPublicSkills,
    providerRuntime: nativeProvider,
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

  const isWindowsApps = process.platform === 'win32' && (/[\\/]WindowsApps[\\/]/i.test(spec.command) || Boolean(spec.aumid));
  if (isWindowsApps) {
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

  try {
    const child = spawnImpl(spec.command, spec.args, options);
    child.on?.('error', () => {});
    child.unref?.();
    return { pid: child.pid || null, status: 'launch_requested', child, launcher: 'direct' };
  } catch (error) {
    throw error;
  }
}
