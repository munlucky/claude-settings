import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runGit } from '../scripts/lib/git-safe.mjs';
import { cleanupExecutionWorkspaces, executionRoot } from '../scripts/kernel/workspace/step-worktree-manager.mjs';
import { dispatchKernelParallel } from '../scripts/host/kernel/parallel-dispatcher.mjs';

const capabilities = {
  surface: 'codex',
  supportsConcurrentSessions: true,
  supportsIsolatedWorkingDirectory: true,
  supportsPerSessionEnvironment: true,
};

const createFixture = async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-parallel-dispatch-repo-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-parallel-dispatch-home-'));
  runGit(projectRoot, ['init', '-b', 'main']);
  runGit(projectRoot, ['config', 'user.name', 'Kernel Parallel Test']);
  runGit(projectRoot, ['config', 'user.email', 'kernel-parallel@example.invalid']);
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'base.txt'), 'base\n');
  runGit(projectRoot, ['add', '--all']);
  runGit(projectRoot, ['commit', '-m', 'fixture']);
  return { projectRoot, runtimeHome, baseCommitSha: String(runGit(projectRoot, ['rev-parse', 'HEAD']).stdout).trim() };
};

const makeSteps = () => [
  { stepId: 'step-alpha', sequence: 1, allowedPaths: ['src/alpha/**'], obligationIds: ['alpha-proof'], expectedOutputs: ['alpha result'] },
  { stepId: 'step-beta', sequence: 2, allowedPaths: ['src/beta/**'], obligationIds: ['beta-proof'], expectedOutputs: ['beta result'] },
];

