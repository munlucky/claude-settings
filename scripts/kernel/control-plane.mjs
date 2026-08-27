import { createHash } from 'node:crypto';
import path from 'node:path';
import { openKernelStateStore } from './state-store.mjs';
import { buildContextReceipt } from './context-build.mjs';
import { resolveProofRoute } from './proof-route.mjs';
import { planDryRunWave } from './wave-plan.mjs';
import { planBoundedWaves } from './run/bounded-wave.mjs';
import { detectStagnation } from './run/stagnation.mjs';
import { recommendModelRouting, resolveModelRoute } from './run/model-routing.mjs';
import { buildActorAssignmentId, normalizeHostCapabilities, resolveEnforcementStrategy, summarizeModelRouting } from './run/model-route-contract.mjs';
import { buildReleaseEvidencePack } from './evidence-pack.mjs';
import { projectRunState } from './state-projector.mjs';
import { resolveKernelRuntimeHome } from './runtime-home.mjs';
import { KERNEL_POLICY, KernelPrinciplesError, loadKernelPrinciples } from './policy.mjs';
import { resolveKernelCapabilities } from './capability-resolver.mjs';
import { buildCandidateIdentity, gitTreeDigest, sha256Hex } from '../lib/candidate-identity.mjs';
import { resolveKernelProjectIdentity } from './project-identity.mjs';
import { ensureKnowledgeStoreDirectories } from './knowledge/store.mjs';
import { buildProjectKnowledgeContext } from './knowledge/context-load.mjs';
import { retryGitCloseout as retryGitCloseoutHelper } from './git/closeout.mjs';
import { finalizeRun, recordKnowledgeObservations } from './run/finalization.mjs';
import { normalizeChangedContract } from './change-contract.mjs';
import { observeWorkspaceIdentity } from './run/workspace-identity.mjs';
import { executeTrustedProof, executeApprovedProof, executeWithFlakyRerun, UntrustedCommandError, CommandApprovalRequiredError } from './proof/proof-executor.mjs';
import { NetworkPolicyUnenforceableError } from './proof/network-policy.mjs';
import { buildNextPayload, normalizeReport, planStatePath, planRouteSteps } from './run/run-loop.mjs';
import { detectProjectMode } from './task/project-mode.mjs';
import {
  normalizeTaskContract,
  applyEvidencePlans,
  assertEvidencePlanSubmission,
  normalizeAcceptanceCoverage,
  mergeContractRevisionWithBindings,
  contractBriefing,
  riskSummaryFromContract,
} from './task/task-contract.mjs';
import {
  compileRunObligations,
  assertCommandBinding,
  assertVerificationSupport,
  ObligationBindingError,
} from './run/obligation-compiler.mjs';
import { discoverProjectCommands } from './proof/command-catalog.mjs';
import { needsShape } from './route.mjs';
import { resolveHostSessionHolder, REPORT_LEASE_TTL_MS, SESSION_LEASE_TTL_MS } from './run/session-holder.mjs';
import { planWalkingSkeleton } from './task/greenfield-bootstrap.mjs';
import { buildImpactAnalysis } from './task/migration-workflow.mjs';
import { resolveReviewPlan, normalizeReviewVerdict, assertIndependentReview, assertIndependentReviewSession, classifyReviewFindings } from './proof/review-pipeline.mjs';
import { digestOfEvidence, digestOfPaths, evaluateReviewReceipt, reviewEvidenceRef } from './proof/review-receipt.mjs';
import { isProtectedObligation } from './proof/protected-obligations.mjs';
import { hashSessionId } from './run/model-route-contract.mjs';
import { scanRepositoryEvidence } from './task/evidence-scan.mjs';
import { allStepsPassed } from './run/run-step-ledger.mjs';
import { planRunSteps } from './run/step-planner.mjs';
import { createWorkCursorApi } from './run/work-cursor.mjs';
import { admitRoute, admissionAllowsDispatch } from './routing/route-admission.mjs';
import { captureBaselineProof } from './proof/baseline-proof.mjs';
import { classifyFailures } from './proof/failure-classify.mjs';
import { computeCompletionView } from './run/completion-view.mjs';
import { assertMutationAllowed } from './run/mutation-guard.mjs';
import { assertRequiredHostCapabilities } from './run/required-host-capabilities.mjs';
import { assertBoundRunAccess, bindingErrorPayload } from './run/binding-preflight.mjs';
import { normalizeSessionBinding } from './run/session-binding.mjs';
import { canonicalizeHostSessionId } from './run/host-session.mjs';
import { resolveBoundInvocation as resolveInvocation } from './run/invocation-resolver.mjs';
import { buildSuccessorKey } from './run/successor-key.mjs';
import { registerWorkspace } from './run/workspace-registration.mjs';
import { resolveRunArtifactPaths } from './artifact-paths.mjs';
import { buildStructuredRunSignals, failureFingerprint } from './knowledge/capture.mjs';
import { buildEvidenceIdentity, buildEvidenceReuseReceipt } from './proof/evidence-reuse.mjs';

export const computeKernelSourceIdentity = ({ projectRoot = process.cwd(), objective = '', taskContract = {} } = {}) => {
  const sourceDigest = gitTreeDigest(projectRoot) || sha256Hex({ projectRoot, objective });
  return buildCandidateIdentity({
    profile: 'kernel',
    source: sourceDigest,
    task: objective,
    spec: taskContract.spec || taskContract.acceptance || taskContract.acceptanceCriteria || [],
    environment: `${process.platform}:${process.arch}:${process.version}`,
    policy: 'moon-relay-kernel.v1',
  }).candidateId;
};

const observed = (value) => ({ status: 'observed', value });
const unavailable = (reason) => ({ status: 'unavailable', reason });

// Provider usage becomes observable only when the Host files receipts. Without
// them the fields stay `unavailable` — an unmeasured run must never look free.
const providerUsageMeasurement = (receipts = []) => {
  const withTokens = receipts.filter((receipt) => receipt.inputTokens !== null || receipt.outputTokens !== null);
  const models = [...new Set(receipts.map((receipt) => receipt.resolvedModel).filter(Boolean))];
  const durations = receipts.map((receipt) => receipt.wallClockMs).filter((value) => Number.isInteger(value));
  const sum = (key) => withTokens.reduce((total, receipt) => total + (receipt[key] ?? 0), 0);
  return {
    providerModelIdentity: models.length > 0
      ? observed({ models, enforcedTurns: receipts.filter((receipt) => receipt.enforcementStatus === 'enforced').length, turns: receipts.length })
      : unavailable('provider-usage-not-recorded'),
    actualInputTokens: withTokens.length > 0 ? observed({ total: sum('inputTokens'), cached: sum('cachedInputTokens'), reportedTurns: withTokens.length }) : unavailable('provider-usage-not-recorded'),
    actualOutputTokens: withTokens.length > 0 ? observed({ total: sum('outputTokens'), reportedTurns: withTokens.length }) : unavailable('provider-usage-not-recorded'),
    wallClockMs: durations.length > 0 ? observed({ modelTurnsTotalMs: durations.reduce((total, value) => total + value, 0), reportedTurns: durations.length }) : unavailable('run-duration-not-recorded'),
  };
};

export const buildKernelMeasurement = ({ run, completion, principles = loadKernelPrinciples(), verifications = [], attempts = [], routeDecisions = [], usageReceipts = [] }) => ({
  schemaVersion: 2,
  harnessIdentity: 'moon-relay-kernel',
  sourceIdentity: run.sourceIdentity,
  currentWorkspaceIdentity: run.currentWorkspaceIdentity ? observed(run.currentWorkspaceIdentity) : unavailable('workspace-identity-not-observed'),
  hardEvidenceCoverage: observed({
    kernelRuntimePassed: verifications.filter((verification) => verification.executor === 'kernel-runtime' && verification.status === 'passed').length,
    callerAttestedPassed: verifications.filter((verification) => verification.executor !== 'kernel-runtime' && verification.status === 'passed').length,
    total: verifications.length,
    requiredForCompletion: run.mutationRevision > 0,
  }),
  promptTokenBudget: observed({
    stableTokenBudget: KERNEL_POLICY.context.stableTokenBudget,
    stageTokenBudget: KERNEL_POLICY.context.stageTokenBudget,
  }),
  taskIdentity: `task-${createHash('sha256').update(run.objective).digest('hex').slice(0, 16)}`,
  ...providerUsageMeasurement(usageReceipts),
  modelRouting: routeDecisions.length > 0 ? observed(summarizeModelRouting(routeDecisions, usageReceipts)) : unavailable('model-routing-not-recorded'),
  estimatedStaticTokens: Math.ceil(JSON.stringify(principles.principles).length / 4),
  successDecision: observed(completion.decision === 'accepted'),
  falseCompletionDecision: unavailable('false-completion-evaluation-not-run'),
  retryCount: observed(Math.max(0, attempts.length - 1)),
  replanCount: observed(run.replanCount || 0),
  userInterventionCount: observed(run.interventionCount || 0),
  evidenceCoverage: observed({ passed: verifications.filter((verification) => verification.status === 'passed').length, total: verifications.length, required: run.requiredObligations.length }),
  contaminationSignals: observed({ relayStateMutation: false, profileMutation: false, source: 'kernel-runtime-boundary' }),
});

// Model-visible actions carry no routing vocabulary, so the Host maps the one
// action the model was handed onto the action kind the router understands.
const ACTION_FOR_MODEL_ACTION = Object.freeze({
  implement: 'implement',
  fix: 'debug',
  review: 'review_engineering',
  report: 'prove',
  finalize: 'close',
  done: 'close',
  blocked: 'understand',
});

// The route a run follows is fixed at start (P1-1) so SHAPE is never skipped
// for contract/boundary/migration work just because PROVE is reachable sooner.
const refreshedTier = (store, runId) => store.getRun(runId)?.proofTier;

const FINDING_CLASS_RANK = Object.freeze({ critical: 3, important: 2, minor: 1 });

const findingClassOf = (findings = []) => {
  let highest = 'none';
  for (const finding of findings) {
    const severity = typeof finding === 'object' && finding ? finding.severity : 'minor';
    if ((FINDING_CLASS_RANK[severity] || 1) > (FINDING_CLASS_RANK[highest] || 0)) highest = severity in FINDING_CLASS_RANK ? severity : 'minor';
  }
  return highest;
};

// K0: which judgments may not rest on caller-supplied reviewer strings.
const reviewReceiptRequired = ({ obligationId, declared, proofTier, independentReviewRequired = false }) =>
  Boolean(declared?.protected)
  || isProtectedObligation(obligationId)
  || obligationId === 'security-review'
  || independentReviewRequired === true
  || (proofTier === 'T3' && (declared?.evidenceClass || 'hard') === 'judgment');

const buildRunRoute = (contract, riskSummary) => {
  if (contract.taskClass === 'analysis') return ['FRAME', 'CLOSE'];
  if (contract.taskClass === 'long-running' || contract.flags.complex === true) return ['FRAME', 'SHAPE', 'SLICE', 'SCHEDULE', 'EXECUTE', 'PROVE', 'CLOSE'];
  if (needsShape(riskSummary)) return ['FRAME', 'SHAPE', 'EXECUTE', 'PROVE', 'CLOSE'];
  return ['FRAME', 'EXECUTE', 'PROVE', 'CLOSE'];
};

export const resolveDeclaredStepForReplan = (contract, step) => {
  if (!step || !Array.isArray(contract?.steps)) return null;
  const byId = contract.steps.find((entry) => entry.stepId && String(entry.stepId) === step.stepId);
  if (byId) return byId;
  const byObjective = contract.steps.find((entry) => String(entry.objective || '') === String(step.objective || ''));
  if (byObjective) return byObjective;
  return contract.steps[Number(step.sequence) - 1] || null;
};

const stepScopeChanged = (step, declared) => {
  if (!step || !declared) return false;
  const normalized = (value) => [...new Set((Array.isArray(value) ? value : []).map(String))].sort();
  return JSON.stringify(normalized(step.allowedPaths)) !== JSON.stringify(normalized(declared.allowedPaths))
    || JSON.stringify(normalized(step.forbiddenPaths)) !== JSON.stringify(normalized(declared.forbiddenPaths))
    || JSON.stringify(normalized(step.acceptanceIds)) !== JSON.stringify(normalized(declared.acceptanceIds))
    || JSON.stringify(normalized(step.obligationIds)) !== JSON.stringify(normalized(declared.obligationIds));
};

const planDiffersFromContract = (steps = [], declared = []) => {
  if (steps.length !== declared.length) return true;
  return steps.some((step, index) => (
    String(step.objective || '') !== String(declared[index]?.objective || '')
    || stepScopeChanged(step, declared[index])
  ));
};

