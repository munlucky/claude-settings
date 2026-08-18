import { runGit } from '../../lib/git-safe.mjs';
import path from 'node:path';
import { observeWorkspaceIdentity } from '../../kernel/run/workspace-identity.mjs';
import { resolveWayfinderAdmission, normalizeHostCapabilities } from '../../kernel/run/active-wave.mjs';
import { prepareWaveWorkspaces, createStepResultCommit, canUseWayfinderWorkspace, cleanupWaveWorkspaces } from '../../kernel/workspace/step-worktree-manager.mjs';
import { buildStepResultReceipt, digestPatch } from '../../kernel/run/wave-receipts.mjs';
import { integrateWave } from '../../kernel/run/integration-coordinator.mjs';
import { executeTrustedProof } from '../../kernel/proof/proof-executor.mjs';
import { buildUsageReceipt } from './usage-receipt.mjs';

const baseCommit = (repoRoot) => {
  const result = runGit(repoRoot, ['rev-parse', '--verify', 'HEAD']);
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || '').trim();
};

export const hostSupportsWayfinder = (capabilities = {}) => {
  const normalized = normalizeHostCapabilities(capabilities);
  return Object.values(normalized).every(Boolean);
};

const fallback = async ({ sequentialDispatcher, reason, context }) => {
  if (typeof sequentialDispatcher === 'function') return sequentialDispatcher(context);
  return { schemaVersion: 1, dispatched: false, fallback: true, reason };
};

const dispatchDefaultStep = async ({ adapter, hosted, dispatchContext = null, workspace, parentSessionId, waveId, step, env = process.env }) => {
  if (!adapter?.dispatch) throw new Error('Wayfinder adapter requires dispatch');
  const context = dispatchContext || hosted;
  if (!context.resolution) throw Object.assign(new Error('Wayfinder worker dispatch requires an admitted model resolution'), { code: 'WORKER_ROUTE_UNRESOLVED' });
  const capsule = context.executionCapsule
    ? {
      ...context.executionCapsule,
      permissions: { ...context.executionCapsule.permissions, canCommit: false, canDelegate: false },
    }
    : null;
  return adapter.dispatch({
    decision: context.decision || context.hostDirective?.modelRouteDecision || hosted.hostDirective?.modelRouteDecision || {},
    resolution: context.resolution,
    strategy: context.strategy || context.hostDirective?.enforcementStrategy || hosted.hostDirective?.enforcementStrategy || 'isolated',
    executionCapsule: context.modelVisibleCapsule || capsule,
    executionContract: context.executionContract || hosted.executionContract || {
      objective: step.objective,
      role: 'worker',
      permissions: { filesystem: 'workspace_write', canCommit: false, canDelegate: false },
      action: { type: 'implement', guidance: step.objective },
    },
    envelope: context.envelope || hosted.envelope || null,
    workingDirectory: workspace.workspaceRoot,
    environment: {
      ...env,
      MOON_RELAY_KERNEL_RUN_ID: context.runId || hosted.runId || step.runId,
      MOON_RELAY_KERNEL_WAVE_ID: waveId,
      MOON_RELAY_KERNEL_STEP_ID: step.stepId,
      MOON_RELAY_KERNEL_WORKSPACE_ID: workspace.workspaceId,
      MOON_RELAY_KERNEL_SESSION_ID: context.actorSessionId || hosted.actorSessionId || `worker:${step.stepId}`,
    },
    parentSessionId,
    concurrencyGroup: waveId,
    childSession: { parentSessionId, maxNestedAgents: 0, canDelegate: false, canCommit: false },
  });
};

