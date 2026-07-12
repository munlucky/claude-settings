import {
  buildProviderRoutingDecision,
  contextActionFor,
  normalizeRoutingIntent,
} from '../provider-model-routing.mjs';

export const CODEX_GPT_5_6_POLICY = Object.freeze({
  provider: 'codex',
  adapterId: 'codex-gpt-5-6',
  adapterVersion: '1',
  applicationMode: 'advisory',
  applicationSurface: 'profile_default',
  autoCompactTokenLimit: 240000,
  billingGuardThreshold: 272000,
  routes: Object.freeze({
    mechanical: Object.freeze({ model: 'gpt-5.6-luna', effort: 'medium' }),
    normal: Object.freeze({ model: 'gpt-5.6-luna', effort: 'high' }),
    hard_reasoning: Object.freeze({ model: 'gpt-5.6-luna', effort: 'xhigh', fallback: 'gpt-5.6-sol:high' }),
    long_context: Object.freeze({ model: 'gpt-5.6-terra', effort: 'high' }),
    critical_review: Object.freeze({ model: 'gpt-5.6-sol', effort: 'max', approval: 'bounded_policy' }),
  }),
});

const approvalFor = (intent = {}) => intent.operatorApprovalRequired === true || intent.operatorApproval === true;

export function adviseCodexGpt56(input = {}, options = {}) {
  const intent = normalizeRoutingIntent(input);
  const route = CODEX_GPT_5_6_POLICY.routes[intent.routeClass];
  const context = {
    projectedInputTokens: options.projectedInputTokens ?? input.projectedInputTokens,
    tokenEstimateSource: options.tokenEstimateSource ?? input.tokenEstimateSource,
    autoCompactTokenLimit: CODEX_GPT_5_6_POLICY.autoCompactTokenLimit,
    billingGuardThreshold: CODEX_GPT_5_6_POLICY.billingGuardThreshold,
    interceptionSupported: options.interceptionSupported === true,
  };
  const contextDecision = contextActionFor(context);
  if (intent.routeClass === 'long_context' && !intent.requiredCapabilities.includes('declared_context_or_state_capability')) {
    return buildProviderRoutingDecision({
      provider: 'codex', adapterId: CODEX_GPT_5_6_POLICY.adapterId, adapterVersion: '1',
      applicationMode: 'advisory', applicationSurface: 'profile_default', intent,
      decisionStatus: 'rejected', reason: 'Terra requires declared_context_or_state_capability',
      fallback: 'gpt-5.6-luna:high', context,
      providerMetadata: { policy: 'codex-gpt-5-6-cost-aware-routing' },
    });
  }
  if (intent.routeClass === 'critical_review' && !approvalFor(intent)) {
    return buildProviderRoutingDecision({
      provider: 'codex', adapterId: CODEX_GPT_5_6_POLICY.adapterId, adapterVersion: '1',
      applicationMode: 'advisory', applicationSurface: 'profile_default', intent,
      decisionStatus: 'rejected', reason: 'Sol max requires bounded policy approval',
      fallback: 'gpt-5.6-luna:xhigh', context,
      operatorApprovalRequired: true,
      providerMetadata: { policy: 'codex-gpt-5-6-cost-aware-routing' },
    });
  }
  if (input.requestedEffort === 'ultra' && !approvalFor(intent)) {
    return buildProviderRoutingDecision({
      provider: 'codex', adapterId: CODEX_GPT_5_6_POLICY.adapterId, adapterVersion: '1',
      applicationMode: 'advisory', applicationSurface: 'profile_default', intent,
      decisionStatus: 'rejected', reason: 'Sol ultra requires per-request operator approval',
      fallback: 'manual_review', context,
      operatorApprovalRequired: true,
      providerMetadata: { policy: 'codex-gpt-5-6-cost-aware-routing' },
    });
  }
  if (input.requestedEffort === 'ultra') {
    return buildProviderRoutingDecision({
      provider: 'codex', adapterId: CODEX_GPT_5_6_POLICY.adapterId, adapterVersion: '1',
      applicationMode: 'advisory', applicationSurface: 'profile_default', intent,
      selectedModel: 'gpt-5.6-sol', selectedEffort: 'ultra', reason: intent.reason,
      fallback: 'manual_review', context, operatorApprovalRequired: true,
      providerMetadata: { policy: 'codex-gpt-5-6-cost-aware-routing', approval: 'per_request' },
    });
  }
  const guardEnforced = contextDecision.enforcementEligible;
  return buildProviderRoutingDecision({
    provider: 'codex', adapterId: CODEX_GPT_5_6_POLICY.adapterId, adapterVersion: '1',
    applicationMode: guardEnforced ? 'enforced' : CODEX_GPT_5_6_POLICY.applicationMode,
    applicationSurface: guardEnforced ? 'per_turn' : CODEX_GPT_5_6_POLICY.applicationSurface,
    intent, selectedModel: route.model, selectedEffort: route.effort,
    reason: intent.reason,
    fallback: route.fallback ?? null,
    context,
    operatorApprovalRequired: intent.routeClass === 'critical_review',
    providerMetadata: {
      policy: 'codex-gpt-5-6-cost-aware-routing',
      longContextBillingRule: 'full_request_input_x2_output_x1_5',
      cacheWriteInputMultiplier: 1.25,
    },
  });
}
