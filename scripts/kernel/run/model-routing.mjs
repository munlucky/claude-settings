// Measurement-based model routing (§25 P3) — a POLICY hook only. It never
// calls a provider; it decides a logical model class from observed signals and
// leaves the actual model selection and invocation to the Host (§5.1).

import {
  ACTION_KINDS,
  BUILD_ACTIONS,
  REVIEW_ACTIONS,
  RISK_TIERS,
  ModelRouteContractError,
  buildDecisionId,
  loadModelPolicy,
  normalizeModelRouteDecision,
} from './model-route-contract.mjs';

// Fixed priority (§5.3). Stagnation outranks retry escalation, because more
// attempts with a stronger model do not fix a plan that cannot work.
const resolveEscalation = ({ actionKind, retryCount, stagnant, planInvalid, architectureDeviation, protectedObligationFailed, escalationLocked, threshold }) => {
  if (stagnant) return { action: 'replan', reasonCode: 'STAGNATION_REPLAN' };
  if (planInvalid) return { action: 'replan', reasonCode: 'PLAN_INVALID_REPLAN' };
  if (architectureDeviation) return { action: 'replan', reasonCode: 'ARCHITECTURE_DEVIATION_REPLAN' };
  if (!BUILD_ACTIONS.includes(actionKind)) return null;
  if (retryCount >= threshold) return { action: 'implement', reasonCode: 'RETRY_ESCALATION' };
  if (protectedObligationFailed) return { action: 'debug', reasonCode: 'PROTECTED_OBLIGATION_FAILURE' };
  // §5.4: within one plan revision and obligation an escalation never demotes.
  if (escalationLocked) return { action: actionKind, reasonCode: 'ESCALATION_LOCKED' };
  return null;
};

// The full Kernel→Host decision for the action the model is about to perform.
export const resolveModelRoute = ({
  runId = 'unbound',
  actionKind,
  riskTier = 'T0',
  attemptNumber = 1,
  replanCount = 0,
  retryCount = 0,
  stagnant = false,
  protectedObligationFailed = false,
  planInvalid = false,
  architectureDeviation = false,
  independentReviewRequired = false,
  currentPlanRevision = 1,
  obligationId = null,
  escalatedObligations = [],
  sequence = 0,
  createdAt,
  policy = loadModelPolicy(),
} = {}) => {
  if (!ACTION_KINDS.includes(actionKind)) {
    throw new ModelRouteContractError('kernel_model_action_invalid', `actionKind must be one of: ${ACTION_KINDS.join(', ')}`);
  }
  const tier = RISK_TIERS.includes(riskTier) ? riskTier : 'T0';
  const base = policy.actionDefaults[actionKind];
  const reasonCodes = [];

  // prove/close belong to the Kernel runtime; no signal may hand them a model.
  if (base.modelClass === 'kernel') {
    return normalizeModelRouteDecision({
      decisionId: buildDecisionId({ runId, attemptNumber, sequence, actionKind }),
      runId,
      attemptNumber,
      replanCount,
      planRevision: currentPlanRevision,
      obligationId,
      actionKind,
      role: base.role,
      modelClass: base.modelClass,
      riskTier: tier,
      independentContextRequired: false,
      permissions: base.permissions,
      reasonCodes: ['KERNEL_ONLY_ACTION'],
      policyRevision: policy.policyRevision,
      createdAt,
    });
  }

  const escalationLocked = Boolean(obligationId) && escalatedObligations.some(
    (entry) => entry && entry.obligationId === obligationId && Number(entry.planRevision) === Number(currentPlanRevision),
  );
  const escalation = resolveEscalation({
    actionKind,
    retryCount,
    stagnant,
    planInvalid,
    architectureDeviation,
    protectedObligationFailed,
    escalationLocked,
    threshold: policy.thresholds.retryEscalationThreshold,
  });

  const effectiveAction = escalation ? escalation.action : actionKind;
  const spec = policy.actionDefaults[effectiveAction];
  if (escalation) reasonCodes.push(escalation.reasonCode);
  else reasonCodes.push(`ACTION_${effectiveAction.toUpperCase()}_DEFAULT`);

  // An escalated build action is the one case where implementation leaves the
  // value class; reviews and planning are frontier by default already.
  const modelClass = escalation ? 'frontier_reasoning' : spec.modelClass;

  const isReview = REVIEW_ACTIONS.includes(effectiveAction);
  const independentContextRequired = isReview && (tier === 'T3' || independentReviewRequired === true);
  if (independentContextRequired) reasonCodes.push('INDEPENDENT_REVIEW_REQUIRED');

  return normalizeModelRouteDecision({
    decisionId: buildDecisionId({ runId, attemptNumber, sequence, actionKind: effectiveAction }),
    runId,
    attemptNumber,
    replanCount,
    planRevision: currentPlanRevision,
    obligationId,
    actionKind: effectiveAction,
    role: spec.role,
    modelClass,
    riskTier: tier,
    independentContextRequired,
    permissions: spec.permissions,
    reasonCodes,
    policyRevision: policy.policyRevision,
    createdAt,
  });
};

// Compatibility surface (§8.4): the original recommendation vocabulary, now
// derived from the same resolver so the two cannot drift apart.
export const recommendModelRouting = ({ riskTier = 'T0', stagnant = false, retryCount = 0, independentReviewRequired = false } = {}) => {
  const route = resolveModelRoute({ actionKind: 'implement', riskTier, stagnant, retryCount, independentReviewRequired });
  if (route.reasonCodes.includes('STAGNATION_REPLAN')) {
    return { action: 'replan', rationale: 'stagnation detected: repeated failure without progress', modelRoute: route };
  }
  if (route.reasonCodes.includes('RETRY_ESCALATION')) {
    return { action: 'escalate-model', rationale: 'multiple retries: recommend a stronger model for the next attempt', modelRoute: route };
  }
  if (independentReviewRequired || riskTier === 'T3') {
    const reviewRoute = resolveModelRoute({ actionKind: 'review_engineering', riskTier, independentReviewRequired });
    return { action: 'independent-review', rationale: 'high-risk run: route to an independent reviewer context', modelRoute: reviewRoute };
  }
  return { action: 'stay', rationale: 'no routing change warranted', modelRoute: route };
};
