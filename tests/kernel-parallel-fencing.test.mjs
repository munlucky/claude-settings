import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchKernelStep } from '../scripts/host/kernel/parallel-dispatcher.mjs';

test('a stale worker report is rejected at the existing Step report fence', async () => {
  const reportCalls = [];
  const recordedResults = [];
  const step = {
    stepId: 'step-stale-worker',
    objective: 'prove stale worker rejection',
    allowedPaths: ['src/stale/**'],
    obligationIds: ['stale-proof'],
  };
  const workspace = {
    workspaceRoot: 'C:/kernel-stale-worker-workspace',
    workspaceId: 'workspace-stale-worker',
    baseWorkspaceIdentity: 'sha256:workspace-base',
  };
  const controlPlane = {
    bindStepAttempt: async () => ({ id: 1, attemptId: 'attempt-stale-worker', bindingId: 'binding-stale-worker' }),
    hostNext: async () => ({
      resolution: { model: 'fixture-model' },
      executionCapsule: { capsuleId: 'capsule-current', provenance: { capsuleDigest: 'sha256:current' } },
      hostDirective: { attempt: { attemptId: 'attempt-stale-worker', bindingId: 'binding-stale-worker' } },
      modelInput: { action: { type: 'implement' } },
    }),
    updateStepAttempt: async () => {},
    report: async (_runId, payload) => {
      reportCalls.push(payload);
      return {
        status: 'scope-rejected',
        failures: [{ errorCode: 'capsule_lineage_incomplete' }],
        step: { state: 'failed' },
      };
    },
    recordStepResult: async (_runId, stepId, result) => recordedResults.push({ stepId, result }),
  };

  const result = await dispatchKernelStep({
    controlPlane,
    runId: 'run-stale-worker',
    step,
    workspace,
    adapter: { capabilities: {} },
    dispatchStep: async () => ({
      status: 'passed',
      resultStatus: 'passed',
      report: {
        summary: 'worker used an old mutation revision',
        mutationRevision: 1,
        changedPaths: ['src/stale/result.txt'],
      },
    }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failureCode, 'scope-rejected');
  assert.equal(reportCalls.length, 1);
  assert.equal(reportCalls[0].capsuleId, 'capsule-current');
  assert.equal(reportCalls[0].mutationRevision, 1);
  assert.equal(recordedResults.length, 0, 'a fenced worker cannot create a synthetic result receipt');
  assert.doesNotMatch(JSON.stringify(result), /batchId|groupId|parallelPlanId/u);
});

test('a missing worker report fails closed without inventing durable parallel state', async () => {
  const controlPlane = {
    bindStepAttempt: async () => ({ id: 2, attemptId: 'attempt-no-report', bindingId: 'binding-no-report' }),
    hostNext: async () => ({
      executionCapsule: { capsuleId: 'capsule-no-report', provenance: { capsuleDigest: 'sha256:no-report' } },
      hostDirective: { attempt: { attemptId: 'attempt-no-report', bindingId: 'binding-no-report' } },
      modelInput: { action: { type: 'implement' } },
    }),
    updateStepAttempt: async () => {},
  };
  const result = await dispatchKernelStep({
    controlPlane,
    runId: 'run-no-report',
    step: { stepId: 'step-no-report', allowedPaths: ['src/**'], obligationIds: ['proof'] },
    workspace: { workspaceRoot: 'C:/kernel-no-report-workspace', workspaceId: 'workspace-no-report', baseWorkspaceIdentity: 'sha256:base' },
    adapter: { capabilities: {} },
    dispatchStep: async () => ({ status: 'passed', resultStatus: 'passed' }),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.failureCode, 'worker-report-missing');
  assert.doesNotMatch(JSON.stringify(result), /batchId|groupId|parallelPlanId/u);
});
