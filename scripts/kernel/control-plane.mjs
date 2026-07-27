import { createHash } from 'node:crypto';
import path from 'node:path';
import { openKernelStateStore } from './state-store.mjs';
import { buildContextReceipt } from './context-build.mjs';
import { resolveProofRoute } from './proof-route.mjs';
import { planDryRunWave } from './wave-plan.mjs';
import { planBoundedWaves } from './run/bounded-wave.mjs';
import { detectStagnation } from './run/stagnation.mjs';
import { recommendModelRouting, resolveModelRoute } from './run/model-routing.mjs';
import { normalizeHostCapabilities, resolveEnforcementStrategy, summarizeModelRouting } from './run/model-route-contract.mjs';
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
import { normalizeTaskContract, applyEvidencePlans, mergeContractRevision, contractBriefing, riskSummaryFromContract } from './task/task-contract.mjs';
import { compileRunObligations, assertCommandBinding, ObligationBindingError } from './run/obligation-compiler.mjs';
import { discoverProjectCommands } from './proof/command-catalog.mjs';
import { needsShape } from './route.mjs';
import { resolveHostSessionHolder, REPORT_LEASE_TTL_MS, SESSION_LEASE_TTL_MS } from './run/session-holder.mjs';
import { planWalkingSkeleton } from './task/greenfield-bootstrap.mjs';
import { buildImpactAnalysis } from './task/migration-workflow.mjs';
import { resolveReviewPlan, normalizeReviewVerdict, assertIndependentReview, assertIndependentReviewSession, classifyReviewFindings } from './proof/review-pipeline.mjs';
import { digestOfPaths, evaluateReviewReceipt, reviewEvidenceRef } from './proof/review-receipt.mjs';
import { isProtectedObligation } from './proof/protected-obligations.mjs';
import { hashSessionId } from './run/model-route-contract.mjs';
import { scanRepositoryEvidence } from './task/evidence-scan.mjs';
import { captureBaselineProof } from './proof/baseline-proof.mjs';
import { classifyFailures } from './proof/failure-classify.mjs';

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
  report: 'prove',
  finalize: 'close',
  done: 'close',
  blocked: 'understand',
});

// The route a run follows is fixed at start (P1-1) so SHAPE is never skipped
// for contract/boundary/migration work just because PROVE is reachable sooner.
const refreshedTier = (store, runId) => store.getRun(runId)?.proofTier;

// What a review claims to have reviewed: the evidence state at review time.
// Recording it in the receipt is what makes a review of an older evidence set
// visible instead of silently reusable.
const digestOfEvidence = (verifications = []) => `sha256:${createHash('sha256').update(JSON.stringify(
  verifications.map((verification) => ({
    obligationId: verification.obligationId,
    status: verification.status,
    evidenceDigest: verification.evidenceDigest || null,
  })),
)).digest('hex')}`;

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

