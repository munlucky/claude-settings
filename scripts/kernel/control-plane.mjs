import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { openKernelStateStore } from './state-store.mjs';
import { buildContextReceipt } from './context-build.mjs';
import { resolveProofRoute } from './proof-route.mjs';
import { planDryRunWave } from './wave-plan.mjs';
import { planBoundedWaves } from './run/bounded-wave.mjs';
import { detectStagnation } from './run/stagnation.mjs';
import { recommendModelRouting } from './run/model-routing.mjs';
import { buildReleaseEvidencePack } from './evidence-pack.mjs';
import { projectRunState } from './state-projector.mjs';
import { resolveKernelRuntimeHome } from './runtime-home.mjs';
import { KERNEL_POLICY, KernelPrinciplesError, loadKernelPrinciples } from './policy.mjs';
import { resolveKernelCapabilities } from './capability-resolver.mjs';
import { buildCandidateIdentity, gitTreeDigest, sha256Hex } from '../lib/candidate-identity.mjs';
import { resolveKernelProjectIdentity } from './project-identity.mjs';
import { ensureKnowledgeStoreDirectories } from './knowledge/store.mjs';
import { buildProjectKnowledgeContext } from './knowledge/context-load.mjs';
import { extractKnowledgeCandidates } from './knowledge/candidate-extract.mjs';
import { reviewKnowledgeCandidates } from './knowledge/candidate-review.mjs';
import { commitProjectKnowledge } from './knowledge/commit.mjs';
import { executeKernelGitCloseout, retryGitCloseout as retryGitCloseoutHelper } from './git/closeout.mjs';
import { normalizeChangedContract } from './change-contract.mjs';
import { VALID_TYPES, resolveRecordType } from './knowledge/records.mjs';
import { observeWorkspaceIdentity } from './run/workspace-identity.mjs';
import { executeTrustedProof, executeApprovedProof, executeWithFlakyRerun, UntrustedCommandError, CommandApprovalRequiredError } from './proof/proof-executor.mjs';
import { NetworkPolicyUnenforceableError } from './proof/network-policy.mjs';
import { buildNextPayload, normalizeReport, planStatePath } from './run/run-loop.mjs';
import { detectProjectMode } from './task/project-mode.mjs';
import { assertEvidencePlans, acceptanceStatements } from './task/evidence-plan.mjs';
import { planWalkingSkeleton } from './task/greenfield-bootstrap.mjs';
import { buildImpactAnalysis } from './task/migration-workflow.mjs';
import { resolveReviewPlan, normalizeReviewVerdict, assertIndependentReview } from './proof/review-pipeline.mjs';
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

export const buildKernelMeasurement = ({ run, completion, principles = loadKernelPrinciples(), verifications = [], attempts = [] }) => ({
  schemaVersion: 1,
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
  providerModelIdentity: unavailable('provider-usage-not-recorded'),
  estimatedStaticTokens: Math.ceil(JSON.stringify(principles.principles).length / 4),
  actualInputTokens: unavailable('provider-usage-not-recorded'),
  actualOutputTokens: unavailable('provider-usage-not-recorded'),
  successDecision: observed(completion.decision === 'accepted'),
  falseCompletionDecision: unavailable('false-completion-evaluation-not-run'),
  retryCount: observed(Math.max(0, attempts.length - 1)),
  replanCount: observed(run.replanCount || 0),
  userInterventionCount: observed(run.interventionCount || 0),
  wallClockMs: unavailable('run-duration-not-recorded'),
  evidenceCoverage: observed({ passed: verifications.filter((verification) => verification.status === 'passed').length, total: verifications.length, required: run.requiredObligations.length }),
  contaminationSignals: observed({ relayStateMutation: false, profileMutation: false, source: 'kernel-runtime-boundary' }),
});

