#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalPath } from '../scripts/kernel/runtime-home.mjs';
import { pathsOverlap, physicalTargetIdentity } from '../scripts/switcher/paths.mjs';

const binPath = fileURLToPath(import.meta.url);
const repoRoot = path.dirname(path.dirname(binPath));
const installer = path.join(repoRoot, 'scripts', 'install-account-root-harness.mjs');
const bridgeInstaller = path.join(repoRoot, 'scripts', 'install-project-runtime-bridge.mjs');
const kernelInstaller = path.join(repoRoot, 'bin', 'moon-relay-kernel.mjs');
const deliverySubmit = path.join(repoRoot, 'scripts', 'delivery-submit.mjs');
const retroCli = path.join(repoRoot, 'tools', 'retro', 'retro-cli.mjs');

const usage = `Usage:
  moonshot-relay [install] [--dry-run] [--json] [--no-backup]
  moonshot-relay install [--runtime all|claude|codex|qwen] [--moonshot-home <dir>] [--claude-home <dir>] [--codex-home <dir>] [--qwen-home <dir>]
  moonshot-relay kernel [--json]
  moonshot-relay bridge [--target <project-root>] [--plan-package docs/implementation/<slug-or-account-root-package>] [--dry-run] [--json]
  moonshot-relay delivery submit --score <json-file> --verification <json-file> --current-sha <sha> [--mode local|pr|release] [--out <submission.json>] [--json]
  moonshot-relay retro collect|import|daily|propose|issue-draft [options]

Runs the account-root installer from the current package source; the final Codex
command-skill surface is synchronized to the Kernel profile without the switcher.`;

const args = process.argv.slice(2).filter((arg) => arg !== '--');

