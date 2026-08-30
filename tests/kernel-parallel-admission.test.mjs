// Host parallel admission is derived from existing run/Step facts. This file
// records the derived parallel-admission contract.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveParallelAdmission, hostSupportsParallel } from '../scripts/host/kernel/parallel-dispatcher.mjs';

const capabilities = {
  supportsConcurrentSessions: true,
  supportsIsolatedWorkingDirectory: true,
  supportsPerSessionEnvironment: true,
};

const step = (stepId, allowedPaths) => ({
  stepId,
  sequence: Number(stepId.slice(-1)),
  allowedPaths,
  obligationIds: ['unit-test'],
});

test('parallel admission has no durable group identity', () => {
  const admission = deriveParallelAdmission({
    run: { status: 'active', proofTier: 'T2', taskContract: { requiredVerifications: [{ commandRef: 'test:integration' }] } },
    steps: [step('a1', ['src/a/**']), step('b2', ['src/b/**'])],
    commands: [{ commandRef: 'test:integration' }],
    hostCapabilities: capabilities,
    git: { ready: true },
  });
  assert.equal(admission.admitted, true);
  assert.equal(admission.workerLimit, 2);
  assert.equal(Object.hasOwn(admission, 'waveId'), false);
  assert.equal(Object.hasOwn(admission, 'batchId'), false);
});

test('host capability or write-scope failures fail closed', () => {
  const blocked = deriveParallelAdmission({
    run: { status: 'active', proofTier: 'T2', taskContract: { requiredVerifications: [{ commandRef: 'test:integration' }] } },
    steps: [step('a1', ['src/**']), step('b2', ['src/b/**'])],
    commands: [{ commandRef: 'test:integration' }],
    hostCapabilities: { ...capabilities, supportsConcurrentSessions: false },
    git: { ready: true },
  });
  assert.equal(blocked.admitted, false);
  assert.equal(blocked.reasons.includes('write-scope-overlap'), true);
  assert.equal(blocked.reasons.includes('host-supportsConcurrentSessions-unsupported'), true);
  assert.equal(hostSupportsParallel(capabilities), true);
});
