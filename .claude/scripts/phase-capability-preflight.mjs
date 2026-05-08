#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { npmBaseArgs, resolveCodexCommand, resolvePowerShellCommand } from './runtime-cli.mjs';
import { resolveCommandEvidence, resolveDockerDependencyGate } from './lib/command-resolver.mjs';
import { classifyFailure } from './lib/failure-classifier.mjs';
import {
  hasUnavailableCapability,
  knownUnavailableSummary,
  recordUnavailableCapability,
} from './lib/runtime-unavailable-cache.mjs';
import {
  buildFailureClassCounts,
  classifyCapabilityCheck,
  summarizeFailureDecision,
} from './lib/failure-classifier.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.cwd();
const phaseStatusFile = path.join(workspaceRoot, '.claude', 'docs', 'phase-status.yaml');
const strictMemoryGateEnabled = String(process.env.PHASE_STRICT_MEMORY_GATE ?? process.env.MEMORYGRAPH_STRICT_MODE ?? 'false').toLowerCase() === 'true';
const unavailableCapabilityCodes = new Set([
  'bash_access_denied',
  'memorygraph_unavailable',
  'git_index_denied',
  'node_spawn_eperm',
  'plugin_network_sync_failed',
  'path_update_denied',
  'mcp_cleanup_eperm',
  'spawn_blocked',
]);
const memorygraphFingerprint = classifyFailure({ code: 'memorygraph_unavailable', source: 'memorygraph.health' }).fingerprint;

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

function combinedProbeText(result = {}) {
  return [result.error, result.stderr, result.stdout]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' | ');
}

function isPermissionDeniedText(text = '') {
  return /EPERM|EACCES|access is denied|permission denied|read only|readonly|unable to create process/i.test(text);
}

function resolveFailureClassFromText(text, defaultCode, accessDeniedCode = defaultCode) {
  if (isPermissionDeniedText(text)) {
    return accessDeniedCode;
  }
  if (/spawn blocked|unable to create process/i.test(text)) {
    return 'spawn_blocked';
  }
  return defaultCode;
}

