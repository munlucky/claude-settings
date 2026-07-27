// K2-10: parallel step execution is not a default. It requires an explicit safe
// wave, disjoint write sets, and an integration verification — and any of those
// missing collapses the wave back to one step at a time.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { selectExecutableSteps } from '../scripts/kernel/run/run-step-ledger.mjs';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

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

// --- Runtime wiring: the wave the Host may actually dispatch ---------------

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-wave-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-wave-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'wave-fixture',
    version: '0.0.1',
    scripts: {
      'test:ok': 'node -e "process.exit(0)"',
      'test:fail': 'node -e "process.exit(1)"',
      'test:integration': 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
    },
  }, null, 2));
  for (const relative of ['src/auth/service.mjs', 'src/billing/invoice.mjs']) {
    await mkdir(path.join(projectRoot, path.dirname(relative)), { recursive: true });
    await writeFile(path.join(projectRoot, relative), 'export const v = 0;\n');
  }
  spawnSync('git', ['add', '--all'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-m', 'fixture', '--quiet'], { cwd: projectRoot, encoding: 'utf8' });
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

const DISJOINT_STEPS = [
  { objective: 'Auth', allowedPaths: ['src/auth/**'], acceptanceIds: ['AC-1'], obligationIds: ['unit-test'] },
  { objective: 'Billing', allowedPaths: ['src/billing/**'], acceptanceIds: ['AC-2'], obligationIds: ['static-analysis'] },
];

const contractWith = (safeWave, steps = DISJOINT_STEPS) => ({
  complex: true,
  riskTier: 'T2',
  acceptance: ['auth holds', 'billing holds'],
  steps: steps.map((step) => ({ ...step, dependsOn: [] })),
  safeWave,
});

test('K2: a wave is refused without an explicit approval, an approver, and an integration check', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    // Requested but not approved.
    await cp.startRun({ runId: 'r-req', objective: 'x', taskContract: contractWith({ requested: true, integrationVerification: 'test:integration' }) });
    const requested = cp.getExecutableSteps('r-req');
    assert.equal(requested.mode, 'sequential');
    assert.equal(requested.reason, 'safe-wave-not-approved');

    // Approved but with nobody on record.
    await cp.startRun({ runId: 'r-anon', objective: 'x', taskContract: contractWith({ approved: true, integrationVerification: 'test:integration' }) });
    assert.equal((await cp.getRun('r-anon')).taskContract.safeWave.approved, false, 'an approval needs an approver');
    assert.equal(cp.getExecutableSteps('r-anon').mode, 'sequential');

    // Approved by someone, but with no integration check to catch what per-step
    // evidence cannot.
    await cp.startRun({ runId: 'r-nocheck', objective: 'x', taskContract: contractWith({ approved: true, approvedBy: 'operator' }) });
    assert.equal((await cp.getRun('r-nocheck')).taskContract.safeWave.approved, false);
    assert.equal(cp.getExecutableSteps('r-nocheck').mode, 'sequential');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K2: an approved wave with disjoint write sets dispatches in parallel', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-wave',
      objective: 'x',
      taskContract: contractWith({ approved: true, approvedBy: 'operator', integrationVerification: 'test:integration' }),
    });
    const wave = cp.getExecutableSteps('r-wave');
    assert.equal(wave.mode, 'parallel');
    assert.equal(wave.steps.length, 2);
    assert.equal(wave.integrationVerification.commandRef, 'test:integration');

    // `next` still hands the model exactly one unit; the wave is a Host concern.
    const next = await cp.next('r-wave');
    assert.equal(next.action.step.stepId, wave.steps[0].stepId);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K2: an integration command the project never declared cannot authorise a wave', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-fakecheck',
      objective: 'x',
      taskContract: contractWith({ approved: true, approvedBy: 'operator', integrationVerification: 'test:does-not-exist' }),
    });
    const wave = cp.getExecutableSteps('r-fakecheck');
    assert.equal(wave.mode, 'sequential');
    assert.equal(wave.reason, 'safe-wave-integration-command-not-declared');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K2-10: overlapping write sets and a stagnant plan both collapse the wave', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  const approved = { approved: true, approvedBy: 'operator', integrationVerification: 'test:integration' };
  try {
    // Overlapping scope: approval does not make a race safe.
    await cp.startRun({
      runId: 'r-overlap',
      objective: 'x',
      taskContract: contractWith(approved, [
        { objective: 'Auth', allowedPaths: ['src/**'], acceptanceIds: ['AC-1'], obligationIds: ['unit-test'] },
        { objective: 'Billing', allowedPaths: ['src/billing/**'], acceptanceIds: ['AC-2'], obligationIds: ['static-analysis'] },
      ]),
    });
    const overlapping = cp.getExecutableSteps('r-overlap');
    assert.equal(overlapping.mode, 'sequential');
    assert.equal(overlapping.reason, 'safe-wave-write-set-conflict');

    // A stuck plan returns to one step at a time (§7.9).
    await cp.startRun({ runId: 'r-stuckwave', objective: 'x', taskContract: contractWith(approved) });
    assert.equal(cp.getExecutableSteps('r-stuckwave').mode, 'parallel');
    const [first] = cp.getRunSteps('r-stuckwave');
    for (const value of [1, 2, 3]) {
      await writeFile(path.join(fixture.projectRoot, 'src', 'auth', 'service.mjs'), `export const v = ${value};\n`);
      await cp.report('r-stuckwave', {
        summary: `attempt ${value}`,
        stepId: first.stepId,
        changedPaths: ['src/auth/service.mjs'],
        verifications: [{ obligationId: 'unit-test', commandRef: 'test:fail' }],
      });
    }
    const suspended = cp.getExecutableSteps('r-stuckwave');
    assert.equal(suspended.mode, 'sequential');
    assert.equal(suspended.reason, 'safe-wave-suspended-by-stagnation');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});