export const createKernelControlPlane = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome, projectRoot = process.cwd(), holder = `${os.hostname()}:${process.pid}` } = {}) => {
  const store = await openKernelStateStore({ runtimeHome, relayHome });

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
      // plan for how it will be proven blocks the run before execution.
      const rawAcceptance = taskContract.acceptance || taskContract.acceptanceCriteria || [];
      assertEvidencePlans(rawAcceptance);

      const identity = resolveKernelProjectIdentity({ cwd: projectRoot });
      const projectId = identity.projectId;
      await ensureKnowledgeStoreDirectories(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
      const knowledgeRevisionStart = String(store.getProjectKnowledgeRevision(projectId));
      const hasKernelKnowledge = store.listKnowledgeRecords({ projectId }).length > 0;
      const projectMode = detectProjectMode({ projectRoot, hasKernelKnowledge });

      const normalizedChangeSet = normalizeChangedContract(taskContract);

      const riskSummary = {
        requestedTier: taskContract.riskTier || taskContract.proofTier || taskContract.requestedTier,
        filesChanged: normalizedChangeSet.changedFileCount,
        surfaces: taskContract.surfaces || [],
        crossLayer: taskContract.crossLayer || false,
      };
      const proofRoute = resolveProofRoute(riskSummary);

      const workspaceObservation = observeWorkspaceIdentity({ projectRoot });
      const run = store.createRun({
        runId,
        objective: objective || taskContract.objective || 'Kernel execution task',
        sourceIdentity: trustedSourceIdentity,
        workspaceIdentity: workspaceObservation.identity,
        proofTier: proofRoute.proofTier,
        evidenceTier: proofRoute.evidenceTier,
        requiredObligations: proofRoute.requiredChecks || ['default'],
        acceptanceCriteria: acceptanceStatements(rawAcceptance),
        requireReleaseEvidence: proofRoute.evidenceTier === 'E2',
        projectId,
        knowledgeRevisionStart,
        projectMode: projectMode.mode,
      });

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

    async recordProof(runId, { obligationId = 'default', status, sourceIdentity, evidenceRef, command, exitCode = 0, evidenceDigest, acceptanceCoverage = [] } = {}) {
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
        retryCount: Math.max(0, attempts.length - 1),
        independentReviewRequired,
      });
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
    async recordReview(runId, verdict = {}, { implementerId } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const normalized = normalizeReviewVerdict(verdict);
      if (run.proofTier === 'T3') {
        assertIndependentReview({ verdict: normalized, implementerId });
      }
      const obligationId = `review-${normalized.stage}`;
      const updated = await this.recordProof(runId, {
        obligationId,
        status: normalized.verdict === 'pass' ? 'passed' : 'failed',
        evidenceRef: `review://${runId}/${normalized.stage}`,
        command: 'structured-review',
        exitCode: normalized.verdict === 'pass' ? 0 : 1,
        evidenceDigest: `sha256:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`,
      });
      return { review: normalized, run: updated };
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

    // Model-visible command 1 of 2: what to do now.
    async next(runId) {
      const run = store.getRun(runId);
      if (!run) return { schemaVersion: 1, runId, status: 'not_found' };
      const latestReceipt = store.getKnowledgeContextReceipt(runId, run.state) || store.getKnowledgeContextReceipt(runId, 'FRAME');
      return buildNextPayload({
        run,
        verifications: store.getVerifications(runId),
        requiredObligations: run.requiredObligations,
        knowledgePromptBlock: latestReceipt?.receiptJson?.promptBlock || null,
      });
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
      const leaseResult = store.acquireLease(runId, { holder });
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
      if (run.status === 'completed') {
        return { schemaVersion: 1, runId, status: 'completed', next: await this.next(runId) };
      }

      // Enforce the run lease before mutating any state (F4). If another runner
      // holds a live lease, refuse the report so concurrent processes cannot
      // interleave attempts, transitions, and finalization on the same run.
      const leaseResult = store.acquireLease(runId, { holder });
      if (!leaseResult.acquired) {
        return { schemaVersion: 1, runId, status: 'lease-conflict', lease: leaseResult.lease, next: await this.next(runId) };
      }

      const report = normalizeReport(payload);

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

      if (report.verifications.length > 0 || report.judgments.length > 0) {
        const current = store.getRun(runId);
        const pathToProve = planStatePath(current.state, 'PROVE');
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
          const judgmentDigest = `sha256:${createHash('sha256').update(JSON.stringify(judgment)).digest('hex')}`;
          await this.recordProof(runId, {
            obligationId: judgment.obligationId,
            status: judgment.verdict === 'pass' ? 'passed' : 'failed',
            evidenceRef: `judgment://${runId}/${judgment.obligationId}`,
            command: 'structured-judgment',
            exitCode: judgment.verdict === 'pass' ? 0 : 1,
            evidenceDigest: judgmentDigest,
            acceptanceCoverage: judgment.acceptanceCoverage || (judgment.acceptanceMapping || []).map((mapping) => mapping.acceptance),
          });
          if (judgment.verdict !== 'pass') {
            failures.push({ obligationId: judgment.obligationId, command: 'structured-judgment', errorSummary: judgment.reason || 'structured judgment failed' });
          }
        }
      }

      const refreshed = store.getRun(runId);
      const verifications = store.getVerifications(runId);
      const passedObligations = new Set(verifications.filter((verification) => verification.status === 'passed').map((verification) => verification.obligationId));
      const outstanding = refreshed.requiredObligations.filter((obligation) => !passedObligations.has(obligation));

      let finalization = null;
      if (failures.length === 0 && outstanding.length === 0 && verifications.length > 0 && refreshed.state === 'PROVE') {
        finalization = await this.finalizeRun(runId, {
          gitCloseoutRequest: report.gitCloseoutRequest,
          changedPaths: report.changedPaths,
          knowledgeObservations: report.knowledgeObservations,
        });
      }

      const finalRun = store.getRun(runId);
      const status = finalization?.completionStatus === 'accepted'
        ? 'completed'
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
        next: buildNextPayload({ run: finalRun, verifications: store.getVerifications(runId), requiredObligations: finalRun.requiredObligations, failures }),
      };
    },

    async recordKnowledgeObservations(runId, { observations = [], approvals = [] } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      if (!run.projectId) throw new Error(`Run ${runId} has no projectId`);

      const ALLOWED_TYPES = new Set([
        'semantic_fact',
        'architecture_decision',
        'domain_term',
        'component_boundary',
        'api_contract',
        'kg_relation',
        'ontology_constraint',
        'tacit_observation',
        'episodic_observation',
        'tacit_practice',
        'known_failure_pattern',
        'required_verification',
      ]);

      const candidates = [];
      for (const obs of observations) {
        if (!obs || typeof obs !== 'object') continue;
        const proposedType = resolveRecordType(obs.proposedType || obs.type || 'semantic_fact');
        if (!ALLOWED_TYPES.has(proposedType)) {
          throw new Error(`INVALID_CANDIDATE_TYPE: ${proposedType} is not an allowed candidate type`);
        }
        const candidateId = obs.candidateId || obs.id || `cand-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        candidates.push({
          candidateId,
          runId,
          projectId: run.projectId,
          proposedType,
          statement: obs.statement || '',
          scope: obs.scope || [],
          sourceRefs: obs.sourceRefs || [],
          evidenceRefs: obs.evidenceRefs || [],
          status: 'pending',
          ...obs,
          candidateId,
        });
      }

      const verifications = store.getVerifications(runId);
      const lastVer = verifications[verifications.length - 1];
      const evidencePack = lastVer ? { status: lastVer.status, digest: lastVer.evidenceDigest } : null;

      const reviewResult = await reviewKnowledgeCandidates({
        projectId: run.projectId,
        runId,
        stateStore: store,
        candidates,
        evidencePack,
        env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
      });

      const allReviewed = [
        ...(reviewResult.verifiedCandidates || []),
        ...(reviewResult.rejectedCandidates || []),
        ...(reviewResult.needsApprovalCandidates || []),
        ...(reviewResult.pendingVerificationCandidates || []),
      ];

      for (const candidate of allReviewed) {
        store.recordKnowledgeCandidate(candidate.candidateId, runId, {
          projectId: run.projectId,
          proposedType: candidate.proposedType || 'semantic_fact',
          status: candidate.status,
          candidateJson: candidate,
        });
      }

      const reviewDigest = createHash('sha256').update(JSON.stringify(reviewResult)).digest('hex');
      store.recordKnowledgeReviewReceipt(runId, {
        projectId: run.projectId,
        status: reviewResult.status,
        candidateCount: candidates.length,
        verifiedCount: (reviewResult.verifiedCandidates || []).length,
        rejectedCount: (reviewResult.rejectedCandidates || []).length,
        waitingApprovalCount: (reviewResult.needsApprovalCandidates || []).length,
        waitingVerificationCount: (reviewResult.pendingVerificationCandidates || []).length,
        reviewDigest,
        receiptJson: reviewResult,
      });

      return reviewResult;
    },

    async closeRun(runId) {
      const updated = store.transition(runId, 'CLOSE');
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async finalizeRun(runId, { gitCloseoutRequest = null, changedPaths = [], changedFileCount = null, knowledgeObservations = [], approvals = [] } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const normalizedChangeSet = normalizeChangedContract({ changedPaths, changedFileCount });

      if (Array.isArray(approvals)) {
        for (const app of approvals) {
          if (app && app.candidateId && app.approvedBy && app.approvalReceipt) {
            store.recordKnowledgeApproval(`app-${crypto.randomUUID()}`, {
              runId,
              candidateId: app.candidateId,
              approvedBy: app.approvedBy,
              approvalReceipt: app.approvalReceipt,
            });
          }
        }
      }

      // Step 1: Observation review BEFORE completion assessment
      let reviewResult = { status: 'no_candidates', verifiedCandidates: [], rejectedCandidates: [] };
      if (Array.isArray(knowledgeObservations) && knowledgeObservations.length > 0) {
        reviewResult = await this.recordKnowledgeObservations(runId, { observations: knowledgeObservations, approvals });
      } else {
        const dbCandidates = store.getKnowledgeCandidates(runId).map((c) => c.candidateJson);
        if (dbCandidates.length > 0) {
          const verifications = store.getVerifications(runId);
          const lastVer = verifications[verifications.length - 1];
          const evidencePack = lastVer ? { status: lastVer.status, digest: lastVer.evidenceDigest } : null;
          reviewResult = await reviewKnowledgeCandidates({
            projectId: run.projectId,
            runId,
            stateStore: store,
            candidates: dbCandidates,
            evidencePack,
            env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
          });

          const reviewDigest = createHash('sha256').update(JSON.stringify(reviewResult)).digest('hex');
          store.recordKnowledgeReviewReceipt(runId, {
            projectId: run.projectId,
            status: reviewResult.status,
            candidateCount: dbCandidates.length,
            verifiedCount: (reviewResult.verifiedCandidates || []).length,
            rejectedCount: (reviewResult.rejectedCandidates || []).length,
            waitingApprovalCount: (reviewResult.needsApprovalCandidates || []).length,
            waitingVerificationCount: (reviewResult.pendingVerificationCandidates || []).length,
            reviewDigest,
            receiptJson: reviewResult,
          });
        }
      }

      if (!['passed', 'no_candidates'].includes(reviewResult.status)) {
        const blockedReceipt = {
          schemaVersion: 1,
          runId,
          projectId: run.projectId,
          completionStatus: 'blocked',
          knowledgeStatus: 'blocked',
          projectionStatus: 'none',
          gitCloseoutStatus: 'skipped',
          finalizationStatus: `blocked_${reviewResult.status}`,
          reviewResult,
          reason: `knowledge_review_${reviewResult.status}`,
        };
        store.recordFinalizationReceipt(runId, blockedReceipt);
        return blockedReceipt;
      }

      // Step 2: Pre-flight completion gates BEFORE closing. CLOSE is terminal
      // (no transition back to PROVE), so closing a run whose acceptance,
      // hard-evidence, or release-evidence gates are unmet would strand it in
      // an unrecoverable blocked state. When gates are unmet, stay in the
      // current (recoverable) state and report which gates are missing.
      if (run.state !== 'CLOSE' && run.status !== 'completed') {
        const preflight = store.evaluateCompletion(runId);
        if (!preflight.readyExceptClose) {
          const recoverableReceipt = {
            schemaVersion: 1,
            runId,
            projectId: run.projectId,
            completionStatus: 'blocked',
            knowledgeStatus: 'skipped',
            projectionStatus: 'none',
            gitCloseoutStatus: 'skipped',
            finalizationStatus: 'incomplete_gates',
            completionResult: preflight,
            reviewResult,
            reason: 'completion_gates_unmet',
            unmetGates: Object.entries(preflight.gates).filter(([key, value]) => key !== 'isClosed' && !value).map(([key]) => key),
          };
          store.recordFinalizationReceipt(runId, recoverableReceipt);
          return recoverableReceipt;
        }
        store.transition(runId, 'CLOSE');
      }

      // Step 3: Assess & persist completion authority
      const completionEval = store.evaluateCompletion(runId);
      const completionRun = store.persistCompletionDecision(runId, completionEval);

      if (completionEval.decision !== 'accepted') {
        const blockedCompletionReceipt = {
          schemaVersion: 1,
          runId,
          projectId: run.projectId,
          completionStatus: completionEval.decision,
          knowledgeStatus: 'blocked',
          projectionStatus: 'none',
          gitCloseoutStatus: 'skipped',
          finalizationStatus: 'blocked_completion',
          completionResult: completionEval,
          reviewResult,
          reason: 'completion_not_accepted',
        };
        store.recordFinalizationReceipt(runId, blockedCompletionReceipt);
        return blockedCompletionReceipt;
      }

      // Step 4: Transactional Knowledge Commit (always called, handles candidates > 0 and no_change)
      let knowledgeStatus = 'skipped';
      let commitReceipt = null;
      let knowledgeCommitError = null;

      try {
        commitReceipt = await commitProjectKnowledge({
          runId,
          projectId: run.projectId,
          stateStore: store,
          expectedKnowledgeRevision: run.knowledgeRevisionStart,
          env: { MOON_RELAY_KERNEL_HOME: runtimeHome },
        });
        knowledgeStatus = commitReceipt.status || 'committed';
      } catch (err) {
        knowledgeStatus = 'failed';
        knowledgeCommitError = err.message;
      }

      // Step 5: Git closeout
      let gitCloseoutStatus = 'skipped';
      let gitReceipt = null;
      let gitCloseoutError = null;

      if (gitCloseoutRequest?.requested) {
        const commitReceiptRow = store.getKnowledgeCommitReceipt(runId);
        const knowledgeCommitReceipt = commitReceiptRow?.receiptJson;
        if (!knowledgeCommitReceipt) {
          gitCloseoutStatus = 'failed';
          gitCloseoutError = 'KNOWLEDGE_RECEIPT_REQUIRED: Explicit Git closeout requires knowledge commit receipt';
        } else {
          try {
            gitReceipt = await executeKernelGitCloseout({
              runId,
              projectId: run.projectId,
              stateStore: store,
              repoRoot: projectRoot,
              gitCloseoutRequest,
              knowledgeCommitReceipt,
              changedFiles: normalizedChangeSet.changedPaths,
            });
            gitCloseoutStatus = gitReceipt.status || 'completed';
          } catch (err) {
            gitCloseoutStatus = 'failed';
            gitCloseoutError = err.message;
          }
        }
      }

      // Step 6: Finalization receipt
      let finalizationStatus = 'completed';
      if (knowledgeStatus === 'failed' || gitCloseoutStatus === 'failed' || commitReceipt?.projectionStatus === 'failed') {
        finalizationStatus = 'partial';
      }

      const finalizationReceipt = {
        schemaVersion: 1,
        runId,
        projectId: run.projectId,
        completionStatus: completionEval.decision,
        knowledgeStatus,
        projectionStatus: commitReceipt?.projectionStatus || 'completed',
        gitCloseoutStatus,
        finalizationStatus,
        completionResult: completionEval,
        reviewResult,
        knowledgeCommitReceipt: commitReceipt,
        knowledgeCommitError,
        gitCloseoutReceipt: gitReceipt,
        gitCloseoutError,
      };

      store.recordFinalizationReceipt(runId, finalizationReceipt);
      await projectRunState(store.getRun(runId), { runtimeHome });

      return finalizationReceipt;
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
      return { run, completion, measurement: buildKernelMeasurement({ run, completion, verifications: store.getVerifications(runId), attempts: store.getAttempts(runId) }) };
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
