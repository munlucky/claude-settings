import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { buildActiveWave, resolveWayfinderAdmission } from '../scripts/kernel/run/active-wave.mjs';
import { createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import { CODEX_MAIN_SESSION_POLICY } from '../scripts/host/kernel/codex-session-observer.mjs';
import { dispatchKernelStep, hostSupportsWayfinder } from '../scripts/host/kernel/wave-dispatcher.mjs';
import { observeWorkspaceIdentity } from '../scripts/kernel/run/workspace-identity.mjs';

const git = (cwd, args) => {
  const result = spawnSync('git', ['-c', `safe.directory=${cwd}`, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return String(result.stdout || '').trim();
};

test('Wayfinder admission stays default-deny and caps the worker width', () => {
  const run = {
    runId: 'run-wayfinder',
    status: 'active',
    proofTier: 'T2',
    taskContract: {
      safeWave: {
        requested: true,
        approved: true,
        approvedBy: 'operator-policy:test',
        integrationVerification: { commandRef: 'test:integration' },
      },
    },
  };
  const steps = [
    { stepId: 'a', allowedPaths: ['src/a.mjs'], obligationIds: ['a'] },
    { stepId: 'b', allowedPaths: ['src/b.mjs'], obligationIds: ['b'] },
  ];
  const admitted = resolveWayfinderAdmission({
    run,
    steps,
    commands: [{ commandRef: 'test:integration' }],
    hostCapabilities: {
      supportsConcurrentSessions: true,
      supportsIsolatedWorkingDirectory: true,
      supportsPerSessionEnvironment: true,
    },
    git: { ready: true },
    maxWorkers: 9,
  });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.workerLimit, 2);
  assert.equal(hostSupportsWayfinder({
    supportsConcurrentSessions: true,
    supportsIsolatedWorkingDirectory: true,
    supportsPerSessionEnvironment: true,
  }), true);
  assert.equal(hostSupportsWayfinder({ supportsConcurrentSessions: true }), false);
  assert.equal(buildActiveWave({ run, steps, baseCommitSha: 'head', baseWorkspaceIdentity: 'sha256:' + 'a'.repeat(64), integrationCommandRef: 'test:integration', approvalSource: 'operator-policy:test' }).stepIds.length, 2);
});

test('Active Wave accepts independently bound reports and rejects cross-worker reports', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-wayfinder-proj-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-wayfinder-home-'));
  let controlPlane;
  try {
    git(projectRoot, ['init']);
    git(projectRoot, ['config', 'user.name', 'kernel-test']);
    git(projectRoot, ['config', 'user.email', 'kernel-test@example.invalid']);
    await mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'wayfinder-test', scripts: { 'test:integration': 'node -e "process.exit(0)"' } }));
    await writeFile(path.join(projectRoot, 'src', 'a.mjs'), 'export const a = 0;\n');
    await writeFile(path.join(projectRoot, 'src', 'b.mjs'), 'export const b = 0;\n');
    git(projectRoot, ['add', '--all']);
    git(projectRoot, ['commit', '-m', 'base', '--quiet']);
    controlPlane = await createKernelControlPlane({ projectRoot, runtimeHome, hostProvider: 'codex', hostSessionId: 'wayfinder-test' });
    await controlPlane.startRun({
      runId: 'run-wave-report',
      objective: 'parallel source update',
      taskContract: {
        complex: true,
        acceptance: ['a', 'b'],
        steps: [
          { objective: 'a', allowedPaths: ['src/a.mjs'], acceptanceIds: ['AC-1'], obligationIds: ['unit-test'], dependsOn: [] },
          { objective: 'b', allowedPaths: ['src/b.mjs'], acceptanceIds: ['AC-2'], obligationIds: ['static-analysis'], dependsOn: [] },
        ],
        safeWave: { approved: true, approvedBy: 'operator-policy:test', integrationVerification: 'test:integration' },
      },
    });
    const executable = controlPlane.getExecutableSteps('run-wave-report');
    assert.equal(executable.mode, 'parallel');
    const run = controlPlane.getRun('run-wave-report');
    const wave = await controlPlane.beginWave('run-wave-report', executable.steps, {
      baseCommitSha: git(projectRoot, ['rev-parse', 'HEAD']),
      baseMutationRevision: run.mutationRevision,
      baseWorkspaceIdentity: observeWorkspaceIdentity({ projectRoot }).identity,
      integrationCommandRef: 'test:integration',
      approvalSource: 'operator-policy:test',
      workerLimit: 2,
    });
    await controlPlane.bindStepAttempt('run-wave-report', wave.waveId, executable.steps[0].stepId, { capsuleId: 'capsule-a', actorSessionId: 'worker-a', workspaceId: 'workspace-a' });
    await controlPlane.bindStepAttempt('run-wave-report', wave.waveId, executable.steps[1].stepId, { capsuleId: 'capsule-b', actorSessionId: 'worker-b', workspaceId: 'workspace-b' });
    const acceptedA = controlPlane.resolveReportStep('run-wave-report', { stepId: executable.steps[0].stepId, waveId: wave.waveId, capsuleId: 'capsule-a', actorSessionId: 'worker-a', workspaceId: 'workspace-a', planRevision: run.planRevision, changedPaths: [] });
    const acceptedB = controlPlane.resolveReportStep('run-wave-report', { stepId: executable.steps[1].stepId, waveId: wave.waveId, capsuleId: 'capsule-b', actorSessionId: 'worker-b', workspaceId: 'workspace-b', planRevision: run.planRevision, changedPaths: [] });
    assert.equal(acceptedA.step.stepId, executable.steps[0].stepId);
    assert.equal(acceptedB.step.stepId, executable.steps[1].stepId);
    const crossWorker = controlPlane.resolveReportStep('run-wave-report', { stepId: executable.steps[0].stepId, waveId: wave.waveId, capsuleId: 'capsule-b', actorSessionId: 'worker-b', workspaceId: 'workspace-b', planRevision: run.planRevision, changedPaths: [] });
    assert.equal(crossWorker.rejection[0].obligationId, 'capsule');

    controlPlane.failWave('run-wave-report', wave.waveId, 'integration-verification-failed');
    const retryable = controlPlane.getRunSteps('run-wave-report', { planRevision: run.planRevision });
    assert.deepEqual(retryable.map((step) => step.state), ['failed', 'failed']);
    assert.deepEqual(retryable.map((step) => step.integrationState), ['failed', 'failed']);
    assert.equal(controlPlane.getExecutableSteps('run-wave-report').steps.length, 2);
  } finally {
    if (controlPlane) await controlPlane.close();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
});

