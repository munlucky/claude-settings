#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const usage = () => `Usage: node tools/harness-lab/codex-cli-smoke.mjs [--out <json>]`;

function parseArgs(argv) {
  const options = { out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      options.out = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileCheck(filePath, required = true) {
  const present = await exists(filePath);
  return {
    path: filePath,
    required,
    status: present ? 'present' : 'missing',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = {
    MOONSHOT_RELAY_HOME: process.env.MOONSHOT_RELAY_HOME || '',
    CODEX_HOME: process.env.CODEX_HOME || '',
    CLAUDE_HOME: process.env.CLAUDE_HOME || '',
    PHASE_RUNTIME_DB: process.env.PHASE_RUNTIME_DB || '',
    HOME: process.env.HOME || '',
    USERPROFILE: process.env.USERPROFILE || '',
  };
  const requireConfig = process.env.HARNESS_LAB_REQUIRE_CODEX_CONFIG === '1';
  const requireAuth = process.env.HARNESS_LAB_REQUIRE_CODEX_AUTH === '1';
  const errors = [];
  for (const [key, value] of Object.entries(env)) {
    if (!value) {
      errors.push(`${key} is not set`);
    }
  }

  const requiredFiles = env.CODEX_HOME && env.MOONSHOT_RELAY_HOME
    ? [
        await fileCheck(path.join(env.CODEX_HOME, 'AGENTS.md')),
        await fileCheck(path.join(env.CODEX_HOME, 'verification.contract.yaml')),
        await fileCheck(path.join(env.CODEX_HOME, 'skills', 'moonshot-orchestrator', 'SKILL.md')),
        await fileCheck(path.join(env.CODEX_HOME, 'skills', 'moonshot-phase-runner', 'SKILL.md')),
        await fileCheck(path.join(env.MOONSHOT_RELAY_HOME, 'scripts', 'codex-mcp-singleton.mjs')),
        await fileCheck(path.join(env.MOONSHOT_RELAY_HOME, 'scripts', 'runtime-state.mjs')),
        await fileCheck(path.join(env.MOONSHOT_RELAY_HOME, 'docs', 'public', 'guidelines', 'harness-bootstrap-lab.md')),
      ]
    : [];

  for (const check of requiredFiles) {
    if (check.required && check.status !== 'present') {
      errors.push(`missing required Codex CLI harness file: ${check.path}`);
    }
  }

  let agentsContract = { status: 'skipped', reason: 'AGENTS.md missing' };
  const agentsPath = env.CODEX_HOME ? path.join(env.CODEX_HOME, 'AGENTS.md') : '';
  if (agentsPath && await exists(agentsPath)) {
    const agents = await readFile(agentsPath, 'utf8');
    const hasCodexToc = /Moonshot Relay Codex Profile TOC/.test(agents);
    const resolvesSharedHome = /MOONSHOT_RELAY_HOME/.test(agents);
    agentsContract = {
      status: hasCodexToc && resolvesSharedHome ? 'passed' : 'failed',
      hasCodexToc,
      resolvesSharedHome,
    };
    if (agentsContract.status !== 'passed') {
      errors.push('Codex AGENTS.md does not expose the expected Moonshot Relay profile contract');
    }
  }

  let configContract = { status: 'absent', required: requireConfig };
  const configPath = env.CODEX_HOME ? path.join(env.CODEX_HOME, 'config.toml') : '';
  if (configPath && await exists(configPath)) {
    const config = await readFile(configPath, 'utf8');
    configContract = {
      status: /codex-mcp-singleton\.mjs/.test(config) ? 'passed' : 'failed',
      required: requireConfig,
      path: configPath,
      referencesSingleton: /codex-mcp-singleton\.mjs/.test(config),
    };
    if (configContract.status !== 'passed') {
      errors.push('Codex config.toml exists but does not reference codex-mcp-singleton.mjs');
    }
  } else if (requireConfig) {
    errors.push('Codex config.toml is required for this lab but is absent');
  }

  const authPath = env.CODEX_HOME ? path.join(env.CODEX_HOME, 'auth.json') : '';
  const authPresent = authPath ? await exists(authPath) : false;
  const authContract = {
    status: authPresent ? 'present' : 'absent',
    required: requireAuth,
  };
  if (requireAuth && !authPresent) {
    errors.push('Codex auth.json is required for this lab but is absent');
  }

  const codexBin = process.env.HARNESS_LAB_CODEX_BIN || 'codex';
  const codexSpawnOptions = {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    shell: process.platform === 'win32',
  };
  const codexVersion = spawnSync(codexBin, ['--version'], codexSpawnOptions);
  const codexExecHelp = spawnSync(codexBin, ['exec', '--help'], codexSpawnOptions);
  const codexCli = {
    version: {
      status: codexVersion.status === 0 ? 'passed' : 'failed',
      exitCode: codexVersion.status ?? (codexVersion.error ? 1 : null),
      stdout: (codexVersion.stdout || '').trim(),
      stderr: (codexVersion.stderr || '').trim(),
    },
    execHelp: {
      status: codexExecHelp.status === 0 ? 'passed' : 'failed',
      exitCode: codexExecHelp.status ?? (codexExecHelp.error ? 1 : null),
      stdoutFirstLine: (codexExecHelp.stdout || '').split(/\r?\n/).find(Boolean) || '',
      stderr: (codexExecHelp.stderr || '').trim(),
    },
  };
  if (codexCli.version.status !== 'passed') {
    errors.push(`Codex CLI --version failed: ${codexCli.version.stderr || codexVersion.error?.message || 'unknown error'}`);
  }
  if (codexCli.execHelp.status !== 'passed') {
    errors.push(`Codex CLI exec --help failed: ${codexCli.execHelp.stderr || codexExecHelp.error?.message || 'unknown error'}`);
  }

  const payload = {
    schemaVersion: 'moonshot-harness-codex-cli-smoke.v1',
    criterion: 'codex-cli-installed-profile-env-contract',
    status: errors.length === 0 ? 'passed' : 'failed',
    env,
    requiredFiles,
    agentsContract,
    configContract,
    authContract,
    codexCli,
    errors,
  };

  if (options.out) {
    await writeFile(options.out, `${JSON.stringify(payload, null, 2)}\n`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }

  if (payload.status !== 'passed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