export const dispatchKernelStep = async ({
  controlPlane,
  runId,
  waveId,
  step,
  workspace,
  adapter,
  hostCapabilities,
  parentSessionId = null,
  actionContext = {},
  dispatchStep = null,
  prepareDispatch = null,
  env = process.env,
} = {}) => {
  let boundAttempt = null;
  if (controlPlane?.bindStepAttempt) {
    boundAttempt = await controlPlane.bindStepAttempt(runId, waveId, step.stepId, {
      actorSessionId: `${parentSessionId || 'parent'}:worker:${step.stepId}`,
      workspaceId: workspace.workspaceId,
      workspaceIdentity: workspace.baseWorkspaceIdentity,
      baseWorkspaceIdentity: workspace.baseWorkspaceIdentity,
    });
  }
  const hosted = controlPlane?.hostNext
    ? await controlPlane.hostNext(runId, {
      hostCapabilities,
      actionContext: {
        ...actionContext,
        stepId: step.stepId,
        attemptId: boundAttempt?.attemptId || null,
        waveId,
        workingDirectory: workspace.workspaceRoot,
        workspaceId: workspace.workspaceId,
        workspaceIdentity: workspace.baseWorkspaceIdentity,
        parentSessionId,
      },
    })
    : { runId, executionCapsule: null, hostDirective: {}, modelInput: { action: { type: 'implement' } } };
  if (hosted.status === 'not_found') return { status: 'failed', failureCode: 'run-not-found', hosted };
  if (boundAttempt && hosted.executionCapsule && controlPlane?.updateStepAttempt) {
    await controlPlane.updateStepAttempt(boundAttempt.id, {
      capsuleId: hosted.executionCapsule.capsuleId,
      capsuleDigest: hosted.executionCapsule.provenance?.capsuleDigest || null,
    });
  }
  const dispatchContext = typeof prepareDispatch === 'function'
    ? await prepareDispatch({ hosted, step, workspace, waveId, parentSessionId })
    : null;
  if (dispatchContext?.status === 'failed') return { status: 'failed', failureCode: dispatchContext.failureCode || 'worker-route-rejected', hosted, dispatchContext, attempt: boundAttempt };
  if (!dispatchContext && typeof dispatchStep !== 'function') {
    return { status: 'failed', failureCode: 'worker-route-unresolved', hosted, attempt: boundAttempt };
  }
  let result;
  try {
    result = await (typeof dispatchStep === 'function'
      ? dispatchStep({ hosted, dispatchContext, adapter, step, workspace, waveId, parentSessionId })
      : dispatchDefaultStep({ adapter, hosted, dispatchContext, workspace, parentSessionId, waveId, step, env }));
  } catch (error) {
    // A provider crash is still a completed Kernel observation. Preserve the
    // failed usage receipt and let the shared failure path retain the attempt
    // as interrupted instead of losing the worker lineage at the adapter edge.
    result = {
      status: 'failed',
      resultStatus: 'failed',
      errorSummary: error?.message || String(error),
      failureCategory: 'provider/infrastructure',
    };
  }
  const usageContext = dispatchContext || hosted;
  const usageDecision = usageContext.decision || usageContext.hostDirective?.modelRouteDecision || hosted.hostDirective?.modelRouteDecision;
  const usageAttempt = boundAttempt || usageContext.hostDirective?.attempt || null;
  if (usageDecision && usageContext.resolution && usageContext.admission && controlPlane?.recordModelUsage) {
    const usageReceipt = buildUsageReceipt({
      decision: usageDecision,
      capabilities: hostCapabilities,
      strategy: usageContext.strategy || usageContext.hostDirective?.enforcementStrategy || 'unsupported',
      resolution: usageContext.resolution,
      dispatch: result || {},
      capsule: usageContext.executionCapsule || hosted.executionCapsule || null,
      admission: usageContext.admission,
      attemptId: usageAttempt?.attemptId || usageContext.hostDirective?.attemptId || null,
      bindingId: usageAttempt?.bindingId || null,
      actorSessionId: result?.actorSessionId || `${hostCapabilities.surface}:${usageDecision.decisionId}`,
      parentSessionId,
      startedAt: result?.startedAt || null,
      finishedAt: result?.finishedAt || new Date().toISOString(),
      envelope: usageContext.envelope || hosted.envelope || null,
    });
    await controlPlane.recordModelUsage(runId, usageReceipt);
  }
  let reportResult = null;
  const workerReport = result?.report || result?.kernelReport || null;
  if (workerReport && controlPlane?.report) {
    reportResult = await controlPlane.report(runId, {
      ...workerReport,
      stepId: step.stepId,
      waveId,
      attemptId: boundAttempt?.attemptId || workerReport.attemptId,
      capsuleId: hosted.executionCapsule?.capsuleId || workerReport.capsuleId,
      workspaceId: workspace.workspaceId,
      bindingId: boundAttempt?.bindingId || workerReport.bindingId,
      actorSessionId: boundAttempt?.actorSessionId || workerReport.actorSessionId,
    });
  }
  const workerCompleted = ['passed', 'completed', 'success'].includes(result?.status || result?.resultStatus);
  const reportAccepted = reportResult?.step?.state === 'passed';
  const failureCode = !workerReport
    ? 'worker-report-missing'
    : !reportResult
      ? 'worker-report-unprocessed'
      : !reportAccepted
        ? reportResult.status || 'worker-report-not-passed'
        : null;
  return {
    status: workerCompleted && reportAccepted ? 'passed' : 'failed',
    failureCode,
    result,
    reportResult,
    hosted,
    dispatchContext,
    attempt: boundAttempt,
  };
};