test('Wayfinder worker adapters preserve the isolated session boundary', async () => {
  let received = null;
  const adapter = createCodexAdapter({
    parentSessionObserver: async ({ parentSessionId }) => ({ sessionId: parentSessionId, model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort }),
    launch: async (request) => {
      received = request;
      return { status: 'completed', resolvedModel: request.invocation.model, resolvedEffort: request.invocation.effort, effortObserved: true, sessionId: 'worker-session' };
    },
  });
  await adapter.dispatch({
    decision: { modelClass: 'value_coding', permissions: 'workspace_write', role: 'implementer', actionKind: 'implement' },
    resolution: { model: 'worker-model', effort: 'medium', enforcementIntent: 'enforced' },
    strategy: 'session-model-override',
    executionContract: {},
    workingDirectory: 'C:/runtime/step-a',
    environment: { MOON_RELAY_KERNEL_STEP_ID: 'step-a' },
    parentSessionId: 'parent-session',
    concurrencyGroup: 'wave-1',
    childSession: { maxNestedAgents: 0, canDelegate: false, canCommit: false },
  });
  assert.equal(received.workingDirectory, 'C:/runtime/step-a');
  assert.equal(received.environment.MOON_RELAY_KERNEL_STEP_ID, 'step-a');
  assert.equal(received.parentSessionId, 'parent-session');
  assert.equal(received.concurrencyGroup, 'wave-1');
  assert.deepEqual(received.childSession, { maxNestedAgents: 0, canDelegate: false, canCommit: false });
});

