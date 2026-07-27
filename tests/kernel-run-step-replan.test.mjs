// K2-6/7: a step that keeps failing is replanned, not retried forever. A replan
// supersedes the live steps at a new plan revision instead of editing what was
// already attempted.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { detectStepStagnation } from '../scripts/kernel/run/run-step-ledger.mjs';

const CONTRACT = {
  complex: true,
  riskTier: 'T2',
  acceptance: ['auth rejects expired tokens', 'the suite stays clean'],
  steps: [
    { objective: 'Implement token expiry', allowedPaths: ['src/auth/**'], acceptanceIds: ['AC-1'], obligationIds: ['unit-test'] },
    { objective: 'Cover it', allowedPaths: ['tests/**'], acceptanceIds: ['AC-2'], obligationIds: ['static-analysis'] },
  ],
};

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-replan-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-replan-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'replan-fixture', version: '0.0.1', scripts: { 'test:ok': 'node -e "process.exit(0)"', 'test:fail': 'node -e "process.exit(1)"', lint: 'node -e "process.exit(0)"' },
  }, null, 2));
  await mkdir(path.join(projectRoot, 'src', 'auth'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests'), { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'auth', 'service.mjs'), 'export const v = 0;\n');
  await writeFile(path.join(projectRoot, 'tests', 'auth.test.mjs'), 'export const t = 0;\n');
  spawnSync('git', ['add', '--all'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-m', 'fixture', '--quiet'], { cwd: projectRoot, encoding: 'utf8' });
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

test('K2-6: three failures on the same step raise stagnation and recommend a replan', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-stag', objective: 'Harden auth', taskContract: CONTRACT });
    const [first] = cp.getRunSteps('r-stag');

    let last;
    for (const value of [1, 2, 3]) {
      await writeFile(path.join(fixture.projectRoot, 'src', 'auth', 'service.mjs'), `export const v = ${value};\n`);
      last = await cp.report('r-stag', {
        summary: `attempt ${value}`,
        stepId: first.stepId,
        changedPaths: ['src/auth/service.mjs'],
        verifications: [{ obligationId: 'unit-test', commandRef: 'test:fail' }],
      });
      assert.equal(last.step.state, 'failed');
    }

    assert.equal(last.step.stagnation.stagnant, true);
    assert.equal(last.step.stagnation.signals.consecutiveFailures, true);
    assert.equal(last.step.stagnation.recommendation, 'replan');
    assert.equal(cp.getRunSteps('r-stag')[0].attemptCount, 3);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K2-7: a replan supersedes the live steps and writes the replacement at a new revision', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-replan', objective: 'Harden auth', taskContract: CONTRACT });
    const original = cp.getRunSteps('r-replan');
    await writeFile(path.join(fixture.projectRoot, 'src', 'auth', 'service.mjs'), 'export const v = 1;\n');
    await cp.report('r-replan', {
      summary: 'first unit done',
      stepId: original[0].stepId,
      changedPaths: ['src/auth/service.mjs'],
      verifications: [{ obligationId: 'unit-test', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] }],
    });

    const replanned = await cp.replanSteps('r-replan', {
      steps: [
        { objective: 'Rework expiry with the clock injected', allowedPaths: ['src/auth/**'], acceptanceIds: ['AC-1'], obligationIds: ['unit-test'] },
        { objective: 'Cover it', allowedPaths: ['tests/**'], acceptanceIds: ['AC-2'], obligationIds: ['static-analysis'] },
      ],
    });

    assert.equal(replanned.planRevision, 2);
    const all = cp.getRunSteps('r-replan');
    const byId = Object.fromEntries(all.map((step) => [step.stepId, step]));
    // A passed step is history, not something a replan rewrites.
    assert.equal(byId[original[0].stepId].state, 'passed');
    assert.equal(byId[original[1].stepId].state, 'superseded');
    assert.equal(all.filter((step) => step.planRevision === 2).length, 2);
    assert.equal((await cp.getRun('r-replan')).replanCount, 1, 'a replan is a measured event');

    // The cursor now points at the new plan, and the old steps cannot be
    // reported against.
    assert.equal(cp.getCurrentStep('r-replan').planRevision, 2);
    const stale = await cp.report('r-replan', { summary: 'old plan', stepId: original[1].stepId, changedPaths: [] });
    assert.equal(stale.status, 'step-rejected');
    assert.match(stale.failures[0].errorSummary, /belongs to plan revision 1/);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('K2: stagnation also fires on repeated no-op reports and repeated identical results', () => {
  const step = { stepId: 'step-1-1' };
  const workspace = `sha256:${'a'.repeat(64)}`;
  const noProgress = [
    { stepId: 'step-1-1', status: 'failed', workspaceIdentityStart: workspace, workspaceIdentityEnd: workspace },
    { stepId: 'step-1-1', status: 'failed', workspaceIdentityStart: workspace, workspaceIdentityEnd: workspace },
  ];
  const detected = detectStepStagnation({ step, attempts: noProgress });
  assert.equal(detected.stagnant, true);
  assert.equal(detected.signals.workspaceUnchanged, true);

  const repeated = detectStepStagnation({
    step,
    attempts: [
      { stepId: 'step-1-1', status: 'failed', resultDigest: 'sha256:same' },
      { stepId: 'step-1-1', status: 'failed', resultDigest: 'sha256:same' },
    ],
  });
  assert.equal(repeated.signals.repeatedResult, true);

  // Progress is not stagnation.
  assert.equal(detectStepStagnation({
    step,
    attempts: [{ stepId: 'step-1-1', status: 'failed', resultDigest: 'sha256:a' }, { stepId: 'step-1-1', status: 'passed', resultDigest: 'sha256:b' }],
  }).stagnant, false);
});