function resultToCheck(name, result, successDetail, failureClass, decision = 'resume_later_handoff', fallbackHint = '') {
  if (result.status === 0) {
    return check(name, 'passed', successDetail, {
      command: result.command,
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    });
  }

  const text = combinedProbeText(result);
  const resolvedFailureClass = resolveFailureClassFromText(text, failureClass, failureClass);
  return check(name, /spawn blocked|unable to create process/i.test(text) ? 'warning' : 'failed', text || successDetail, {
    command: result.command,
    failureClass: resolvedFailureClass,
    decision,
    fallbackHint,
  });
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeProbeFile(filePath, contents = 'probe\n') {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf8');
}

function probeWritablePath(name, directoryPath, relativeFileName, successDetail, failureClass, fallbackHint = '') {
  const filePath = path.join(directoryPath, relativeFileName);
  try {
    writeProbeFile(filePath);
    fs.unlinkSync(filePath);
    return check(name, 'passed', successDetail, {
      command: filePath,
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    });
  } catch (error) {
    const text = String(error?.message || error || '');
    return check(name, 'failed', text || successDetail, {
      command: filePath,
      failureClass: resolveFailureClassFromText(text, failureClass, failureClass),
      decision: 'resume_later_handoff',
      fallbackHint,
    });
  }
}

function probeWritableExistingFile(name, filePath, successDetail, failureClass, fallbackHint = '', missingDetail = 'path missing; writable probe skipped') {
  if (!fs.existsSync(filePath)) {
    return check(name, 'passed', missingDetail, {
      command: filePath,
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    });
  }

  try {
    const fd = fs.openSync(filePath, 'r+');
    fs.closeSync(fd);
    return check(name, 'passed', successDetail, {
      command: filePath,
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    });
  } catch (error) {
    const text = String(error?.message || error || '');
    return check(name, 'failed', text || successDetail, {
      command: filePath,
      failureClass: resolveFailureClassFromText(text, failureClass, failureClass),
      decision: 'resume_later_handoff',
      fallbackHint,
    });
  }
}

function runChildProbe(name, command, args, successDetail, failureClass, fallbackHint = '') {
  const result = run(command, args);
  return resultToCheck(name, result, successDetail, failureClass, 'resume_later_handoff', fallbackHint);
}

function gitIndexWriteCheck() {
  const result = run('git', ['update-index', '-q', '--refresh']);
  if (result.status === 0) {
    return check('git.index', 'passed', 'git index refresh succeeded', {
      command: result.command,
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    });
  }

  const text = combinedProbeText(result) || 'git index refresh failed';
  const failureClass = /command not found|not recognized/i.test(text)
    ? 'command_not_found'
    : resolveFailureClassFromText(text, 'git_index_denied', 'git_index_denied');
  return check('git.index', 'failed', text, {
    command: result.command,
    failureClass,
    decision: failureClass === 'command_not_found' ? 'host_fallback' : 'resume_later_handoff',
    fallbackHint: failureClass === 'command_not_found'
      ? 'resolve-command-path-or-fallback-runtime'
      : 'repair-git-index-permissions-or-fallback-runtime',
  });
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

function workspaceRequiresPytest(manifest) {
  return packageHasDependency(manifest, 'pytest')
    || fileExists('pytest.ini')
    || fileExists('pyproject.toml')
    || fileExists('tox.ini')
    || fileExists('setup.cfg');
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
  const targetName = String(name || '').toLowerCase();
  const probe = checks.find((entry) => String(entry.name || '').toLowerCase() === targetName) || null;
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
    failureClass: probe.failureClass ?? (probe.code === 'ok' ? '' : 'unknown_failure'),
    decision: probe.decision || 'continue',
    fallbackHint: probe.fallbackHint || '',
    fingerprint: probe.fingerprint || '',
  };
}

function buildCapabilities(checks) {
  return {
    codex: buildCapabilitySummary(checks, 'codex.resolve'),
    codexHome: buildCapabilitySummary(checks, 'codex.home'),
    codexSessionStorage: buildCapabilitySummary(checks, 'codex.sessionStorage'),
    codexStateDb: buildCapabilitySummary(checks, 'codex.stateDb'),
    node: buildCapabilitySummary(checks, 'node.current'),
    nodeSpawn: buildCapabilitySummary(checks, 'node.spawn'),
    npm: buildCapabilitySummary(checks, 'npm.stablePath'),
    pnpm: buildCapabilitySummary(checks, 'pnpm.version'),
    corepack: buildCapabilitySummary(checks, 'corepack.version'),
    python: buildCapabilitySummary(checks, 'python.version'),
    pytest: buildCapabilitySummary(checks, 'pytest.version'),
    bash: buildCapabilitySummary(checks, 'bash.version'),
    bashSmoke: buildCapabilitySummary(checks, 'bash.smoke'),
    git: buildCapabilitySummary(checks, 'git.version'),
    gitIndex: buildCapabilitySummary(checks, 'git.index'),
    rgPath: buildCapabilitySummary(checks, 'search.rg'),
    docker: buildCapabilitySummary(checks, 'docker.version'),
    nodeModules: buildCapabilitySummary(checks, 'node_modules'),
    vitest: buildCapabilitySummary(checks, 'vitest.bin'),
    next: buildCapabilitySummary(checks, 'next.bin'),
    shellSnapshot: buildCapabilitySummary(checks, 'shell.snapshot'),
    verifierRuntime: buildCapabilitySummary(checks, 'verifier.runtime'),
    memorygraph: buildCapabilitySummary(checks, 'memorygraph.health'),
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
  const preflightRoot = path.join(workspaceRoot, '.claude', 'cache', 'preflight');
  const codexHomeDir = path.join(preflightRoot, 'codex-home');
  const codexSessionDir = path.join(preflightRoot, 'codex-home', '.codex', 'sessions');
  const shellSnapshotDir = path.join(preflightRoot, 'shell-snapshot');
  const stateDbPath = path.join(workspaceRoot, '.claude', 'runtime-state.sqlite');
  const memorygraphProbeCommand = [process.execPath, path.join(scriptDir, 'memorygraph-direct.mjs'), 'health'];
  const memorygraphCacheQuery = {
    code: 'memorygraph_unavailable',
    fingerprint: memorygraphFingerprint,
    source: 'memorygraph.health',
    strict: strictMemoryGateEnabled ? 'true' : 'false',
  };

  checks.push(resolveCodexCommand()
    ? check('codex.resolve', 'passed', resolveCodexCommand())
    : check('codex.resolve', 'warning', 'codex command was not resolved; non-codex runtimes may still work'));
  checks.push(check('node.current', 'passed', process.execPath, { command: process.execPath }));
  checks.push(runChildProbe('node.spawn', process.execPath, ['-e', 'process.exit(0)'], 'node child spawn succeeded', 'node_spawn_eperm', 'restore-node-child-spawn-permissions-or-fallback-runtime'));
  checks.push(runChildProbe('bash.smoke', 'bash', ['-lc', 'exit 0'], 'bash smoke succeeded', 'bash_access_denied', 'restore-bash-access-or-fallback-runtime'));
  checks.push(runChildProbe('verifier.runtime', process.execPath, ['--version'], 'node verifier runtime available', 'verifier_unavailable', 'restore-node-verifier-runtime-or-defer-verification'));

  checks.push(probeWritablePath('codex.home', codexHomeDir, 'home-probe.tmp', 'codex home writable', 'codex_home_readonly', 'make-codex-home-writable-or-fallback-runtime'));
  checks.push(gitIndexWriteCheck());

  checks.push(probeWritablePath('codex.sessionStorage', codexSessionDir, 'session-probe.tmp', 'codex session storage writable', 'codex_session_storage_readonly', 'repair-codex-session-storage-permissions-or-fallback-runtime'));
  checks.push(probeWritableExistingFile('codex.stateDb', stateDbPath, 'codex state DB opened for write access', 'codex_state_db_readonly', 'repair-codex-state-db-permissions-or-fallback-runtime', 'state DB not present; writable probe skipped'));
  checks.push(probeWritablePath('shell.snapshot', shellSnapshotDir, 'snapshot-probe.tmp', 'shell snapshot directory writable', 'shell_snapshot_failure', 'repair-shell-snapshot-path-or-fallback-runtime'));
  if (hasUnavailableCapability(phaseStatusFile, memorygraphCacheQuery) && !strictMemoryGateEnabled) {
    checks.push(check(
      'memorygraph.health',
      'warning',
      `cached unavailable capability: ${knownUnavailableSummary(phaseStatusFile, { code: 'memorygraph_unavailable' }) || 'memorygraph_unavailable'}`,
      {
        command: memorygraphProbeCommand.join(' '),
        failureClass: 'memorygraph_unavailable',
        decision: 'continue',
        fallbackHint: '',
        fingerprint: memorygraphFingerprint,
        cached: true,
      },
    ));
  } else {
    checks.push(runChildProbe('memorygraph.health', memorygraphProbeCommand[0], memorygraphProbeCommand.slice(1), 'MemoryGraph health probe succeeded', 'memorygraph_unavailable', 'install-or-repair-memorygraph-or-defer-memory-backed-verification'));
  }

  checks.push(commandCheck('corepack.version', resolveCommandEvidence('corepack')));
  checks.push(commandCheck('pnpm.version', resolveCommandEvidence('pnpm')));
  checks.push(commandCheck('python.version', resolveCommandEvidence('python')));
  const pytestEvidence = resolveCommandEvidence('pytest');
  checks.push(workspaceRequiresPytest(manifest)
    ? commandCheck('pytest.version', pytestEvidence)
    : check('pytest.version', pytestEvidence.status === 'failed' ? 'warning' : pytestEvidence.status, pytestEvidence.detail || 'pytest not required by this workspace', {
      command: pytestEvidence.invocation?.join(' ') || pytestEvidence.commandName || 'pytest',
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    }));
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
    dockerGate.staticConfig.status === 'skipped' && dockerGate.daemon.status !== 'passed'
      ? 'warning'
      : dockerGate.daemon.status === 'passed' ? 'passed' : 'failed',
    dockerGate.daemon.detail || 'docker daemon probe unavailable',
    {
      command: dockerGate.daemon.command,
      failureClass: dockerGate.staticConfig.status === 'skipped' && dockerGate.daemon.status !== 'passed'
        ? ''
        : dockerGate.daemon.failureCode || 'docker_daemon_unavailable',
      decision: dockerGate.staticConfig.status === 'skipped' && dockerGate.daemon.status !== 'passed'
        ? 'continue'
        : dockerGate.daemon.decision || 'resume_later_handoff',
      fallbackHint: dockerGate.staticConfig.status === 'skipped' && dockerGate.daemon.status !== 'passed'
        ? ''
        : dockerGate.fallbackReason || dockerGate.daemon.detail || '',
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

  const rg = run('rg', ['--version']);
  if (rg.status === 0) {
    checks.push(check('search.rg', 'passed', rg.stdout.trim() || 'rg available', {
      command: rg.command,
      failureClass: '',
      decision: 'continue',
      fallbackHint: '',
    }));
  } else {
    const rgDetail = combinedProbeText(rg);
    const rgFailureClass = resolveFailureClassFromText(rgDetail, 'command_not_found', 'rg_access_denied');
    const fallback = selectStringAvailable();
    checks.push(fallback.available
      ? check('search.rg', 'passed_with_equivalent_evidence', `rg unavailable; Select-String fallback available (${rgFailureClass})`, {
        command: rg.command,
        preferred: 'rg',
        fallback: 'Select-String',
        failureClass: rgFailureClass,
        decision: 'continue',
        fallbackHint: 'use-host-search-or-fallback-runtime',
        rgError: rgDetail || 'rg unavailable',
      })
      : check('search.rg', 'failed', rgDetail || fallback.detail || 'rg unavailable and no fallback found', {
        command: rg.command,
        failureClass: rgFailureClass,
        decision: rgFailureClass === 'rg_access_denied' ? 'resume_later_handoff' : 'host_fallback',
        fallbackHint: 'use-host-search-or-fallback-runtime',
      }));
  }

  const fixtureBlocker = String(process.env.PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER || '').trim();
  if (fixtureBlocker) {
    checks.push(check('fixture.forcedBlocker', 'failed', `forced fixture blocker: ${fixtureBlocker}`, {
      command: 'PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER',
      failureClass: fixtureBlocker,
      decision: 'resume_later_handoff',
      fallbackHint: 'fixture-only',
    }));
  }

  const classifiedChecks = checks.map(classifyCapabilityCheck).map((entry) => {
    if (!strictMemoryGateEnabled && entry.code === 'memorygraph_unavailable') {
      return {
        ...entry,
        blocker: false,
        decision: 'continue',
        retryPolicy: 'retryable',
      };
    }
    return entry;
  });
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
  const activeSummary = blockers.length === 0
    ? {
      sameFailureClassCount: 0,
      blockerFingerprint: '',
    }
    : summary;
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
    sameFailureClassCount: activeSummary.sameFailureClassCount,
    blockerFingerprint: activeSummary.blockerFingerprint,
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

function recordUnavailableCapabilityEvidence(report, artifactPath) {
  const entries = Array.isArray(report?.checks) ? report.checks : [];
  for (const checkEntry of entries) {
    const classified = classifyCapabilityCheck(checkEntry);
    if (!unavailableCapabilityCodes.has(classified.code)) {
      continue;
    }
    if (classified.status === 'passed') {
      continue;
    }
    recordUnavailableCapability(phaseStatusFile, {
      code: classified.code,
      fingerprint: classified.fingerprint,
      source: classified.name || checkEntry.name || classified.code,
      evidencePath: artifactPath,
      strict: strictMemoryGateEnabled ? 'true' : 'false',
    });
  }
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
  if (process.argv.includes('self-test')) {
    const originalFixture = process.env.PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER;
    process.env.PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER = 'bash_access_denied';
    try {
      const report = buildReport();
      const blocker = report.currentBlockers.find((entry) => entry.code === 'bash_access_denied');
      if (!blocker) {
        throw new Error('forced bash_access_denied blocker was not reported');
      }
      if (report.decision === 'continue' || report.status !== 'failed') {
        throw new Error(`forced blocker did not fail preflight: status=${report.status} decision=${report.decision}`);
      }
      process.stdout.write('phase-capability-preflight self-test passed\n');
      return;
    } finally {
      if (originalFixture === undefined) {
        delete process.env.PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER;
      } else {
        process.env.PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BLOCKER = originalFixture;
      }
    }
  }

  const json = process.argv.includes('--json');
  const report = buildReport();
  const artifactPath = writeArtifact(report);
  recordUnavailableCapabilityEvidence(report, artifactPath);
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
