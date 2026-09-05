// Host-routing bridge (Wave B9).
//
// The Control Plane coordinates Work, Trust, and Knowledge.  It must not also
// own the policy used to turn an action into an execution route.  This bridge
// keeps the compatibility methods that existing Host callers use, while
// making the policy boundary explicit and provider-neutral:
//
//   Kernel coordinator -> logical execution class
//   Host              -> provider/model/session/process details
//
// No provider model id or provider credential belongs in this module.

import { detectOptionalStagnation, optionalCapabilityActive } from '../run/optional-capabilities.mjs';
import { recommendModelRouting, resolveModelRoute } from '../run/model-routing.mjs';

export const ACTION_FOR_MODEL_ACTION = Object.freeze({
  implement: 'implement',
  fix: 'debug',
  review: 'review_engineering',
  report: 'prove',
  finalize: 'close',
  done: 'close',
  blocked: 'understand',
});

export const actionKindForModelAction = (actionType) =>
  ACTION_FOR_MODEL_ACTION[actionType] || 'implement';

const buildStagnationSignal = ({ store, detectStepStagnation }) => (runId) => {
  const run = store.getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const attempts = store.getAttempts(runId);
  const enabled = optionalCapabilityActive('stagnation-escalation', { run, attempts });
  const runLevel = enabled
    ? detectOptionalStagnation({
      run,
      attempts,
      verifications: store.getVerifications(runId),
    })
    : {
      stagnant: false,
      reason: 'optional-capability-disabled',
      failedAttempts: attempts.filter((attempt) => attempt.status === 'failed').length,
    };
  const stepLevel = enabled
    ? detectStepStagnation(runId)
    : { stagnant: false, reason: 'optional-capability-disabled', signals: {} };
  const stepEscalates = stepLevel.signals?.consecutiveFailures === true;
  return {
    stagnant: runLevel.stagnant || stepEscalates,
    enabled,
    runLevel,
    stepLevel,
    source: runLevel.stagnant ? 'run' : (stepEscalates ? 'step' : null),
  };
};

export const createHostRoutingBridge = ({ store, detectStepStagnation = () => ({ stagnant: false, signals: {} }) } = {}) => {
  if (!store || typeof store.getRun !== 'function') throw new TypeError('host routing bridge requires a state store');
  const stagnationSignal = buildStagnationSignal({ store, detectStepStagnation });

  const bridge = {
    detectStagnation(runId, { threshold } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const attempts = store.getAttempts(runId);
      return detectOptionalStagnation({
        run,
        attempts,
        verifications: store.getVerifications(runId),
        threshold,
      });
    },

    stagnationSignal,

    recommendRouting(runId, { independentReviewRequired = false } = {}) {
      const run = store.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      const stagnation = stagnationSignal(runId);
      const attempts = store.getAttempts(runId);
      return recommendModelRouting({
        riskTier: run.proofTier,
        stagnant: stagnation.stagnant,
        retryCount: attempts.filter((attempt) => attempt.status === 'failed').length,
        independentReviewRequired,
      });
    },

    decideModelRoute(runId, {
      actionKind,
      obligationId = null,
      independentReviewRequired = false,
      planInvalid = false,
      architectureDeviation = false,
      protectedObligationFailed = false,
      workProfile = null,
      complexity = null,
    } = {}) {
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
        retryCount: attempts.filter((attempt) => attempt.status === 'failed').length,
        stagnant: stagnationSignal(runId).stagnant,
        protectedObligationFailed,
        planInvalid,
        architectureDeviation,
        independentReviewRequired,
        workProfile,
        complexity,
        currentPlanRevision: Number(run.planRevision || 1),
        obligationId,
        escalatedObligations: priorDecisions
          .filter((entry) => entry.modelClass === 'frontier_reasoning' && entry.role === 'implementer' && entry.obligationId)
          .map((entry) => ({ planRevision: entry.planRevision, obligationId: entry.obligationId })),
        sequence: priorDecisions.length,
      });
      return store.recordModelRouteDecision(runId, decision);
    },
  };

  return Object.freeze(bridge);
};
