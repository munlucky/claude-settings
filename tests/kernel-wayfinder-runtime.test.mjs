import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { buildActiveWave, resolveWayfinderAdmission } from '../scripts/kernel/run/active-wave.mjs';
import { hostSupportsWayfinder } from '../scripts/host/kernel/wave-dispatcher.mjs';
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
  } finally {
    if (controlPlane) await controlPlane.close();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
});
