#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const bundleRoot = path.resolve(path.dirname(scriptPath), '..', '..');
const relayInstaller = path.join(bundleRoot, 'scripts', 'install-account-root-harness.mjs');
const kernelCli = path.join(bundleRoot, 'bin', 'moon-relay-kernel.mjs');
const payloadRoot = path.join(bundleRoot, 'payload');
const selectedRuntimes = ['claude', 'codex', 'qwen'];

const usage = () => `Usage: Install-Offline.cmd [--dry-run] [--json] [--skip-kernel] [--skip-provider-profiles]
  [--moonshot-home <dir>] [--claude-home <dir>] [--codex-home <dir>] [--qwen-home <dir>]
  [--kernel-home <dir>] [--no-backup] [--remove-legacy-harness-core]`;

const pathExists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const parseArgs = (argv) => {
  const options = {
    dryRun: false,
    json: false,
    skipKernel: false,
    skipProviderProfiles: false,
    passthrough: [],
    kernelHome: process.env.MOON_RELAY_KERNEL_HOME
      || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.moon-relay-kernel'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.passthrough.push(arg);
    } else if (arg === '--json') {
      options.json = true;
      options.passthrough.push(arg);
    } else if (arg === '--skip-kernel') {
      options.skipKernel = true;
    } else if (arg === '--skip-provider-profiles') {
      options.skipProviderProfiles = true;
    } else if (arg === '--kernel-home') {
      options.kernelHome = path.resolve(argv[++index]);
    } else if (['--moonshot-home', '--claude-home', '--codex-home', '--qwen-home'].includes(arg)) {
      options.passthrough.push(arg, path.resolve(argv[++index]));
    } else if (['--no-backup', '--remove-legacy-harness-core'].includes(arg)) {
      options.passthrough.push(arg);
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return options;
};

const run = (executable, args, options = {}) => {
  const result = spawnSync(executable, args, {
    cwd: bundleRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      ...options.env,
    },
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout) : '';
    throw new Error(`${path.basename(executable)} exited with ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
};

const findPayloadNode = async () => {
  const runtimeRoot = path.join(payloadRoot, 'moonshot-relay', 'profile', 'runtime');
  const manifestPath = path.join(runtimeRoot, 'runtime-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const versionDir = path.join(runtimeRoot, 'versions', `${manifest.version}-${manifest.platform}-${manifest.arch}`);
  const nodePath = manifest.platform === 'win32'
    ? path.join(versionDir, 'node.exe')
    : path.join(versionDir, 'bin', 'node');
  return { manifest, versionDir, nodePath: path.normalize(nodePath) };
};

const installKernel = async (options, nodePath) => {
  if (options.skipKernel || options.dryRun) return { status: options.skipKernel ? 'skipped' : 'dry-run' };

  const kernelArgs = [
    kernelCli,
    'install',
    '--target-root',
    options.kernelHome,
    '--source-root',
    bundleRoot,
    '--runtime-source',
    path.dirname(nodePath),
    '--json',
  ];
  const installed = [run(nodePath, kernelArgs, { capture: true })];

  if (!options.skipProviderProfiles) {
    for (const runtime of selectedRuntimes) {
      const targetRoot = path.join(options.kernelHome, 'providers', runtime);
      installed.push(run(nodePath, [
        kernelCli,
        'profile-install',
        '--runtime',
        runtime,
        '--target-root',
        targetRoot,
        '--source-root',
        bundleRoot,
        '--json',
      ], { capture: true }));
    }
  }

  return {
    status: 'installed',
    kernelHome: options.kernelHome,
    providerRuntimes: options.skipProviderProfiles ? [] : selectedRuntimes,
    output: installed.map((entry) => entry.stdout ? JSON.parse(entry.stdout) : null),
  };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!(await pathExists(relayInstaller))) throw new Error(`Missing relay installer: ${relayInstaller}`);
  if (!(await pathExists(payloadRoot))) throw new Error(`Missing materialized payload: ${payloadRoot}`);

  const { nodePath } = await findPayloadNode();
  if (!(await pathExists(nodePath))) throw new Error(`Missing bundled Node runtime: ${nodePath}`);

  const kernel = await installKernel(options, nodePath);
  const relayArgs = [
    relayInstaller,
    '--runtime',
    selectedRuntimes.join(','),
    '--source-root',
    bundleRoot,
    '--payload-root',
    payloadRoot,
    '--remove-legacy-harness-core',
    ...options.passthrough,
  ];
  const relayResult = run(nodePath, relayArgs, { capture: true });
  const relay = JSON.parse(relayResult.stdout);

  const result = {
    schemaVersion: 1,
    bundleRoot,
    targetNode: nodePath,
    antigravity: 'excluded',
    kernel,
    relay,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Installed Moonshot Relay offline bundle from ${bundleRoot}`);
    console.log(`Profiles: ${selectedRuntimes.join(', ')}`);
    console.log(`Antigravity: excluded`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