if (args.includes('--help') || args.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

let command = 'install';
if (args[0] && !args[0].startsWith('-')) {
  command = args.shift();
}

if (!['install', 'kernel', 'bridge', 'delivery', 'retro'].includes(command)) {
  console.error(`Unknown command: ${command}\n${usage}`);
  process.exit(1);
}

// In --json mode the primary installer prints one JSON document to stdout.
// The chained Kernel install steps must NOT pollute stdout
// with their human logs, or `install --json` stops being parseable. Route
// their output to stderr in json mode; keep everything on stdout otherwise.
const jsonMode = args.includes('--json');
const chainedStdio = jsonMode ? ['inherit', 2, 2] : 'inherit';

if (command === 'retro') {
  if (!existsSync(retroCli)) {
    console.error(`Moonshot Relay retro command not found: ${retroCli}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [retroCli, ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (command === 'delivery') {
  const subcommand = args.shift();
  if (subcommand !== 'submit') {
    console.error(`Unknown delivery command: ${subcommand || ''}\n${usage}`);
    process.exit(1);
  }
  if (!existsSync(deliverySubmit)) {
    console.error(`Moonshot Relay delivery submit command not found: ${deliverySubmit}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [deliverySubmit, 'submit', ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const selectedInstaller = command === 'bridge' ? bridgeInstaller : installer;

const relaySetupEnvironment = ({ userHome, kernelHome }) => {
  const physicalKernelHome = canonicalPath(kernelHome);
  const defaultRelayHome = canonicalPath(path.join(userHome, '.moonshot-relay'));
  if (pathsOverlap(physicalKernelHome, defaultRelayHome)) throw new Error('unsafe_target: Kernel and Relay runtime homes overlap');
  const configuredRelayHome = process.env.MOONSHOT_RELAY_HOME;
  const relayHome = configuredRelayHome
    && !pathsOverlap(physicalKernelHome, configuredRelayHome)
    ? canonicalPath(configuredRelayHome)
    : defaultRelayHome;
  const configuredOrDefault = (key, fallback) => {
    const configured = process.env[key];
    const fallbackPath = canonicalPath(fallback);
    if (pathsOverlap(physicalKernelHome, fallbackPath)) throw new Error(`unsafe_target: ${key} fallback overlaps Kernel home`);
    return configured && !pathsOverlap(physicalKernelHome, configured) ? canonicalPath(configured) : fallbackPath;
  };
  const relayEnv = {
    ...process.env,
    MOON_RELAY_TRACK: 'relay',
    MOONSHOT_RELAY_HOME: relayHome,
    CLAUDE_HOME: configuredOrDefault('CLAUDE_HOME', path.join(userHome, '.claude')),
    CLAUDE_CONFIG_DIR: configuredOrDefault('CLAUDE_CONFIG_DIR', path.join(userHome, '.claude')),
    CODEX_HOME: configuredOrDefault('CODEX_HOME', path.join(userHome, '.codex')),
    QWEN_HOME: configuredOrDefault('QWEN_HOME', path.join(userHome, '.qwen')),
    ANTIGRAVITY_HOME: configuredOrDefault('ANTIGRAVITY_HOME', path.join(userHome, '.gemini', 'antigravity')),
    ANTIGRAVITY_SKILLS_HOME: configuredOrDefault('ANTIGRAVITY_SKILLS_HOME', path.join(userHome, '.gemini', 'config')),
    GEMINI_HOME: configuredOrDefault('GEMINI_HOME', path.join(userHome, '.gemini', 'antigravity')),
  };
  const inheritedPath = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1];
  for (const key of Object.keys(relayEnv)) if (key.toLowerCase() === 'path') delete relayEnv[key];
  relayEnv.PATH = typeof inheritedPath === 'string'
    ? inheritedPath.split(path.delimiter).filter((entry) => !entry || !pathsOverlap(physicalKernelHome, entry)).join(path.delimiter)
    : inheritedPath;
  for (const key of [
    'MOON_RELAY_KERNEL_HOME',
    'MOON_RELAY_KERNEL_RUN_ID',
    'MOON_RELAY_KERNEL_PROJECT_ID',
    'MOON_RELAY_KERNEL_SESSION_ID',
    'MOON_RELAY_KERNEL_LEGACY_SESSION_ID',
    'MOON_RELAY_KERNEL_PROVIDER',
    'MOON_RELAY_KERNEL_WORKSPACE_ID',
    'MOON_RELAY_WORKSPACE_ROOT',
  ]) delete relayEnv[key];
  return relayEnv;
};

if (command !== 'kernel' && !existsSync(selectedInstaller)) {
  console.error(`Moonshot Relay installer not found: ${selectedInstaller}`);
  process.exit(1);
}

const userHome = process.env.USERPROFILE || process.env.HOME || os.homedir();
const optionValue = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};
const requestedKernelHome = process.env.MOON_RELAY_KERNEL_HOME || path.join(userHome, '.moon-relay-kernel');
const kernelHomeIdentity = await physicalTargetIdentity(requestedKernelHome, {
  protectedRoots: [process.env.MOONSHOT_RELAY_HOME || path.join(userHome, '.moonshot-relay')],
});
if (!kernelHomeIdentity.safe) {
  console.error(`Setup refused: unsafe Kernel home ${requestedKernelHome}`);
  process.exit(1);
}
const kernelHome = kernelHomeIdentity.canonicalPath;
const relayEnv = command === 'install' ? relaySetupEnvironment({ userHome, kernelHome }) : process.env;
const codexHome = canonicalPath(optionValue('--codex-home') || process.env.CODEX_HOME || path.join(userHome, '.codex'));

const runKernelInstall = () => {
  if (!existsSync(kernelInstaller)) {
    console.error(`Kernel installer not found: ${kernelInstaller}`);
    process.exit(1);
  }
  const kernelInstallArgs = ['install', '--target-root', kernelHome, '--source-root', repoRoot];
  if (jsonMode) kernelInstallArgs.push('--json');
  const kernelInstall = spawnSync(process.execPath, [kernelInstaller, ...kernelInstallArgs], {
    cwd: repoRoot,
    env: { ...process.env, MOON_RELAY_TRACK: 'kernel', MOON_RELAY_KERNEL_HOME: kernelHome },
    stdio: command === 'kernel' ? 'inherit' : chainedStdio,
  });
  if (kernelInstall.error) {
    console.error(`Kernel account install failed: ${kernelInstall.error.message}`);
    process.exit(1);
  }
  if (kernelInstall.status !== 0) {
    console.error(`Kernel account install failed with exit code ${kernelInstall.status}`);
    process.exit(kernelInstall.status || 1);
  }

  // A Kernel install must establish the account-root project identity before
  // any legacy Relay profile is allowed to run. This is setup-time bootstrap,
  // not a bypass of the normal model-visible identity preflight.
  const identityBootstrap = spawnSync(process.execPath, [
    kernelInstaller,
    'identity',
    'bootstrap',
    '--project-root',
    repoRoot,
    '--runtime-home',
    kernelHome,
    '--policy',
    'isolate',
    '--json',
  ], {
    cwd: repoRoot,
    env: { ...process.env, MOON_RELAY_TRACK: 'kernel', MOON_RELAY_KERNEL_HOME: kernelHome },
    stdio: chainedStdio,
  });
  if (identityBootstrap.error) {
    console.error(`Kernel project identity bootstrap failed: ${identityBootstrap.error.message}`);
    process.exit(1);
  }
  if (identityBootstrap.status !== 0) {
    console.error(`Kernel project identity bootstrap failed with exit code ${identityBootstrap.status}`);
    process.exit(identityBootstrap.status || 1);
  }
};

const runKernelAccountRootProfileInstall = () => {
  const profileArgs = [
    kernelInstaller,
    'profile-install',
    '--runtime',
    'codex',
    '--account-root',
    '--target-root',
    codexHome,
    '--source-root',
    repoRoot,
    '--runtime-home',
    kernelHome,
  ];
  if (jsonMode) profileArgs.push('--json');
  const profileInstall = spawnSync(process.execPath, profileArgs, {
    cwd: repoRoot,
    env: { ...process.env, MOON_RELAY_TRACK: 'kernel', MOON_RELAY_KERNEL_HOME: kernelHome },
    stdio: chainedStdio,
  });
  if (profileInstall.error) {
    console.error(`Kernel Codex account-root profile install failed: ${profileInstall.error.message}`);
    process.exit(1);
  }
  if (profileInstall.status !== 0) {
    console.error(`Kernel Codex account-root profile install failed with exit code ${profileInstall.status}`);
    process.exit(profileInstall.status || 1);
  }
};

if (command === 'kernel') {
  runKernelInstall();
  runKernelAccountRootProfileInstall();
  process.exit(0);
}

// Kernel is the first installation authority. The Relay installer below only
// materializes compatibility profiles; the direct Codex Kernel account profile
// is synchronized after it so `/` command discovery has the Kernel default.
if (command === 'install' && !args.includes('--dry-run')) runKernelInstall();

const installerArgs = command === 'bridge'
  ? [selectedInstaller, ...args]
  : [
      selectedInstaller,
      '--runtime',
      'all',
      '--source-root',
      repoRoot,
      '--remove-legacy-harness-core',
      ...args.filter((a) => a !== '--force' && a !== '-f' && a !== '--clean-overlay'),
    ];

const result = spawnSync(process.execPath, installerArgs, {
  cwd: repoRoot,
  env: relayEnv,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status === 0 && command === 'install' && !args.includes('--dry-run')) {
  runKernelAccountRootProfileInstall();
}

process.exit(result.status ?? 1);
