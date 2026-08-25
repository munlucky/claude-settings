// Codex Host session telemetry. Requested model/effort are configuration;
// only terminal events or the matching persisted Codex rollout are evidence of
// what actually ran. Missing observations stay null and never echo a request.

const MODEL_KEYS = Object.freeze(['model', 'model_id', 'modelId', 'model_slug', 'modelSlug']);
const EFFORT_KEYS = Object.freeze(['effort', 'reasoning_effort', 'reasoningEffort', 'model_reasoning_effort']);
const TERMINAL_EVENT_TYPES = new Set(['turn.completed', 'response.completed', 'turn_context']);

const nestedObjects = (value) => [
  value,
  value?.response,
  value?.turn,
  value?.metadata,
  value?.payload,
].filter((entry) => entry && typeof entry === 'object');

const firstText = (objects, keys) => {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
};

const normalizeEffort = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().toLowerCase();
};

// The main Codex session is a Host invariant, not a Kernel model enum. The
// parent is the Sol/High orchestrator for the whole run; concrete model and
// effort choices belong only to child worker invocations.
export const CODEX_MAIN_SESSION_POLICY = Object.freeze({
  role: 'orchestrator',
  model: 'gpt-5.6-sol',
  effort: 'high',
  parentMayImplement: false,
  nestedDelegationAllowed: false,
});

export const resolveObservedCodexSessionConfig = (events = []) => {
  let model = null;
  let effort = null;
  for (const event of [...events].reverse()) {
    if (!TERMINAL_EVENT_TYPES.has(event?.type)) continue;
    const objects = nestedObjects(event);
    model ||= firstText(objects, MODEL_KEYS);
    effort ||= normalizeEffort(firstText(objects, EFFORT_KEYS));
    if (model && effort) break;
  }
  return Object.freeze({ model, effort });
};

export const compareCodexSessionConfig = ({ requested = {}, observed = {} } = {}) => {
  const requestedModel = requested.model ? String(requested.model) : null;
  const requestedEffort = normalizeEffort(requested.effort);
  const observedModel = observed.model ? String(observed.model) : null;
  const observedEffort = normalizeEffort(observed.effort);
  const modelMatch = Boolean(requestedModel && observedModel && requestedModel === observedModel);
  const effortMatch = Boolean(requestedEffort && observedEffort && requestedEffort === observedEffort);
  const complete = Boolean(observedModel && observedEffort);
  return Object.freeze({
    requestedModel,
    requestedEffort,
    observedModel,
    observedEffort,
    modelMatch,
    effortMatch,
    complete,
    exact: complete && modelMatch && effortMatch,
    reason: !observedModel
      ? 'model-observation-missing'
      : !observedEffort
        ? 'effort-observation-missing'
        : !modelMatch
          ? 'model-mismatch'
          : !effortMatch
            ? 'effort-mismatch'
            : null,
  });
};

export const compareCodexMainSessionConfig = ({ expectedSessionId = null, observed = {} } = {}) => {
  const comparison = compareCodexSessionConfig({
    requested: CODEX_MAIN_SESSION_POLICY,
    observed,
  });
  const observedSessionId = observed?.sessionId ? String(observed.sessionId) : null;
  const sessionMatch = Boolean(expectedSessionId && observedSessionId && String(expectedSessionId) === observedSessionId);
  const exact = comparison.exact && sessionMatch;
  return Object.freeze({
    ...comparison,
    expectedSessionId: expectedSessionId ? String(expectedSessionId) : null,
    observedSessionId,
    sessionMatch,
    exact,
    reason: !sessionMatch
      ? 'parent-session-not-stable'
      : comparison.reason,
  });
};

export const compareCodexMainSessionInvariance = ({ expectedSessionId = null, before = {}, after = {} } = {}) => {
  const beforeComparison = compareCodexMainSessionConfig({ expectedSessionId, observed: before });
  const afterComparison = compareCodexMainSessionConfig({ expectedSessionId, observed: after });
  const exact = beforeComparison.exact && afterComparison.exact;
  return Object.freeze({
    before: beforeComparison,
    after: afterComparison,
    exact,
    reason: !beforeComparison.exact
      ? `before-${beforeComparison.reason}`
      : !afterComparison.exact
        ? `after-${afterComparison.reason}`
        : null,
  });
};

// This is deliberately explicit about an unobserved parent. A policy
// declaration is not telemetry: callers may only call the parent `declared`
// until a Host supplies a before/after observation. When supplied, a mismatch
// is a hard failure and cannot be hidden by a successful child dispatch.
export const buildCodexMainSessionPolicy = ({ parentSessionId = null, observed = null } = {}) => {
  const comparison = observed?.before && observed?.after
    ? compareCodexMainSessionInvariance({ expectedSessionId: parentSessionId, before: observed.before, after: observed.after })
    : observed
      ? compareCodexMainSessionConfig({ expectedSessionId: parentSessionId, observed })
    : null;
  const current = comparison?.after || comparison;
  const observationStatus = comparison
    ? (comparison.exact ? (observed?.before && observed?.after ? 'enforced' : 'observed') : 'failed')
    : (parentSessionId ? 'declared' : 'unbound');
  return Object.freeze({
    ...CODEX_MAIN_SESSION_POLICY,
    sessionId: parentSessionId ? String(parentSessionId) : null,
    observedModel: current?.observedModel || null,
    observedEffort: current?.observedEffort || null,
    observedSessionId: current?.observedSessionId || null,
    observationStatus,
    observationReason: comparison?.reason || (parentSessionId ? 'parent-session-observation-missing' : 'parent-session-missing'),
  });
};

export const resolveObservedCodexSessionConfigFromEvents = resolveObservedCodexSessionConfig;
