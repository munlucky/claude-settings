#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { npmBaseArgs, resolveCodexCommand, resolvePowerShellCommand } from './runtime-cli.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.cwd();

function run(command, args, options = {}) {
  const env = { ...process.env };
  if (process.platform === 'win32' && !env.npm_config_prefix) {
    env.npm_config_prefix = 'C:\\Program Files\\nodejs';
  }
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 15000,
    env,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message || '',
  };
}

function check(name, status, detail, extra = {}) {
  return { name, status, detail, ...extra };
}

function spawnBlocked(result) {
  return /EPERM|EACCES/i.test(result.error || result.stderr || '');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(workspaceRoot, relativePath));
}

function readPackageManifest() {
  const packagePath = path.join(workspaceRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    return null;
  }
}

function packageHasDependency(manifest, name) {
  if (!manifest) {
    return false;
  }
  return Boolean(manifest.dependencies?.[name] || manifest.devDependencies?.[name]);
}

function commandAvailable(command, args = ['--version']) {
  const result = run(command, args, { timeout: 8000 });
  return {
    available: result.status === 0 && !result.error,
    result,
  };
}

function shellHasCrLf(relativePath) {
  const fullPath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return false;
  }
  return fs.readFileSync(fullPath).includes(Buffer.from('\r\n'));
}

function checkShellSyntax(relativePath) {
  if (!fileExists(relativePath)) {
    return check(`shell:${relativePath}`, 'failed', 'missing shell wrapper');
  }
  if (shellHasCrLf(relativePath)) {
    return check(`shell:${relativePath}`, 'failed', 'CRLF line endings are not allowed for bash wrappers');
  }
  const result = run('bash', ['-n', relativePath]);
  if (spawnBlocked(result)) {
    return check(`shell:${relativePath}`, 'warning', result.error || result.stderr || 'bash spawn blocked by host policy');
  }
  return result.status === 0
    ? check(`shell:${relativePath}`, 'passed', 'bash syntax ok')
    : check(`shell:${relativePath}`, 'failed', result.stderr || result.error || 'bash syntax failed');
}

function selectStringAvailable() {
  if (process.platform !== 'win32') {
    return { available: false, detail: 'not windows' };
  }
  if (process.env.PSModulePath || fs.existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')) {
    return { available: true, detail: 'PowerShell Select-String is available on Windows' };
  }
  const powershell = resolvePowerShellCommand();
  const result = run(powershell, ['-NoProfile', '-Command', 'Get-Command Select-String | Select-Object -ExpandProperty Name']);
  return {
    available: result.status === 0 && /Select-String/i.test(result.stdout),
    detail: result.stderr || result.error || result.stdout.trim(),
  };
}

function buildReport() {
  const checks = [];
  const manifest = readPackageManifest();

  const codexCommand = resolveCodexCommand();
  checks.push(codexCommand
    ? check('codex.resolve', 'passed', codexCommand)
    : check('codex.resolve', 'warning', 'codex command was not resolved; non-codex runtimes may still work'));

  checks.push(check('node.current', 'passed', process.execPath));

  const npmArgs = npmBaseArgs();
  const npmVersion = run(npmArgs[0], [...npmArgs.slice(1), '--version']);
  if (npmVersion.status === 0) {
    checks.push(check('npm.stablePath', 'passed', npmVersion.stdout.trim() || npmArgs.join(' ')));
  } else if (spawnBlocked(npmVersion) && npmArgs.length > 1 && fs.existsSync(npmArgs[0]) && fs.existsSync(npmArgs[1])) {
    checks.push(check('npm.stablePath', 'warning', 'npm stable path exists, but child process spawn was blocked by host policy', { command: npmVersion.command }));
  } else {
    checks.push(check('npm.stablePath', 'failed', npmVersion.stderr || npmVersion.error || 'npm --version failed', { command: npmVersion.command }));
  }

  checks.push(fileExists('node_modules')
    ? check('node_modules', 'passed', 'node_modules exists')
    : manifest
      ? check('node_modules', 'failed', 'node_modules is missing')
      : check('node_modules', 'warning', 'package.json is absent; Node app dependencies are not required here'));

  const vitestBin = process.platform === 'win32' ? 'node_modules/.bin/vitest.cmd' : 'node_modules/.bin/vitest';
  const nextBin = process.platform === 'win32' ? 'node_modules/.bin/next.cmd' : 'node_modules/.bin/next';
  if (packageHasDependency(manifest, 'vitest')) {
    checks.push(fileExists(vitestBin) ? check('vitest.bin', 'passed', vitestBin) : check('vitest.bin', 'failed', `${vitestBin} missing`));
  } else {
    checks.push(check('vitest.bin', 'warning', 'vitest is not declared by this workspace'));
  }
  if (packageHasDependency(manifest, 'next')) {
    checks.push(fileExists(nextBin) ? check('next.bin', 'passed', nextBin) : check('next.bin', 'failed', `${nextBin} missing`));
  } else {
    checks.push(check('next.bin', 'warning', 'next is not declared by this workspace'));
  }

  for (const relativePath of [
    '.claude/scripts/knowledge-repo-audit.sh',
    '.claude/scripts/verify-code-policy.sh',
    '.claude/scripts/workflow-enforcement.sh',
    '.claude/scripts/agent-loop.sh',
    '.claude/scripts/moonshot-phase-dispatch.sh',
  ]) {
    checks.push(checkShellSyntax(relativePath));
  }

  const rg = commandAvailable('rg', ['--version']);
  if (rg.available) {
    checks.push(check('search.rg', 'passed', rg.result.stdout.split(/\r?\n/)[0] || 'rg available'));
  } else {
    const fallback = selectStringAvailable();
    checks.push(fallback.available
      ? check('search.rg', 'passed_with_equivalent_evidence', 'rg unavailable; Select-String fallback available', {
        preferred: 'rg',
        fallback: 'Select-String',
        rgError: rg.result.stderr || rg.result.error,
      })
      : check('search.rg', 'failed', rg.result.stderr || rg.result.error || fallback.detail || 'rg unavailable and no fallback found'));
  }

  const failed = checks.filter((entry) => entry.status === 'failed');
  const warnings = checks.filter((entry) => entry.status === 'warning' || entry.status === 'passed_with_equivalent_evidence');
  return {
    schemaVersion: '1',
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platform: process.platform,
    workspaceRoot,
    status: failed.length > 0 ? 'failed' : warnings.length > 0 ? 'passed_with_equivalent_evidence' : 'passed',
    checks,
  };
}

function writeArtifact(report) {
  const outputDir = path.join(workspaceRoot, '.claude', 'logs', 'agent-loop');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `capabilities-${stamp}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

function main() {
  const json = process.argv.includes('--json');
  const report = buildReport();
  const artifactPath = writeArtifact(report);
  const output = { ...report, artifactPath };
  if (json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(`phase capability preflight: ${report.status}\nartifact: ${artifactPath}\n`);
    for (const entry of report.checks) {
      process.stdout.write(`- ${entry.name}: ${entry.status} (${entry.detail})\n`);
    }
  }
  process.exit(report.checks.some((entry) => entry.status === 'failed') ? 1 : 0);
}

main();
