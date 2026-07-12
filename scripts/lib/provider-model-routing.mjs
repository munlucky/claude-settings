export const ROUTE_CLASSES = Object.freeze([
  'mechanical',
  'normal',
  'hard_reasoning',
  'long_context',
  'critical_review',
]);

export const APPLICATION_MODES = Object.freeze(['enforced', 'advisory', 'unsupported']);
export const TOKEN_ESTIMATE_SOURCES = Object.freeze([
  'runtime_authoritative',
  'caller_supplied',
  'approximation',
  'unknown',
]);

const asText = (value, fallback = '') => String(value ?? fallback).trim();

const isProviderSpecificFallback = (value) => /\b(?:gpt[-_ ]?\d|claude|qwen|luna|terra|sol)\b/i.test(value);

export function normalizeRoutingIntent(input = {}) {
  const routeClass = ROUTE_CLASSES.includes(input.routeClass) ? input.routeClass : 'normal';
  const effortProfile = ['economy', 'standard', 'deep', 'max'].includes(input.effortProfile)
    ? input.effortProfile
    : 'standard';
  const requiredCapabilities = Array.isArray(input.requiredCapabilities)
    ? input.requiredCapabilities.map((value) => asText(value)).filter(Boolean)
    : [];
  return {
    schemaVersion: 1,
    routeClass,
    effortProfile,
    requiredCapabilities,
    contextAction: asText(input.contextAction, 'none'),
    reason: asText(input.reason, 'default provider-neutral route'),
    fallback: input.fallback == null || isProviderSpecificFallback(asText(input.fallback))
      ? null
      : asText(input.fallback),
    operatorApprovalRequired: input.operatorApprovalRequired === true,
  };
}

export function contextActionFor({
  projectedInputTokens = null,
  tokenEstimateSource = 'unknown',
  autoCompactTokenLimit = 240000,
  billingGuardThreshold = 272000,
  interceptionSupported = false,
} = {}) {
  const source = TOKEN_ESTIMATE_SOURCES.includes(tokenEstimateSource) ? tokenEstimateSource : 'unknown';
  const numericTokens = Number.isInteger(projectedInputTokens) && projectedInputTokens >= 0
    ? projectedInputTokens
    : null;
  if (numericTokens === null) {
    return {
      contextAction: 'measurement_unavailable',
      enforcementEligible: false,
      projectedInputTokens: null,
      tokenEstimateSource: source,
    };
  }
  if (numericTokens > billingGuardThreshold) {
    const canEnforce = source === 'runtime_authoritative' && interceptionSupported === true;
    return {
      contextAction: canEnforce ? 'explicit_exception_required' : 'billing_guard_warning',
      enforcementEligible: canEnforce,
      projectedInputTokens: numericTokens,
      tokenEstimateSource: source,
    };
  }
  if (numericTokens > autoCompactTokenLimit) {
    return {
      contextAction: 'compact_or_retrieve',
      enforcementEligible: false,
      projectedInputTokens: numericTokens,
      tokenEstimateSource: source,
    };
  }
  return {
    contextAction: 'none',
    enforcementEligible: false,
    projectedInputTokens: numericTokens,
    tokenEstimateSource: source,
  };
}

export function buildProviderRoutingDecision({
  provider,
  adapterId,
  adapterVersion = '1',
  applicationMode = 'unsupported',
  applicationSurface = 'none',
  intent = {},
  reason,
  fallback = null,
  selectedModel = null,
  selectedEffort = null,
  context = {},
  operatorApprovalRequired = false,
  decisionStatus = 'accepted',
  providerMetadata = {},
} = {}) {
  if (!provider || !adapterId || !APPLICATION_MODES.includes(applicationMode)) {
    throw new Error('provider, adapterId, and a valid applicationMode are required');
  }
  const normalizedIntent = normalizeRoutingIntent(intent);
  const contextDecision = contextActionFor(context);
  return {
    schemaVersion: 1,
    provider: asText(provider),
    adapterId: asText(adapterId),
    adapterVersion: asText(adapterVersion),
    decisionStatus,
    applicationMode,
    applicationSurface,
    routeClass: normalizedIntent.routeClass,
    effortProfile: normalizedIntent.effortProfile,
    selectedModel,
    selectedEffort,
    reason: asText(reason, normalizedIntent.reason),
    fallback: fallback ?? normalizedIntent.fallback,
    contextAction: contextDecision.contextAction,
    tokenEstimateSource: contextDecision.tokenEstimateSource,
    projectedInputTokens: contextDecision.projectedInputTokens,
    enforcementEligible: contextDecision.enforcementEligible,
    operatorApprovalRequired: operatorApprovalRequired === true || normalizedIntent.operatorApprovalRequired,
    providerMetadata,
  };
}

export function buildRoutingDiagnosticEvent(decision, { runId = null, taskId = null } = {}) {
  return Object.freeze({
    schemaVersion: 1,
    eventType: 'model.routing.advised',
    severity: 'info',
    runId,
    taskId,
    routing: decision,
    authority: Object.freeze({ completion: false, promotion: false }),
  });
}
