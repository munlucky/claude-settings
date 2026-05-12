import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  classifyRuntimeParity,
  normalizeCodexProbeText,
  resolveRuntimeProfile,
  validateReferencePlanDir,
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

test('WSL loading Windows npm Codex shim is a runtime namespace mismatch', () => {
  const normalized = normalizeCodexProbeText({
    stderr: [
      'file:///mnt/c/Users/moon/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js:100',
      'Error: Missing optional dependency @openai/codex-linux-x64.',
    ].join('\n'),
    stdout: '',
    exitCode: 1,
  });
  const result = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'required_runtime',
    available: false,
    ...normalized,
  });

  assert.deepEqual(normalized, {
    failureCode: 'runtime_namespace_mismatch',
    packageName: '@openai/codex-linux-x64',
    exitCode: 1,
  });
  assert.equal(result.reason, 'runtime_namespace_mismatch');
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocks, true);
});

test('default reference fixture requires explicit opt in', () => {
  const result = validateReferencePlanDir({ referencePlanDir: '', allowDefaultFixture: false });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'default_fixture_requires_opt_in');
  assert.match(result.recommendedCommand, /--allow-default-fixture/);
});

test('broad implementation directory does not fallback to default fixture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-parity-ref-'));
  try {
    fs.mkdirSync(path.join(root, 'docs', 'implementation'), { recursive: true });
    const result = validateReferencePlanDir({
      referencePlanDir: 'docs/implementation',
      cwd: root,
      allowDefaultFixture: false,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'master_plan_not_found');
    assert.equal(result.broadParentDirectory, true);
    assert.equal(result.expectedPatterns.includes('00-master-plan-v*.md'), true);
    assert.match(result.searchedPaths[0], /00-master-plan-v1\.md$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('concrete reference plan directory with master plan passes validation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-parity-ref-'));
  try {
    const planDir = path.join(root, 'docs', 'implementation', 'valid-plan');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, '00-master-plan-v1.md'), '# Master\n', 'utf8');
    const result = validateReferencePlanDir({
      referencePlanDir: 'docs/implementation/valid-plan',
      cwd: root,
    });

    assert.equal(result.ok, true);
    assert.match(result.masterPlanPath, /00-master-plan-v1\.md$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
