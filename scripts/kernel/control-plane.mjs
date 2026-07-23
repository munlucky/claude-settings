import { createHash } from 'node:crypto';
import { openKernelStateStore } from './state-store.mjs';
import { buildContextReceipt } from './context-build.mjs';
import { resolveProofRoute } from './proof-route.mjs';
import { planDryRunWave } from './wave-plan.mjs';
import { buildReleaseEvidencePack } from './evidence-pack.mjs';
import { projectRunState } from './state-projector.mjs';
import { resolveKernelRuntimeHome } from './runtime-home.mjs';
import { KernelPrinciplesError, loadKernelPrinciples } from './policy.mjs';
import { resolveKernelCapabilities } from './capability-resolver.mjs';
import { buildCandidateIdentity, gitTreeDigest, sha256Hex } from '../lib/candidate-identity.mjs';
import { resolveKernelProjectIdentity } from './project-identity.mjs';
import { readProjectRevision, ensureKnowledgeStoreDirectories } from './knowledge/store.mjs';
import { buildProjectKnowledgeContext } from './knowledge/context-load.mjs';
import { extractKnowledgeCandidates } from './knowledge/candidate-extract.mjs';
import { reviewKnowledgeCandidates } from './knowledge/candidate-review.mjs';
import { commitProjectKnowledge } from './knowledge/commit.mjs';
import { executeKernelGitCloseout, retryGitCloseout as retryGitCloseoutHelper } from './git/closeout.mjs';
import { normalizeChangedContract } from './change-contract.mjs';
import { VALID_TYPES, resolveRecordType } from './knowledge/records.mjs';

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

export const buildKernelMeasurement = ({ run, completion, principles = loadKernelPrinciples(), verifications = [] }) => ({
  schemaVersion: 1,
  harnessIdentity: 'moon-relay-kernel',
  sourceIdentity: run.sourceIdentity,
  taskIdentity: `task-${createHash('sha256').update(run.objective).digest('hex').slice(0, 16)}`,
  providerModelIdentity: unavailable('provider-usage-not-recorded'),
  estimatedStaticTokens: Math.ceil(JSON.stringify(principles.principles).length / 4),
  actualInputTokens: unavailable('provider-usage-not-recorded'),
  actualOutputTokens: unavailable('provider-usage-not-recorded'),
  successDecision: observed(completion.decision === 'accepted'),
  falseCompletionDecision: unavailable('false-completion-evaluation-not-run'),
  retryCount: unavailable('retry-history-not-recorded'),
  replanCount: unavailable('replan-history-not-recorded'),
  userInterventionCount: unavailable('user-intervention-history-not-recorded'),
  wallClockMs: unavailable('run-duration-not-recorded'),
  evidenceCoverage: observed({ passed: verifications.filter((verification) => verification.status === 'passed').length, total: verifications.length, required: run.requiredObligations.length }),
  contaminationSignals: observed({ relayStateMutation: false, profileMutation: false, source: 'kernel-runtime-boundary' }),
});

export const createKernelControlPlane = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome, projectRoot = process.cwd() } = {}) => {
  const store = await openKernelStateStore({ runtimeHome, relayHome });

  return {
    async startRun({ runId, objective, sourceIdentity, taskContract = {}, projectId: optionsProjectId } = {}) {
      const trustedSourceIdentity = computeKernelSourceIdentity({ projectRoot, objective: objective || taskContract.objective || 'Kernel execution task', taskContract });
      if (sourceIdentity && sourceIdentity !== trustedSourceIdentity) {
        throw new Error('sourceIdentity is computed by Kernel and cannot be caller-authored');
      }

      const identity = resolveKernelProjectIdentity({ cwd: projectRoot });
      const projectId = optionsProjectId || taskContract.projectId || identity.projectId;
      await ensureKnowledgeStoreDirectories(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
      const knowledgeRevisionStart = await readProjectRevision(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });

      const normalizedChangeSet = normalizeChangedContract(taskContract);

      const riskSummary = {
        requestedTier: taskContract.riskTier || taskContract.proofTier || taskContract.requestedTier,
        filesChanged: normalizedChangeSet.changedFileCount,
        surfaces: taskContract.surfaces || [],
        crossLayer: taskContract.crossLayer || false,
      };
      const proofRoute = resolveProofRoute(riskSummary);

      const run = store.createRun({
        runId,
        objective: objective || taskContract.objective || 'Kernel execution task',
        sourceIdentity: trustedSourceIdentity,
        proofTier: proofRoute.proofTier,
        evidenceTier: proofRoute.evidenceTier,
        requiredObligations: proofRoute.requiredChecks || ['default'],
        acceptanceCriteria: taskContract.acceptance || taskContract.acceptanceCriteria || [],
        requireReleaseEvidence: proofRoute.evidenceTier === 'E2',
        projectId,
        knowledgeRevisionStart,
      });

      // Automatically load FRAME knowledge context and record receipt
      const frameKnowledgeCtx = await buildProjectKnowledgeContext({
        projectId,
        stage: 'FRAME',
        runId,
        objective: run.objective,
        changedPaths: normalizedChangeSet.changedPaths,
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
      });
      if (updated.evidenceTier === 'E2') {
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
      }

      await projectRunState(updated, { runtimeHome });
      return updated;
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

      // Step 2: Transition to CLOSE
      if (run.state !== 'CLOSE' && run.status !== 'completed') {
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
      return { run, completion, measurement: buildKernelMeasurement({ run, completion, verifications: store.getVerifications(runId) }) };
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