export const dispatchKernelWave = async ({
  controlPlane,
  runId,
  adapter,
  projectRoot,
  runtimeHome,
  stateStore = null,
  parentSessionId = null,
  env = process.env,
  sequentialDispatcher = null,
  dispatchStep = null,
  prepareDispatch = null,
  executeIntegrationVerification = null,
  now = () => new Date().toISOString(),
} = {}) => {
  const executable = await controlPlane.getExecutableSteps(runId);
  const run = controlPlane.getRun ? controlPlane.getRun(runId) : stateStore?.getRun(runId);
  const repoRoot = projectRoot || controlPlane.projectRoot;
  const capabilities = adapter?.capabilities || {};
  const gitCheck = repoRoot ? canUseWayfinderWorkspace(repoRoot) : { ready: false, reason: 'project-root-missing' };
  const admission = resolveWayfinderAdmission({
    run,
    steps: executable.steps || [],
    commands: controlPlane.discoverProjectCommands ? controlPlane.discoverProjectCommands() : [],
    hostCapabilities: capabilities,
    git: gitCheck,
    maxWorkers: executable.steps?.length || 2,
  });
  if (!admission.admitted || !hostSupportsWayfinder(capabilities)) {
    return fallback({ sequentialDispatcher, reason: admission.reasons[0] || 'wayfinder-unavailable', context: { runId, executable, admission } });
  }
  const base = baseCommit(repoRoot);
  if (!base) return fallback({ sequentialDispatcher, reason: 'head-unavailable', context: { runId, executable } });
  const deliveryIdentity = observeWorkspaceIdentity({ projectRoot: repoRoot }).identity;
  const wave = controlPlane.beginWave
    ? await controlPlane.beginWave(runId, executable.steps, {
      baseCommitSha: base,
      baseMutationRevision: run.mutationRevision,
      baseWorkspaceIdentity: deliveryIdentity,
      integrationCommandRef: admission.integrationCommandRef,
      approvalSource: admission.approvalSource,
      workerLimit: admission.workerLimit,
    })
    : { waveId: `wave-${runId}`, runId, planRevision: run.planRevision, baseCommitSha: base, baseMutationRevision: run.mutationRevision, baseWorkspaceIdentity: deliveryIdentity, integrationCommandRef: admission.integrationCommandRef };
  let workspaces;
  try {
    workspaces = await prepareWaveWorkspaces({
      repoRoot,
      baseCommit: base,
      runId,
      waveId: wave.waveId,
      projectId: run.projectId,
      runtimeHome,
      stateStore,
      steps: executable.steps || [],
    });
  } catch (error) {
    if (controlPlane.abortWave) await controlPlane.abortWave(runId, wave.waveId, error.code || 'worktree-preparation-failed');
    return fallback({ sequentialDispatcher, reason: 'worktree-preparation-failed', context: { runId, wave, error } });
  }
  if (controlPlane.updateWave) await controlPlane.updateWave(runId, wave.waveId, { status: 'dispatching' });
  const workspaceByStep = new Map(workspaces.steps.map((workspace) => [workspace.stepId, workspace]));
  const dispatched = await Promise.allSettled((executable.steps || []).map(async (step) => {
    const workspace = workspaceByStep.get(step.stepId);
    const outcome = await dispatchKernelStep({ controlPlane, runId, waveId: wave.waveId, step, workspace, adapter, hostCapabilities: capabilities, parentSessionId, dispatchStep, prepareDispatch, env });
    if (outcome.status !== 'passed' && outcome.status !== 'completed' && outcome.status !== 'success') {
      if (controlPlane.failStepAttempt) await controlPlane.failStepAttempt(runId, wave.waveId, step.stepId, { code: outcome.failureCode || 'worker-failed' });
      return { step, workspace, outcome, status: 'failed' };
    }
    const commit = createStepResultCommit({ workspaceRoot: workspace.workspaceRoot, runId, waveId: wave.waveId, stepId: step.stepId, attemptNumber: step.attemptCount + 1 });
    const resultIdentity = observeWorkspaceIdentity({ projectRoot: workspace.workspaceRoot }).identity;
    const receipt = buildStepResultReceipt({
      run,
      wave,
      step,
      attempt: outcome.attempt || { id: `${step.stepId}:1`, actorSessionId: outcome.hosted?.actorSessionId },
      executionWorkspaceId: workspace.workspaceId,
      baseCommitSha: base,
      baseWorkspaceIdentity: wave.baseWorkspaceIdentity,
      resultWorkspaceIdentity: resultIdentity,
      changedPaths: commit.changedPaths,
      resultCommitSha: commit.commitSha,
      patchDigest: commit.patch ? digestPatch(commit.patch) : null,
      status: 'passed',
      now: now(),
    });
    if (controlPlane.recordStepResult) await controlPlane.recordStepResult(runId, wave.waveId, step.stepId, receipt);
    return { step, workspace, outcome, receipt, status: 'passed' };
  }));
  for (let index = 0; index < dispatched.length; index += 1) {
    if (dispatched[index].status === 'rejected' && controlPlane.failStepAttempt) {
      await controlPlane.failStepAttempt(runId, wave.waveId, executable.steps[index].stepId, { code: dispatched[index].reason?.code || 'worker-dispatch-failed' });
    }
  }
  const fulfilled = dispatched.filter((entry) => entry.status === 'fulfilled' && entry.value.status === 'passed').map((entry) => entry.value);
  const rejected = dispatched.filter((entry) => entry.status === 'rejected' || entry.value?.status !== 'passed');
  if (rejected.length > 0 || fulfilled.length !== executable.steps.length) {
    if (controlPlane.failWave) await controlPlane.failWave(runId, wave.waveId, 'worker-failed');
    return { schemaVersion: 1, runId, waveId: wave.waveId, dispatched: true, status: 'failed', workerResults: dispatched };
  }
  if (controlPlane.beginIntegration) await controlPlane.beginIntegration(runId, wave.waveId);
  const integrationRunner = executeIntegrationVerification || (async ({ commandRef, workspaceRoot }) => {
    const execution = executeTrustedProof({
      projectRoot: workspaceRoot,
      commandRef,
      evidenceDir: path.join(runtimeHome, 'evidence', run.projectId, runId, 'integration', wave.waveId),
    });
    return {
      status: execution.status,
      passed: execution.status === 'passed',
      verificationRef: execution.evidenceRef,
      evidenceRef: execution.evidenceRef,
      execution,
    };
  });
  const integration = await integrateWave({
    stateStore,
    run,
    wave,
    steps: executable.steps,
    stepResults: fulfilled.map((entry) => entry.receipt),
    integrationWorkspace: workspaces.integration,
    deliveryWorkspace: { workspaceRoot: repoRoot },
    integrationVerification: executable.integrationVerification,
    executeIntegrationVerification: integrationRunner,
    now: now(),
  });
  let cleanup = null;
  if (integration.status === 'integrated' && controlPlane.completeWave) {
    await controlPlane.completeWave(runId, wave.waveId, integration.receipt);
    cleanup = await cleanupWaveWorkspaces({ runtimeHome, projectId: run.projectId, runId, waveId: wave.waveId, repoRoot, retain: false });
  }
  if (integration.status !== 'integrated' && controlPlane.failWave) await controlPlane.failWave(runId, wave.waveId, integration.failureCode || 'integration-failed');
  return { schemaVersion: 1, runId, waveId: wave.waveId, dispatched: true, status: integration.status, workerResults: fulfilled, integration, cleanup };
};

export const dispatchKernelRun = async (options = {}) => {
  const executable = await options.controlPlane.getExecutableSteps(options.runId);
  if ((executable.steps || []).length < 2 || executable.mode !== 'parallel') {
    return fallback({ sequentialDispatcher: options.sequentialDispatcher, reason: executable.reason || 'sequential-fast-path', context: { runId: options.runId, executable } });
  }
  return dispatchKernelWave(options);
};
