import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRuntimeParity,
  normalizeCodexProbeText,
  resolveRuntimeProfile,
} from './runtime-parity-classifier.mjs';

test('missing Codex native package is package_missing, not auth failure', () => {
  const result = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'required_runtime',
    available: false,
    failureCode: 'package_missing',
    packageName: '@openai/codex-linux-x64',
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'package_missing');
  assert.equal(result.blocks, true);
});

test('generic Codex runtime unavailable remains separate from auth failure', () => {
  const runtimeResult = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'required_runtime',
    available: false,
    failureCode: 'network_unavailable',
  });
  const authResult = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'required_runtime',
    available: false,
    failureCode: 'login_required',
  });

  assert.equal(runtimeResult.reason, 'runtime_unavailable');
  assert.equal(authResult.reason, 'auth_unavailable');
});

test('optional profile skips unavailable runtime while required profile blocks', () => {
  const optionalResult = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'optional_probe',
    available: false,
    failureCode: 'cli_missing',
  });
  const requiredResult = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'required_runtime',
    available: false,
    failureCode: 'cli_missing',
  });

  assert.equal(optionalResult.status, 'skipped');
  assert.equal(optionalResult.severity, 'warning');
  assert.equal(optionalResult.blocks, false);
  assert.equal(requiredResult.status, 'blocked');
  assert.equal(requiredResult.severity, 'blocker');
  assert.equal(requiredResult.blocks, true);
});

test('CLI runtime profile overrides PHASE_RUNTIME_PROFILE fallback', () => {
  assert.equal(
    resolveRuntimeProfile({ cliProfile: 'optional_probe', envProfile: 'required_runtime' }),
    'optional_probe',
  );
  assert.equal(
    resolveRuntimeProfile({ cliProfile: '', envProfile: 'optional_probe' }),
    'optional_probe',
  );
  assert.equal(resolveRuntimeProfile({}), 'required_runtime');
});

test('shell string normalization is separate from object-input classification', () => {
  const normalized = normalizeCodexProbeText({
    stderr: "Cannot find module '@openai/codex-linux-x64'",
    stdout: '',
    exitCode: 1,
  });
  const result = classifyRuntimeParity({
    runtime: 'codex',
    cliProfile: 'optional_probe',
    available: false,
    ...normalized,
  });

  assert.deepEqual(normalized, {
    failureCode: 'package_missing',
    packageName: '@openai/codex-linux-x64',
    exitCode: 1,
  });
  assert.equal(result.reason, 'package_missing');
  assert.equal(result.status, 'skipped');
});
