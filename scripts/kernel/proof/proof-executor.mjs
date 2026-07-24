import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveNetworkExecution } from './network-policy.mjs';

const COMMAND_REF_REGEX = /^[A-Za-z0-9:._-]+$/;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_BUFFER = 32 * 1024 * 1024;
const ERROR_SUMMARY_LIMIT = 2000;

// Child processes get an explicit allowlist, never the full parent
// environment, so ambient secrets are not handed to project scripts.
const ENV_ALLOWLIST = [
  'PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC',
  'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'ProgramFiles', 'ProgramData', 'SHELL', 'LANG', 'LC_ALL', 'TZ',
];

export class UntrustedCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UntrustedCommandError';
    this.code = 'UNTRUSTED_COMMAND';
  }
}

export class CommandApprovalRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommandApprovalRequiredError';
    this.code = 'COMMAND_APPROVAL_REQUIRED';
  }
}

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const redactSecretLikeOutput = (text) => String(text || '')
  .replace(/((?:api[_-]?key|access[_-]?key|secret|token|password|passwd|authorization|bearer)["']?\s*[:=]\s*)(["']?)[^\s"'&]+\2/gi, '$1$2[REDACTED]$2')
  .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');

const buildChildEnv = () => {
  const env = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
};

// P0 trust boundary: only scripts declared in the project's package manifest
// are executable. Arbitrary or discovered commands are rejected here.
export const resolveTrustedCommand = ({ projectRoot = process.cwd(), commandRef } = {}) => {
  if (!commandRef || typeof commandRef !== 'string' || !COMMAND_REF_REGEX.test(commandRef)) {
    throw new UntrustedCommandError(`commandRef must match ${COMMAND_REF_REGEX}: ${commandRef}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch {
    throw new UntrustedCommandError(`No readable package manifest at ${projectRoot}; cannot resolve trusted command`);
  }
  if (!manifest.scripts || typeof manifest.scripts[commandRef] !== 'string') {
    throw new UntrustedCommandError(`Command ref is not a manifest script: ${commandRef}`);
  }
  return {
    kind: 'manifest-script',
    commandRef,
    command: 'npm',
    args: ['run', commandRef],
    resolvedScript: manifest.scripts[commandRef],
  };
};

// Shared runner for any resolved command (trusted manifest script or an
// explicitly approved discovered command). Isolation, digests, and honest
// facts are identical regardless of how the command was authorized.
const runResolvedCommand = ({ projectRoot, command, args, label, trust, timeoutMs, evidenceDir, networkPolicy = 'inherited', env = process.env }) => {
  // Resolve (and, when required, refuse) the network policy BEFORE running, so
  // isolation is never recorded unless it was actually enforced.
  const network = resolveNetworkExecution({ policy: networkPolicy, env });
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30 * 60 * 1000) : DEFAULT_TIMEOUT_MS;
  const startedAt = new Date();
  const spawnOptions = {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: effectiveTimeout,
    maxBuffer: MAX_OUTPUT_BUFFER,
    env: buildChildEnv(),
  };
  // npm is a .cmd shim on Windows and cannot be spawned shell-less there; the
  // command tokens are validated by the caller so no untrusted text reaches
  // the shell.
  const result = process.platform === 'win32'
    ? spawnSync(`${command} ${args.join(' ')}`, { ...spawnOptions, shell: true })
    : spawnSync(command, args, spawnOptions);

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT');
  const spawnFailed = Boolean(result.error && !timedOut);
  const exitCode = typeof result.status === 'number' ? result.status : 1;

  let evidenceRef = null;
  if (evidenceDir) {
    const stamp = `${startedAt.toISOString().replace(/[:.]/g, '-')}-${String(label).replace(/[^A-Za-z0-9_-]/g, '_')}`;
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(path.join(evidenceDir, `${stamp}.stdout.log`), stdout);
    writeFileSync(path.join(evidenceDir, `${stamp}.stderr.log`), stderr);
    evidenceRef = `evidence://proof/${stamp}`;
  }

  const failed = timedOut || spawnFailed || exitCode !== 0;
  const errorSummary = failed
    ? redactSecretLikeOutput(`${result.error ? `${result.error.message}\n` : ''}${stderr.slice(-ERROR_SUMMARY_LIMIT)}${stderr ? '' : stdout.slice(-ERROR_SUMMARY_LIMIT)}`).trim()
    : null;

  return {
    obligationExecutor: 'kernel-runtime',
    trust,
    commandRef: label,
    command,
    args,
    cwd: projectRoot,
    exitCode: timedOut || spawnFailed ? exitCode || 1 : exitCode,
    timedOut,
    status: failed ? 'failed' : 'passed',
    stdoutDigest: sha256(stdout),
    stderrDigest: sha256(stderr),
    outputDigest: sha256(`${stdout}\n--stderr--\n${stderr}`),
    executedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    timeoutMs: effectiveTimeout,
    networkIsolation: network.networkIsolation,
    networkPolicy: network.networkPolicy,
    evidenceRef,
    errorSummary,
  };
};

export const executeTrustedProof = ({ projectRoot = process.cwd(), commandRef, timeoutMs = DEFAULT_TIMEOUT_MS, evidenceDir, networkPolicy = 'inherited', env = process.env } = {}) => {
  const trusted = resolveTrustedCommand({ projectRoot, commandRef });
  return runResolvedCommand({ projectRoot, command: trusted.command, args: trusted.args, label: commandRef, trust: trusted.kind, timeoutMs, evidenceDir, networkPolicy, env });
};

const APPROVED_COMMAND_ALLOWLIST = new Set(['npm', 'npx', 'node', 'pnpm', 'yarn', 'python', 'python3', 'pytest', 'go', 'cargo', 'make', 'bash', 'sh']);

// Discovered / ad-hoc command path (§11.3): a command not registered as a
// manifest script may only run when the caller supplies an explicit approval
// (approvedBy + approvalReceipt). Without it, execution is refused.
export const executeApprovedProof = ({ projectRoot = process.cwd(), command, args = [], approval, label, timeoutMs = DEFAULT_TIMEOUT_MS, evidenceDir, networkPolicy = 'inherited', env = process.env } = {}) => {
  if (!approval || !approval.approvedBy || !approval.approvalReceipt) {
    throw new CommandApprovalRequiredError(`Discovered command "${command}" requires explicit approval (approvedBy + approvalReceipt)`);
  }
  if (typeof command !== 'string' || !APPROVED_COMMAND_ALLOWLIST.has(command)) {
    throw new UntrustedCommandError(`Approved command executable must be one of: ${[...APPROVED_COMMAND_ALLOWLIST].join(', ')}`);
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new UntrustedCommandError('Approved command args must be an array of strings');
  }
  return runResolvedCommand({ projectRoot, command, args, label: label || command, trust: 'approved-discovered', timeoutMs, evidenceDir, networkPolicy, env });
};

// Re-runs a command once at the same workspace state to detect flakiness
// (§17.2): a differing pass/fail across identical runs marks it a candidate.
export const executeWithFlakyRerun = (runner) => {
  const first = runner();
  if (first.status === 'passed') return { ...first, flaky: false, reruns: 0 };
  const second = runner();
  const flaky = second.status !== first.status;
  return { ...second, flaky, reruns: 1, firstStatus: first.status };
};
