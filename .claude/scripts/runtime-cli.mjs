#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { activeWorkspaceContract, isWsl } from './lib/runtime-platform.mjs';
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

function codexBaseArgs(cwd) {
  let useOss = process.env.CODEX_USE_OSS_PROVIDER ?? 'auto';
  let localProvider = process.env.CODEX_LOCAL_PROVIDER ?? '';
  const useEphemeral = process.env.CODEX_EXEC_EPHEMERAL ?? 'true';

  const args = ['codex', 'exec', '--full-auto', '-C', cwd];

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
    '  codex-base-args <cwd>',
  ].join('\n'));
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
        console.log(authPath);
        process.exit(0);
      }
      process.exit(1);
      break;
    }
    case 'sync-wsl-codex-auth': {
      const authPath = syncWslCodexAuth();
      if (authPath) {
        console.log(authPath);
      }
      process.exit(0);
      break;
    }
    case 'active-workspace-contract': {
      const cwd = args[0] || process.cwd();
      console.log(activeWorkspaceContract(cwd));
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
        console.log(pid);
      }
      process.exit(0);
      break;
    }
    case 'codex-base-args': {
      const cwd = args[0] || process.cwd();
      for (const arg of codexBaseArgs(cwd)) {
        console.log(arg);
      }
      process.exit(0);
      break;
    }
    default:
      printUsage();
      process.exit(64);
  }
}

main();
