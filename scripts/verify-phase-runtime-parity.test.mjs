import assert from 'node:assert/strict';
import test from 'node:test';

import {
  argvIncludesRequiredRuntime,
  envRequiresRuntime,
  resolveWrapperTimeoutMs,
} from './verify-phase-runtime-parity.mjs';

test('runtime parity wrapper uses short optional budget unless required runtime is explicit', () => {
  assert.equal(resolveWrapperTimeoutMs({ env: {}, args: [] }), 240_000);
  assert.equal(
    resolveWrapperTimeoutMs({ env: { PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS: '30' }, args: [] }),
    90_000,
  );
  assert.equal(
    resolveWrapperTimeoutMs({
      env: { PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS: '30' },
      args: ['--runtime-profile', 'required_runtime'],
    }),
    300_000,
  );
});

test('runtime parity wrapper honors explicit timeout and required runtime signals', () => {
  assert.equal(
    resolveWrapperTimeoutMs({ env: { PHASE_RUNTIME_PARITY_WRAPPER_TIMEOUT_SECONDS: '7' }, args: [] }),
    7_000,
  );
  assert.equal(resolveWrapperTimeoutMs({ env: { PHASE_RUNTIME_PARITY_REQUIRED: 'true' }, args: [] }), 1_440_000);
  assert.equal(resolveWrapperTimeoutMs({ env: { PHASE_RUNTIME_PROFILE: 'required_runtime' }, args: [] }), 1_440_000);
  assert.equal(resolveWrapperTimeoutMs({ env: {}, args: ['--runtime-profile=required_runtime'] }), 1_440_000);
});

test('required runtime detection accepts env and CLI forms only', () => {
  assert.equal(envRequiresRuntime({ PHASE_RUNTIME_PARITY_REQUIRED: 'true' }), true);
  assert.equal(envRequiresRuntime({ PHASE_RUNTIME_PROFILE: 'required_runtime' }), true);
  assert.equal(envRequiresRuntime({ PHASE_RUNTIME_PROFILE: 'optional_probe' }), false);
  assert.equal(argvIncludesRequiredRuntime(['--runtime-profile', 'required_runtime']), true);
  assert.equal(argvIncludesRequiredRuntime(['--runtime-profile=required_runtime']), true);
  assert.equal(argvIncludesRequiredRuntime(['--runtime-profile', 'optional_probe']), false);
});
