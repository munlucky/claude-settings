import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveWorkerBound, planBoundedWaves, buildWorkerContract } from '../scripts/kernel/run/bounded-wave.mjs';

test('worker bound is capped at 2 generally and 3 only for high-risk with independent review', () => {
  assert.equal(resolveWorkerBound({ riskTier: 'T0' }), 2);
  assert.equal(resolveWorkerBound({ riskTier: 'T3' }), 2);
  assert.equal(resolveWorkerBound({ riskTier: 'T3', includeIndependentReview: true }), 3);
});

test('disjoint slices with verification and an integration check form a parallel wave', () => {
  const slices = [
    { id: 'a', blockedBy: [], predictedWriteSet: ['src/a/**'], ownedPaths: ['src/a'], sharedSurfaces: ['none'], verification: 'test:a' },
    { id: 'b', blockedBy: [], predictedWriteSet: ['src/b/**'], ownedPaths: ['src/b'], sharedSurfaces: ['none'], verification: 'test:b' },
  ];
  const plan = planBoundedWaves(slices, { riskTier: 'T2', integrationVerification: 'test:integration' });
  assert.equal(plan.waves[0].mode, 'parallel');
  assert.equal(plan.waves[0].workers, 2);
  assert.equal(plan.integrationVerificationRequired, true);
});

test('a parallel-looking wave downgrades to sequential without an integration check', () => {
  const slices = [
    { id: 'a', blockedBy: [], predictedWriteSet: ['src/a/**'], ownedPaths: ['src/a'], sharedSurfaces: ['none'], verification: 'test:a' },
    { id: 'b', blockedBy: [], predictedWriteSet: ['src/b/**'], ownedPaths: ['src/b'], sharedSurfaces: ['none'], verification: 'test:b' },
  ];
  const plan = planBoundedWaves(slices, { riskTier: 'T2' });
  assert.equal(plan.waves[0].mode, 'sequential');
});

test('worker bound caps parallel width; overflow spills into a following chunk', () => {
  const slices = ['a', 'b', 'c'].map((id) => ({
    id, blockedBy: [], predictedWriteSet: [`src/${id}/**`], ownedPaths: [`src/${id}`], sharedSurfaces: ['none'], verification: `test:${id}`,
  }));
  const plan = planBoundedWaves(slices, { riskTier: 'T2', integrationVerification: 'test:int' });
  // Cap of 2: first wave holds 2, the third slice spills to a second wave.
  assert.equal(plan.waves[0].slices.length, 2);
  assert.equal(plan.waves[1].slices.length, 1);
});

test('slices that share a write set are never placed in the same parallel wave', () => {
  const slices = [
    { id: 'a', blockedBy: [], predictedWriteSet: ['schemas/user.json'], ownedPaths: ['schemas'], sharedSurfaces: ['user-schema'], verification: 'test:a' },
    { id: 'b', blockedBy: [], predictedWriteSet: ['schemas/user.json'], ownedPaths: ['schemas'], sharedSurfaces: ['user-schema'], verification: 'test:b' },
  ];
  const plan = planBoundedWaves(slices, { riskTier: 'T2', integrationVerification: 'test:int' });
  assert.deepEqual(plan.waves[0].slices, ['a']);
  assert.deepEqual(plan.waves[1].slices, ['b']);
});

test('worker contract is an I/O contract, not a persona', () => {
  const contract = buildWorkerContract({ id: 's1', ownedPaths: ['src/s1'], objective: 'do x', verification: 'test:s1' });
  assert.equal(contract.role, 'worker');
  assert.equal(contract.permissions, 'workspace_write');
  assert.deepEqual(contract.ownedPaths, ['src/s1']);
  assert.deepEqual(Object.keys(contract.output), ['changedPaths', 'evidenceRef', 'status']);
});
