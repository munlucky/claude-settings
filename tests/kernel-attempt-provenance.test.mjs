// WP-1/WP-2: the step attempt is the common authority for direct, routed, and
// wave lineage. Legacy rows remain readable but are never backfilled by guess.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { admitRoute } from '../scripts/kernel/routing/route-admission.mjs';
import { hashSessionId } from '../scripts/kernel/run/model-route-contract.mjs';
import { dispatchKernelTurn, prepareWayfinderWorkerDispatch } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { dispatchKernelStep } from '../scripts/host/kernel/wave-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';
import { buildStepResultReceipt } from '../scripts/kernel/run/wave-receipts.mjs';

const CONTRACT = {
  acceptance: [{
    acceptance: 'the attempt lineage is durable',
    evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'unit-test' },
  }],
};

const SIMPLE_CONTRACT = { acceptance: ['the direct path is durable'] };

const DIRECT_CONTRACT = {
  acceptance: [{ acceptance: 'the direct path is durable', evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'default' } }],
};

const REVIEW_CONTRACT = {
  surfaces: ['security_boundary'],
  acceptance: [{ acceptance: 'the reviewed path is durable', evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'unit-test' } }],
};

const WAVE_CONTRACT = {
  complex: true,
  acceptance: [
    { id: 'AC-wave-a', statement: 'wave a is durable', evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'unit-test' } },
    { id: 'AC-wave-b', statement: 'wave b is durable', evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'unit-test' } },
  ],
  steps: [
    { id: 'wave-a', objective: 'wave a', allowedPaths: ['app-a.mjs'], acceptanceIds: ['AC-wave-a'], obligationIds: ['unit-test'], dependsOn: [] },
    { id: 'wave-b', objective: 'wave b', allowedPaths: ['app-b.mjs'], acceptanceIds: ['AC-wave-b'], obligationIds: ['unit-test'], dependsOn: [] },
  ],
  safeWave: { approved: true, approvedBy: 'operator-policy:test', integrationVerification: { commandRef: 'test:ok' } },
};

const setup = async (runId = 'r-attempt', taskContract = CONTRACT, controlPlaneOptions = {}) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-attempt-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-attempt-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'attempt-fixture', version: '0.0.1', scripts: { 'test:ok': 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' },
  }));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const value = 0;\n');
  await writeFile(path.join(projectRoot, 'app-a.mjs'), 'export const value = 0;\n');
  await writeFile(path.join(projectRoot, 'app-b.mjs'), 'export const value = 0;\n');
  const { hostProvider = null, hostSessionId = null, ...restOptions } = controlPlaneOptions;
  const env = {
    ...(restOptions.env || process.env),
    ...(hostProvider ? { MOON_RELAY_KERNEL_PROVIDER: hostProvider } : {}),
    ...(hostSessionId ? { MOON_RELAY_KERNEL_SESSION_ID: hostSessionId } : {}),
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, ...restOptions, env });
  const bootstrap = restOptions.requireHostBinding ? controlPlane.ensureRun.bind(controlPlane) : controlPlane.startRun.bind(controlPlane);
  await bootstrap({ runId, objective: 'preserve attempt lineage', taskContract });
  return { runtimeHome, projectRoot, controlPlane, runId };
};

