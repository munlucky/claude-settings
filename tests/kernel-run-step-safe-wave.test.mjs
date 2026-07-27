// K2-10: parallel step execution is not a default. It requires an explicit safe
// wave, disjoint write sets, and an integration verification — and any of those
// missing collapses the wave back to one step at a time.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectExecutableSteps } from '../scripts/kernel/run/run-step-ledger.mjs';

const step = (sequence, allowedPaths, overrides = {}) => ({
  stepId: `step-1-${sequence}`,
  sequence,
  state: 'ready',
  planRevision: 1,
  dependencyIds: [],
  allowedPaths,
  ...overrides,
});

const INTEGRATION = { commandRef: 'test:integration' };

test('K2: sequential is the default even when several steps are runnable', () => {
  const steps = [step(1, ['src/auth/**']), step(2, ['src/billing/**'])];
  const selected = selectExecutableSteps(steps, { planRevision: 1 });
  assert.deepEqual(selected.steps.map((entry) => entry.stepId), ['step-1-1']);
  assert.equal(selected.reason, 'sequential');
});

test('K2: a safe wave needs an integration verification before it may run in parallel', () => {
  const steps = [step(1, ['src/auth/**']), step(2, ['src/billing/**'])];
  const withoutIntegration = selectExecutableSteps(steps, { planRevision: 1, safeWave: true });
  assert.equal(withoutIntegration.steps.length, 1);
  assert.equal(withoutIntegration.reason, 'safe-wave-requires-integration-verification');

  const withIntegration = selectExecutableSteps(steps, { planRevision: 1, safeWave: true, integrationVerification: INTEGRATION });
  assert.deepEqual(withIntegration.steps.map((entry) => entry.stepId), ['step-1-1', 'step-1-2']);
  assert.equal(withIntegration.reason, 'safe-wave');
});

test('K2-10: overlapping write sets block the wave instead of racing', () => {
  const overlapping = [step(1, ['src/auth/**']), step(2, ['src/auth/tokens/**'])];
  const selected = selectExecutableSteps(overlapping, { planRevision: 1, safeWave: true, integrationVerification: INTEGRATION });
  assert.deepEqual(selected.steps.map((entry) => entry.stepId), ['step-1-1']);
  assert.equal(selected.reason, 'safe-wave-write-set-conflict');

  // An unbounded write set is the widest possible conflict.
  const unbounded = [step(1, []), step(2, ['src/billing/**'])];
  const collapsed = selectExecutableSteps(unbounded, { planRevision: 1, safeWave: true, integrationVerification: INTEGRATION });
  assert.equal(collapsed.steps.length, 1);
  assert.equal(collapsed.reason, 'safe-wave-write-set-conflict');
});

test('K2: a wave never includes a step whose dependency has not passed', () => {
  const steps = [
    step(1, ['src/auth/**'], { state: 'ready' }),
    step(2, ['src/billing/**'], { state: 'ready', dependencyIds: ['step-1-1'] }),
    step(3, ['docs/**'], { state: 'ready' }),
  ];
  const selected = selectExecutableSteps(steps, { planRevision: 1, safeWave: true, integrationVerification: INTEGRATION });
  assert.deepEqual(selected.steps.map((entry) => entry.stepId), ['step-1-1', 'step-1-3']);
});
