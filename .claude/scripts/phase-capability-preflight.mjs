#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { npmBaseArgs, resolveCodexCommand, resolvePowerShellCommand } from './runtime-cli.mjs';
import { resolveCommandEvidence, resolveDockerDependencyGate } from './lib/command-resolver.mjs';
import {
  buildFailureClassCounts,
  classifyCapabilityCheck,
  summarizeFailureDecision,
} from './lib/failure-classifier.mjs';

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

function readRecentCapabilityReports(limit = 12, recentWindowMs = 24 * 60 * 60 * 1000) {
  const logDir = path.join(workspaceRoot, '.claude', 'logs', 'agent-loop');
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^capabilities-.*\.json$/.test(entry.name))
    .map((entry) => {
      const filePath = path.join(logDir, entry.name);
      const stats = fs.statSync(filePath);
      return { filePath, mtimeMs: stats.mtimeMs };
    })
    .filter((entry) => Date.now() - entry.mtimeMs <= recentWindowMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .flatMap((entry) => {
      try {
        const payload = JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
        return [{ ...entry, payload }];
      } catch {
        return [];
      }
    });
}

function buildCapabilitySummary(checks, name) {
  const probe = checks.find((entry) => entry.name === name) || null;
  if (!probe) {
    return {
      available: false,
      status: 'missing',
      detail: 'probe missing',
      failureClass: 'unknown_failure',
      decision: 'continue',
      fallbackHint: '',
      fingerprint: '',
    };
  }

  return {
    available: probe.status === 'passed' || probe.status === 'passed_with_equivalent_evidence',
    status: probe.status,
    detail: probe.detail,
    command: probe.command || '',
    failureClass: probe.failureClass || 'unknown_failure',
    decision: probe.decision || 'continue',
    fallbackHint: probe.fallbackHint || '',
    fingerprint: probe.fingerprint || '',
  };
}

function buildCapabilities(checks) {
  return {
    codex: buildCapabilitySummary(checks, 'codex.resolve'),
    node: buildCapabilitySummary(checks, 'node.current'),
    npm: buildCapabilitySummary(checks, 'npm.stablePath'),
    pnpm: buildCapabilitySummary(checks, 'pnpm.version'),
    corepack: buildCapabilitySummary(checks, 'corepack.version'),
    python: buildCapabilitySummary(checks, 'python.version'),
    pytest: buildCapabilitySummary(checks, 'pytest.version'),
    bash: buildCapabilitySummary(checks, 'bash.version'),
    git: buildCapabilitySummary(checks, 'git.version'),
    docker: buildCapabilitySummary(checks, 'docker.version'),
    nodeModules: buildCapabilitySummary(checks, 'node_modules'),
    vitest: buildCapabilitySummary(checks, 'vitest.bin'),
    next: buildCapabilitySummary(checks, 'next.bin'),
    shellSyntax: checks
      .filter((entry) => entry.name.startsWith('shell:'))
      .map((entry) => buildCapabilitySummary(checks, entry.name)),
  };
}

function collectFailureEvidence(checks) {
  return checks
    .map(classifyCapabilityCheck)
    .filter((entry) => entry.blocker || entry.code !== 'ok');
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
  return target;
}

function commandCheck(name, evidence, fallbackDetail = '') {
  if (!evidence) {
    return check(name, 'failed', fallbackDetail || 'resolver returned no evidence');
  }
  if (evidence.status === 'passed' || evidence.status === 'passed_with_equivalent_evidence') {
    return check(name, evidence.status, evidence.detail || `${evidence.evidenceCommand || evidence.resolvedCommand || evidence.commandName} available`, {
      command: evidence.invocation?.join(' ') || evidence.evidenceCommand || evidence.resolvedCommand || evidence.commandName,
      failureClass: evidence.failureCode || '',
      decision: evidence.decision || 'continue',
      fallbackHint: evidence.fallbackReason || '',
    });
  }
  return check(name, 'failed', evidence.detail || fallbackDetail || `${evidence.commandName || name} unavailable`, {
    command: evidence.invocation?.join(' ') || evidence.commandName || name,
    failureClass: evidence.failureCode || 'command_not_found',
    decision: evidence.decision || 'resume_later_handoff',
    fallbackHint: evidence.fallbackReason || '',
  });
}

