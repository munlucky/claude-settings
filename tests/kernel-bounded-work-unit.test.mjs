import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';

const HOST = {
  surface: 'claude',
  supportsSubagentModel: true,
  supportsIndependentContext: true,
  supportsUsageTokens: true,
  supportsResolvedModelIdentity: true,
};

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-bounded-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-bounded-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'bounded-work-unit-fixture',
    version: '0.0.1',
    scripts: { 'test:ok': 'node -e "process.exit(0)"' },
  }));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const value = 0;\n');
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

const structuredAcceptance = () => Array.from({ length: 10 }, (_, index) => ({
  acceptance: `criterion-${index + 1}`,
  evidencePlan: {
    class: 'hard',
    method: 'unit-test',
    commandRefs: ['test:ok'],
    obligationId: `criterion-${index + 1}`,
  },
}));

const broadContract = (allowedPaths) => ({
  acceptance: structuredAcceptance(),
  ...(allowedPaths === undefined ? {} : { allowedPaths }),
});

const assertNoDispatchState = (cp, runId, run) => {
  assert.equal(cp.stateStore.getWorkspaceMutationLockV2(run.workspaceId), null);
  assert.deepEqual(cp.stateStore.listModelRouteDecisions(runId), []);
  assert.deepEqual(cp.listRouteAdmissions(runId), []);
  assert.deepEqual(cp.stateStore.listExecutionCapsules(runId), []);
  assert.deepEqual(cp.stateStore.getStepAttempts(runId), []);
  assert.deepEqual(cp.stateStore.getAttempts(runId), []);
};

test('control-plane rejects an unbounded implementation before any dispatch state is created', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const cases = [
      { runId: 'r-missing', taskContract: broadContract(), errorCode: 'work-unit-scope-missing' },
      { runId: 'r-empty', taskContract: broadContract([]), errorCode: 'work-unit-scope-missing' },
      { runId: 'r-globstar', taskContract: broadContract(['**']), errorCode: 'work-unit-scope-unbounded' },
      { runId: 'r-star', taskContract: broadContract(['*']), errorCode: 'work-unit-scope-unbounded' },
    ];

    for (const entry of cases) {
      if (cases.indexOf(entry) > 0) await cp.abandonRun(cases[cases.indexOf(entry) - 1].runId);
      await cp.startRun({ runId: entry.runId, objective: 'bounded implementation', taskContract: entry.taskContract });
      const run = await cp.getRun(entry.runId);
      const host = await cp.hostNext(entry.runId, { hostCapabilities: HOST });

      assert.equal(host.status, 'scope-rejected');
      assert.equal(host.errorCode, entry.errorCode);
      assert.equal(host.hostDirective.mutationLock, null);
      assert.equal(host.hostDirective.attemptId, null);
      assert.equal(host.hostDirective.executionCapsule, null);
      assert.equal(host.hostDirective.actorAssignment, null);
      assertNoDispatchState(cp, entry.runId, run);
    }

    let providerCalls = 0;
    const dispatched = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'r-star',
      adapter: {
        capabilities: HOST,
        dispatch: async () => {
          providerCalls += 1;
          throw new Error('provider dispatch must not be reached');
        },
      },
      env: { MOON_RELAY_KERNEL_WAYFINDER_MODE: 'off' },
      runtimeHome: fixture.runtimeHome,
    });
    assert.equal(providerCalls, 0);
    assert.equal(dispatched.dispatched, false);
    assert.equal(dispatched.modelInput.status, 'scope-rejected');
    assertNoDispatchState(cp, 'r-star', await cp.getRun('r-star'));
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('a scoped implementation is still admitted by the control plane', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-scoped',
      objective: 'bounded implementation',
      taskContract: broadContract(['src/**']),
    });
    const host = await cp.hostNext('r-scoped', { hostCapabilities: HOST });

    assert.equal(host.modelInput.action.type, 'implement');
    assert.deepEqual(host.executionCapsule.workUnit.allowedPaths, ['src/**']);
    assert.ok(host.hostDirective.mutationLock);
    assert.equal(cp.stateStore.listModelRouteDecisions('r-scoped').length, 1);
    assert.equal(cp.stateStore.listExecutionCapsules('r-scoped').length, 1);
    assert.equal(cp.stateStore.getStepAttempts('r-scoped').length, 1);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('reviewer/read-only turns remain allowed without an implementation scope', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({
      runId: 'r-review',
      objective: 'review the workspace',
      taskContract: { allowedPaths: [] },
    });
    const review = await cp.hostNext('r-review', {
      hostCapabilities: HOST,
      actionContext: { actionKind: 'review_engineering' },
    });

    assert.equal(review.status, undefined);
    assert.equal(review.hostDirective.modelRouteDecision.role, 'reviewer');
    assert.equal(review.hostDirective.modelRouteDecision.permissions, 'read_only');
    assert.equal(review.executionCapsule.role, 'reviewer');
    assert.equal(review.executionCapsule.permissions.filesystem, 'read_only');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});
