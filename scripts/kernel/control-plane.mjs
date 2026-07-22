import { createHash } from 'node:crypto';
import { openKernelStateStore } from './state-store.mjs';
import { buildContextReceipt } from './context-build.mjs';
import { resolveProofRoute } from './proof-route.mjs';
import { planDryRunWave } from './wave-plan.mjs';
import { buildReleaseEvidencePack } from './evidence-pack.mjs';
import { projectRunState } from './state-projector.mjs';
import { resolveKernelRuntimeHome } from './runtime-home.mjs';
import { buildCandidateIdentity, gitTreeDigest, sha256Hex } from '../lib/candidate-identity.mjs';

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

export const createKernelControlPlane = async ({ runtimeHome = resolveKernelRuntimeHome(), relayHome, projectRoot = process.cwd() } = {}) => {
  const store = await openKernelStateStore({ runtimeHome, relayHome });

  return {
    async startRun({ runId, objective, sourceIdentity, taskContract = {} }) {
      const trustedSourceIdentity = computeKernelSourceIdentity({ projectRoot, objective: objective || taskContract.objective || 'Kernel execution task', taskContract });
      if (sourceIdentity && sourceIdentity !== trustedSourceIdentity) {
        throw new Error('sourceIdentity is computed by Kernel and cannot be caller-authored');
      }
      const riskSummary = {
        requestedTier: taskContract.riskTier || taskContract.proofTier || taskContract.requestedTier,
        filesChanged: taskContract.filesChanged || 1,
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
      });

      await projectRunState(run, { runtimeHome });
      return run;
    },

    async getRun(runId) {
      return store.getRun(runId);
    },

    async buildStageContext(runId, { stage = 'EXECUTE', taskContract = {}, principles = {} } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const context = await buildContextReceipt({
        taskContract: { objective: run.objective, ...taskContract },
        principles: Array.isArray(principles) ? principles : Object.entries(principles || {}).map(([key, value]) => `${key}: ${value}`),
        stage,
        stageRecords: [{ id: `stage-${runId}`, type: 'stage-context', content: JSON.stringify({ runId, state: run.state, stage }), revision: String(run.revision) }],
      });
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

    async recordProof(runId, { obligationId = 'default', status, sourceIdentity, evidenceRef, command, exitCode = 0, evidenceDigest, acceptanceCoverage = [] }) {
      const updated = store.recordVerification(runId, {
        obligationId,
        status,
        evidenceRef,
        sourceIdentity,
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

    async closeRun(runId) {
      const updated = store.transition(runId, 'CLOSE');
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async assessCompletion(runId, { expectedSourceIdentity = null, commitDecision = true } = {}) {
      const result = store.assessCompletion(runId, { expectedSourceIdentity, commitDecision });
      if (result.run) {
        await projectRunState(result.run, { runtimeHome });
      }
      return result;
    },

    async status(runId) {
      const run = store.getRun(runId);
      if (!run) return null;
      const completion = store.assessCompletion(runId, { commitDecision: false });
      return { run, completion };
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
