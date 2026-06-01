#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const binPath = fileURLToPath(import.meta.url);
const repoRoot = path.dirname(path.dirname(binPath));
const installer = path.join(repoRoot, 'scripts', 'install-account-root-harness.mjs');

const usage = `Usage:
  moonshot-relay [install] [--dry-run] [--json] [--no-backup]
  moonshot-relay install [--runtime all|claude|codex] [--moonshot-home <dir>] [--claude-home <dir>] [--codex-home <dir>]

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

if (command !== 'install') {
  console.error(`Unknown command: ${command}\n${usage}`);
  process.exit(1);
}

if (!existsSync(installer)) {
  console.error(`Moonshot Relay installer not found: ${installer}`);
  process.exit(1);
}

const installerArgs = [
  installer,
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