const cleanup = async ({ runtimeHome, projectRoot, controlPlane }) => {
  await controlPlane.close();
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

test('a routed attempt carries capsule, admission, usage, retry, and failure lineage', async () => {
  const fixture = await setup();
  try {
    const { controlPlane: cp, runId } = fixture;
    const store = cp.stateStore;
    const step = cp.getCurrentStep(runId);
    const capsuleId = 'capsule-attempt-lineage';
    const capsuleDigest = `sha256:${'a'.repeat(64)}`;
    const attempt = cp.beginAttempt(runId, {
      stepId: step.stepId,
      actorSessionId: 'owner-session',
      capsuleId,
      capsuleDigest,
      provenanceKind: 'routed',
      planRevision: step.planRevision,
      mutationRevision: 0,
      retryReason: 'provider-timeout',
      failureCategory: 'provider/infrastructure',
    });
    assert.match(attempt.attemptId, /^attempt-[a-f0-9-]{8,96}$/);
    assert.equal(attempt.status, 'started');
    assert.equal(attempt.stepId, step.stepId);
    assert.equal(attempt.provenanceKind, 'routed');

    const decision = await cp.decideModelRoute(runId, { actionKind: 'implement', obligationId: 'unit-test' });
    const admission = admitRoute({
      run: store.getRun(runId),
      step,
      attemptId: attempt.attemptId,
      decision,
      resolution: { surface: 'claude', model: 'configured-value', source: 'environment', enforcementIntent: 'enforced' },
      capabilities: {
        surface: 'claude',
        adapterVersion: 'test',
        supportsSubagentModel: true,
        supportsResolvedModelIdentity: true,
        supportsIndependentContext: true,
      },
      capsule: { capsuleId, stepId: step.stepId, provenance: { capsuleDigest } },
    });
    store.recordRouteAdmission(runId, admission);
    const withAdmission = store.getStepAttemptByAttemptId(attempt.attemptId, { runId });
    assert.equal(withAdmission.admissionId, admission.admissionId);

    const usage = store.recordModelUsageReceipt(runId, {
      decisionId: decision.decisionId,
      runId,
      hostSurface: 'claude',
      actorSessionId: hashSessionId('worker-session'),
      resolvedModel: 'configured-value',
      resolvedEffort: 'high',
      observedModel: 'configured-value',
      observedEffort: 'high',
      enforcementStatus: 'enforced',
      resultStatus: 'failed',
      attemptId: attempt.attemptId,
      bindingId: attempt.bindingId,
      capsuleId,
      capsuleDigest,
      admissionId: admission.admissionId,
      admissionDigest: admission.digest,
      stepId: step.stepId,
    });
    assert.equal(usage.attemptId, attempt.attemptId);
    assert.equal(usage.stepId, step.stepId);

    const interrupted = store.getStepAttemptByAttemptId(attempt.attemptId, { runId });
    assert.equal(interrupted.usageReceiptId, usage.receiptId);
    assert.equal(interrupted.status, 'interrupted');
    assert.equal(interrupted.failureCategory, 'provider/infrastructure');
    assert.equal(store.listRouteAdmissions(runId).length, 1);
    assert.equal(store.listModelUsageReceipts(runId).length, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('a legacy step-attempt row is retained as legacy-unattributed across idempotent opens', async () => {
  const fixture = await setup('r-legacy-attempt');
  let dbPath;
  try {
    const store = await openKernelStateStore({ runtimeHome: fixture.runtimeHome });
    dbPath = store.dbPath;
    store.close();
    const stepId = fixture.controlPlane.getCurrentStep('r-legacy-attempt').stepId;
    const { default: Database } = await import('better-sqlite3');
    const raw = new Database(dbPath);
    raw.prepare(`
      INSERT INTO run_step_attempts(run_id, step_id, attempt_number, status, summary, started_at)
      VALUES(?, ?, ?, 'started', ?, ?)
    `).run('r-legacy-attempt', stepId, 1, 'old attempt', new Date().toISOString());
    raw.close();

    const reopened = await openKernelStateStore({ runtimeHome: fixture.runtimeHome });
    const legacy = reopened.getStepAttempts('r-legacy-attempt', { stepId })[0];
    assert.equal(legacy.attemptId, null);
    assert.equal(legacy.provenanceKind, 'legacy-unattributed');
    assert.equal(legacy.planRevision, null);
    assert.equal(legacy.mutationRevision, null);
    assert.equal(legacy.summary, 'old attempt');

    const canonical = reopened.recordStepAttempt('r-legacy-attempt', {
      stepId,
      actorSessionId: 'owner-session',
      provenanceKind: 'owner-session',
      planRevision: 1,
      mutationRevision: 0,
    });
    assert.match(canonical.attemptId, /^attempt-[a-f0-9-]{8,96}$/);
    assert.equal(reopened.getStepAttempts('r-legacy-attempt', { stepId }).length, 2);
    reopened.close();

    const reopenedAgain = await openKernelStateStore({ runtimeHome: fixture.runtimeHome });
    try {
      const rows = reopenedAgain.getStepAttempts('r-legacy-attempt', { stepId });
      assert.equal(rows.length, 2);
      assert.equal(rows[0].attemptId, null);
      assert.equal(rows[0].provenanceKind, 'legacy-unattributed');
      assert.equal(rows[0].planRevision, null);
      assert.equal(rows[0].mutationRevision, null);
      assert.equal(rows[1].attemptId, canonical.attemptId);
    } finally {
      reopenedAgain.close();
    }
  } finally {
    await cleanup(fixture);
  }
});

test('an attempt or capsule mismatch is rejected before proof execution', async () => {
  const fixture = await setup('r-reject-attempt');
  try {
    const { controlPlane: cp, runId } = fixture;
    const step = cp.getCurrentStep(runId);
    const attempt = cp.beginAttempt(runId, {
      stepId: step.stepId,
      actorSessionId: 'owner-session',
      capsuleId: 'capsule-bound',
      capsuleDigest: `sha256:${'b'.repeat(64)}`,
      provenanceKind: 'owner-session',
      planRevision: step.planRevision,
      mutationRevision: 0,
    });
    const rejected = await cp.report(runId, {
      stepId: step.stepId,
      attemptId: `attempt-${'c'.repeat(8)}`,
      capsuleId: 'capsule-bound',
      changedPaths: [],
    });
    assert.equal(rejected.status, 'step-rejected');
    assert.equal(rejected.executed.length, 0);
    assert.match(rejected.failures[0].errorSummary, /not an active attempt/);
    assert.equal(cp.stateStore.getStepAttemptByAttemptId(attempt.attemptId, { runId }).status, 'started');

    const unnamed = await cp.report(runId, {
      attemptId: `attempt-${'d'.repeat(8)}`,
      changedPaths: [],
    });
    assert.equal(unnamed.status, 'step-rejected');
    assert.equal(unnamed.executed.length, 0);
    assert.match(unnamed.failures[0].errorSummary, /not an active attempt/);

    const bindingRejected = await cp.report(runId, {
      stepId: step.stepId,
      attemptId: attempt.attemptId,
      bindingId: 'binding-not-current',
      capsuleId: 'capsule-bound',
      changedPaths: [],
    });
    assert.equal(bindingRejected.status, 'step-rejected');
    assert.equal(bindingRejected.executed.length, 0);
    assert.match(bindingRejected.failures[0].errorSummary, /binding/);

    const missingLineage = await cp.report(runId, {
      stepId: step.stepId,
      changedPaths: [],
    });
    assert.equal(missingLineage.status, 'step-rejected');
    assert.equal(missingLineage.executed.length, 0);
    assert.match(missingLineage.failures[0].errorSummary, /capsuleId/);

    cp.stateStore.updateStepAttempt(attempt.id, { mutationRevision: 1 });
    const stale = await cp.report(runId, {
      stepId: step.stepId,
      attemptId: attempt.attemptId,
      bindingId: attempt.bindingId,
      changedPaths: [],
    });
    assert.equal(stale.status, 'step-rejected');
    assert.equal(stale.executed.length, 0);
    assert.match(stale.failures[0].errorSummary, /capsule|lineage|mutation/);
  } finally {
    await cleanup(fixture);
  }
});

test('a direct report enters and closes the canonical attempt before legacy projection', async () => {
  const fixture = await setup('r-direct-attempt', DIRECT_CONTRACT);
  try {
    const { controlPlane: cp, runId } = fixture;
    const step = cp.getCurrentStep(runId);

    const report = await cp.report(runId, {
      stepId: step.stepId,
      summary: 'direct implementation completed',
      changedPaths: ['app.mjs'],
      verifications: [
        { obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] },
        { obligationId: 'static-analysis', commandRef: 'lint' },
      ],
    });

    assert.equal(report.status, 'completed', JSON.stringify(report.failures));
    assert.equal(report.step.state, 'passed', JSON.stringify(report));
    const canonical = cp.stateStore.getStepAttempts(runId, { stepId: step.stepId }).at(-1);
    assert.match(canonical.attemptId, /^attempt-[a-f0-9-]{8,96}$/);
    assert.equal(canonical.status, 'passed');
    assert.deepEqual(canonical.verificationRefs.length > 0, true);
    assert.equal(cp.stateStore.getAttempts(runId).at(-1).status, 'finished');
  } finally {
    await cleanup(fixture);
  }
});

test('a Codex owner report is admitted by generic Run and worktree authority', async () => {
  const fixture = await setup('r-codex-direct-attempt', DIRECT_CONTRACT, {
    hostProvider: 'codex',
    hostSessionId: 'codex-owner-session',
    requireHostBinding: true,
  });
  try {
    const { controlPlane: cp, runId } = fixture;
    const step = cp.getCurrentStep(runId);
    const accepted = await cp.report(runId, {
      stepId: step.stepId,
      summary: 'implementation completed in the Run worktree',
      changedPaths: ['app.mjs'],
      verifications: [
        { obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] },
        { obligationId: 'static-analysis', commandRef: 'lint' },
      ],
    });
    assert.equal(accepted.status, 'completed', JSON.stringify(accepted.failures));
    assert.ok(accepted.executed.length > 0);
  } finally {
    await cleanup(fixture);
  }
});

test('a Codex report may use its bound capsule without actor receipt or parent lineage gates', async () => {
  const fixture = await setup('r-codex-capsule-reuse', DIRECT_CONTRACT, {
    hostProvider: 'codex',
    hostSessionId: 'codex-owner-session',
    requireHostBinding: true,
  });
  try {
    const { controlPlane: cp, runId } = fixture;
    const host = await cp.hostNext(runId, {
      hostCapabilities: {
        surface: 'codex',
        supportsSessionModelOverride: true,
        supportsIndependentContext: true,
        supportsResolvedModelIdentity: true,
      },
    });
    const step = cp.getCurrentStep(runId);
    const reportBase = {
      stepId: step.stepId,
      capsuleId: host.executionCapsule.capsuleId,
      changedPaths: ['app.mjs'],
      verifications: [{ obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['the direct path is durable'] }],
    };
    const accepted = await cp.report(runId, reportBase);
    assert.equal(accepted.status, 'completed', JSON.stringify(accepted.failures));
    assert.ok(accepted.executed.length > 0);
  } finally {
    await cleanup(fixture);
  }
});

test('a routed reviewer attempt cannot replace an owner-session implementation attempt', async () => {
  const fixture = await setup('r-reviewer-attempt-selection', REVIEW_CONTRACT);
  try {
    const { controlPlane: cp, runId } = fixture;
    const step = cp.getCurrentStep(runId);
    const implementation = cp.beginAttempt(runId, {
      stepId: step.stepId,
      actorSessionId: 'owner-implementation',
      provenanceKind: 'owner-session',
      planRevision: step.planRevision,
      mutationRevision: 0,
    });
    const reviewDecision = await cp.decideModelRoute(runId, {
      actionKind: 'review_engineering',
      obligationId: 'security-review',
    });
    cp.beginAttempt(runId, {
      stepId: step.stepId,
      actorSessionId: 'routed-reviewer',
      capsuleId: 'capsule-reviewer-attempt',
      routeDecisionId: reviewDecision.decisionId,
      provenanceKind: 'routed',
      planRevision: step.planRevision,
      mutationRevision: 0,
    });
    const latestImplementation = cp.stateStore.getLatestImplementationAttempt(runId, { stepId: step.stepId });
    assert.equal(latestImplementation.attemptId, implementation.attemptId);
  } finally {
    await cleanup(fixture);
  }
});

test('a wave worker uses the same begin, attach, assert, and finish lineage', async () => {
  const fixture = await setup('r-wave-attempt', WAVE_CONTRACT);
  try {
    const { controlPlane: cp, runId } = fixture;
    const executable = cp.getExecutableSteps(runId);
    assert.equal(executable.steps.length, 2);
    const run = cp.stateStore.getRun(runId);
    const wave = await cp.beginWave(runId, executable.steps, {
      baseCommitSha: 'base-sha',
      baseMutationRevision: run.mutationRevision,
      baseWorkspaceIdentity: run.currentWorkspaceIdentity,
      integrationCommandRef: 'test:ok',
      approvalSource: 'operator-policy:test',
      workerLimit: 2,
    });
    const bound = await cp.bindStepAttempt(runId, wave.waveId, executable.steps[0].stepId, {
      actorSessionId: 'wave-worker-a',
      workspaceId: 'wave-workspace-a',
      workspaceIdentity: run.currentWorkspaceIdentity,
      baseWorkspaceIdentity: run.currentWorkspaceIdentity,
      capsuleId: 'capsule-wave-a',
    });
    const resolved = cp.resolveReportStep(runId, {
      stepId: executable.steps[0].stepId,
      waveId: wave.waveId,
      attemptId: bound.attemptId,
      bindingId: bound.bindingId,
      capsuleId: 'capsule-wave-a',
      actorSessionId: 'wave-worker-a',
      workspaceId: 'wave-workspace-a',
      planRevision: run.planRevision,
      changedPaths: [],
    });
    assert.equal(resolved.rejection, undefined);
    cp.assertAttemptLineage(resolved.attempt, {
      runId,
      stepId: executable.steps[0].stepId,
      attemptId: bound.attemptId,
      bindingId: bound.bindingId,
      capsuleId: 'capsule-wave-a',
      provenanceKind: 'routed',
      planRevision: run.planRevision,
      mutationRevision: run.mutationRevision,
    });
    const finished = cp.stateStore.finishStepAttempt(bound.id, {
      status: 'passed',
      verificationRefs: ['evidence://wave/attempt'],
    });
    const resultReceipt = buildStepResultReceipt({
      run,
      wave,
      step: executable.steps[0],
      attempt: bound,
      baseCommitSha: 'base-sha',
      resultWorkspaceIdentity: run.currentWorkspaceIdentity,
      resultCommitSha: 'result-sha',
      patchDigest: `sha256:${'c'.repeat(64)}`,
    });
    assert.equal(resultReceipt.attemptId, bound.attemptId);
    assert.equal(finished.status, 'passed');
    assert.equal(finished.attemptId, bound.attemptId);
    assert.equal(finished.waveId, wave.waveId);
  } finally {
    await cleanup(fixture);
  }
});

test('a provider crash leaves the dispatched attempt interrupted with a failed usage receipt', async () => {
  const fixture = await setup('r-provider-crash', SIMPLE_CONTRACT);
  try {
    const { controlPlane: cp, runId } = fixture;
    const adapter = createClaudeAdapter({ launch: async () => { throw new Error('provider crashed'); } });
    const result = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry: createModelRegistry({ surface: 'claude', env: { MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' } }),
      actionContext: { executionMode: 'native-subagent', delegationRequested: true },
    });
    assert.equal(result.dispatched, true);
    assert.equal(result.receipt.resultStatus, 'failed');
    const attempt = cp.stateStore.getStepAttemptByAttemptId(result.attemptId, { runId });
    assert.equal(attempt.status, 'interrupted');
    assert.equal(attempt.usageReceiptId, result.receipt.receiptId);
    assert.equal(attempt.failureCategory, 'provider/infrastructure');
  } finally {
    await cleanup(fixture);
  }
});

test('a Wave provider crash records failed usage and preserves interrupted lineage', async () => {
  const fixture = await setup('r-wave-provider-crash', WAVE_CONTRACT);
  try {
    const { controlPlane: cp, runId } = fixture;
    const executable = cp.getExecutableSteps(runId);
    const run = cp.stateStore.getRun(runId);
    const wave = await cp.beginWave(runId, executable.steps, {
      baseCommitSha: 'base-sha',
      baseMutationRevision: run.mutationRevision,
      baseWorkspaceIdentity: run.currentWorkspaceIdentity,
      integrationCommandRef: 'test:ok',
      approvalSource: 'operator-policy:test',
      workerLimit: 2,
    });
    const adapter = createClaudeAdapter({ launch: async () => { throw new Error('wave provider crashed'); } });
    const registry = createModelRegistry({ surface: 'claude', env: { MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' } });
    const workspace = {
      workspaceId: run.workspaceId,
      workspaceRoot: fixture.projectRoot,
      baseWorkspaceIdentity: run.currentWorkspaceIdentity,
    };
    const outcome = await dispatchKernelStep({
      controlPlane: cp,
      runId,
      waveId: wave.waveId,
      step: executable.steps[0],
      workspace,
      adapter,
      hostCapabilities: adapter.capabilities,
      parentSessionId: 'wave-parent',
      actionContext: { executionMode: 'native-subagent', delegationRequested: true },
      prepareDispatch: ({ hosted, step }) => prepareWayfinderWorkerDispatch({
        controlPlane: cp,
        runId,
        adapter,
        hosted,
        step,
        registry,
        runtimeHome: fixture.runtimeHome,
        env: { ...process.env, MOON_RELAY_KERNEL_WAYFINDER_MODE: 'off' },
      }),
    });
    assert.equal(outcome.status, 'failed');
    const attempt = cp.stateStore.getStepAttemptByAttemptId(outcome.attempt.attemptId, { runId });
    assert.equal(attempt.status, 'interrupted');
    assert.equal(attempt.failureCategory, 'provider/infrastructure');
    const usage = cp.stateStore.listModelUsageReceipts(runId).at(-1);
    assert.equal(usage.resultStatus, 'failed');
    assert.equal(usage.attemptId, attempt.attemptId);
  } finally {
    await cleanup(fixture);
  }
});

test('a routed review receipt links reviewer usage to the step and implementer attempt', async () => {
  const fixture = await setup('r-review-attempt', REVIEW_CONTRACT);
  try {
    const { controlPlane: cp, runId } = fixture;
    const registry = createModelRegistry({
      surface: 'claude',
      env: {
        MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value',
        MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier',
      },
    });
    const adapter = createClaudeAdapter({ launch: async ({ invocation }) => ({ resolvedModel: invocation.model, sessionId: `${invocation.subagent}-session` }) });
    const implementation = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry,
      actionContext: { executionMode: 'native-subagent', delegationRequested: true },
    });
    await writeFile(path.join(fixture.projectRoot, 'app.mjs'), 'export const value = 1;\n');
    const report = await cp.report(runId, {
      stepId: implementation.receipt.stepId,
      attemptId: implementation.attemptId,
      bindingId: implementation.receipt.bindingId,
      capsuleId: implementation.receipt.capsuleId,
      changedPaths: ['app.mjs'],
      verifications: [
        { obligationId: 'unit-test', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] },
        { obligationId: 'static-analysis', commandRef: 'lint' },
      ],
    });
    assert.equal((await cp.getRun(runId)).state, 'PROVE', JSON.stringify(report.failures));

    const review = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry,
      actionContext: {
        actionKind: 'review_engineering',
        obligationId: 'security-review',
        executionMode: 'native-subagent',
        delegationRequested: true,
      },
    });
    const reviewResult = await cp.recordReview(runId, {
      stage: 'engineering',
      verdict: 'pass',
      reviewerId: review.receipt.actorSessionId,
      findings: [],
    }, {
      implementerId: implementation.receipt.actorSessionId,
      reviewReceiptId: review.receipt.receiptId,
      obligationId: 'security-review',
      changedPaths: ['app.mjs'],
      acceptanceCoverage: [],
    });
    assert.equal(reviewResult.reviewReceipt.stepId, implementation.receipt.stepId);
    assert.equal(reviewResult.reviewReceipt.reviewerBindingId, review.receipt.bindingId);
    assert.equal(reviewResult.reviewReceipt.implementerAttemptId, implementation.attemptId);
    assert.equal(cp.stateStore.getStepAttemptByAttemptId(implementation.attemptId, { runId }).attemptId, implementation.attemptId);
  } finally {
    await cleanup(fixture);
  }
});