function buildReport() {
  const manifest = readPackageManifest();
  const npmArgs = npmBaseArgs();
  const checks = [];
  const dockerGate = resolveDockerDependencyGate({ workspaceRoot });

  checks.push(resolveCodexCommand()
    ? check('codex.resolve', 'passed', resolveCodexCommand())
    : check('codex.resolve', 'warning', 'codex command was not resolved; non-codex runtimes may still work'));
  checks.push(check('node.current', 'passed', process.execPath, { command: process.execPath }));
  checks.push(commandCheck('corepack.version', resolveCommandEvidence('corepack')));
  checks.push(commandCheck('pnpm.version', resolveCommandEvidence('pnpm')));
  checks.push(commandCheck('python.version', resolveCommandEvidence('python')));
  checks.push(commandCheck('pytest.version', resolveCommandEvidence('pytest')));
  checks.push(commandCheck('bash.version', resolveCommandEvidence('bash')));
  checks.push(commandCheck('git.version', resolveCommandEvidence('git')));
  checks.push(commandCheck('docker.version', dockerGate.version));
  checks.push(check(
    'docker.compose.config',
    dockerGate.staticConfig.status === 'passed' ? 'passed' : dockerGate.staticConfig.status === 'failed' ? 'failed' : 'warning',
    dockerGate.staticConfig.detail || 'docker compose config not evaluated',
    {
      command: dockerGate.staticConfig.command,
      failureClass: dockerGate.staticConfig.failureCode || '',
      decision: dockerGate.staticConfig.decision || 'continue',
      fallbackHint: dockerGate.staticConfig.detail || '',
    },
  ));
  checks.push(check(
    'docker.info',
    dockerGate.daemon.status === 'passed' ? 'passed' : 'failed',
    dockerGate.daemon.detail || 'docker daemon probe unavailable',
    {
      command: dockerGate.daemon.command,
      failureClass: dockerGate.daemon.failureCode || 'docker_daemon_unavailable',
      decision: dockerGate.daemon.decision || 'resume_later_handoff',
      fallbackHint: dockerGate.fallbackReason || dockerGate.daemon.detail || '',
    },
  ));

  const npmVersion = run(npmArgs[0], [...npmArgs.slice(1), '--version']);
  if (npmVersion.status === 0) {
    checks.push(check('npm.stablePath', 'passed', npmVersion.stdout.trim() || npmArgs.join(' '), { command: npmVersion.command }));
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

  const rg = resolveCommandEvidence('rg');
  if (rg.status === 'passed' || rg.status === 'passed_with_equivalent_evidence') {
    checks.push(check('search.rg', rg.status, rg.detail || rg.resolvedCommand || 'rg available', {
      command: rg.invocation?.join(' ') || 'rg --version',
      failureClass: rg.failureCode || '',
      decision: rg.decision || 'continue',
      fallbackHint: rg.fallbackReason || '',
    }));
  } else {
    const fallback = selectStringAvailable();
    checks.push(fallback.available
      ? check('search.rg', 'passed_with_equivalent_evidence', 'rg unavailable; Select-String fallback available', {
        preferred: 'rg',
        fallback: 'Select-String',
        rgError: rg.detail || rg.failureCode || 'rg unavailable',
      })
      : check('search.rg', 'failed', rg.detail || fallback.detail || 'rg unavailable and no fallback found', {
        failureClass: rg.failureCode || 'command_not_found',
        decision: rg.decision || 'host_fallback',
        fallbackHint: rg.fallbackReason || '',
      }));
  }

  const classifiedChecks = checks.map(classifyCapabilityCheck);
  const currentFailureCounts = buildFailureClassCounts(classifiedChecks.filter((entry) => entry.blocker));
  const historicalCounts = {};
  for (const report of readRecentCapabilityReports()) {
    const reportChecks = Array.isArray(report.payload?.checks) ? report.payload.checks : [];
    mergeCounts(historicalCounts, buildFailureClassCounts(reportChecks.map(classifyCapabilityCheck).filter((entry) => entry.blocker)));
  }
  const failureClassCounts = mergeCounts({ ...historicalCounts }, currentFailureCounts);
  const summary = summarizeFailureDecision(failureClassCounts);
  const blockers = classifiedChecks.filter((entry) => entry.blocker);
  const warnings = classifiedChecks.filter((entry) => entry.status === 'warning' || entry.status === 'passed_with_equivalent_evidence');
  const decision = blockers.length === 0
    ? 'continue'
    : summary.decision;
  const reason = blockers.length === 0
    ? 'ok'
    : summary.reason;
  const currentBlockers = blockers.map((entry) => ({
    name: entry.name,
    code: entry.code,
    category: entry.category,
    decision: entry.decision,
    fallbackHint: entry.fallbackHint,
    fingerprint: entry.fingerprint,
    detail: entry.detail,
  }));

  return {
    schemaVersion: '2',
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platform: process.platform,
    workspaceRoot,
    status: blockers.length > 0 ? 'failed' : warnings.length > 0 ? 'passed_with_equivalent_evidence' : 'passed',
    decision,
    reason,
    sameFailureClassCount: summary.sameFailureClassCount,
    blockerFingerprint: summary.blockerFingerprint,
    fallbackHints: currentBlockers.map((entry) => entry.fallbackHint).filter(Boolean),
    currentBlockers,
    failureClassCounts,
    dependencyGates: {
      docker: dockerGate,
    },
    capabilities: buildCapabilities(classifiedChecks),
    checks: classifiedChecks,
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
