import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRuntimeParity,
  normalizeCodexProbeText,
} from './runtime-parity-classifier.mjs';

test('codex refresh-token failure is classified as login_required', () => {
  const normalized = normalizeCodexProbeText({
    stderr: [
      'Failed to refresh token: Your access token could not be refreshed because your refresh token was already used.',
      'Please log out and sign in again.',
    ].join('\n'),
    exitCode: 1,
  });

  assert.equal(normalized.failureCode, 'login_required');

  const required = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'required_runtime',
    available: false,
    failureCode: normalized.failureCode,
  });
  assert.equal(required.status, 'blocked');
  assert.equal(required.reason, 'auth_unavailable');
  assert.equal(required.blocks, true);

  const optional = classifyRuntimeParity({
    runtime: 'codex',
    runtimeProfile: 'optional_probe',
    available: false,
    failureCode: normalized.failureCode,
  });
  assert.equal(optional.status, 'skipped');
  assert.equal(optional.reason, 'auth_unavailable');
  assert.equal(optional.blocks, false);
});
