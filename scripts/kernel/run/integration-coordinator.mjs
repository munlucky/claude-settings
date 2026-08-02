import { runGit } from '../../lib/git-safe.mjs';
import { observeWorkspaceIdentity } from './workspace-identity.mjs';
import { buildIntegrationReceipt, digestPatch, sortStepResults, validateStepResultReceipt } from './wave-receipts.mjs';

const fail = (code, message, detail = {}) => Object.assign(new Error(message), { code, detail });

const git = (root, args) => {
  const result = runGit(root, args, { maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw fail('INTEGRATION_GIT_FAILED', String(result.stderr || '').trim() || `git ${args[0]} failed`, { args, status: result.status });
  return String(result.stdout || '');
};

const changedPaths = (root) => git(root, ['diff', '--name-only', '--cached', '--']).split(/\r?\n/u).filter(Boolean).map((path) => path.replaceAll('\\', '/')).sort();

const assertBase = (workspaceRoot, baseCommit) => {
  const head = git(workspaceRoot, ['rev-parse', 'HEAD']).trim();
  if (head !== baseCommit) throw fail('integration-base-drift', `Integration workspace is based on ${head}, expected ${baseCommit}`);
};

const assertCleanDelivery = (workspaceRoot) => {
  const status = git(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all']).trim();
  if (status) throw fail('delivery-workspace-drift', 'Delivery workspace is no longer clean');
};

export const integrateWave = async ({
  stateStore = null,
  run,
  wave,
  steps = [],
  stepResults = [],
  integrationWorkspace,
  deliveryWorkspace,
  executeIntegrationVerification = null,
  integrationVerification = null,
  attempt = 1,
  now = new Date().toISOString(),
} = {}) => {
  if (!run || !wave || !integrationWorkspace?.workspaceRoot || !deliveryWorkspace?.workspaceRoot) {
    throw fail('integration-input-invalid', 'run, wave, integration workspace, and delivery workspace are required');
  }
  const ordered = sortStepResults(stepResults, steps);
  const preIntegrationIdentity = observeWorkspaceIdentity({ projectRoot: integrationWorkspace.workspaceRoot }).identity;
  const expectedDeliveryIdentity = wave.baseWorkspaceIdentity;
  const currentDeliveryIdentity = observeWorkspaceIdentity({ projectRoot: deliveryWorkspace.workspaceRoot }).identity;
  if (expectedDeliveryIdentity && currentDeliveryIdentity !== expectedDeliveryIdentity) {
    throw fail('integration_base_drift', 'Delivery workspace changed after the wave started');
  }

  try {
    assertBase(integrationWorkspace.workspaceRoot, wave.baseCommitSha);
    for (const result of ordered) {
      if (!result.resultCommitSha) throw fail('step-result-commit-missing', `Step ${result.stepId} has no result commit`);
      const step = steps.find((candidate) => candidate.stepId === result.stepId);
      if (!step) throw fail('step-result-step-missing', `Step ${result.stepId} is not part of the Wave`);
      const receiptCheck = validateStepResultReceipt(result, {
        runId: run.runId,
        waveId: wave.waveId,
        stepId: step.stepId,
        baseCommitSha: wave.baseCommitSha,
        allowedPaths: step.allowedPaths || [],
        forbiddenPaths: step.forbiddenPaths || [],
      });
      if (!receiptCheck.valid) throw fail('step-result-receipt-invalid', `Step ${result.stepId} receipt is invalid`, receiptCheck);
      // The coordinator is deliberately not a merge agent. A conflict aborts
      // the transaction and becomes a replan/integration-fix signal.
      git(integrationWorkspace.workspaceRoot, ['cherry-pick', '--no-commit', result.resultCommitSha]);
    }
    const integratedPaths = changedPaths(integrationWorkspace.workspaceRoot);
    const declaredPaths = [...new Set(ordered.flatMap((result) => result.changedPaths || []))].sort();
    if (JSON.stringify(integratedPaths) !== JSON.stringify(declaredPaths)) {
      throw fail('integration-path-mismatch', 'Integrated diff does not match the Step Result receipts', { integratedPaths, declaredPaths });
    }
    const integrationIdentity = observeWorkspaceIdentity({ projectRoot: integrationWorkspace.workspaceRoot }).identity;
    let verification = null;
    if (typeof executeIntegrationVerification === 'function') {
      verification = await executeIntegrationVerification({
        commandRef: integrationVerification?.commandRef || wave.integrationCommandRef,
        workspaceRoot: integrationWorkspace.workspaceRoot,
        run,
        wave,
      });
    } else {
      throw fail('integration-verification-runner-missing', 'Kernel did not receive an integration verification runner');
    }
    if (!verification || verification.status === 'failed' || verification.passed === false) {
      throw fail('integration-verification-failed', 'Integration verification failed', { verification });
    }

    assertCleanDelivery(deliveryWorkspace.workspaceRoot);
    const patch = git(integrationWorkspace.workspaceRoot, ['diff', '--cached', '--binary', wave.baseCommitSha]);
    if (patch) {
      const check = runGit(deliveryWorkspace.workspaceRoot, ['apply', '--check', '--binary', '-'], { input: patch, maxBuffer: 64 * 1024 * 1024 });
      if (check.error || check.status !== 0) throw fail('delivery-patch-check-failed', String(check.stderr || '').trim() || 'git apply --check failed');
      const apply = runGit(deliveryWorkspace.workspaceRoot, ['apply', '--binary', '-'], { input: patch, maxBuffer: 64 * 1024 * 1024 });
      if (apply.error || apply.status !== 0) throw fail('delivery-materialization-failed', String(apply.stderr || '').trim() || 'git apply failed');
    }
    const deliveryIdentity = observeWorkspaceIdentity({ projectRoot: deliveryWorkspace.workspaceRoot }).identity;
    const resultMutationRevision = Number(wave.baseMutationRevision || run.mutationRevision || 0) + 1;
    const receipt = buildIntegrationReceipt({
      run,
      wave,
      stepResults: ordered,
      applyOrder: ordered.map((result) => result.stepId),
      preIntegrationIdentity,
      postIntegrationIdentity: integrationIdentity,
      deliveryWorkspaceIdentity: deliveryIdentity,
      integrationWorkspaceIdentity: integrationIdentity,
      integrationVerificationRef: verification.verificationRef || verification.evidenceRef || null,
      deliveryPatchDigest: digestPatch(patch),
      resultMutationRevision,
      status: 'integrated',
      attempt,
      now,
    });
    if (stateStore?.recordWaveIntegrationReceipt) stateStore.recordWaveIntegrationReceipt(receipt);
    if (stateStore?.observeWorkspaceIdentity) stateStore.observeWorkspaceIdentity(run.runId, deliveryIdentity);
    return { status: 'integrated', receipt, patch, changedPaths: integratedPaths };
  } catch (error) {
    // No reset is used. If cherry-pick has entered a conflict state, abort only
    // the generated Integration Worktree transaction; the Delivery Workspace
    // remains untouched and the worktree is retained for diagnosis/replan.
    runGit(integrationWorkspace.workspaceRoot, ['cherry-pick', '--abort']);
    const failureCode = error.code === 'INTEGRATION_GIT_FAILED' ? 'integration-conflict' : (error.code || 'integration-failed');
    const receipt = buildIntegrationReceipt({
      run,
      wave,
      stepResults: ordered,
      applyOrder: ordered.map((result) => result.stepId),
      preIntegrationIdentity,
      integrationVerificationRef: integrationVerification?.commandRef || wave.integrationCommandRef,
      deliveryPatchDigest: null,
      resultMutationRevision: null,
      status: failureCode,
      attempt,
      now,
    });
    if (stateStore?.recordWaveIntegrationReceipt) stateStore.recordWaveIntegrationReceipt(receipt);
    return { status: 'failed', failureCode, error, receipt };
  }
};
