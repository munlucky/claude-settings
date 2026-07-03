#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const binPath = fileURLToPath(import.meta.url);
const repoRoot = path.dirname(path.dirname(binPath));
const installer = path.join(repoRoot, 'scripts', 'install-account-root-harness.mjs');
const bridgeInstaller = path.join(repoRoot, 'scripts', 'install-project-runtime-bridge.mjs');
const deliverySubmit = path.join(repoRoot, 'scripts', 'delivery-submit.mjs');
const retroCli = path.join(repoRoot, 'tools', 'retro', 'retro-cli.mjs');

const usage = `Usage:
  moonshot-relay [install] [--dry-run] [--json] [--no-backup]
  moonshot-relay install [--runtime all|claude|codex] [--moonshot-home <dir>] [--claude-home <dir>] [--codex-home <dir>]
  moonshot-relay bridge [--target <project-root>] [--plan-package docs/implementation/<slug-or-account-root-package>] [--dry-run] [--json]
  moonshot-relay delivery submit --score <json-file> --verification <json-file> --current-sha <sha> [--mode local|pr|release] [--out <submission.json>] [--json]
  moonshot-relay retro collect|import|daily|propose|issue-draft [options]

Runs the Moonshot Relay account-root installer from the current package source.`;

const args = process.argv.slice(2).filter((arg) => arg !== '--');

if (args.includes('--help') || args.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

let command = 'install';
if (args[0] && !args[0].startsWith('-')) {
  command = args.shift();
}

if (!['install', 'bridge', 'delivery', 'retro'].includes(command)) {
  console.error(`Unknown command: ${command}\n${usage}`);
  process.exit(1);
}

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

if (!existsSync(selectedInstaller)) {
  console.error(`Moonshot Relay installer not found: ${selectedInstaller}`);
  process.exit(1);
}

const installerArgs = command === 'bridge'
  ? [selectedInstaller, ...args]
  : [
      selectedInstaller,
      '--runtime',
      'all',
      '--source-root',
      repoRoot,
      '--remove-legacy-harness-core',
      ...args,
    ];

const result = spawnSync(process.execPath, installerArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