export const createKernelControlPlane = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome, projectRoot = process.cwd(), holder: holderOption, env = process.env, requireHostBinding = false } = {}) => {
  const store = await openKernelStateStore({ runtimeHome, relayHome });
  let currentProject = resolveKernelProjectIdentity({
    cwd: projectRoot,
    env: { ...env, MOON_RELAY_KERNEL_HOME: runtimeHome },
  });
  // State-store identity roots are persisted in canonical, case-normalized
  // form. Keep a native spelling for mutation fencing without changing the
  // source-root spelling used by source identity and repository evidence.
  const fencingWorkspaceRoot = path.resolve(currentProject.canonicalRoot);
  const identityState = store.inspectProjectIdentity({
    projectId: currentProject.projectId,
    canonicalRoot: currentProject.canonicalRoot,
    legacyCandidates: (currentProject.legacyAliases || []).filter((candidate) => candidate?.projectId),
  });
  const legacyData = identityState.legacyCandidates.filter((candidate) => candidate.hasData);
  if (!identityState.currentIdentity && legacyData.length > 0) {
    store.close();
    throw Object.assign(new Error('project_identity_preflight_required'), {
      code: 'project_identity_preflight_required',
      errorCode: 'project_identity_preflight_required',
      legacyProjectId: legacyData[0].projectId,
      source: legacyData[0].source,
      nextAction: 'kernel identity bootstrap --policy isolate or kernel identity approve --legacy-project-id <id> --approval-ref <operator-ref> --approved-by <operator> then kernel identity repair --legacy-project-id <id> --approval-ref <operator-ref>',
      projectIdentity: {
        status: 'repair_required',
        projectId: currentProject.projectId,
        canonicalRoot: currentProject.canonicalRoot,
        legacyCandidates: legacyData,
        remediation: {
          action: 'choose-isolate-or-adopt',
          isolateCommand: 'kernel identity bootstrap --policy isolate',
          approvalCommand: 'kernel identity approve --legacy-project-id <id> --approval-ref <operator-ref> --approved-by <operator>',
          adoptCommand: 'kernel identity repair --legacy-project-id <id> --approval-ref <operator-ref>',
          reason: 'legacy project data exists without an explicit operator identity-repair decision',
        },
      },
    });
  }
  const persistedIdentity = identityState.currentIdentity || store.registerProjectIdentity({
    ...currentProject,
    legacyProjectIds: [],
    legacyAliases: [],
  });
  currentProject = {
    ...currentProject,
    ...persistedIdentity,
    projectRoot,
    aliases: persistedIdentity.aliases,
  };
  const rawHostSessionId = env.MOON_RELAY_KERNEL_SESSION_ID || null;
  const hostProvider = env.MOON_RELAY_KERNEL_PROVIDER || 'unknown-host';
  const hostSessionId = rawHostSessionId
    ? canonicalizeHostSessionId({ provider: hostProvider, sessionId: rawHostSessionId })
    : null;
  const explicitLegacySessionId = env.MOON_RELAY_KERNEL_LEGACY_SESSION_ID || null;
  const codexLegacySessionId = env.CODEX_THREAD_ID && hostSessionId === `codex:${env.CODEX_THREAD_ID}`
    ? env.CODEX_THREAD_ID
    : null;
  const legacyHostSessionId = explicitLegacySessionId
    || codexLegacySessionId
    || (rawHostSessionId && rawHostSessionId !== hostSessionId && !rawHostSessionId.includes(':')
      ? rawHostSessionId
      : null);
  const holder = resolveHostSessionHolder({
    holder: holderOption,
    env: hostSessionId ? { ...env, MOON_RELAY_KERNEL_SESSION_ID: hostSessionId } : env,
    projectRoot,
  });
  const hostWorkspaceId = env.MOON_RELAY_KERNEL_WORKSPACE_ID || null;
  const registeredWorkspace = registerWorkspace({ stateStore: store, projectId: currentProject.projectId, workspaceRoot: projectRoot });
  if (hostWorkspaceId && hostWorkspaceId !== registeredWorkspace.workspaceId) {
    throw Object.assign(new Error('run_workspace_mismatch'), { code: 'run_workspace_mismatch' });
  }
  const effectiveWorkspaceId = registeredWorkspace.workspaceId;
  // Reconcile terminal bindings and stale mutation locks at the public Kernel
  // lifecycle boundary. Preserve only a completed binding owned by this host
  // so a successor contract can perform its atomic handoff; blocked bindings
  // and terminal bindings from other sessions cannot remain executable.
  store.reconcileTerminalLifecycle({
    projectId: currentProject.projectId,
    preserveSessionId: hostSessionId,
  });
  const getHostBinding = ({ runId = null } = {}) => {
    const canonical = runId
      ? store.getActiveRunBinding({ projectId: currentProject.projectId, sessionId: hostSessionId, runId })
      : store.getActiveOwnerBinding({ projectId: currentProject.projectId, sessionId: hostSessionId });
    if (canonical || !legacyHostSessionId || !hostSessionId) return canonical;
    const migrated = store.migrateLegacySessionBinding({
      projectId: currentProject.projectId,
      legacySessionId: legacyHostSessionId,
      canonicalSessionId: hostSessionId,
      provider: hostProvider,
    });
    if (!migrated || (runId && migrated.runId !== runId)) return null;
    return migrated;
  };
  const preflight = (runId, command) => {
    if (!requireHostBinding) return null;
    const binding = getHostBinding({ runId });
    return assertBoundRunAccess({
      stateStore: store,
      requestedRunId: runId,
      currentProject,
      currentWorkspace: effectiveWorkspaceId,
      sessionId: binding?.sessionId || hostSessionId,
      requiredAccess: command,
      command,
    });
  };

  // Blocking a run closes its owner binding by design. Build the model-visible
  // blocked action directly from persisted state instead of calling the
  // binding-gated `next()` immediately after that transition; otherwise the
  // real blocker is replaced by the secondary `host_binding_missing` error.
  const buildUnboundNextPayload = (runId) => {
    const run = store.getRun(runId);
    if (!run) return { schemaVersion: 1, runId, status: 'not_found' };
    return buildNextPayload({
      run,
      verifications: store.getVerifications(runId),
      requiredObligations: run.requiredObligations,
      obligations: store.getRunObligations(runId),
      contract: run.taskContract ? contractBriefing(run.taskContract) : null,
    });
  };
  const buildBlockedResponse = ({ runId, reason, detail = null }) => ({
    schemaVersion: 1,
    runId,
    status: 'blocked',
    blockedReason: reason,
    blockedDetail: detail,
    next: buildUnboundNextPayload(runId),
  });

  const persistReleaseEvidenceIfNeeded = (runId, updated) => {
    if (updated.evidenceTier !== 'E2') return;
    const pack = buildReleaseEvidencePack({
      objective: updated.objective,
      proofTier: updated.proofTier,
      acceptanceCoverage: updated.acceptanceCriteria,
      acceptance: updated.acceptanceCriteria,
      scope: [projectRoot],
      completionDecision: 'pending',
      checks: store.getVerifications(runId),
    });
    const digest = `sha256:${createHash('sha256').update(JSON.stringify({ pack, mutationRevision: updated.mutationRevision })).digest('hex')}`;
    store.recordEvidencePack(runId, { tier: 'E2', pack, digest, mutationRevision: updated.mutationRevision });
  };

  return {
    // Internal Host hooks. They do not add a model-visible command or stage;
    // the Host uses them to build a Wave behind next/report.
    projectRoot,
    stateStore: store,
    discoverProjectCommands: () => discoverProjectCommands({ projectRoot }),
    // K1 + K2 live in one module: the current work unit and the bounded context
    // it is executed with. Spread as methods so `this` stays the control plane.
    ...createWorkCursorApi({ store, projectRoot, runtimeHome }),

    resolveBoundInvocation({
      explicitRunId = null,
      envRunId = null,
      taskContract = null,
    } = {}) {
      if (!hostSessionId) {
        throw Object.assign(new Error('host_binding_missing'), {
          code: 'host_binding_missing',
          errorCode: 'host_binding_missing',
          nextAction: 'relaunch-through-kernel-host',
        });
      }
      return resolveInvocation({
        stateStore: store,
        projectId: currentProject.projectId,
        provider: hostProvider,
        sessionId: hostSessionId,
        workspaceId: effectiveWorkspaceId,
        explicitRunId,
        envRunId,
        taskContract,
      });
    },

    async startRun({ runId, objective, sourceIdentity, taskContract = {}, hostCapabilities = null } = {}) {
      const trustedSourceIdentity = computeKernelSourceIdentity({ projectRoot, objective: objective || taskContract.objective || 'Kernel execution task', taskContract });
      if (sourceIdentity && sourceIdentity !== trustedSourceIdentity) {
        throw new Error('sourceIdentity is computed by Kernel and cannot be caller-authored');
      }

      // Evidence-plan gate (§8): a structured acceptance criterion without a
      // plan for how it will be proven blocks the run before execution. The
      // normalized contract is what gets persisted, so constraints, non-goals,
      // risks, and evidence plans survive a process restart (P0-4/P0-5).
      const contract = normalizeTaskContract(taskContract, { objective: objective || taskContract.objective });
      if (hostCapabilities) assertRequiredHostCapabilities(contract, hostCapabilities);

      const identity = currentProject;
      const projectId = identity.projectId;
      await ensureKnowledgeStoreDirectories(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
      const knowledgeRevisionStart = String(store.getProjectKnowledgeRevision(projectId));
      const hasKernelKnowledge = store.listKnowledgeRecords({ projectId }).length > 0;
      const projectMode = detectProjectMode({ projectRoot, hasKernelKnowledge });
      const repositoryScan = projectMode.mode === 'greenfield' ? null : scanRepositoryEvidence({ projectRoot });
      const implementationContext = projectMode.mode === 'greenfield'
        ? { walkingSkeleton: planWalkingSkeleton({ projectType: contract.flags?.projectType || 'library', objective: contract.objective, taskContract: contract }) }
        : {
          entrypoints: repositoryScan.entrypoints,
          manifests: repositoryScan.manifests,
          knownCommands: [...repositoryScan.testCommands, ...repositoryScan.buildCommands].map((entry) => entry.commandRef),
          baseline: { status: contract.flags?.baselineRequired ? 'required' : 'deferred' },
        };

      const normalizedChangeSet = normalizeChangedContract(taskContract);

      // Risk carries behaviorChanging through to the tier resolver, so an
      // ordinary behavior change is not left at T0 (P1-1).
      const riskSummary = {
        ...riskSummaryFromContract(contract),
        filesChanged: contract.filesChanged || normalizedChangeSet.changedFileCount,
      };
      const proofRoute = resolveProofRoute(riskSummary);
      const route = buildRunRoute(contract, riskSummary);
      const projectCommands = discoverProjectCommands({ projectRoot });

      // Obligations are compiled once and fixed: each records its evidence
      // class and the exact commands allowed to prove it (P0-2/P0-3).
      const obligations = compileRunObligations({
        projectRoot,
        requiredChecks: proofRoute.requiredChecks || ['default'],
        contract,
        contractRevision: 1,
        commands: projectCommands,
        knowledgeRecords: store.listKnowledgeRecords({ projectId, statuses: ['committed'] }),
        changedPaths: normalizedChangeSet.changedPaths,
      });
      assertVerificationSupport(obligations, contract, { projectMode: projectMode.mode });

      const workspaceObservation = observeWorkspaceIdentity({ projectRoot });
      const run = store.createRun({
        runId,
        objective: contract.objective,
        sourceIdentity: trustedSourceIdentity,
        workspaceIdentity: workspaceObservation.identity,
        proofTier: proofRoute.proofTier,
        evidenceTier: proofRoute.evidenceTier,
        requiredObligations: obligations.map((obligation) => obligation.obligationId),
        acceptanceCriteria: contract.acceptance.map((item) => item.statement).filter(Boolean),
        requireReleaseEvidence: proofRoute.evidenceTier === 'E2',
        projectId,
        knowledgeRevisionStart,
        projectMode: projectMode.mode,
        taskContract: contract,
        contractRevision: 1,
        route: { stages: route, riskTier: proofRoute.proofTier, shapeRequired: route.includes('SHAPE') },
        implementationContext,
        workspaceId: effectiveWorkspaceId,
      });
      store.declareRunObligations(runId, obligations);

      // K2: every run gets a durable work cursor. Ordinary work is one synthetic
      // step — the model-visible loop is unchanged — while long or complex work
      // is decomposed into units the ledger can resume, retry, and replan.
      const planned = planRunSteps({
        run,
        contract,
        obligations,
        route: { stages: route },
        planRevision: 1,
      });
      store.createRunSteps(runId, planned.steps);

      // Automatically load FRAME knowledge context and record receipt
      const frameKnowledgeCtx = await buildProjectKnowledgeContext({
        projectId,
        stage: 'FRAME',
        runId,
        objective: run.objective,
        changedPaths: normalizedChangeSet.changedPaths,
        projectRoot,
        stateStore: store,
        env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
      });
      store.recordKnowledgeContextReceipt(runId, {
        stage: 'FRAME',
        knowledgeRevision: frameKnowledgeCtx.knowledgeRevision,
        digest: frameKnowledgeCtx.digest,
        receiptJson: frameKnowledgeCtx,
      });

      await projectRunState(run, { runtimeHome });
      return run;
    },

    async startSuccessor({ invocation, objective, taskContract = {}, hostCapabilities = null } = {}) {
      if (invocation?.mode !== 'successor' || !invocation.predecessorRunId || !invocation.binding) {
        throw Object.assign(new Error('successor_not_allowed'), {
          code: 'successor_not_allowed',
          errorCode: 'successor_not_allowed',
          nextAction: 'resolve-successor-from-current-binding',
        });
      }
      const runId = invocation.runId;
      const contract = normalizeTaskContract(taskContract, {
        objective: objective || taskContract.objective,
      });
      if (hostCapabilities) assertRequiredHostCapabilities(contract, hostCapabilities);
      const trustedSourceIdentity = computeKernelSourceIdentity({
        projectRoot,
        objective: contract.objective,
        taskContract: contract,
      });
      const projectId = currentProject.projectId;
      await ensureKnowledgeStoreDirectories(projectId, {
        env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
      });
      const knowledgeRevisionStart = String(store.getProjectKnowledgeRevision(projectId));
      const hasKernelKnowledge = store.listKnowledgeRecords({ projectId }).length > 0;
      const projectMode = detectProjectMode({ projectRoot, hasKernelKnowledge });
      const repositoryScan = projectMode.mode === 'greenfield'
        ? null
        : scanRepositoryEvidence({ projectRoot });
      const implementationContext = projectMode.mode === 'greenfield'
        ? {
          walkingSkeleton: planWalkingSkeleton({
            projectType: contract.flags?.projectType || 'library',
            objective: contract.objective,
            taskContract: contract,
          }),
        }
        : {
          entrypoints: repositoryScan.entrypoints,
          manifests: repositoryScan.manifests,
          knownCommands: [...repositoryScan.testCommands, ...repositoryScan.buildCommands]
            .map((entry) => entry.commandRef),
          baseline: { status: contract.flags?.baselineRequired ? 'required' : 'deferred' },
        };
      const normalizedChangeSet = normalizeChangedContract(taskContract);
      const riskSummary = {
        ...riskSummaryFromContract(contract),
        filesChanged: contract.filesChanged || normalizedChangeSet.changedFileCount,
      };
      const proofRoute = resolveProofRoute(riskSummary);
      const route = buildRunRoute(contract, riskSummary);
      const obligations = compileRunObligations({
        projectRoot,
        requiredChecks: proofRoute.requiredChecks || ['default'],
        contract,
        contractRevision: 1,
        commands: discoverProjectCommands({ projectRoot }),
        knowledgeRecords: store.listKnowledgeRecords({ projectId, statuses: ['committed'] }),
        changedPaths: normalizedChangeSet.changedPaths,
      });
      assertVerificationSupport(obligations, contract, { projectMode: projectMode.mode });
      const workspaceObservation = observeWorkspaceIdentity({ projectRoot });
      const successorRun = {
        runId,
        objective: contract.objective,
        sourceIdentity: trustedSourceIdentity,
        workspaceIdentity: workspaceObservation.identity,
        proofTier: proofRoute.proofTier,
        evidenceTier: proofRoute.evidenceTier,
        requiredObligations: obligations.map((obligation) => obligation.obligationId),
        acceptanceCriteria: contract.acceptance.map((item) => item.statement).filter(Boolean),
        requireReleaseEvidence: proofRoute.evidenceTier === 'E2',
        projectId,
        knowledgeRevisionStart,
        projectMode: projectMode.mode,
        taskContract: contract,
        contractRevision: 1,
        route: {
          stages: route,
          riskTier: proofRoute.proofTier,
          shapeRequired: route.includes('SHAPE'),
        },
        implementationContext,
        workspaceId: effectiveWorkspaceId,
      };
      const planned = planRunSteps({
        run: successorRun,
        contract,
        obligations,
        route: { stages: route },
        planRevision: 1,
      });
      const successorBinding = normalizeSessionBinding({
        sessionId: hostSessionId,
        runId,
        projectId,
        workspaceId: effectiveWorkspaceId,
        workspaceRoot: path.resolve(projectRoot),
        provider: hostProvider,
        surface: env.MOON_RELAY_KERNEL_SURFACE || null,
        accessMode: 'owner',
      });
      const predecessor = store.getRun(invocation.predecessorRunId);
      const currentLock = predecessor?.workspaceId
        ? store.getWorkspaceMutationLockV2(predecessor.workspaceId)
        : null;
      const result = store.createSuccessorRunAtomic({
        projectId,
        sessionId: hostSessionId,
        predecessorRunId: invocation.predecessorRunId,
        predecessorBindingId: invocation.binding.bindingId,
        successorRun,
        successorBinding,
        obligations,
        steps: planned.steps,
        successorKey: buildSuccessorKey({
          projectId,
          sessionId: hostSessionId,
          predecessorRunId: invocation.predecessorRunId,
          workspaceId: effectiveWorkspaceId,
          taskContractDigest: contract.digest,
        }),
        predecessorLock: currentLock?.holderRunId === invocation.predecessorRunId
          ? currentLock
          : null,
      });
      if (result.created) {
        const frameKnowledgeCtx = await buildProjectKnowledgeContext({
          projectId,
          stage: 'FRAME',
          runId,
          objective: result.run.objective,
          changedPaths: normalizedChangeSet.changedPaths,
          projectRoot,
          stateStore: store,
          env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
        });
        store.recordKnowledgeContextReceipt(runId, {
          stage: 'FRAME',
          knowledgeRevision: frameKnowledgeCtx.knowledgeRevision,
          digest: frameKnowledgeCtx.digest,
          receiptJson: frameKnowledgeCtx,
        });
        await projectRunState(result.run, { runtimeHome });
      }
      return {
        status: result.created ? 'created' : 'resumed',
        run: result.run,
        next: await this.next(result.run.runId),
      };
    },

    async resolveRunId({ explicitRunId = null, envRunId = null } = {}) {
      if (explicitRunId && envRunId && String(explicitRunId) !== String(envRunId)) {
        throw Object.assign(new Error('run_binding_conflict'), {
          code: 'run_binding_conflict',
          errorCode: 'run_binding_conflict',
          nextAction: 'relaunch-through-kernel-host',
        });
      }
      if (requireHostBinding) {
        if (!hostSessionId) throw Object.assign(new Error('host_binding_missing'), { code: 'host_binding_missing' });
        const binding = getHostBinding();
        const requested = explicitRunId || envRunId || binding?.runId || null;
        if (!requested) {
          throw Object.assign(new Error('host_binding_missing'), {
            code: 'host_binding_missing',
            errorCode: 'host_binding_missing',
            nextAction: 'supply-a-task-contract',
            details: {
              remediation: {
                action: 'supply-a-task-contract',
                command: 'kernel next --contract-json <task-contract.json>',
              },
            },
          });
        }
        if (binding) {
          if (explicitRunId && String(explicitRunId) !== binding.runId) throw Object.assign(new Error('run_session_mismatch'), { code: 'run_session_mismatch' });
          if (envRunId && String(envRunId) !== binding.runId) throw Object.assign(new Error('run_session_mismatch'), { code: 'run_session_mismatch' });
          preflight(binding.runId, 'next');
          return binding.runId;
        }
        const envProjectId = env.MOON_RELAY_KERNEL_PROJECT_ID || currentProject.projectId;
        if (envProjectId !== currentProject.projectId) throw Object.assign(new Error('run_project_mismatch'), { code: 'run_project_mismatch' });
        return String(requested);
      }
      if (explicitRunId) return String(explicitRunId);
      if (envRunId) return String(envRunId);
      const identity = currentProject;
      const active = store.listActiveRuns({ projectId: identity.projectId });
      if (active.length === 1) return active[0].runId;
      if (active.length > 1) throw new Error(`ambiguous_active_run: ${active.map((run) => run.runId).join(', ')}`);
      throw new Error('active_run_not_found: pass --run-id or launch through a Kernel host');
    },

    // Host bootstrap (P0-1). The model only ever calls `next` and `report`, so
    // the run must come into existence without a model-visible `start` command.
    // ensureRun is idempotent: it creates the run on first call for a run id
    // and resumes it afterwards, and it is what `kernel next --contract-json`
    // uses to bootstrap a turn.
    async ensureRun({ runId, objective, taskContract = {} } = {}) {
      if (!runId) throw new Error('ensureRun requires a runId');
      const metadata = store.getRunMetadata(runId);
      if (!metadata) {
        const run = await this.startRun({ runId, objective, taskContract });
        if (requireHostBinding) {
          const binding = normalizeSessionBinding({
            sessionId: hostSessionId,
            runId,
            projectId: currentProject.projectId,
            workspaceId: effectiveWorkspaceId,
            workspaceRoot: path.resolve(projectRoot),
            provider: env.MOON_RELAY_KERNEL_PROVIDER || 'unknown',
            surface: env.MOON_RELAY_KERNEL_SURFACE || null,
            accessMode: 'owner',
          });
          store.createSessionBinding(binding);
        }
        return { status: 'created', run, next: await this.next(runId) };
      }
      if (requireHostBinding && !getHostBinding({ runId })) {
        if (metadata.status === 'blocked' && metadata.ownerBindingId) {
          store.reactivateBlockedRunBinding(normalizeSessionBinding({
            bindingId: metadata.ownerBindingId,
            sessionId: hostSessionId,
            runId,
            projectId: currentProject.projectId,
            workspaceId: effectiveWorkspaceId,
            workspaceRoot: path.resolve(projectRoot),
            provider: env.MOON_RELAY_KERNEL_PROVIDER || 'unknown',
            surface: env.MOON_RELAY_KERNEL_SURFACE || null,
            accessMode: 'owner',
          }));
        }
        // Additive legacy adoption is deliberately one-shot. Only an
        // unowned run in this exact project/workspace can acquire its first
        // owner binding; once owner_binding_id is populated, another session
        // must be authorized by the Host rather than claiming the run here.
        if (
          !metadata.ownerBindingId
          && metadata.projectId === currentProject.projectId
          && (!metadata.workspaceId || metadata.workspaceId === effectiveWorkspaceId)
        ) {
          store.adoptUnownedRunBinding(normalizeSessionBinding({
            sessionId: hostSessionId,
            runId,
            projectId: currentProject.projectId,
            workspaceId: effectiveWorkspaceId,
            workspaceRoot: path.resolve(projectRoot),
            provider: env.MOON_RELAY_KERNEL_PROVIDER || 'unknown',
            surface: env.MOON_RELAY_KERNEL_SURFACE || null,
            accessMode: 'owner',
          }));
        }
      }
      preflight(runId, 'next');
      const existing = store.getRun(runId);
      // An existing run may still be refined: a contract that now carries
      // evidence plans or new constraints is a revision, never a new run.
      if (objective || (taskContract && Object.keys(taskContract).length > 0)) {
        // A revision may only refine the contract; scope it already carries is
        // never dropped, so a later turn cannot shrink the completion gate.
        const mergedRevision = mergeContractRevisionWithBindings(
          existing.taskContract,
          normalizeTaskContract(taskContract, { objective: objective || existing.objective }),
        );
        const merged = mergedRevision.contract;
        if (existing.taskContract) {
          const contractChanged = merged.digest !== existing.taskContract.digest;
          if (contractChanged) {
            await this.reviseContract(runId, merged, { acceptanceIdMap: mergedRevision.acceptanceIdMap });
          }
          const activeContract = contractChanged ? merged : existing.taskContract;
          const currentRun = store.getRun(runId);
          const currentStep = this.getCurrentStep(runId);
          const amendedStep = resolveDeclaredStepForReplan(activeContract, currentStep);
          const requiresScopeReplan = stepScopeChanged(currentStep, amendedStep);
          const currentPlan = store.getRunSteps(runId, { planRevision: currentRun.planRevision });
          const requiresCompletedPlanReplan = !currentStep
            && activeContract.steps.length > 0
            && planDiffersFromContract(currentPlan, activeContract.steps);
          if (requiresScopeReplan || requiresCompletedPlanReplan) {
            await this.replanSteps(runId, {
              steps: requiresCompletedPlanReplan
                ? activeContract.steps
                : [{
                  ...amendedStep,
                  dependsOn: [],
                }],
              resumeBlockedReason: existing.status === 'blocked'
                && existing.blockedReason === 'unsupported-verification'
                ? 'unsupported-verification'
                : null,
            });
          }
        }
      }
      return { status: 'resumed', run: store.getRun(runId), next: await this.next(runId) };
    },

    // Persists a refined Task Contract and recompiles obligations against it,
    // so a plan supplied after FRAME is a binding change, not a note (P0-5).
    async reviseContract(runId, contract, { acceptanceIdMap = null } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const nextContractRevision = Number(run.contractRevision || 1) + 1;
      const obligations = compileRunObligations({
        projectRoot,
        requiredChecks: KERNEL_POLICY.requiredChecks[run.proofTier] || ['default'],
        contract,
        contractRevision: nextContractRevision,
      });
      assertVerificationSupport(obligations, contract, { projectMode: run.projectMode });
      // The contract already contains canonicalized successor references. Keep
      // the mapping visible to this boundary for lineage, but never rewrite
      // predecessor proof from an old AC namespace using successor-local IDs.
      void acceptanceIdMap;
      const updated = typeof store.reviseTaskContractAtomic === 'function'
        ? store.reviseTaskContractAtomic(runId, contract, { obligations })
        : store.updateTaskContract(runId, contract);
      if (typeof store.reviseTaskContractAtomic !== 'function') {
        store.declareRunObligations(runId, obligations);
        const merged = [...new Set([...updated.requiredObligations, ...obligations.map((obligation) => obligation.obligationId)])];
        const escalated = store.escalateRun(runId, { addObligations: merged });
        await projectRunState(escalated, { runtimeHome });
        return escalated;
      }
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async getRun(runId) {
      return store.getRun(runId);
    },

    async buildStageContext(runId, { stage = 'EXECUTE', taskContract = {}, principles, principleExtensions = [], stageRecords = [], references = [], evidence = [] } = {}) {
      try { preflight(runId, 'context'); } catch (error) { return bindingErrorPayload(error, { projectRoot, provider: hostProvider }); }
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const normalizedChangeSet = normalizeChangedContract(taskContract);
      const projectId = run.projectId || currentProject.projectId;
      const knowledgeCtx = await buildProjectKnowledgeContext({
        projectId,
        stage,
        runId,
        objective: run.objective,
        changedPaths: normalizedChangeSet.changedPaths,
        projectRoot,
        stateStore: store,
        env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
      });
      store.recordKnowledgeContextReceipt(runId, {
        stage,
        knowledgeRevision: knowledgeCtx.knowledgeRevision,
        digest: knowledgeCtx.digest,
        receiptJson: knowledgeCtx,
      });

      const canonical = loadKernelPrinciples();
      const callerValues = principles === undefined || principles === null || (typeof principles === 'object' && !Array.isArray(principles) && Object.keys(principles).length === 0)
        ? []
        : (Array.isArray(principles) ? principles : Object.entries(principles).map(([id, value]) => ({ id, guidance: value, rationale: 'Caller-supplied extension' })));
      const extensions = [...callerValues, ...(Array.isArray(principleExtensions) ? principleExtensions : [])].map((extension, index) => {
        const candidate = typeof extension === 'string'
          ? { id: `caller.${index + 1}`, guidance: extension, rationale: 'Caller-supplied extension' }
          : extension;
        if (!candidate || typeof candidate !== 'object' || !candidate.id || !candidate.guidance || !candidate.rationale) {
          throw new KernelPrinciplesError('kernel_principle_extension_invalid', 'Caller principle extensions require id, guidance, and rationale');
        }
        if (canonical.principles.some((principle) => principle.id === candidate.id)) {
          throw new KernelPrinciplesError('kernel_principle_override_forbidden', `Canonical principle override is forbidden: ${candidate.id}`);
        }
        if (!/^(?:caller|extension)[.:\/-]/.test(candidate.id)) {
          throw new KernelPrinciplesError('kernel_principle_extension_namespace_required', `Caller principle extension must use caller.* or extension.* namespace: ${candidate.id}`);
        }
        return { id: String(candidate.id), guidance: String(candidate.guidance), rationale: String(candidate.rationale) };
      });

      const persistedEvidence = store.getVerifications(runId).map((verification) => ({
        id: `verification-${verification.obligationId}`,
        type: 'evidence-digest',
        content: JSON.stringify({
          obligationId: verification.obligationId,
          status: verification.status,
          evidenceRef: verification.evidenceRef,
          command: verification.command,
          exitCode: verification.exitCode,
          evidenceDigest: verification.evidenceDigest,
          acceptanceCoverage: verification.acceptanceCoverage,
        }),
        revision: String(verification.verifiedRuntimeRevision || run.revision),
        sourceRef: verification.evidenceRef || `verification:${verification.id}`,
        trust: 'persisted-verification',
      }));
      const capabilityDecision = resolveKernelCapabilities({ ...taskContract, stage, taskClass: taskContract.taskClass || 'feature' });

      const context = await buildContextReceipt({
        taskContract: { objective: run.objective, ...taskContract },
        principles: [...canonical.principles, ...extensions],
        principleSource: canonical,
        stage,
        stageRecords: [
          { id: `stage-${runId}`, type: 'stage-context', content: JSON.stringify({ runId, state: run.state, stage }), revision: String(run.revision), sourceRef: `run:${runId}`, trust: 'persisted-run-state' },
          { id: `capability-decision-${runId}`, type: 'stage-context', content: JSON.stringify(capabilityDecision), revision: capabilityDecision.revision, sourceRef: 'catalog/kernel-skills.json', trust: 'canonical-catalog' },
          { id: `knowledge-context-${runId}`, type: 'knowledge-context', content: JSON.stringify({ digest: knowledgeCtx.digest, contextPackRef: knowledgeCtx.contextPackRef, promptBlock: knowledgeCtx.promptBlock }), revision: String(knowledgeCtx.knowledgeRevision), sourceRef: knowledgeCtx.contextPackRef, trust: 'verified-knowledge' },
          ...stageRecords,
        ],
        references,
        evidence: [...persistedEvidence, ...evidence],
      });
      context.knowledgeContext = knowledgeCtx;
      return context;
    },

    async materializeStageKnowledge(runId, { stage, strict = true } = {}) {
      return this.refreshStageKnowledge(runId, { stage, strict });
    },

    async transition(runId, nextState, options = {}) {
      await this.materializeStageKnowledge(runId, {
        stage: nextState,
        strict: true,
      });

      const updated = store.transition(runId, nextState, options);
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async planWaves(runId, slices = []) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      return planDryRunWave(slices);
    },

    // Bounded, safety-checked wave plan (§20). Worker count is capped by the
    // run's risk tier; parallel waves require disjoint write sets, per-slice
    // verification, and a declared integration check.
    async planBounded(runId, slices = [], { includeIndependentReview = false, integrationVerification = null } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      return planBoundedWaves(slices, { riskTier: run.proofTier, includeIndependentReview, integrationVerification });
    },

    async recordProof(runId, { obligationId = 'default', status, sourceIdentity, evidenceRef, command, commandRef = null, exitCode = 0, evidenceDigest, acceptanceCoverage = [], evidenceClass = null } = {}) {
      const run = store.getRun(runId);
      const effectiveSourceIdentity = sourceIdentity || run?.sourceIdentity;
      const updated = store.recordVerification(runId, {
        obligationId,
        status,
        evidenceRef,
        sourceIdentity: effectiveSourceIdentity,
        commandRef,
        command,
        exitCode,
        evidenceDigest,
        acceptanceCoverage,
        evidenceClass,
        executor: 'caller-attested',
      });
      persistReleaseEvidenceIfNeeded(runId, updated);

      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    // Migration impact analysis (§16.4). Validates the change-seam analysis,
    // and when a migration is required, escalates the run to T3 and adds the
    // protected migration-smoke obligation. Missing rollback / verification
    // seam blocks the run instead of proceeding.
    async analyzeMigration(runId, impact = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const result = buildImpactAnalysis(impact);

      if (result.blockingFindings.length > 0) {
        store.markRunBlocked(runId, 'external-dependency');
        await projectRunState(store.getRun(runId), { runtimeHome });
        return { ...result, status: 'blocked', blockedReason: 'external-dependency' };
      }

      let escalated = run;
      if (result.analysis.migrationRequired) {
        escalated = store.escalateRun(runId, {
          proofTier: result.requiredTier,
          evidenceTier: 'E2',
          addObligations: result.requiredObligations,
        });
        await projectRunState(escalated, { runtimeHome });
      }
      return { ...result, status: 'ready', run: escalated };
    },

    // Stagnation detection (§25 P3): repeated failing attempts with no
    // progress on the same obligation.
    detectStagnation(runId, { threshold } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      return detectStagnation({ attempts: store.getAttempts(runId), verifications: store.getVerifications(runId), threshold });
    },

    // Records a replan event (durable, measured). Used when stagnation or a new
    // risk requires a different approach.
    async signalReplan(runId) {
      const updated = store.incrementReplanCount(runId);
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    // K2 §7.9: stagnation is judged per unit of work as well as per run. A step
    // that keeps failing the same way escalates the route even when the run-wide
    // attempt counter has not reached its threshold yet.
    // Only the step's CONSECUTIVE-FAILURE signal escalates the route. Its looser
    // signals (a no-op retry, an identical result digest) fire at two attempts,
    // which would overtake the retry-escalation threshold and make it
    // unreachable — stagnation outranks retry. Those signals still drive the
    // replan recommendation and suspend a Safe Wave.
    stagnationSignal(runId) {
      const runLevel = this.detectStagnation(runId);
      const stepLevel = this.detectStepStagnation(runId);
      const stepEscalates = stepLevel.signals?.consecutiveFailures === true;
      return {
        stagnant: runLevel.stagnant || stepEscalates,
        runLevel,
        stepLevel,
        source: runLevel.stagnant ? 'run' : (stepEscalates ? 'step' : null),
      };
    },

    // Measurement-based routing recommendation (policy only; no provider call).
    recommendRouting(runId, { independentReviewRequired = false } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const stagnation = this.stagnationSignal(runId);
      const attempts = store.getAttempts(runId);
      return recommendModelRouting({
        riskTier: run.proofTier,
        stagnant: stagnation.stagnant,
        retryCount: attempts.filter((attempt) => attempt.status === 'failed').length,
        independentReviewRequired,
      });
    },

    // Decides the LOGICAL model class for the action the model is about to
    // perform and persists it before the Host dispatches (§16.5). Provider
    // identity is never decided here — only the class the Host must satisfy.
    async decideModelRoute(runId, { actionKind, obligationId = null, independentReviewRequired = false, planInvalid = false, architectureDeviation = false, protectedObligationFailed = false, workProfile = null, complexity = null } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const attempts = store.getAttempts(runId);
      const priorDecisions = store.listModelRouteDecisions(runId);
      const decision = resolveModelRoute({
        runId,
        actionKind,
        riskTier: run.proofTier,
        attemptNumber: attempts.length || 1,
        replanCount: run.replanCount || 0,
        // Retries are counted as FAILED attempts, not attempts made. Counting
        // every attempt would push the retry threshold onto the same turn as
        // the stagnation threshold, and stagnation outranks it — which would
        // make retry escalation unreachable on the failing-report path.
        retryCount: attempts.filter((attempt) => attempt.status === 'failed').length,
        stagnant: this.stagnationSignal(runId).stagnant,
        protectedObligationFailed,
        planInvalid,
        architectureDeviation,
        independentReviewRequired,
        workProfile,
        complexity,
        currentPlanRevision: Number(run.planRevision || 1),
        obligationId,
        // §5.4: an escalation holds for the rest of this plan revision, but a
        // replan produces a new revision that may return to the value class.
        escalatedObligations: priorDecisions
          .filter((entry) => entry.modelClass === 'frontier_reasoning' && entry.role === 'implementer' && entry.obligationId)
          .map((entry) => ({ planRevision: entry.planRevision, obligationId: entry.obligationId })),
        sequence: priorDecisions.length,
      });
      return store.recordModelRouteDecision(runId, decision);
    },

    // Host-only turn API (§8.2). `next` stays exactly as the model sees it;
    // the routing directive travels beside it, never inside it.
    async hostNext(runId, { hostCapabilities = {}, actionContext = {} } = {}) {
      const run = store.getRun(runId);
      if (!run) return { schemaVersion: 1, runId, status: 'not_found' };
      const capabilities = normalizeHostCapabilities(hostCapabilities);
      let modelInput = await this.next(runId, { stepId: actionContext.stepId || null });
      if (modelInput.action?.type === 'baseline-required') {
        await this.captureBaseline(runId, {
          commandRefs: modelInput.action.commandRefs,
          timeoutMs: actionContext.baselineTimeoutMs || 120000,
        });
        modelInput = await this.next(runId, { stepId: actionContext.stepId || null });
      }
      let mutationLock = null;
      const workspaceIdForTurn = actionContext.workspaceId || run.workspaceId || effectiveWorkspaceId;
      if (['implement', 'fix'].includes(modelInput.action?.type)) {
        const lockResult = store.acquireWorkspaceMutationLockV2({
          workspaceId: workspaceIdForTurn,
          projectId: run.projectId,
          runId,
          sessionToken: holder,
          ttlMs: actionContext.mutationLockTtlMs || 60000,
        });
        if (!lockResult.acquired) {
          modelInput.status = 'blocked';
          modelInput.errorCode = 'workspace_mutation_conflict';
          modelInput.nextAction = 'create-worktree';
          modelInput.action = {
            type: 'blocked',
            reason: 'workspace_mutation_conflict',
            guidance: `Workspace is held by run ${lockResult.lock.holderRunId}.`,
          };
        } else {
          mutationLock = lockResult.lock;
        }
      }
      const decision = await this.decideModelRoute(runId, {
        actionKind: actionContext.actionKind || ACTION_FOR_MODEL_ACTION[modelInput.action?.type] || 'implement',
        obligationId: actionContext.obligationId ?? modelInput.action?.outstandingObligations?.[0] ?? null,
        independentReviewRequired: actionContext.independentReviewRequired === true,
        planInvalid: actionContext.planInvalid === true,
        architectureDeviation: actionContext.architectureDeviation === true,
        protectedObligationFailed: actionContext.protectedObligationFailed === true,
        workProfile: actionContext.workProfile || null,
        complexity: actionContext.complexity || null,
      });

      // K1: the worker's bounded context is built here, beside the routing
      // directive, so the model-visible payload keeps its shape while the Host
      // gains everything a fresh session needs. Kernel-owned actions dispatch no
      // worker, so they get no capsule.
      let executionCapsule = null;
      if (decision.modelClass !== 'kernel') {
        const latestImplementationAttempt = decision.role === 'reviewer'
          ? store.getLatestImplementationAttempt?.(runId)
          : null;
        const capsuleStep = actionContext.stepId
          ? this.ensureRunStepsMigrated(runId).find((entry) => entry.stepId === actionContext.stepId)
          : this.getCurrentStep(runId)
            || (latestImplementationAttempt?.stepId ? store.getRunStep(runId, latestImplementationAttempt.stepId) : null);
        executionCapsule = decision.role === 'reviewer'
          ? await this.buildReviewerCapsule(runId, {
            decision,
            stage: decision.actionKind === 'review_contract' ? 'contract' : 'engineering',
            obligationId: decision.obligationId,
            changedPaths: actionContext.changedPaths || [],
            step: capsuleStep,
          })
          : await this.buildCapsule(runId, {
            role: 'implementer',
            decision,
            step: capsuleStep,
            changedPaths: actionContext.changedPaths || [],
            workspaceIdentity: actionContext.workspaceIdentity || null,
          });
        if (modelInput.action) modelInput.action.capsuleId = executionCapsule.capsuleId;
      }

      // The attempt is opened after the Kernel has issued the bounded capsule
      // but before admission/dispatch. Wave workers pass their pre-bound
      // attempt so the shared path never creates a duplicate row.
      let attempt = actionContext.attemptId
        ? store.getStepAttemptByAttemptId(actionContext.attemptId, { runId })
        : null;
      if (!attempt && decision.modelClass !== 'kernel' && executionCapsule?.stepId) {
        attempt = store.getActiveStepAttempt(runId, {
          stepId: executionCapsule.stepId,
          capsuleId: executionCapsule.capsuleId,
          waveId: actionContext.waveId || null,
        });
      }
      if (decision.modelClass !== 'kernel' && executionCapsule?.stepId) {
        if (attempt) {
          this.assertAttemptLineage(attempt, { runId, stepId: executionCapsule.stepId, planRevision: run.planRevision, mutationRevision: run.mutationRevision });
          attempt = this.attachAttemptLineage(attempt.attemptId, {
            bindingId: attempt.bindingId || store.getRunOwnerBinding?.(runId)?.bindingId || null,
            capsuleId: executionCapsule.capsuleId,
            capsuleDigest: executionCapsule.provenance?.capsuleDigest || null,
            routeDecisionId: decision.decisionId,
            provenanceKind: attempt.provenanceKind === 'legacy-unattributed' ? 'routed' : attempt.provenanceKind,
            planRevision: run.planRevision,
            mutationRevision: run.mutationRevision,
          });
        } else {
          attempt = this.beginAttempt(runId, {
            stepId: executionCapsule.stepId,
            bindingId: store.getRunOwnerBinding?.(runId)?.bindingId || null,
            capsuleId: executionCapsule.capsuleId,
            capsuleDigest: executionCapsule.provenance?.capsuleDigest || null,
            routeDecisionId: decision.decisionId,
            provenanceKind: 'routed',
            planRevision: run.planRevision,
            mutationRevision: run.mutationRevision,
            workspaceIdentityStart: executionCapsule.provenance?.workspaceIdentity || run.currentWorkspaceIdentity,
            workspaceId: actionContext.workspaceId || run.workspaceId || null,
            baseWorkspaceIdentity: actionContext.workspaceIdentity || null,
            waveId: actionContext.waveId || null,
          });
        }
      }

      // The model-visible `next` action carries the provider-neutral
      // requirement. Host callers also receive the concrete assignment handle
      // that must be echoed by the worker report. Provider model names stay in
      // the Host-only route decision; the assignment itself is role- and
      // lineage-shaped so Claude and other providers retain the same boundary.
      const actorAssignment = decision.modelClass === 'kernel'
        ? null
        : {
          assignmentId: buildActorAssignmentId(decision.decisionId),
          role: decision.role,
          parentRole: 'orchestrator',
          workProfile: decision.workProfile,
          parentMayImplement: false,
          nestedDelegationAllowed: false,
          freshSessionRequired: decision.independentContextRequired === true
            || decision.workProfile?.independentContextRequired === true
            || decision.role === 'reviewer',
        };
      return {
        schemaVersion: 1,
        runId,
        modelInput,
        executionCapsule,
        hostDirective: {
          modelRouteDecision: decision,
          actorAssignment,
          hostCapabilities: capabilities,
          enforcementStrategy: resolveEnforcementStrategy(capabilities, decision),
          executionCapsule,
          attemptId: attempt?.attemptId || null,
          attempt,
          mutationLock,
        },
      };
    },

    assertMutationAllowed(request = {}) {
      return assertMutationAllowed({
        stateStore: store,
        workspaceRoot: fencingWorkspaceRoot,
        ...request,
      });
    },

    // K3: the Host asks for admission between the route decision and the actual
    // dispatch, and the answer is persisted whatever it is. A blocked admission
    // is evidence that a turn was refused, not an absence of a turn.
    async admitRoute(runId, { decision, resolution, capabilities = {}, capsule = null, step = null, attemptId = null, policies, economics = {} } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const admission = admitRoute({
        run,
        step: step || this.getCurrentStep(runId),
        attemptId,
        decision,
        resolution,
        capabilities,
        capsule,
        policies,
        economics,
      });
      return store.recordRouteAdmission(runId, admission);
    },

    getRouteAdmission(runId, admissionId) {
      return store.getRouteAdmission(admissionId, { runId });
    },

    listRouteAdmissions(runId, options = {}) {
      return store.listRouteAdmissions(runId, options);
    },

    // The Host reports what it actually ran. This is the only evidence that a
    // routing decision was honoured; without it the turn stays unobserved.
    async recordModelUsage(runId, usageReceipt = {}, { lateObservation = false } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed' && !lateObservation) {
        throw new Error(`Run ${runId} is completed; a late usage receipt requires an explicit late-observation flag`);
      }
      const attempt = usageReceipt.attemptId
        ? store.getStepAttemptByAttemptId(usageReceipt.attemptId, { runId })
        : usageReceipt.capsuleId ? store.getActiveStepAttempt(runId, { capsuleId: usageReceipt.capsuleId }) : null;
      return store.recordModelUsageReceipt(runId, {
        ...usageReceipt,
        runId,
        ...(attempt && !usageReceipt.attemptId ? { attemptId: attempt.attemptId } : {}),
        ...(attempt && !usageReceipt.bindingId ? { bindingId: attempt.bindingId } : {}),
      });
    },

    modelRoutingSummary(runId) {
      return summarizeModelRouting(store.listModelRouteDecisions(runId), store.listModelUsageReceipts(runId));
    },

    listReviewReceipts(runId, options = {}) {
      return store.listReviewReceipts(runId, options);
    },

    // Two-stage review plan (§31): which reviews apply and whether an
    // independent reviewer is required, derived from the run's tier and risk.
    reviewPlan(runId, { publicContract = false, acceptanceAmbiguity = false, behaviorChanging = false } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      return resolveReviewPlan({ riskTier: run.proofTier, publicContract, acceptanceAmbiguity, behaviorChanging });
    },

    // Records a structured review verdict as a judgment obligation. At T3 the
    // verdict must come from a reviewer independent of the implementer.
    //
    // K0: the receipt is written FIRST and the judgment verification references
    // it, so every judgment the completion gate accepts has a lineage it can
    // re-check later. A review the Host never routed is still recorded, but as
    // `unrouted` — visible, and never sufficient for a protected or T3 judgment.
    async recordReview(runId, verdict = {}, {
      implementerId,
      reviewReceiptId = null,
      obligationId = null,
      acceptanceCoverage = [],
      changedPaths = [],
      rationale = null,
    } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const normalized = normalizeReviewVerdict(verdict);
      const implementationSession = store.getImplementationPrincipal(runId);
      const usageReceipt = reviewReceiptId ? store.getModelUsageReceipt(reviewReceiptId, { runId }) : null;
      const reviewDecision = usageReceipt ? store.getModelRouteDecision(usageReceipt.decisionId, { runId }) : null;

      if (run.proofTier === 'T3') {
        assertIndependentReview({ verdict: normalized, implementerId });
        // Once the Host is routing models, the reviewer string is no longer
        // enough: independence is checked against the session that implemented.
        if (implementationSession || reviewReceiptId) {
          assertIndependentReviewSession({ reviewReceipt: usageReceipt, reviewDecision, implementationSession });
        }
      }

      const targetObligation = obligationId || `review-${normalized.stage}`;
      const reviewReceipt = store.recordReviewReceipt(runId, {
        runId,
        obligationId: targetObligation,
        reviewStage: normalized.stage,
        verdict: normalized.verdict,
        findingClass: findingClassOf(normalized.findings),
        planRevision: Number(run.planRevision || run.contractRevision || 1),
        reviewer: usageReceipt
          ? {
            actorSessionId: usageReceipt.actorSessionId,
            usageReceiptId: usageReceipt.receiptId,
            routeDecisionId: usageReceipt.decisionId,
            modelClass: reviewDecision?.modelClass || 'unrouted',
            resolvedModel: usageReceipt.resolvedModel,
            enforcementStatus: usageReceipt.enforcementStatus,
          }
          : {
            actorSessionId: hashSessionId(normalized.reviewerId || `unrouted-reviewer:${runId}:${normalized.stage}`),
            usageReceiptId: null,
            routeDecisionId: null,
            modelClass: 'unrouted',
            resolvedModel: null,
            enforcementStatus: 'unrouted',
          },
        implementer: {
          actorSessionId: implementationSession?.actorSessionId || null,
          usageReceiptId: implementationSession?.receiptId || null,
        },
        stepId: usageReceipt?.stepId
          || implementationSession?.stepId
          || store.getLatestImplementationAttempt?.(runId)?.stepId
          || null,
        reviewerBindingId: usageReceipt?.bindingId || null,
        implementerAttemptId: implementationSession?.attemptId
          || store.getLatestImplementationAttempt?.(runId)?.attemptId
          || null,
        subject: {
          workspaceIdentity: run.currentWorkspaceIdentity,
          mutationRevision: run.mutationRevision,
          changedPathsDigest: digestOfPaths(changedPaths),
          evidenceDigest: digestOfEvidence(store.getVerifications(runId), { excludeObligationId: targetObligation }),
        },
        acceptanceCoverage,
        findings: normalized.findings,
        rationale: rationale || `${normalized.stage} review verdict: ${normalized.verdict}`,
      });

      const updated = await this.recordProof(runId, {
        obligationId: targetObligation,
        status: normalized.verdict === 'pass' ? 'passed' : 'failed',
        evidenceRef: reviewEvidenceRef(runId, reviewReceipt.receiptId),
        command: 'structured-review',
        exitCode: normalized.verdict === 'pass' ? 0 : 1,
        evidenceDigest: reviewReceipt.digest,
        evidenceClass: 'judgment',
        acceptanceCoverage: reviewReceipt.acceptanceCoverage,
      });
      // The follow-up class is decided here, so an architecture defect cannot
      // be quietly handed back to the implementer as a local patch (§9.3).
      return { review: normalized, reviewReceipt, run: updated, followUp: classifyReviewFindings(normalized.findings) };
    },

    async ingestReviewerOutcome({
      runId,
      stepId = null,
      capsuleId,
      routeDecisionId,
      usageReceiptId,
      reviewerSessionId,
      outcome,
    } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`incomplete_review_chain: run ${runId} not found`);
      if (!outcome || !['pass', 'fail', 'blocked'].includes(outcome.verdict)
        || !Array.isArray(outcome.findings) || !Array.isArray(outcome.evidenceRefs)
        || !Number.isInteger(outcome.reviewedMutationRevision)) {
        throw new Error('incomplete_review_chain: invalid reviewer outcome schema');
      }
      const capsule = store.getExecutionCapsule(capsuleId, { runId });
      const usage = store.getModelUsageReceipt(usageReceiptId, { runId });
      const decision = store.getModelRouteDecision(routeDecisionId, { runId });
      const admission = usage?.admissionId ? store.getRouteAdmission(usage.admissionId, { runId }) : null;
      const implementationSession = store.getImplementationPrincipal(runId);
      const reviewerSessionHash = hashSessionId(reviewerSessionId);
      const chainComplete = capsule?.role === 'reviewer'
        && (!stepId || capsule.stepId === stepId)
        && capsule.provenance.routeDecisionId === routeDecisionId
        && capsule.subject.mutationRevision === run.mutationRevision
        && capsule.subject.workspaceIdentity === run.currentWorkspaceIdentity
        && outcome.reviewedMutationRevision === run.mutationRevision
        && decision?.role === 'reviewer'
        && decision.permissions === 'read_only'
        && usage?.decisionId === routeDecisionId
        && usage.capsuleId === capsuleId
        && usage.actorSessionId === reviewerSessionHash
        && usage.enforcementStatus === 'enforced'
        && admissionAllowsDispatch(admission)
        && admission.capsuleId === capsuleId
        && admission.decisionId === routeDecisionId
        && implementationSession?.actorSessionId
        && implementationSession.actorSessionId !== usage.actorSessionId;
      if (!chainComplete) throw new Error('incomplete_review_chain: route, capsule, usage, session, read-only, or mutation lineage is missing');
      if (outcome.verdict === 'blocked') {
        return { status: 'blocked', blockedReason: 'incomplete_review_chain', findings: outcome.findings };
      }
      const obligationId = capsule.reviewScope?.obligationId || decision.obligationId || 'security-review';
      const acceptanceCoverage = (capsule.acceptance || [])
        .filter((item) => (item.obligationIds || []).includes(obligationId))
        .map((item) => item.id);
      return this.recordReview(runId, {
        stage: capsule.reviewScope?.stage || 'engineering',
        verdict: outcome.verdict,
        reviewerId: reviewerSessionHash,
        findings: outcome.findings,
      }, {
        implementerId: implementationSession.actorSessionId,
        reviewReceiptId: usageReceiptId,
        obligationId,
        acceptanceCoverage,
        changedPaths: capsule.subject.changedPaths,
        rationale: `Host-ingested reviewer outcome (${outcome.evidenceRefs.length} evidence refs)`,
      });
    },

    // Within-run route/tier promotion only (§13.5). Demotion throws.
    async escalateRoute(runId, { proofTier, evidenceTier, addObligations = [] } = {}) {
      const updated = store.escalateRun(runId, { proofTier, evidenceTier, addObligations });
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    // Hard evidence path: the Kernel runtime resolves a trusted manifest
    // command, executes it itself, and binds the result to the workspace
    // identity observed immediately before execution.
    async executeProof(runId, { obligationId = 'default', commandRef, timeoutMs, acceptanceCoverage = [], flakyRerun = false, discovered = null, networkPolicy = 'inherited', evidenceIdentity: requestedEvidenceIdentity = null, freshnessInputs = null, allowEvidenceReuse = true } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      // Direct Host callers use this method without reportUnderLease's
      // preflight. Reject an unbound command before observing/executing it so
      // the direct API cannot create side effects and only fail at persistence.
      const declaredObligation = store.getRunObligation(runId, obligationId);
      if (declaredObligation && declaredObligation.sourceType !== 'ad-hoc') {
        assertCommandBinding(declaredObligation, discovered ? null : commandRef);
      }

      const observation = observeWorkspaceIdentity({ projectRoot });
      store.observeWorkspaceIdentity(runId, observation.identity);

      const evidenceIdentity = requestedEvidenceIdentity || buildEvidenceIdentity({
        commandRef,
        sourceInputDigest: observation.identity,
        networkPolicy,
        freshnessInputs: freshnessInputs || undefined,
      });
      const reusable = allowEvidenceReuse && !discovered && typeof store.findExactReusableVerification === 'function'
        ? store.findExactReusableVerification({
          projectId: run.projectId,
          obligationId,
          evidenceIdentity,
          excludeRunId: runId,
        })
        : null;
      if (reusable) {
        const reuseReceipt = buildEvidenceReuseReceipt({
          runId,
          obligationId,
          priorRunId: reusable.runId,
          priorVerificationId: reusable.id,
          mutationRevision: run.mutationRevision,
          identity: evidenceIdentity,
          evidenceDigest: reusable.evidenceDigest,
        });
        const updated = store.recordVerification(runId, {
          obligationId,
          status: 'passed',
          evidenceRef: `evidence://reuse/${reuseReceipt.receiptId}`,
          commandRef,
          command: reusable.command || commandRef,
          exitCode: 0,
          evidenceDigest: reusable.evidenceDigest,
          acceptanceCoverage,
          verifiedSourceIdentity: observation.identity,
          executor: 'kernel-runtime',
          networkIsolation: networkPolicy,
          evidenceIdentity,
          reuseOfVerificationId: reusable.id,
          reuseReceipt,
        });
        persistReleaseEvidenceIfNeeded(runId, updated);
        await projectRunState(updated, { runtimeHome });
        return {
          run: updated,
          execution: {
            status: 'passed',
            recordedStatus: 'passed',
            reused: true,
            reuseReceipt,
            outputDigest: reusable.evidenceDigest,
            evidenceRef: `evidence://reuse/${reuseReceipt.receiptId}`,
            command: reusable.command || commandRef,
            args: [],
            exitCode: 0,
            flaky: false,
            workspaceMutatedByProof: false,
          },
        };
      }

      const evidenceDir = run.projectId
        ? resolveRunArtifactPaths({ runtimeHome, projectId: run.projectId, runId }).evidence
        : path.join(runtimeHome, 'evidence', runId);
      // Discovered commands require an explicit approval; trusted commands are
      // manifest scripts. Flaky reruns re-execute once at the same identity.
      const runner = discovered
        ? () => executeApprovedProof({ projectRoot, command: discovered.command, args: discovered.args || [], approval: discovered.approval, label: obligationId, timeoutMs, evidenceDir, networkPolicy })
        : () => executeTrustedProof({ projectRoot, commandRef, timeoutMs, evidenceDir, networkPolicy });
      const execution = flakyRerun ? executeWithFlakyRerun(runner) : runner();

      // Re-observe the workspace AFTER execution. If the verification command
      // itself mutated tracked source (e.g. a formatter or codegen step), the
      // evidence was produced against a state that no longer exists — bind it
      // to the post-execution identity so the completion gate treats it as
      // stale rather than accepting evidence for a vanished workspace (F2).
      const postObservation = observeWorkspaceIdentity({ projectRoot });
      const workspaceMutatedByProof = postObservation.identity !== observation.identity;
      if (workspaceMutatedByProof) {
        store.observeWorkspaceIdentity(runId, postObservation.identity);
      }

      // A flaky result (divergent pass/fail across identical runs) is blocking
      // by default (§17); it may only pass through an explicit waiver, which
      // marks the run degraded. A proof that mutated its own workspace cannot
      // stand as valid evidence for that workspace either.
      const blockedForFlaky = execution.flaky === true;
      const recordedStatus = (blockedForFlaky || workspaceMutatedByProof) ? 'failed' : execution.status;

      const updated = store.recordVerification(runId, {
        obligationId,
        status: recordedStatus,
        evidenceRef: execution.evidenceRef,
        commandRef: discovered ? null : commandRef,
        command: [execution.command, ...execution.args].join(' '),
        exitCode: recordedStatus === 'failed' && execution.exitCode === 0 ? 1 : execution.exitCode,
        evidenceDigest: execution.outputDigest,
        acceptanceCoverage,
        verifiedSourceIdentity: workspaceMutatedByProof ? postObservation.identity : observation.identity,
        executor: 'kernel-runtime',
        networkIsolation: execution.networkIsolation,
        evidenceIdentity,
      });
      persistReleaseEvidenceIfNeeded(runId, updated);

      await projectRunState(updated, { runtimeHome });
      return { run: updated, execution: { ...execution, recordedStatus, flaky: blockedForFlaky, workspaceMutatedByProof } };
    },

    // Builds (and records a receipt for) the knowledge context of the run's
    // CURRENT stage, so an EXECUTE turn is not handed FRAME knowledge (P1-2).
    async refreshStageKnowledge(runId, { stage, strict = false } = {}) {
      const run = store.getRun(runId);
      if (!run) return null;
      const effectiveStage = stage || run.state;
      const existing = store.getKnowledgeContextReceipt(runId, effectiveStage);
      const projectId = run.projectId;
      if (!projectId) return existing?.receiptJson || null;
      const knowledgeRevision = String(store.getProjectKnowledgeRevision(projectId));
      const contractRevision = Number(run.contractRevision || 1);
      const objectiveDigest = sha256Hex(run.objective || '');
      const changedPaths = run.taskContract?.changedPaths || [];
      const changedPathsDigest = sha256Hex(JSON.stringify([...changedPaths].sort()));

      const receiptMeta = existing?.receiptJson?.selectionMeta;
      const isMatch = existing
        && String(existing.knowledgeRevision) === knowledgeRevision
        && (receiptMeta?.contractRevision === undefined || receiptMeta.contractRevision === contractRevision)
        && (receiptMeta?.objectiveDigest === undefined || receiptMeta.objectiveDigest === objectiveDigest)
        && (receiptMeta?.changedPathsDigest === undefined || receiptMeta.changedPathsDigest === changedPathsDigest);

      if (isMatch) return existing.receiptJson;

      try {
        const context = await buildProjectKnowledgeContext({
          projectId,
          stage: effectiveStage,
          runId,
          objective: run.objective,
          changedPaths,
          projectRoot,
          stateStore: store,
          env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
        });
        context.selectionMeta = {
          stage: effectiveStage,
          knowledgeRevision,
          contractRevision,
          objectiveDigest,
          changedPathsDigest,
        };
        store.recordKnowledgeContextReceipt(runId, {
          stage: effectiveStage,
          knowledgeRevision: context.knowledgeRevision,
          digest: context.digest,
          receiptJson: context,
        });
        return context;
      } catch (error) {
        if (strict) throw error;
        return existing?.receiptJson || null;
      }
    },

    // Model-visible command 1 of 2: what to do now.
    async next(runId, { stepId = null } = {}) {
      try {
        preflight(runId, 'next');
      } catch (error) {
        return bindingErrorPayload(error, { projectRoot, provider: hostProvider });
      }
      const run = store.getRun(runId);
      if (!run) return { schemaVersion: 1, runId, status: 'not_found' };

      let stageContext = store.getKnowledgeContextReceipt(runId, run.state)?.receiptJson;
      if (!stageContext) {
        stageContext = await this.refreshStageKnowledge(runId, { stage: run.state });
      }
      if (!stageContext) {
        stageContext = store.getKnowledgeContextReceipt(runId, 'FRAME')?.receiptJson || null;
      }

      const obligations = store.getRunObligations(runId);
      const capabilityDecision = resolveKernelCapabilities({
        ...(run.taskContract?.flags || {}),
        taskClass: run.taskContract?.taskClass || 'feature',
        riskTier: run.proofTier,
        stage: run.state,
        route: run.route?.stages || [],
        filesChanged: run.taskContract?.filesChanged || 0,
      });

      const payload = buildNextPayload({
        run,
        verifications: store.getVerifications(runId),
        requiredObligations: run.requiredObligations,
        obligations,
        contract: run.taskContract ? contractBriefing(run.taskContract) : null,
        knowledgePromptBlock: stageContext?.promptBlock || null,
        capabilities: capabilityDecision.selected.map((entry) => ({ id: entry.id, guidance: entry.guidance })),
      });

      if (payload.action?.type === 'implement' && run.projectMode !== 'greenfield' && run.taskContract?.flags?.baselineRequired === true && run.baselineStatus === 'pending') {
        const commandRefs = [...new Set(obligations
          .filter((obligation) => obligation.evidenceClass === 'hard')
          .flatMap((obligation) => obligation.allowedCommandRefs))].slice(0, 3);
        if (commandRefs.length > 0 && run.runStartWorkspaceIdentity === run.currentWorkspaceIdentity) {
          payload.action = {
            type: 'baseline-required',
            guidance: 'The Kernel host must capture the bound baseline commands before implementation.',
            commandRefs,
          };
        }
      }
      if (payload.action?.type === 'implement' && run.implementationContext) {
        payload.action.projectContext = {
          ...run.implementationContext,
          baseline: run.baselineStatus === 'captured'
            ? { status: 'captured', failures: run.baselineFailures }
            : run.implementationContext.baseline,
        };
      }
      // K2: the model is handed ONE work unit, never the whole plan. A synthetic
      // step carries the run itself, so a simple task looks exactly as before.
      const requestedStep = stepId
        ? this.ensureRunStepsMigrated(runId).find((entry) => entry.stepId === stepId && entry.planRevision === run.planRevision)
        : null;
      const step = requestedStep || this.getCurrentStep(runId);
      if (step && ['implement', 'fix', 'review', 'report'].includes(payload.action?.type)) {
        payload.action.step = {
          stepId: step.stepId,
          objective: step.objective,
          acceptanceIds: step.acceptanceIds,
          allowedPaths: step.allowedPaths,
          forbiddenPaths: step.forbiddenPaths,
        };
      }
      payload.completion = computeCompletionView({
        run,
        step,
        verifications: store.getVerifications(runId),
        obligations,
        reviews: store.listReviewReceipts(runId),
        completionDecision: store.getCompletionDecision(runId),
      });
      return payload;
    },

    // Greenfield/Brownfield guidance is attached to the one action that can
    // use it, instead of living in an API the host loop never calls (P1-3).
    // The mode itself stays an internal policy signal and is never named in
    // the model-visible payload; only its consequences are.
    async buildImplementationContext(runId, run) {
      if (run.projectMode === 'greenfield') {
        return {
          walkingSkeleton: planWalkingSkeleton({
            projectType: run.taskContract?.flags?.projectType || 'library',
            objective: run.objective,
            taskContract: run.taskContract || {},
          }),
        };
      }
      const scan = scanRepositoryEvidence({ projectRoot });
      const baseline = await this.captureBaselineIfPossible(runId, run);
      return {
        entrypoints: scan.entrypoints,
        manifests: scan.manifests,
        knownCommands: [...scan.testCommands, ...scan.buildCommands].map((entry) => entry.commandRef),
        baseline,
      };
    },

    // A baseline is only meaningful before the workspace changes. When the run
    // is still at its start identity we capture it automatically; afterwards we
    // say so honestly instead of pretending failures are pre-existing.
    async captureBaselineIfPossible(runId, run) {
      if ((run.baselineFailures || []).length > 0) return { status: 'captured', failures: run.baselineFailures };
      if (String(env.MOON_RELAY_KERNEL_BASELINE || 'auto') === 'off') return { status: 'disabled' };
      if (run.projectMode === 'greenfield') return { status: 'not-applicable' };
      if (!run.runStartWorkspaceIdentity || run.currentWorkspaceIdentity !== run.runStartWorkspaceIdentity) {
        return { status: 'unavailable-workspace-already-changed' };
      }
      const commandRefs = [...new Set(store.getRunObligations(runId)
        .filter((obligation) => obligation.evidenceClass === 'hard')
        .flatMap((obligation) => obligation.allowedCommandRefs))].slice(0, 3);
      if (commandRefs.length === 0) return { status: 'no-bound-commands' };
      const baseline = await this.captureBaseline(runId, { commandRefs, timeoutMs: 120000 });
      return { status: 'captured', commandRefs, failures: baseline.baselineFailures };
    },

    // Brownfield repository scan (§16.2): objective-relevant evidence only.
    scanEvidence() {
      return scanRepositoryEvidence({ projectRoot });
    },

    // Greenfield walking-skeleton plan (§15.4): only meaningful for greenfield
    // runs; returns the minimal runnable slice and the project-type evidence.
    async greenfieldPlan(runId, { projectType = 'library', taskContract = {} } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      return {
        projectMode: run.projectMode,
        applicable: run.projectMode === 'greenfield',
        plan: planWalkingSkeleton({ projectType, objective: run.objective, taskContract }),
      };
    },

    // Capture a pre-change baseline (§16.3): run the requested trusted commands
    // and persist which already fail, so later failures can be classified.
    async captureBaseline(runId, { commandRefs = [], timeoutMs } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const baseline = captureBaselineProof({
        projectRoot,
        commandRefs,
        timeoutMs,
        evidenceDir: run.projectId
          ? path.join(resolveRunArtifactPaths({ runtimeHome, projectId: run.projectId, runId }).evidence, 'baseline')
          : path.join(runtimeHome, 'evidence', runId, 'baseline'),
      });
      store.observeWorkspaceIdentity(runId, baseline.workspaceIdentity);
      store.setBaselineFailures(runId, baseline.baselineFailures);
      store.setBaselineStatus(runId, 'captured');
      return baseline;
    },

    // Deterministic resume: reconstructs the next action from persisted SQLite
    // state alone (never chat history), and detects a live lease held by a
    // different runner so concurrent processes do not stomp the same run.
    async resume(runId) {
      try {
        preflight(runId, 'resume');
      } catch (error) {
        return bindingErrorPayload(error, { projectRoot, provider: hostProvider });
      }
      const run = store.getRun(runId);
      if (!run) return { schemaVersion: 1, runId, status: 'not_found' };
      const leaseResult = store.acquireLease(runId, { holder, ttlMs: SESSION_LEASE_TTL_MS });
      if (!leaseResult.acquired) {
        return { schemaVersion: 1, runId, status: 'lease-conflict', lease: leaseResult.lease, next: await this.next(runId) };
      }
      const attempts = store.getAttempts(runId);
      const verifications = store.getVerifications(runId);
      const lastValidEvidence = verifications.filter((verification) => verification.status === 'passed').at(-1) || null;
      return {
        schemaVersion: 1,
        runId,
        status: run.status === 'completed' ? 'completed' : run.status === 'blocked' ? 'blocked' : 'resumed',
        state: run.state,
        mutationRevision: run.mutationRevision,
        attemptCount: attempts.length,
        blockedReason: run.blockedReason || null,
        lastValidEvidence: lastValidEvidence ? { obligationId: lastValidEvidence.obligationId, evidenceDigest: lastValidEvidence.evidenceDigest, executor: lastValidEvidence.executor } : null,
        next: await this.next(runId),
      };
    },

    // Model-visible command 2 of 2: submit work. The Kernel re-observes the
    // workspace, executes requested trusted verifications itself, records
    // evidence, advances state, and finalizes when everything required passed.
    async report(runId, payload = {}) {
      try {
        preflight(runId, payload?.blocker ? 'blocker' : 'report');
      } catch (error) {
        return bindingErrorPayload(error, { projectRoot, provider: hostProvider });
      }
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      // A completed run is only *done* when finalization also completed
      // (P0-7); a partial finalization stays retryable instead of reporting a
      // success the Kernel did not actually achieve.
      if (run.status === 'completed' && run.finalizationStatus === 'completed') {
        return { schemaVersion: 1, runId, status: 'completed', next: await this.next(runId) };
      }

      // Enforce the run lease before mutating any state (F4). If another runner
      // holds a live lease, refuse the report so concurrent processes cannot
      // interleave attempts, transitions, and finalization on the same run.
      const leaseResult = store.acquireLease(runId, { holder, ttlMs: REPORT_LEASE_TTL_MS });
      if (!leaseResult.acquired) {
        return { schemaVersion: 1, runId, status: 'lease-conflict', lease: leaseResult.lease, next: await this.next(runId) };
      }
      const fencingToken = leaseResult.lease.fencingToken;
      try {
        return await this.reportUnderLease(runId, payload, { fencingToken });
      } finally {
        // The lease is released when the command finishes so the next CLI
        // process — a different PID, same session — is never locked out (P0-6).
        store.releaseLease(runId, { holder, fencingToken });
      }
    },

    async reportUnderLease(runId, payload, { fencingToken }) {
      const run = store.getRun(runId);
      const evidenceRejected = (failures) => {
        const currentRun = store.getRun(runId);
        return {
          schemaVersion: 1,
          runId,
          status: 'evidence-rejected',
          executed: [],
          failures,
          finalization: null,
          next: buildNextPayload({
            run: currentRun,
            verifications: store.getVerifications(runId),
            requiredObligations: currentRun.requiredObligations,
            obligations: store.getRunObligations(runId),
            contract: currentRun.taskContract ? contractBriefing(currentRun.taskContract) : null,
            failures,
          }),
        };
      };
      // A run that already reached accepted completion but whose finalization
      // is partial re-enters finalization instead of restarting the loop.
      if (run.status === 'completed' && run.finalizationStatus !== 'completed') {
        const retried = await this.finalizeRun(runId, {
          gitCloseoutRequest: payload?.gitCloseoutRequest || null,
          changedPaths: Array.isArray(payload?.changedPaths) ? payload.changedPaths : [],
          knowledgeObservations: Array.isArray(payload?.knowledgeObservations) ? payload.knowledgeObservations : [],
        });
        const finalRun = store.getRun(runId);
        return {
          schemaVersion: 1,
          runId,
          status: retried.finalizationStatus === 'completed' ? 'completed' : 'finalization-incomplete',
          executed: [],
          failures: [],
          finalization: retried,
          next: await this.next(runId),
        };
      }

      const report = normalizeReport(payload);

      // Project-owned required_verification records are compiled when the
      // actual changed scope becomes known. This keeps a report's binding
      // exact without requiring the project to predict paths in the initial
      // compact contract.
      if (report.changedPaths.length > 0 && typeof store.listKnowledgeRecords === 'function') {
        const currentContractRun = store.getRun(runId);
        const scopedObligations = compileRunObligations({
          projectRoot,
          requiredChecks: [],
          contract: currentContractRun.taskContract,
          contractRevision: currentContractRun.contractRevision,
          commands: discoverProjectCommands({ projectRoot }),
          knowledgeRecords: store.listKnowledgeRecords({ projectId: currentContractRun.projectId, statuses: ['committed'] }),
          changedPaths: report.changedPaths,
        }).filter((obligation) => obligation.sourceType === 'knowledge');
        if (scopedObligations.length > 0) {
          store.declareRunObligations(runId, scopedObligations);
          store.escalateRun(runId, { addObligations: scopedObligations.map((obligation) => obligation.obligationId) });
        }
      }

      if (report.blocker) {
        if (typeof store.recordRunSignals === 'function') {
          store.recordRunSignals(runId, buildStructuredRunSignals({
            runId,
            blocker: { ...report.blocker, blockerReceipt: `blocker://${runId}/${report.blocker.reason}` },
            changedPaths: report.changedPaths,
          }));
        }
        store.markRunBlocked(runId, report.blocker.reason);
        await projectRunState(store.getRun(runId), { runtimeHome });
        return buildBlockedResponse({ runId, reason: report.blocker.reason, detail: report.blocker.detail || null });
      }
      if (run.status === 'blocked') store.resumeBlockedRun(runId);

      // K1: a report answers a capsule. A report that names a capsule the
      // Kernel never issued, or one built against a workspace the run has
      // already moved past, is refused before any evidence is executed — and a
      // change outside the capsule's work unit is a scope violation, not a
      // stylistic problem.
      // K2: which unit of work this report answers, resolved from the ledger
      // rather than from whatever the model remembered.
      const stepResolution = this.resolveReportStep(runId, report);
      const activeStep = stepResolution.step || null;

      // A stale named capsule remains a capsule/scope failure even when the
      // active attempt carrying it also has stale mutation lineage. Preserve
      // that public rejection class while still refusing the report before
      // any proof can run.
      const lineageRejection = stepResolution.rejection;
      const hasAttemptLineageRejection = lineageRejection
        && lineageRejection.some((failure) => failure.errorCode === 'attempt_lineage_incomplete');
      const scopeStep = activeStep
        || (report.stepId ? store.getRunStep(runId, report.stepId) : this.getCurrentStep(runId));
      const capsuleScopeRejection = hasAttemptLineageRejection
        ? this.assertCapsuleScope(runId, report, scopeStep)
        : null;
      const staleCapsuleRejection = hasAttemptLineageRejection
        && (report.capsuleId || capsuleScopeRejection)
        ? capsuleScopeRejection || [{
          obligationId: 'capsule',
          command: 'kernel report',
          errorSummary: `Execution capsule "${report.capsuleId}" no longer describes this run: ${lineageRejection.map((failure) => failure.errorSummary).join(', ')}`,
          errorCode: 'capsule_lineage_incomplete',
        }]
        : null;
      const capsuleRejection = staleCapsuleRejection || lineageRejection || this.assertCapsuleScope(runId, report, activeStep);
      if (capsuleRejection) {
        const currentRun = store.getRun(runId);
        return {
          schemaVersion: 1,
          runId,
          status: staleCapsuleRejection ? 'scope-rejected' : stepResolution.rejection ? 'step-rejected' : 'scope-rejected',
          executed: [],
          failures: capsuleRejection,
          finalization: null,
          next: buildNextPayload({
            run: currentRun,
            verifications: store.getVerifications(runId),
            requiredObligations: currentRun.requiredObligations,
            obligations: store.getRunObligations(runId),
            contract: currentRun.taskContract ? contractBriefing(currentRun.taskContract) : null,
            failures: capsuleRejection,
          }),
        };
      }

      // A refined contract (new constraints, or the evidence plan the model
      // produced in FRAME) is persisted before any execution (P0-5). A plain
      // acceptance string is allowed at bootstrap, but proof cannot begin
      // until every unplanned criterion is bound to an AC-specific plan. Scope
      // and capsule admission are checked first so an invalid work-unit
      // report remains a scope/step rejection even though it also lacks proof
      // plans; neither path executes a command.
      const hasProofSubmission = report.verifications.length > 0 || report.judgments.length > 0;
      const currentRunForEvidence = store.getRun(runId);
      const missingEvidencePlanIds = (currentRunForEvidence.taskContract?.acceptance || [])
        .filter((item) => !item.evidencePlan)
        .map((item) => item.id);
      try {
        if (report.evidencePlans.length > 0) {
          assertEvidencePlanSubmission(currentRunForEvidence.taskContract || {}, report.evidencePlans);
          const revised = applyEvidencePlans(currentRunForEvidence.taskContract, report.evidencePlans);
          if (revised) await this.reviseContract(runId, revised);
        } else if (hasProofSubmission && missingEvidencePlanIds.length > 0) {
          throw new Error(`MISSING_EVIDENCE_PLAN: proof requires plans for ${missingEvidencePlanIds.join(', ')}`);
        }
      } catch (error) {
        return evidenceRejected([{
          obligationId: 'evidence-plan',
          command: 'evidence-plan',
          errorSummary: error.message,
          errorCode: error.code || 'MISSING_EVIDENCE_PLAN',
          ...(error.detail ? { detail: error.detail } : {}),
        }]);
      }

      // Canonicalize legacy statement coverage and reject coverage that is
      // unknown or belongs to a different acceptance-bound obligation before
      // any command can execute.
      const currentContractRun = store.getRun(runId);
      const coverageFailures = [];
      for (const request of report.verifications) {
        const obligationId = request.obligationId || request.commandRef;
        const declared = store.getRunObligation(runId, obligationId);
        try {
          request.acceptanceCoverage = normalizeAcceptanceCoverage({
            contract: currentContractRun.taskContract || {},
            acceptanceCriteria: currentContractRun.acceptanceCriteria || [],
            obligation: declared,
            coverage: request.acceptanceCoverage || [],
          });
        } catch (error) {
          coverageFailures.push({
            obligationId,
            commandRef: request.commandRef,
            errorSummary: error.message,
            errorCode: error.code || 'ACCEPTANCE_COVERAGE_INVALID',
            ...(error.detail ? { detail: error.detail } : {}),
          });
        }
      }
      if (coverageFailures.length > 0) return evidenceRejected(coverageFailures);

      // Each report is a durable attempt; the number is derived from persisted
      // rows so retry counting survives restarts.
      // Compatibility projection only. Completion, retry, and lineage below
      // use the step attempt returned by the canonical work-attempt authority.
      const attempt = store.recordAttempt(runId, { attemptNumber: store.nextAttemptNumber(runId), state: run.state, status: 'started' });

      const waveAttempt = stepResolution.attempt || null;
      const boundWorkspaceId = report.workspaceId || waveAttempt?.workspaceId || null;
      const boundWorkspace = boundWorkspaceId && store.getProjectWorkspace
        ? store.getProjectWorkspace(boundWorkspaceId)
        : null;
      const observation = observeWorkspaceIdentity({ projectRoot: boundWorkspace?.canonicalRoot || projectRoot });
      // A Worker Worktree has its own identity and mutation lock. Observing it
      // must not advance the Parent Delivery Workspace mutation revision; the
      // revision advances once, after Integration materializes the Wave.
      const observed = stepResolution.activeWave
        ? { changed: false, run: store.getRun(runId) }
        : store.observeWorkspaceIdentity(runId, observation.identity);

      // The step moves to `running` and opens its own attempt row, so retries
      // and failures are counted per unit of work rather than per run. The
      // canonical row is opened only after the pre-execution evidence binding
      // checks below; a rejected command must not leave a live attempt that a
      // legacy retry cannot identify.
      let stepAttempt = null;

      const failures = [];
      const executed = [];

      // Binding pre-check (P0-2): a requested verification whose command is not
      // bound to its obligation is rejected BEFORE anything runs, so a passing
      // unrelated command can never be filed under a required obligation.
      const bindingFailures = [];
      for (const request of report.verifications) {
        const obligationId = request.obligationId || request.commandRef;
        const declared = store.getRunObligation(runId, obligationId);
        if (!declared || declared.sourceType === 'ad-hoc') continue;
        try {
          assertCommandBinding(declared, request.commandRef);
        } catch (error) {
          if (!(error instanceof ObligationBindingError)) throw error;
          bindingFailures.push({
            obligationId,
            commandRef: request.commandRef,
            errorSummary: error.message,
            allowedCommandRefs: declared.allowedCommandRefs,
            requiredEvidenceClass: declared.evidenceClass,
          });
        }
      }
      if (bindingFailures.length > 0) {
        const currentRun = store.getRun(runId);
        return {
          schemaVersion: 1,
          runId,
          status: 'evidence-rejected',
          executed: [],
          failures: bindingFailures,
          finalization: null,
          next: buildNextPayload({
            run: currentRun,
            verifications: store.getVerifications(runId),
            requiredObligations: currentRun.requiredObligations,
            obligations: store.getRunObligations(runId),
            contract: currentRun.taskContract ? contractBriefing(currentRun.taskContract) : null,
            failures: bindingFailures,
          }),
        };
      }

      if (activeStep) {
        const boundCapsule = report.capsuleId ? store.getExecutionCapsule(report.capsuleId, { runId }) : null;
        stepAttempt = waveAttempt || stepResolution.attempt || store.getActiveStepAttempt(runId, {
          stepId: activeStep.stepId,
          attemptId: report.attemptId,
          capsuleId: report.capsuleId,
          waveId: stepResolution.activeWave?.waveId || null,
        });
        if (!stepAttempt) {
          stepAttempt = this.beginAttempt(runId, {
            stepId: activeStep.stepId,
            bindingId: store.getRunOwnerBinding?.(runId)?.bindingId || null,
            capsuleId: report.capsuleId,
            capsuleDigest: boundCapsule?.provenance?.capsuleDigest || null,
            routeDecisionId: boundCapsule?.provenance?.routeDecisionId || null,
            provenanceKind: boundCapsule?.provenance?.routeDecisionId ? 'routed' : 'owner-session',
            planRevision: activeStep.planRevision,
            mutationRevision: run.mutationRevision,
            workspaceIdentityStart: observation.identity,
            summary: report.summary || null,
            changedPaths: report.changedPaths,
            waveId: stepResolution.activeWave?.waveId || null,
            workspaceId: report.workspaceId || null,
            baseWorkspaceIdentity: stepResolution.activeWave?.baseWorkspaceIdentity || null,
          });
        }
        // Workspace observation is what advances mutationRevision for a direct
        // report. Bind the active attempt to that observed result before proof
        // and before a later process resumes it; a manually stale attempt with
        // no new workspace observation is still rejected by resolveReportStep.
        if (stepAttempt && observed.changed && !stepResolution.activeWave) {
          stepAttempt = this.attachAttemptLineage(stepAttempt.attemptId, {
            mutationRevision: observed.run.mutationRevision,
          });
        }
      }

      if (report.verifications.length > 0 || report.judgments.length > 0) {
        const current = store.getRun(runId);
        // Follow the route fixed at run start rather than the shortest path to
        // PROVE, so SHAPE is not silently skipped for boundary work (P1-1).
        const pathToProve = planRouteSteps(current.route?.stages, current.state, 'PROVE') ?? planStatePath(current.state, 'PROVE');
        if (pathToProve === null) throw new Error(`Cannot advance run ${runId} from ${current.state} to verification`);
        for (const stateStep of pathToProve) {
          await this.transition(runId, stateStep);
        }

        for (const request of report.verifications) {
          const obligationId = request.obligationId || request.commandRef;
          try {
            const declaredObligation = store.getRunObligation(runId, obligationId);
            const { execution } = await this.executeProof(runId, {
              obligationId,
              commandRef: request.commandRef,
              timeoutMs: request.timeoutMs,
              acceptanceCoverage: request.acceptanceCoverage || [],
              networkPolicy: request.networkPolicy || 'inherited',
              evidenceIdentity: request.evidenceIdentity || null,
              freshnessInputs: request.freshnessInputs || declaredObligation?.metadata?.freshnessInputs || null,
              allowEvidenceReuse: request.allowEvidenceReuse !== false,
            });
            // recordedStatus reflects flaky/self-mutation blocking policy, not
            // just the raw command exit; use it so the report is consistent
            // with what completion authority actually sees.
            const effectiveStatus = execution.recordedStatus || execution.status;
            executed.push({ obligationId, commandRef: request.commandRef, status: effectiveStatus, exitCode: execution.exitCode, evidenceDigest: execution.outputDigest, newRegression: request.newRegression === true, flaky: Boolean(execution.flaky), workspaceMutatedByProof: Boolean(execution.workspaceMutatedByProof) });
            if (effectiveStatus !== 'passed') {
              const flakyNote = execution.flaky ? ' (flaky: divergent pass/fail — requires a waiver to pass)' : '';
              const mutationNote = execution.workspaceMutatedByProof ? ' (verification command mutated tracked source; evidence invalid)' : '';
              failures.push({ obligationId, commandRef: request.commandRef, command: [execution.command, ...execution.args].join(' '), errorSummary: `${execution.errorSummary || ''}${flakyNote}${mutationNote}`.trim() || null });
            }
          } catch (error) {
            if (error instanceof UntrustedCommandError) {
              store.markRunBlocked(runId, 'unsafe-command');
              await projectRunState(store.getRun(runId), { runtimeHome });
              return buildBlockedResponse({ runId, reason: 'unsafe-command', detail: error.message });
            }
            // A requested isolation that cannot be truly enforced blocks the run
            // rather than recording a false security boundary (§11.5).
            if (error instanceof NetworkPolicyUnenforceableError) {
              store.markRunBlocked(runId, 'network-policy');
              await projectRunState(store.getRun(runId), { runtimeHome });
              return buildBlockedResponse({ runId, reason: 'network-policy', detail: error.message });
            }
            throw error;
          }
        }

        for (const judgment of report.judgments) {
          // A judgment standing in for a protected obligation (security, auth,
          // payment, migration) must name its reviewer and its reasoning, and
          // at T3 that reviewer may not be the implementer (§31).
          const declaredJudgment = store.getRunObligation(runId, judgment.obligationId);
          if (declaredJudgment?.protected) {
            if (!judgment.reviewerId || !judgment.rationale) {
              failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `Protected obligation "${judgment.obligationId}" requires a judgment with reviewerId and rationale` });
              continue;
            }
            // At T3 both identities are mandatory. Making the comparison
            // conditional on `implementerId` being present would let a caller
            // skip the independence gate simply by omitting the field.
            if (refreshedTier(store, runId) === 'T3') {
              if (!report.implementerId) {
                failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `T3 protected obligation "${judgment.obligationId}" requires the report to declare implementerId so reviewer independence can be checked` });
                continue;
              }
              if (judgment.reviewerId === report.implementerId) {
                failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `T3 protected obligation "${judgment.obligationId}" requires a reviewer independent of the implementer` });
                continue;
              }
            }
          }
          let judgmentEvidenceRef = `judgment://${runId}/${judgment.obligationId}`;
          let judgmentDigest = `sha256:${createHash('sha256').update(JSON.stringify(judgment)).digest('hex')}`;
          let judgmentCoverage = judgment.acceptanceCoverage || (judgment.acceptanceMapping || []).map((mapping) => mapping.acceptance);

          // K0: a protected or T3 judgment may not be self-asserted in the
          // report. It must name a Review Receipt whose reviewer lineage the
          // Kernel itself recorded, and that receipt must still describe the
          // workspace and evidence state the run is in now.
          const currentTier = refreshedTier(store, runId);
          if (reviewReceiptRequired({
            obligationId: judgment.obligationId,
            declared: declaredJudgment,
            proofTier: currentTier,
            independentReviewRequired: judgment.independentReviewRequired === true,
          })) {
            if (!judgment.reviewReceiptId) {
              failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `Obligation "${judgment.obligationId}" requires a reviewReceiptId: a review recorded by the Kernel from a routed reviewer session, not a reviewer identifier supplied in the report` });
              continue;
            }
            const receipt = store.getReviewReceipt(judgment.reviewReceiptId, { runId });
            if (!receipt) {
              failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `Review receipt "${judgment.reviewReceiptId}" does not exist for this run` });
              continue;
            }
            if (receipt.obligationId !== judgment.obligationId) {
              failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `Review receipt "${receipt.receiptId}" reviewed "${receipt.obligationId}" and cannot satisfy "${judgment.obligationId}"` });
              continue;
            }
            const lineage = evaluateReviewReceipt({
              receipt,
              run: store.getRun(runId),
              requireIndependentSession: currentTier === 'T3',
              requireFrontierClass: currentTier === 'T3',
              requireTrustedEnforcement: true,
              currentEvidenceDigest: digestOfEvidence(store.getVerifications(runId), { excludeObligationId: judgment.obligationId }),
            });
            if (!lineage.usable) {
              failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `Review receipt "${receipt.receiptId}" cannot prove "${judgment.obligationId}": ${lineage.reasons.join(', ')}` });
              continue;
            }
            if (judgment.verdict === 'pass' && receipt.verdict !== 'pass') {
              failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: `Review receipt "${receipt.receiptId}" recorded verdict "${receipt.verdict}" and cannot back a passing judgment` });
              continue;
            }
            judgmentEvidenceRef = reviewEvidenceRef(runId, receipt.receiptId);
            judgmentDigest = receipt.digest;
            judgmentCoverage = [...new Set([...(judgmentCoverage || []), ...receipt.acceptanceCoverage])];
          }

          await this.recordProof(runId, {
            obligationId: judgment.obligationId,
            status: judgment.verdict === 'pass' ? 'passed' : 'failed',
            evidenceRef: judgmentEvidenceRef,
            command: 'structured-judgment',
            exitCode: judgment.verdict === 'pass' ? 0 : 1,
            evidenceDigest: judgmentDigest,
            evidenceClass: 'judgment',
            acceptanceCoverage: judgmentCoverage,
          });
          if (judgment.verdict !== 'pass') {
            failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: judgment.reason || 'structured judgment failed' });
          }
        }
      }

      const refreshed = store.getRun(runId);
      const verifications = store.getVerifications(runId);
      const structuredSignals = buildStructuredRunSignals({
        runId,
        failures: failures.map((failure) => ({ ...failure, fingerprint: failure.fingerprint || failureFingerprint(failure) })),
        judgments: report.judgments,
        executed,
        changedPaths: report.changedPaths,
        verifications,
      });
      structuredSignals.invariantObservations = report.knowledgeObservations
        .filter((observation) => ['ontology_constraint', 'invariant', 'invariant_observation'].includes(observation?.proposedType || observation?.type))
        .map((observation) => ({ ...observation, evidenceRefs: observation.evidenceRefs || observation.evidenceRef || observation.evidenceDigest, scope: observation.scope || report.changedPaths }));
      structuredSignals.supersessionEvidence = report.knowledgeObservations
        .filter((observation) => Array.isArray(observation?.supersedes) || observation?.supersedes || observation?.supersedesId)
        .map((observation) => ({ ...observation, evidenceRefs: observation.evidenceRefs || observation.evidenceRef || observation.evidenceDigest, scope: observation.scope || report.changedPaths }));
      if (typeof store.recordRunSignals === 'function') store.recordRunSignals(runId, structuredSignals);
      const completionPreview = store.evaluateCompletion(runId);
      const outstanding = completionPreview.unsatisfiedObligations.map((entry) => entry.obligationId);

      // Settle the step BEFORE completion is considered: a step that passed
      // moves the cursor, and only a plan whose every step passed can reach
      // run-level completion.
      const stepOutcome = activeStep
        ? this.settleStep(runId, { step: activeStep, attempt: stepAttempt, report, failures, outstanding, observation })
        : null;
      const currentSteps = store.getRunSteps(runId, { planRevision: refreshed.planRevision });
      const wayfinderWaveIds = [...new Set(currentSteps.map((step) => step.waveId).filter(Boolean))];
      const deliveryIdentity = store.getRun(runId)?.currentWorkspaceIdentity;
      const integrationsFresh = wayfinderWaveIds.every((waveId) => {
        const wave = store.getRunWave?.(waveId);
        const receipts = store.getWaveIntegrationReceipts?.(waveId) || [];
        return wave?.status === 'integrated'
          && receipts.some((receipt) => receipt.status === 'integrated' && (!deliveryIdentity || receipt.deliveryWorkspaceIdentity === deliveryIdentity));
      });
      const stepsSettled = allStepsPassed(currentSteps, refreshed.planRevision) && integrationsFresh;

      let finalization = null;
      if (failures.length === 0 && outstanding.length === 0 && stepsSettled && verifications.length > 0 && refreshed.state === 'PROVE') {
        // Only the runner that still holds the lease it acquired may finalize.
        if (!store.isLeaseHeld(runId, { holder, fencingToken })) {
          return { schemaVersion: 1, runId, status: 'lease-conflict', lease: store.getLease(runId), next: await this.next(runId) };
        }
        finalization = await this.finalizeRun(runId, {
          gitCloseoutRequest: report.gitCloseoutRequest,
          changedPaths: report.changedPaths,
          knowledgeObservations: report.knowledgeObservations,
          structuredSignals,
        });
      }

      const finalRun = store.getRun(runId);
      // `completed` requires BOTH an accepted completion decision and a
      // finalization that actually finished (P0-7).
      const status = finalization?.completionStatus === 'accepted'
        ? (finalization.finalizationStatus === 'completed' ? 'completed' : 'finalization-incomplete')
        : failures.length > 0 ? 'evidence-failed' : 'in-progress';

      store.finishAttempt(attempt.id, failures.length > 0 ? 'failed' : 'finished');

      // Classify failures against the run's baseline so the model can tell
      // which failures it caused vs. pre-existing/unrelated breakage.
      const failureClassification = failures.length > 0
        ? classifyFailures({ baselineFailures: finalRun.baselineFailures || [], currentFailures: failures, changedPaths: report.changedPaths })
        : null;

      return {
        schemaVersion: 1,
        runId,
        status,
        attemptNumber: attempt.attemptNumber,
        mutationDetected: observed.changed,
        executed,
        failures,
        failureClassification,
        step: stepOutcome,
        finalization,
        next: buildNextPayload({
          run: finalRun,
          verifications: store.getVerifications(runId),
          requiredObligations: finalRun.requiredObligations,
          obligations: store.getRunObligations(runId),
          contract: finalRun.taskContract ? contractBriefing(finalRun.taskContract) : null,
          failures,
        }),
      };
    },

    async recordKnowledgeObservations(runId, { observations = [] } = {}) {
      return recordKnowledgeObservations({ store, runtimeHome, runId, observations });
    },

    async closeRun(runId) {
      const updated = store.transition(runId, 'CLOSE');
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async finalizeRun(runId, options = {}) {
      try { preflight(runId, 'finalize'); } catch (error) { return bindingErrorPayload(error, { projectRoot, provider: hostProvider }); }
      return finalizeRun({ store, runtimeHome, projectRoot, runId, ...options });
    },

    async retryGitCloseout(runId) {
      return retryGitCloseoutHelper(runId, { stateStore: store, repoRoot: projectRoot });
    },

    async assessCompletion(runId) {
      return store.evaluateCompletion(runId);
    },

    async status(runId) {
      try { preflight(runId, 'status'); } catch (error) { return bindingErrorPayload(error, { projectRoot, provider: hostProvider }); }
      const run = store.getRun(runId);
      if (!run) return null;
      const completion = store.evaluateCompletion(runId);
      return {
        run,
        completion,
        measurement: buildKernelMeasurement({
          run,
          completion,
          verifications: store.getVerifications(runId),
          attempts: store.getAttempts(runId),
          routeDecisions: store.listModelRouteDecisions(runId),
          usageReceipts: store.listModelUsageReceipts(runId),
        }),
      };
    },

    async addWaiver(runId, options) {
      const waiver = store.addWaiver(runId, options);
      const run = store.getRun(runId);
      if (run.evidenceTier === 'E2') {
        const pack = buildReleaseEvidencePack({
          objective: run.objective,
          proofTier: run.proofTier,
          acceptanceCoverage: run.acceptanceCriteria,
          acceptance: run.acceptanceCriteria,
          scope: [projectRoot],
          completionDecision: 'pending',
          checks: [...store.getVerifications(runId), waiver],
        });
        const digest = `sha256:${createHash('sha256').update(JSON.stringify({ pack, mutationRevision: run.mutationRevision })).digest('hex')}`;
        store.recordEvidencePack(runId, { tier: 'E2', pack, digest, mutationRevision: run.mutationRevision });
      }
      return waiver;
    },

    async close() {
      store.close();
    },
  };
};