const makeControlPlane = ({ fixture, failedStepId = null }) => {
  const steps = makeSteps();
  const failures = [];
  const reports = [];
  const recorded = [];
  const run = {
    runId: 'run-parallel-dispatch',
    projectId: 'project-parallel-dispatch',
    status: 'active',
    proofTier: 'T0',
    baseCommitSha: fixture.baseCommitSha,
    taskContract: {
      acceptance: [{ evidencePlan: { commandRefs: ['test:ok'] } }],
    },
  };
  return {
    projectRoot: fixture.projectRoot,
    getExecutableSteps: async () => ({ mode: 'parallel', steps }),
    getRun: () => run,
    discoverProjectCommands: () => [{ commandRef: 'test:ok' }],
    bindStepAttempt: async (_runId, step) => ({ id: step, attemptId: `attempt-${step}`, bindingId: `binding-${step}` }),
    hostNext: async (_runId, { actionContext }) => {
      const stepId = actionContext.stepId;
      return {
      resolution: { model: 'fixture-model' },
      executionCapsule: {
        capsuleId: `capsule-${stepId}`,
        provenance: { capsuleDigest: `sha256:${stepId}`, routeDecisionId: `route-${stepId}` },
      },
      hostDirective: {
        attempt: { attemptId: `attempt-${stepId}`, bindingId: `binding-${stepId}` },
        modelRouteDecision: { decisionId: `decision-${stepId}` },
        enforcementStrategy: 'isolated',
      },
      modelInput: { action: { type: 'implement' } },
      };
    },
    updateStepAttempt: async () => {},
    report: async (_runId, payload) => {
      reports.push(payload);
      return { status: 'in-progress', step: { state: 'passed', resultDigest: `digest-${payload.stepId}` } };
    },
    recordStepResult: async (_runId, stepId, result) => recorded.push({ stepId, result }),
    failStepAttempt: async (_runId, stepId, details) => failures.push({ stepId, details }),
    recordModelUsage: async () => {},
    execute: async () => {},
    failures,
    reports,
    recorded,
    steps,
    adapter: {
      capabilities,
      dispatch: async () => ({ status: 'passed' }),
    },
    dispatchStep: async ({ step, workspace }) => {
      if (step.stepId === failedStepId) {
        return {
          status: 'failed',
          resultStatus: 'failed',
          report: { summary: 'simulated worker failure', changedPaths: [] },
        };
      }
      const relativePath = `src/${step.stepId === 'step-alpha' ? 'alpha' : 'beta'}/result.txt`;
      const target = path.join(workspace.workspaceRoot, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${step.stepId}\n`);
      return {
        status: 'passed',
        resultStatus: 'passed',
        report: { summary: `${step.stepId} complete`, changedPaths: [relativePath] },
      };
    },
  };
};

const runDispatch = async ({ failedStepId = null } = {}) => {
  const fixture = await createFixture();
  const controlPlane = makeControlPlane({ fixture, failedStepId });
  try {
    const result = await dispatchKernelParallel({
      controlPlane,
      runId: 'run-parallel-dispatch',
      adapter: controlPlane.adapter,
      projectRoot: fixture.projectRoot,
      runtimeHome: fixture.runtimeHome,
      dispatchStep: controlPlane.dispatchStep,
      executeIntegrationVerification: async () => ({ status: 'passed', passed: true, evidenceRef: 'evidence://fixture' }),
    });
    return { fixture, controlPlane, result };
  } catch (error) {
    await cleanupExecutionWorkspaces({ runtimeHome: fixture.runtimeHome, projectId: 'project-parallel-dispatch', runId: 'run-parallel-dispatch', repoRoot: fixture.projectRoot, retain: false }).catch(() => {});
    await rm(fixture.runtimeHome, { recursive: true, force: true });
    await rm(fixture.projectRoot, { recursive: true, force: true });
    throw error;
  }
};

const finishFixture = async ({ fixture, result }) => {
  await cleanupExecutionWorkspaces({ runtimeHome: fixture.runtimeHome, projectId: 'project-parallel-dispatch', runId: 'run-parallel-dispatch', repoRoot: fixture.projectRoot, retain: false });
  await rm(fixture.runtimeHome, { recursive: true, force: true });
  await rm(fixture.projectRoot, { recursive: true, force: true });
  assert.ok(result);
};

test('parallel success uses existing Step receipts and integrates deterministic worker results', async () => {
  const run = await runDispatch();
  try {
    assert.equal(run.result.status, 'passed', `${JSON.stringify(run.result, null, 2)}\nintegration=${run.result.integration.error?.stack || run.result.integration.error?.message || ''}\nreasons=${run.result.workerResults.map((entry) => entry.reason?.stack || entry.reason || '').join('\n')}`);
    assert.equal(run.result.dispatched, true);
    assert.equal(run.result.executionResults.length, 2);
    assert.equal(run.controlPlane.failures.length, 0);
    assert.equal(run.controlPlane.recorded.length, 2);
    assert.ok(run.controlPlane.reports.every((report) => report.attemptId.startsWith('attempt-step-')));
    assert.doesNotMatch(JSON.stringify(run.result), /batchId|groupId|parallelPlanId/u);
    assert.equal((await readFile(path.join(run.fixture.projectRoot, 'src', 'alpha', 'result.txt'), 'utf8')).trim(), 'step-alpha');
    assert.equal((await readFile(path.join(run.fixture.projectRoot, 'src', 'beta', 'result.txt'), 'utf8')).trim(), 'step-beta');
  } finally {
    await finishFixture(run);
  }
});

test('partial worker failure retains recovery workspaces and records only the failed Step', async () => {
  const run = await runDispatch({ failedStepId: 'step-beta' });
  try {
    assert.equal(run.result.status, 'partial-failure', `${JSON.stringify(run.result, null, 2)}\nintegration=${run.result.integration.error?.stack || run.result.integration.error?.message || ''}\nreasons=${run.result.workerResults.map((entry) => entry.reason?.stack || entry.reason || '').join('\n')}`);
    assert.equal(run.result.executionResults.length, 1);
    assert.deepEqual(run.controlPlane.failures.map((entry) => entry.stepId), ['step-beta']);
    assert.equal(run.controlPlane.recorded.length, 1);
    assert.equal(run.result.cleanup.retained, true);
    assert.equal((await readFile(path.join(run.fixture.projectRoot, 'src', 'alpha', 'result.txt'), 'utf8')).trim(), 'step-alpha');
    assert.equal(existsSync(executionRoot({ runtimeHome: run.fixture.runtimeHome, projectId: 'project-parallel-dispatch', runId: 'run-parallel-dispatch' })), true);
    assert.doesNotMatch(JSON.stringify(run.result), /batchId|groupId|parallelPlanId/u);
  } finally {
    await finishFixture(run);
  }
});
