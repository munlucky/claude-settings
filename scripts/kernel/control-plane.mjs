import { createHash } from 'node:crypto';
import { openKernelStateStore } from './state-store.mjs';
import { finalizeRunCoordinator } from './finalization/coordinator.mjs';
import { prepareFinalization as prepareFinalizationHelper, approveKnowledgeCandidate as approveKnowledgeCandidateHelper } from './finalization/prepare.mjs';
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
    async startRun({ runId, objective, sourceIdentity, taskContract = {} }) {
      const trustedSourceIdentity = computeKernelSourceIdentity({ projectRoot, objective: objective || taskContract.objective || 'Kernel execution task', taskContract });
      if (sourceIdentity && sourceIdentity !== trustedSourceIdentity) {
        throw new Error('sourceIdentity is computed by Kernel and cannot be caller-authored');
      }

      const identity = resolveKernelProjectIdentity({ cwd: projectRoot });
      const projectId = identity.projectId;
      await ensureKnowledgeStoreDirectories(projectId, { env: { MOON_RELAY_KERNEL_HOME: runtimeHome } });
      const knowledgeRevisionStart = store.getProjectKnowledgeRevision(projectId);

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
        stateStore: store,
        stage: 'FRAME',
        runId,
        objective: run.objective,
        changedPaths: normalizedChangeSet.changedPaths,
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
        stateStore: store,
        stage,
        runId,
        objective: run.objective,
        changedPaths: normalizedChangeSet.changedPaths,
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



    async prepareFinalization(runId, options = {}) {
      return prepareFinalizationHelper(runId, options, { stateStore: store });
    },

    async approveKnowledgeCandidate(runId, candidateId, options = {}) {
      return approveKnowledgeCandidateHelper(runId, candidateId, options, { stateStore: store });
    },

    async finalizeRun(runId, { gitCloseoutRequest = null, changedPaths = [], changedFileCount = null, knowledgeObservations = [] } = {}) {
      return finalizeRunCoordinator(runId, {
        observations: knowledgeObservations,
        gitCloseoutRequest,
        repoRoot: projectRoot,
      }, { stateStore: store });
    },

    async retryGitCloseout(runId) {
      return retryGitCloseoutHelper(runId, { stateStore: store, repoRoot: projectRoot });
    },

    async getFinalizationStatus(runId) {
      return store.getFinalizationAuthorityReceipt ? store.getFinalizationAuthorityReceipt(runId) : null;
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
