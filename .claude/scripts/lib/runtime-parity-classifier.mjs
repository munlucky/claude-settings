import fs from 'node:fs';
import path from 'node:path';

const VALID_RUNTIME_PROFILES = new Set(['optional_probe', 'required_runtime']);
const MASTER_PLAN_PATTERNS = ['00-master-plan-v*.md'];

const PACKAGE_MISSING_CODES = new Set([
  'package_missing',
  'native_package_missing',
  'codex_native_package_missing',
]);

const AUTH_UNAVAILABLE_CODES = new Set([
  'access_unavailable',
  'auth_unavailable',
  'auth_unconfigured',
  'login_required',
]);

const RUNTIME_UNAVAILABLE_CODES = new Set([
  'cli_missing',
  'network_unavailable',
  'probe_no_output',
  'probe_unknown',
  'runtime_unavailable',
  'session_storage_permission_denied',
  'session_storage_unwritable',
  'shell_snapshot_inconsistent',
  'state_db_inconsistent',
]);

const RUNTIME_NAMESPACE_MISMATCH_CODES = new Set([
  'runtime_namespace_mismatch',
  'windows_npm_codex_shim_used_from_wsl',
]);

function normalizeProfile(value) {
  if (!value) {
    return '';
  }
  const profile = String(value).trim();
  return VALID_RUNTIME_PROFILES.has(profile) ? profile : '';
}

export function resolveRuntimeProfile({ cliProfile = '', envProfile = '' } = {}) {
  return normalizeProfile(cliProfile) || normalizeProfile(envProfile) || 'required_runtime';
}

export function classifyRuntimeParity(input = {}) {
  const runtimeProfile = resolveRuntimeProfile({
    cliProfile: input.cliProfile || input.runtimeProfile,
    envProfile: input.envProfile,
  });
  const runtime = input.runtime || 'unknown';
  const available = Boolean(input.available);
  const rawReason = String(input.failureCode || input.reason || '').trim();
  const packageName = String(input.packageName || '');

  if (available) {
    return {
      runtime,
      runtimeProfile,
      status: 'passed',
      severity: 'info',
      reason: 'runtime_available',
      blocks: false,
    };
  }

  let reason = 'runtime_unavailable';
  if (RUNTIME_NAMESPACE_MISMATCH_CODES.has(rawReason)) {
    reason = 'runtime_namespace_mismatch';
  } else if (
    PACKAGE_MISSING_CODES.has(rawReason)
    || packageName === '@openai/codex-linux-x64'
  ) {
    reason = 'package_missing';
  } else if (AUTH_UNAVAILABLE_CODES.has(rawReason)) {
    reason = 'auth_unavailable';
  } else if (RUNTIME_UNAVAILABLE_CODES.has(rawReason)) {
    reason = 'runtime_unavailable';
  }

  if (runtimeProfile === 'optional_probe') {
    return {
      runtime,
      runtimeProfile,
      status: 'skipped',
      severity: 'warning',
      reason,
      blocks: false,
    };
  }

  return {
    runtime,
    runtimeProfile,
    status: 'blocked',
    severity: 'blocker',
    reason,
    blocks: true,
  };
}

export function normalizeCodexProbeText({ stderr = '', stdout = '', exitCode = 1 } = {}) {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  if (
    text.includes('@openai/codex-linux-x64')
    && /(?:file:\/\/)?\/mnt\/[a-z]\//i.test(text)
    && text.includes('/appdata/roaming/npm/node_modules/@openai/codex/')
  ) {
    return {
      failureCode: 'runtime_namespace_mismatch',
      packageName: '@openai/codex-linux-x64',
      exitCode,
    };
  }
  if (text.includes('@openai/codex-linux-x64')) {
    return { failureCode: 'package_missing', packageName: '@openai/codex-linux-x64', exitCode };
  }
  if (text.includes('state db discrepancy')) {
    return { failureCode: 'state_db_inconsistent', exitCode };
  }
  if (text.includes('failed to check rollout age for snapshot') || text.includes('shell_snapshot')) {
    return { failureCode: 'shell_snapshot_inconsistent', exitCode };
  }
  if (text.includes('.codex/sessions') && text.includes('permission denied')) {
    return { failureCode: 'session_storage_permission_denied', exitCode };
  }
  if (text.includes('session storage is not writable')) {
    return { failureCode: 'session_storage_unwritable', exitCode };
  }
  if (text.includes('error sending request for url') || text.includes('network error')) {
    return { failureCode: 'network_unavailable', exitCode };
  }
  if (text.includes('login') && text.includes('codex')) {
    return { failureCode: 'login_required', exitCode };
  }
  return { failureCode: 'probe_unknown', exitCode };
}

export function validateReferencePlanDir({ referencePlanDir = '', allowDefaultFixture = false, defaultReferencePlanDir = '.claude/docs/runtime-parity-reference-plan', cwd = process.cwd() } = {}) {
  const explicit = String(referencePlanDir || '').trim();
  if (!explicit && !allowDefaultFixture) {
    return {
      ok: false,
      code: 'default_fixture_requires_opt_in',
      message: 'Default runtime parity reference fixture requires --allow-default-fixture.',
      referencePlanDir: '',
      searchedPaths: [],
      expectedPatterns: MASTER_PLAN_PATTERNS,
      recommendedCommand: 'bash .claude/scripts/verify-phase-runtime-parity.sh --allow-default-fixture --runtime-profile optional_probe',
    };
  }

  const selected = explicit || defaultReferencePlanDir;
  const resolved = path.resolve(cwd, selected);
  const searchedPaths = [path.join(resolved, '00-master-plan-v1.md')];
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return {
      ok: false,
      code: 'reference_plan_dir_missing',
      message: `Reference plan directory not found: ${selected}`,
      referencePlanDir: selected,
      searchedPaths,
      expectedPatterns: MASTER_PLAN_PATTERNS,
      recommendedCommand: 'Pass a concrete docs/implementation/<plan-package> directory.',
    };
  }

  const hasMaster = fs.existsSync(path.join(resolved, '00-master-plan-v1.md'));
  if (!hasMaster) {
    return {
      ok: false,
      code: 'master_plan_not_found',
      message: 'Master plan not found.',
      referencePlanDir: selected,
      searchedPaths,
      expectedPatterns: MASTER_PLAN_PATTERNS,
      broadParentDirectory: path.basename(resolved) === 'implementation',
      recommendedCommand: 'Pass a concrete docs/implementation/<plan-package> directory.',
    };
  }

  return {
    ok: true,
    code: 'ok',
    message: '',
    referencePlanDir: selected,
    masterPlanPath: path.join(resolved, '00-master-plan-v1.md'),
    searchedPaths,
    expectedPatterns: MASTER_PLAN_PATTERNS,
  };
}
