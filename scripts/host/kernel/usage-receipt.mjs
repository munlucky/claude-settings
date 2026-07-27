// Host usage receipt builder (§6.3 / §16.1). Its whole job is to report what
// really happened, including "I could not do what the Kernel asked". A Host
// that silently upgrades its own status is worse than one that cannot route.

import { buildReceiptId, hashSessionId, normalizeModelUsageReceipt } from '../../kernel/run/model-route-contract.mjs';

// The requested class was applied only when the registry resolved an explicit
// model AND the Host can prove which model actually answered.
const resolveEnforcementStatus = ({ resolution, capabilities, strategy, dispatch }) => {
  if (dispatch.status === 'failed') return 'failed';
  if (strategy === 'unsupported' || !capabilities.supportsResolvedModelIdentity) return 'unsupported';
  if (dispatch.status === 'unsupported') return 'unsupported';
  if (!resolution.model || resolution.enforcementIntent !== 'enforced') return 'advisory';
  if (!dispatch.resolvedModel) return 'advisory';
  return dispatch.resolvedModel === resolution.model ? 'enforced' : 'fallback';
};

const countOrNull = (value, allowed) => (allowed && Number.isInteger(value) && value >= 0 ? value : null);

export const buildUsageReceipt = ({ decision, capabilities, strategy, resolution, dispatch = {}, capsule = null, admission = null, actorSessionId, parentSessionId = null, startedAt = null, finishedAt = null } = {}) => {
  if (!decision) throw new Error('a usage receipt requires the route decision it answers');
  if (decision.modelClass === 'kernel') throw new Error('kernel-owned actions run no provider model and produce no usage receipt');
  const actor = hashSessionId(actorSessionId);
  if (!actor) throw new Error('a usage receipt requires the Host session that performed the turn');
  const enforcementStatus = resolveEnforcementStatus({ resolution, capabilities, strategy, dispatch });
  const tokensAllowed = capabilities.supportsUsageTokens === true;
  return normalizeModelUsageReceipt({
    receiptId: buildReceiptId({ decisionId: decision.decisionId, actorSessionId: actor, startedAt: startedAt || '' }),
    decisionId: decision.decisionId,
    runId: decision.runId,
    hostSurface: capabilities.surface,
    actorSessionId: actor,
    parentSessionId: hashSessionId(parentSessionId),
    // Only an identity the Host actually observed is recorded. Echoing the
    // requested model back would turn a wish into evidence.
    resolvedModel: dispatch.resolvedModel || null,
    resolvedEffort: dispatch.resolvedEffort || resolution.effort || null,
    // Lineage: which bounded context the worker ran on (K1), which admission
    // permitted the dispatch (K3), and which step it belongs to (K2).
    capsuleId: capsule?.capsuleId || null,
    capsuleDigest: capsule?.provenance?.capsuleDigest || null,
    stepId: capsule?.stepId || null,
    admissionId: admission?.admissionId || null,
    admissionDigest: admission?.digest || null,
    enforcementStatus,
    resultStatus: dispatch.resultStatus || (dispatch.status === 'failed' ? 'failed' : 'completed'),
    startedAt,
    finishedAt,
    wallClockMs: countOrNull(dispatch.wallClockMs, true),
    inputTokens: countOrNull(dispatch.inputTokens, tokensAllowed),
    cachedInputTokens: countOrNull(dispatch.cachedInputTokens, tokensAllowed),
    outputTokens: countOrNull(dispatch.outputTokens, tokensAllowed),
    costMicros: countOrNull(dispatch.costMicros, tokensAllowed),
  });
};
