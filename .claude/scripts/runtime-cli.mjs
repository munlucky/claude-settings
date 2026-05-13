#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  activeWorkspaceContract,
  isCodexDesktopContext,
  isWsl,
  resolveParentRuntimeContext,
} from './lib/runtime-platform.mjs';
import { resolveNpmBaseArgs } from './lib/command-resolver.mjs';
import { runCommand } from './lib/process-utils.mjs';

function windowsCodexAuthCandidates() {
  const userHint = process.env.WIN_USERNAME || process.env.USERNAME || process.env.USER || '';
  const candidates = [];

  if (userHint) {
    candidates.push(`/mnt/c/Users/${userHint}/.codex/auth.json`);
  }

  if (process.env.USER) {
    candidates.push(`/mnt/c/Users/${process.env.USER}/.codex/auth.json`);
  }

  candidates.push('/mnt/c/Users/moon/.codex/auth.json');

  try {
    for (const entry of fs.readdirSync('/mnt/c/Users', { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      candidates.push(`/mnt/c/Users/${entry.name}/.codex/auth.json`);
    }
  } catch {
    // Ignore missing Windows mount points.
  }

  return [...new Set(candidates)];
}

function findWindowsCodexAuth() {
  for (const candidate of windowsCodexAuthCandidates()) {
    try {
      if (fs.statSync(candidate).size > 0) {
        return candidate;
      }
    } catch {
      // Ignore missing candidates.
    }
  }

  return '';
}

function syncWslCodexAuth() {
  if (!isWsl()) {
    return '';
  }

  const localCodexDir = path.join(os.homedir(), '.codex');
  const localAuth = path.join(localCodexDir, 'auth.json');

  try {
    if (fs.statSync(localAuth).size > 0) {
      return localAuth;
    }
  } catch {
    // Continue with Windows auth discovery.
  }

  const windowsAuth = findWindowsCodexAuth();
  if (!windowsAuth) {
    return '';
  }

  fs.mkdirSync(localCodexDir, { recursive: true });
  try {
    fs.rmSync(localAuth, { force: true });
  } catch {
    // Ignore removal failures and continue with copy fallback.
  }

  try {
    fs.symlinkSync(windowsAuth, localAuth);
  } catch {
    fs.copyFileSync(windowsAuth, localAuth);
  }

  return localAuth;
}

function findPidsByPattern(pattern) {
  if (process.platform === 'win32') {
    const psCommand = [
      '$pattern = $args[0]',
      '$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $pattern }',
      '$procs | ForEach-Object { $_.ProcessId }',
    ].join('; ');
    const result = runCommand('powershell.exe', ['-NoProfile', '-Command', psCommand, pattern]);
    if (result.status !== 0 && result.error) {
      return [];
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const result = runCommand('ps', ['-ax', '-o', 'pid=', '-o', 'command=']);
  if (result.status !== 0 && result.error) {
    return [];
  }

  const regex = new RegExp(pattern);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => regex.test(line))
    .map((line) => line.split(/\s+/, 1)[0]);
}

function resolveCommandFromPath(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = runCommand(checker, [command]);
  if (result.status !== 0 || result.error) {
    return '';
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function codexBinaryCandidates() {
  const homeDir = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
  const programFiles = [
    process.env.ProgramFiles || '',
    process.env['ProgramFiles(x86)'] || '',
  ].filter(Boolean);

  const candidates = [
    process.env.AGENT_LOOP_CODEX_BINARY || '',
    process.env.CODEX_BINARY_PATH || '',
    process.env.CODEX_CLI_PATH || '',
  ];

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Codex.app/Contents/Resources/codex',
      path.join(homeDir, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
    );
  }

  if (process.platform === 'win32') {
    if (localAppData) {
      candidates.push(
        path.join(localAppData, 'Programs', 'Codex', 'resources', 'codex.exe'),
        path.join(localAppData, 'Programs', 'Codex', 'Codex.exe'),
        path.join(localAppData, 'Codex', 'resources', 'codex.exe'),
        path.join(localAppData, 'Codex', 'Codex.exe'),
      );
    }
    for (const base of programFiles) {
      candidates.push(
        path.join(base, 'Codex', 'resources', 'codex.exe'),
        path.join(base, 'Codex', 'Codex.exe'),
      );
    }
  }

  const pathResolved = resolveCommandFromPath('codex');
  if (isCodexDesktopContext()) {
    candidates.push(pathResolved);
  } else {
    candidates.unshift(pathResolved);
  }

  return [...new Set(candidates.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

export function resolveCodexCommand() {
  for (const candidate of codexBinaryCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore candidate resolution failures.
    }
  }
  return '';
}

export function resolvePowerShellCommand() {
  const pwshPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  if (process.platform === 'win32' && fs.existsSync(pwshPath)) {
    return pwshPath;
  }
  return process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
}

export function npmBaseArgs() {
  return resolveNpmBaseArgs();
}

function getProcessGroupId(pid) {
  if (!pid) {
    return '';
  }

  if (process.platform === 'win32') {
    return String(pid);
  }

  const result = runCommand('ps', ['-o', 'pgid=', '-p', String(pid)]);
  if (result.status !== 0 || result.error) {
    return '';
  }

  return result.stdout.trim().split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function copyIfPresent(sourcePath, targetPath) {
  try {
    if (!fs.existsSync(sourcePath)) {
      return false;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return true;
  } catch {
    return false;
  }
}

function prepareCodexProbeHome(rootPath) {
  if (isWsl()) {
    syncWslCodexAuth();
  }

  const probeHome = path.resolve(rootPath || path.join(os.tmpdir(), 'codex-probe-home'));
  const codexHome = path.join(probeHome, '.codex');
  const xdgConfigHome = path.join(probeHome, '.config');
  const xdgCacheHome = path.join(probeHome, '.cache');
  const xdgStateHome = path.join(probeHome, '.local', 'state');

  for (const directory of [probeHome, codexHome, xdgConfigHome, xdgCacheHome, xdgStateHome]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const sourceCodexHome = path.join(os.homedir(), '.codex');
  for (const relativePath of ['auth.json', 'config.json', 'config.toml']) {
    copyIfPresent(path.join(sourceCodexHome, relativePath), path.join(codexHome, relativePath));
  }

  return {
    HOME: probeHome,
    CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_CACHE_HOME: xdgCacheHome,
    XDG_STATE_HOME: xdgStateHome,
  };
}

export function codexBaseArgs(cwd) {
  let useOss = process.env.CODEX_USE_OSS_PROVIDER ?? 'auto';
  let localProvider = process.env.CODEX_LOCAL_PROVIDER ?? '';
  const useEphemeral = process.env.CODEX_EXEC_EPHEMERAL ?? 'true';
  const sandboxMode = process.env.CODEX_EXEC_SANDBOX || 'danger-full-access';
  const approvalPolicy = process.env.CODEX_EXEC_APPROVAL_POLICY
    || (sandboxMode === 'danger-full-access' ? 'never' : '');

  const codexCommand = resolveCodexCommand() || 'codex';
  const windowsWrapper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'codex-exec-wrapper.ps1');
  const powershellCommand = resolvePowerShellCommand();
  const args = process.platform === 'win32'
    ? [powershellCommand, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', windowsWrapper, 'exec', '--sandbox', sandboxMode, '-C', cwd]
    : [codexCommand, 'exec', '--sandbox', sandboxMode, '-C', cwd];

  if (approvalPolicy) {
    args.push('--ask-for-approval', approvalPolicy);
  }

  if (useEphemeral === 'true') {
    args.push('--ephemeral');
  }

  if (useOss === 'auto') {
    useOss = localProvider ? 'true' : 'false';
  }

  if (useOss === 'true') {
    if (!localProvider) {
      localProvider = 'ollama';
    }
    args.push('--oss', '--local-provider', localProvider);
  }

  return args;
}

function printUsage() {
  console.error([
    'Usage:',
    '  runtime-cli.mjs <command> [args]',
    '',
    'Commands:',
    '  is-wsl',
    '  find-windows-codex-auth',
    '  sync-wsl-codex-auth',
    '  active-workspace-contract [cwd]',
    '  find-pids-by-pattern <pattern>',
    '  get-process-group-id <pid>',
    '  resolve-codex-command',
    '  resolve-powershell-command',
    '  resolve-parent-runtime-context [requested-runtime] [verification-runtimes]',
    '  codex-base-args <cwd>',
    '  npm-base-args',
    '  capability-preflight-command',
    '  codex-probe-env <probe-root>',
  ].join('\n'));
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'is-wsl':
      process.exit(isWsl() ? 0 : 1);
      break;
    case 'find-windows-codex-auth': {
      const authPath = findWindowsCodexAuth();
      if (authPath) {
        writeStdoutLine(authPath);
        process.exit(0);
      }
      process.exit(1);
      break;
    }
    case 'sync-wsl-codex-auth': {
      const authPath = syncWslCodexAuth();
      if (authPath) {
        writeStdoutLine(authPath);
      }
      process.exit(0);
      break;
    }
    case 'active-workspace-contract': {
      const cwd = args[0] || process.cwd();
      writeStdoutLine(activeWorkspaceContract(cwd));
      process.exit(0);
      break;
    }
    case 'find-pids-by-pattern': {
      const pattern = args[0];
      if (!pattern) {
        printUsage();
        process.exit(64);
      }
      for (const pid of findPidsByPattern(pattern)) {
        writeStdoutLine(pid);
      }
      process.exit(0);
      break;
    }
    case 'get-process-group-id': {
      const pid = args[0];
      if (!pid) {
        printUsage();
        process.exit(64);
      }
      const pgid = getProcessGroupId(pid);
      if (pgid) {
        writeStdoutLine(pgid);
      }
      process.exit(pgid ? 0 : 1);
      break;
    }
    case 'resolve-codex-command': {
      const codexCommand = resolveCodexCommand();
      if (codexCommand) {
        writeStdoutLine(codexCommand);
        process.exit(0);
      }
      process.exit(1);
      break;
    }
    case 'resolve-powershell-command': {
      writeStdoutLine(resolvePowerShellCommand());
      process.exit(0);
      break;
    }
    case 'resolve-parent-runtime-context': {
      const context = resolveParentRuntimeContext({
        requestedRuntime: args[0] ?? 'auto',
        verificationRuntimes: args[1] ?? 'auto',
      });
      for (const [key, value] of Object.entries(context)) {
        writeStdoutLine(`${key}=${String(value)}`);
      }
      process.exit(0);
      break;
    }
    case 'codex-base-args': {
      const cwd = args[0] || process.cwd();
      for (const arg of codexBaseArgs(cwd)) {
        writeStdoutLine(arg);
      }
      process.exit(0);
      break;
    }
    case 'npm-base-args': {
      for (const arg of npmBaseArgs()) {
        writeStdoutLine(arg);
      }
      process.exit(0);
      break;
    }
    case 'capability-preflight-command': {
      writeStdoutLine('node');
      writeStdoutLine(path.join(path.dirname(fileURLToPath(import.meta.url)), 'phase-capability-preflight.mjs'));
      process.exit(0);
      break;
    }
    case 'codex-probe-env': {
      const probeRoot = args[0];
      if (!probeRoot) {
        printUsage();
        process.exit(64);
      }
      const envAssignments = prepareCodexProbeHome(probeRoot);
      for (const [key, value] of Object.entries(envAssignments)) {
        writeStdoutLine(`${key}=${value}`);
      }
      process.exit(0);
      break;
    }
    default:
      printUsage();
      process.exit(64);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