export const createKernelControlPlane = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome, projectRoot = process.cwd(), holder: holderOption, env = process.env } = {}) => {
  const store = await openKernelStateStore({ runtimeHome, relayHome });
  const holder = resolveHostSessionHolder({ holder: holderOption, env, projectRoot });

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
    async startRun({ runId, objective, sourceIdentity, taskContract = {} } = {}) {
      const trustedSourceIdentity = computeKernelSourceIdentity({ projectRoot, objective: objective || taskContract.objective || 'Kernel execution task', taskContract });
      if (sourceIdentity && sourceIdentity !== trustedSourceIdentity) {
        throw new Error('sourceIdentity is computed by Kernel and cannot be caller-authored');
      }

      // Evidence-plan gate (§8): a structured acceptance criterion without a
      // plan for how it will be proven blocks the run before execution. The
      // normalized contract is what gets persisted, so constraints, non-goals,
      // risks, and evidence plans survive a process restart (P0-4/P0-5).
      const contract = normalizeTaskContract(taskContract, { objective: objective || taskContract.objective });

      const identity = resolveKernelProjectIdentity({ cwd: projectRoot });
      const projectId = identity.projectId;
      await ensureKnowledgeStoreDirectories(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
      const knowledgeRevisionStart = String(store.getProjectKnowledgeRevision(projectId));
      const hasKernelKnowledge = store.listKnowledgeRecords({ projectId }).length > 0;
      const projectMode = detectProjectMode({ projectRoot, hasKernelKnowledge });

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
      });

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
      });
      store.declareRunObligations(runId, obligations);

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

    // Host bootstrap (P0-1). The model only ever calls `next` and `report`, so
    // the run must come into existence without a model-visible `start` command.
    // ensureRun is idempotent: it creates the run on first call for a run id
    // and resumes it afterwards, and it is what `kernel next --contract-json`
    // uses to bootstrap a turn.
    async ensureRun({ runId, objective, taskContract = {} } = {}) {
      if (!runId) throw new Error('ensureRun requires a runId');
      const existing = store.getRun(runId);
      if (!existing) {
        const run = await this.startRun({ runId, objective, taskContract });
        return { status: 'created', run, next: await this.next(runId) };
      }
      // An existing run may still be refined: a contract that now carries
      // evidence plans or new constraints is a revision, never a new run.
      if (objective || (taskContract && Object.keys(taskContract).length > 0)) {
        // A revision may only refine the contract; scope it already carries is
        // never dropped, so a later turn cannot shrink the completion gate.
        const merged = mergeContractRevision(
          existing.taskContract,
          normalizeTaskContract(taskContract, { objective: objective || existing.objective }),
        );
        if (existing.taskContract && merged.digest !== existing.taskContract.digest) {
          await this.reviseContract(runId, merged);
        }
      }
      return { status: 'resumed', run: store.getRun(runId), next: await this.next(runId) };
    },

    // Persists a refined Task Contract and recompiles obligations against it,
    // so a plan supplied after FRAME is a binding change, not a note (P0-5).
    async reviseContract(runId, contract) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const updated = store.updateTaskContract(runId, contract);
      const obligations = compileRunObligations({
        projectRoot,
        requiredChecks: KERNEL_POLICY.requiredChecks[updated.proofTier] || ['default'],
        contract,
        contractRevision: updated.contractRevision,
      });
      store.declareRunObligations(runId, obligations);
      const merged = [...new Set([...updated.requiredObligations, ...obligations.map((obligation) => obligation.obligationId)])];
      const escalated = store.escalateRun(runId, { addObligations: merged });
      await projectRunState(escalated, { runtimeHome });
      return escalated;
    },

    async getRun(runId) {
      return store.getRun(runId);
    },

    async buildStageContext(runId, { stage = 'EXECUTE', taskContract = {}, principles, principleExtensions = [], stageRecords = [], references = [], evidence = [] } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const normalizedChangeSet = normalizeChangedContract(taskContract);
      const projectId = run.projectId || resolveKernelProjectIdentity({ cwd: projectRoot }).projectId;
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

    async transition(runId, nextState, options = {}) {
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

    async recordProof(runId, { obligationId = 'default', status, sourceIdentity, evidenceRef, command, exitCode = 0, evidenceDigest, acceptanceCoverage = [], evidenceClass = null } = {}) {
      const run = store.getRun(runId);
      const effectiveSourceIdentity = sourceIdentity || run?.sourceIdentity;
      const updated = store.recordVerification(runId, {
        obligationId,
        status,
        evidenceRef,
        sourceIdentity: effectiveSourceIdentity,
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

    // Measurement-based routing recommendation (policy only; no provider call).
    recommendRouting(runId, { independentReviewRequired = false } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const stagnation = this.detectStagnation(runId);
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
    async decideModelRoute(runId, { actionKind, obligationId = null, independentReviewRequired = false, planInvalid = false, architectureDeviation = false, protectedObligationFailed = false } = {}) {
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
        stagnant: this.detectStagnation(runId).stagnant,
        protectedObligationFailed,
        planInvalid,
        architectureDeviation,
        independentReviewRequired,
        currentPlanRevision: Number(run.contractRevision || 1),
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
      const modelInput = await this.next(runId);
      const decision = await this.decideModelRoute(runId, {
        actionKind: actionContext.actionKind || ACTION_FOR_MODEL_ACTION[modelInput.action?.type] || 'implement',
        obligationId: actionContext.obligationId ?? modelInput.action?.outstandingObligations?.[0] ?? null,
        independentReviewRequired: actionContext.independentReviewRequired === true,
        planInvalid: actionContext.planInvalid === true,
        architectureDeviation: actionContext.architectureDeviation === true,
        protectedObligationFailed: actionContext.protectedObligationFailed === true,
      });
      return {
        schemaVersion: 1,
        runId,
        modelInput,
        hostDirective: {
          modelRouteDecision: decision,
          hostCapabilities: capabilities,
          enforcementStrategy: resolveEnforcementStrategy(capabilities, decision),
        },
      };
    },

    // The Host reports what it actually ran. This is the only evidence that a
    // routing decision was honoured; without it the turn stays unobserved.
    async recordModelUsage(runId, usageReceipt = {}, { lateObservation = false } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (run.status === 'completed' && !lateObservation) {
        throw new Error(`Run ${runId} is completed; a late usage receipt requires an explicit late-observation flag`);
      }
      return store.recordModelUsageReceipt(runId, { ...usageReceipt, runId });
    },

    modelRoutingSummary(runId) {
      return summarizeModelRouting(store.listModelRouteDecisions(runId), store.listModelUsageReceipts(runId));
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
      const implementationSession = store.getLatestImplementationSession(runId);
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
        planRevision: Number(run.contractRevision || 1),
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
        subject: {
          workspaceIdentity: run.currentWorkspaceIdentity,
          mutationRevision: run.mutationRevision,
          changedPathsDigest: digestOfPaths(changedPaths),
          evidenceDigest: digestOfEvidence(store.getVerifications(runId)),
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

    // Within-run route/tier promotion only (§13.5). Demotion throws.
    async escalateRoute(runId, { proofTier, evidenceTier, addObligations = [] } = {}) {
      const updated = store.escalateRun(runId, { proofTier, evidenceTier, addObligations });
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    // Hard evidence path: the Kernel runtime resolves a trusted manifest
    // command, executes it itself, and binds the result to the workspace
    // identity observed immediately before execution.
    async executeProof(runId, { obligationId = 'default', commandRef, timeoutMs, acceptanceCoverage = [], flakyRerun = false, discovered = null, networkPolicy = 'inherited' } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const observation = observeWorkspaceIdentity({ projectRoot });
      store.observeWorkspaceIdentity(runId, observation.identity);

      const evidenceDir = path.join(runtimeHome, 'evidence', runId);
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
      });
      persistReleaseEvidenceIfNeeded(runId, updated);

      await projectRunState(updated, { runtimeHome });
      return { run: updated, execution: { ...execution, recordedStatus, flaky: blockedForFlaky, workspaceMutatedByProof } };
    },

    // Builds (and records a receipt for) the knowledge context of the run's
    // CURRENT stage, so an EXECUTE turn is not handed FRAME knowledge (P1-2).
    async refreshStageKnowledge(runId, { stage } = {}) {
      const run = store.getRun(runId);
      if (!run) return null;
      const effectiveStage = stage || run.state;
      const existing = store.getKnowledgeContextReceipt(runId, effectiveStage);
      const projectId = run.projectId;
      if (!projectId) return existing?.receiptJson || null;
      const knowledgeRevision = String(store.getProjectKnowledgeRevision(projectId));
      // Reuse the receipt when nothing about the stage or the knowledge base
      // changed; rebuilding on every `next` would re-verify records needlessly.
      if (existing && String(existing.knowledgeRevision) === knowledgeRevision) return existing.receiptJson;
      try {
        const context = await buildProjectKnowledgeContext({
          projectId,
          stage: effectiveStage,
          runId,
          objective: run.objective,
          changedPaths: run.taskContract?.changedPaths || [],
          projectRoot,
          stateStore: store,
          env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
        });
        store.recordKnowledgeContextReceipt(runId, {
          stage: effectiveStage,
          knowledgeRevision: context.knowledgeRevision,
          digest: context.digest,
          receiptJson: context,
        });
        return context;
      } catch {
        return existing?.receiptJson || null;
      }
    },

    // Model-visible command 1 of 2: what to do now.
    async next(runId) {
      const run = store.getRun(runId);
      if (!run) return { schemaVersion: 1, runId, status: 'not_found' };

      const stageContext = await this.refreshStageKnowledge(runId);
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

      if (payload.action?.type === 'implement') {
        payload.action.projectContext = await this.buildImplementationContext(runId, run);
      }
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
        evidenceDir: path.join(runtimeHome, 'evidence', runId, 'baseline'),
      });
      store.observeWorkspaceIdentity(runId, baseline.workspaceIdentity);
      store.setBaselineFailures(runId, baseline.baselineFailures);
      return baseline;
    },

    // Deterministic resume: reconstructs the next action from persisted SQLite
    // state alone (never chat history), and detects a live lease held by a
    // different runner so concurrent processes do not stomp the same run.
    async resume(runId) {
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

      // A refined contract (new constraints, or the evidence plan the model
      // produced in FRAME) is persisted before any execution (P0-5).
      if (run.taskContract && report.evidencePlans.length > 0) {
        const revised = applyEvidencePlans(run.taskContract, report.evidencePlans);
        if (revised) await this.reviseContract(runId, revised);
      }

      if (report.blocker) {
        store.markRunBlocked(runId, report.blocker.reason);
        await projectRunState(store.getRun(runId), { runtimeHome });
        return { schemaVersion: 1, runId, status: 'blocked', blockedReason: report.blocker.reason, blockedDetail: report.blocker.detail || null, next: await this.next(runId) };
      }
      if (run.status === 'blocked') store.resumeBlockedRun(runId);

      // Each report is a durable attempt; the number is derived from persisted
      // rows so retry counting survives restarts.
      const attempt = store.recordAttempt(runId, { attemptNumber: store.nextAttemptNumber(runId), state: run.state, status: 'started' });

      const observation = observeWorkspaceIdentity({ projectRoot });
      const observed = store.observeWorkspaceIdentity(runId, observation.identity);

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
            const { execution } = await this.executeProof(runId, {
              obligationId,
              commandRef: request.commandRef,
              timeoutMs: request.timeoutMs,
              acceptanceCoverage: request.acceptanceCoverage || [],
              networkPolicy: request.networkPolicy || 'inherited',
            });
            // recordedStatus reflects flaky/self-mutation blocking policy, not
            // just the raw command exit; use it so the report is consistent
            // with what completion authority actually sees.
            const effectiveStatus = execution.recordedStatus || execution.status;
            executed.push({ obligationId, commandRef: request.commandRef, status: effectiveStatus, exitCode: execution.exitCode, evidenceDigest: execution.outputDigest, flaky: Boolean(execution.flaky), workspaceMutatedByProof: Boolean(execution.workspaceMutatedByProof) });
            if (effectiveStatus !== 'passed') {
              const flakyNote = execution.flaky ? ' (flaky: divergent pass/fail — requires a waiver to pass)' : '';
              const mutationNote = execution.workspaceMutatedByProof ? ' (verification command mutated tracked source; evidence invalid)' : '';
              failures.push({ obligationId, commandRef: request.commandRef, command: [execution.command, ...execution.args].join(' '), errorSummary: `${execution.errorSummary || ''}${flakyNote}${mutationNote}`.trim() || null });
            }
          } catch (error) {
            if (error instanceof UntrustedCommandError) {
              store.markRunBlocked(runId, 'unsafe-command');
              await projectRunState(store.getRun(runId), { runtimeHome });
              return { schemaVersion: 1, runId, status: 'blocked', blockedReason: 'unsafe-command', blockedDetail: error.message, next: await this.next(runId) };
            }
            // A requested isolation that cannot be truly enforced blocks the run
            // rather than recording a false security boundary (§11.5).
            if (error instanceof NetworkPolicyUnenforceableError) {
              store.markRunBlocked(runId, 'network-policy');
              await projectRunState(store.getRun(runId), { runtimeHome });
              return { schemaVersion: 1, runId, status: 'blocked', blockedReason: 'network-policy', blockedDetail: error.message, next: await this.next(runId) };
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
      const completionPreview = store.evaluateCompletion(runId);
      const outstanding = completionPreview.unsatisfiedObligations.map((entry) => entry.obligationId);

      let finalization = null;
      if (failures.length === 0 && outstanding.length === 0 && verifications.length > 0 && refreshed.state === 'PROVE') {
        // Only the runner that still holds the lease it acquired may finalize.
        if (!store.isLeaseHeld(runId, { holder, fencingToken })) {
          return { schemaVersion: 1, runId, status: 'lease-conflict', lease: store.getLease(runId), next: await this.next(runId) };
        }
        finalization = await this.finalizeRun(runId, {
          gitCloseoutRequest: report.gitCloseoutRequest,
          changedPaths: report.changedPaths,
          knowledgeObservations: report.knowledgeObservations,
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
      return finalizeRun({ store, runtimeHome, projectRoot, runId, ...options });
    },

    async retryGitCloseout(runId) {
      return retryGitCloseoutHelper(runId, { stateStore: store, repoRoot: projectRoot });
    },

    async assessCompletion(runId) {
      return store.evaluateCompletion(runId);
    },

    async status(runId) {
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
