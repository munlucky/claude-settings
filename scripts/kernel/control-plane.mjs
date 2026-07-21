import { openKernelStateStore } from './state-store.mjs';
import { buildContextReceipt } from './context-build.mjs';
import { resolveProofRoute } from './proof-route.mjs';
import { planDryRunWave } from './wave-plan.mjs';
import { buildReleaseEvidencePack, buildStageEvidencePack } from './evidence-pack.mjs';
import { projectRunState } from './state-projector.mjs';

export const createKernelControlPlane = async ({ runtimeHome, relayHome } = {}) => {
  const store = await openKernelStateStore({ runtimeHome, relayHome });

  return {
    async startRun({ runId, objective, sourceIdentity, taskContract = {} }) {
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
        sourceIdentity,
        proofTier: proofRoute.proofTier,
        evidenceTier: proofRoute.evidenceTier,
        requiredObligations: proofRoute.requiredChecks || ['default'],
        acceptanceCriteria: taskContract.acceptanceCriteria || [],
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

      const receipt = await buildContextReceipt({
        taskContract: { objective: run.objective, ...taskContract },
        principles,
        stageContext: { runId, state: run.state, stage },
      });
      return receipt;
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

    async recordProof(runId, { obligationId = 'default', status, evidenceRef, sourceIdentity, command, exitCode = 0, evidenceDigest }) {
      const updated = store.recordVerification(runId, {
        obligationId,
        status,
        evidenceRef,
        sourceIdentity,
        command,
        exitCode,
        evidenceDigest,
      });
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async closeRun(runId) {
      const updated = store.transition(runId, 'CLOSE');
      await projectRunState(updated, { runtimeHome });
      return updated;
    },

    async assessCompletion(runId, { expectedSourceIdentity = null } = {}) {
      const result = store.assessCompletion(runId, { expectedSourceIdentity });
      if (result.run) {
        await projectRunState(result.run, { runtimeHome });
      }
      return result;
    },

    async status(runId) {
      const run = store.getRun(runId);
      if (!run) return null;
      const completion = store.assessCompletion(runId);
      return { run, completion };
    },

    async close() {
      store.close();
    },
  };
};