test('Wayfinder worker completion requires an accepted Step report', async () => {
  const step = { stepId: 'step-a', objective: 'update a' };
  const workspace = { workspaceId: 'workspace-a', workspaceRoot: 'C:/runtime/step-a', baseWorkspaceIdentity: 'sha256:base' };
  const controlPlane = {
    bindStepAttempt: async () => ({ id: 'attempt-a', actorSessionId: 'worker-a' }),
    hostNext: async () => ({ runId: 'run-a', executionCapsule: null, hostDirective: { modelRouteDecision: {} }, modelInput: {} }),
    report: async () => ({ status: 'in-progress', step: { state: 'passed' } }),
  };
  const passed = await dispatchKernelStep({
    controlPlane,
    runId: 'run-a',
    waveId: 'wave-a',
    step,
    workspace,
    adapter: {},
    dispatchStep: async () => ({ status: 'completed', report: { stepId: 'step-a' } }),
  });
  assert.equal(passed.status, 'passed');

  const missingReport = await dispatchKernelStep({
    controlPlane,
    runId: 'run-a',
    waveId: 'wave-a',
    step,
    workspace,
    adapter: {},
    dispatchStep: async () => ({ status: 'completed' }),
  });
  assert.equal(missingReport.status, 'failed');
  assert.equal(missingReport.failureCode, 'worker-report-missing');
});

test('Wayfinder reports the observed child session after usage attaches it to the attempt', async () => {
  const reportInputs = [];
  const boundAttempt = {
    id: 1,
    attemptId: 'attempt-aaaaaaaa',
    bindingId: 'binding-a',
    actorSessionId: 'parent-worker',
  };
  const refreshedAttempt = {
    ...boundAttempt,
    actorSessionId: 'sha256:' + 'b'.repeat(64),
  };
  const controlPlane = {
    stateStore: {
      getStepAttemptByAttemptId: () => refreshedAttempt,
    },
    bindStepAttempt: async () => boundAttempt,
    updateStepAttempt: async () => refreshedAttempt,
    hostNext: async () => ({
      runId: 'run-a',
      executionCapsule: {
        capsuleId: 'capsule-a',
        stepId: 'step-a',
        provenance: { capsuleDigest: 'sha256:' + 'c'.repeat(64) },
      },
      hostDirective: {
        modelRouteDecision: {
          decisionId: 'route-abcdef12',
          runId: 'run-a',
          role: 'implementer',
          actionKind: 'implement',
          modelClass: 'value_coding',
          workProfile: null,
        },
        enforcementStrategy: 'subagent',
      },
      resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
      strategy: 'subagent',
      admission: { admissionId: 'admission-a', digest: 'sha256:' + 'd'.repeat(64) },
      envelope: null,
    }),
    recordModelUsage: async () => {},
    report: async (_runId, payload) => {
      reportInputs.push(payload);
      return { status: 'in-progress', step: { state: 'passed' } };
    },
  };
  const passed = await dispatchKernelStep({
    controlPlane,
    runId: 'run-a',
    waveId: 'wave-a',
    step: { stepId: 'step-a', objective: 'update a' },
    workspace: { workspaceId: 'workspace-a', workspaceRoot: 'C:/runtime/step-a', baseWorkspaceIdentity: 'sha256:base' },
    adapter: {},
    hostCapabilities: { surface: 'codex', supportsResolvedModelIdentity: true },
    dispatchStep: async () => ({
      status: 'completed',
      actorSessionId: 'child-session',
      resolvedModel: 'gpt-5.6-luna',
      resolvedEffort: 'max',
      observedModel: 'gpt-5.6-luna',
      observedEffort: 'max',
      report: { status: 'completed', summary: 'child done', changedPaths: [], risks: [], requestedVerifications: [], judgments: [], knowledgeObservations: [], blocker: null },
    }),
  });
  assert.equal(passed.status, 'passed');
  assert.equal(reportInputs.length, 1);
  assert.equal(reportInputs[0].actorSessionId, 'child-session');
});
