// Codex GPT-5.6 model routing (Wave 6.2). Sol for hard and high-stakes work,
// Terra for everyday implementation and debugging, Luna for well-specified
// repetitive work. The default is Terra at medium: reaching for Sol/high on
// routine edits costs more without a measured quality gain, and `max`, Ultra,
// and Pro stay off the default path entirely until an eval says otherwise.
//
// This module lives on the Host side. The Kernel decides a logical model class;
// only here does that become a provider model id.

export const CODEX_MODELS = Object.freeze({ sol: 'gpt-5.6-sol', terra: 'gpt-5.6-terra', luna: 'gpt-5.6-luna' });
export const CODEX_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

// `gpt-5.6` is an alias that resolves to the Sol tier. The Host records the
// explicit id in the receipt so a replay is reproducible even if the alias moves.
export const CODEX_MODEL_ALIASES = Object.freeze({ 'gpt-5.6': CODEX_MODELS.sol });

export const resolveCodexModelAlias = (model) => CODEX_MODEL_ALIASES[String(model)] || String(model);

const PLANNING_ACTIONS = new Set(['understand', 'design', 'plan', 'replan']);
const REVIEW_ACTIONS = new Set(['review_contract', 'review_engineering']);
const HIGH_RISK_SHAPES = Object.freeze(['security', 'migration', 'authentication', 'authorization', 'payment', 'data-loss', 'irreversible']);

export const resolveCodexModelPolicy = ({
  actionKind = 'implement',
  riskTier = 'T1',
  complexity = 'simple',
  shapes = [],
  repeatedFailure = false,
  userRequested = null,
} = {}) => {
  const reasons = [];
  let model = CODEX_MODELS.terra;
  let reasoning = 'medium';

  if (PLANNING_ACTIONS.has(actionKind)) {
    model = CODEX_MODELS.sol; reasoning = 'high'; reasons.push('planning-action');
  } else if (REVIEW_ACTIONS.has(actionKind)) {
    const protectedReview = riskTier === 'T3' || shapes.some((shape) => HIGH_RISK_SHAPES.includes(String(shape)));
    model = CODEX_MODELS.sol;
    reasoning = protectedReview ? 'xhigh' : 'high';
    reasons.push(protectedReview ? 'protected-review' : 'engineering-review');
  } else if (complexity === 'routine-batch') {
    // Luna only where the transformation is already specified: classification,
    // mechanical rewrites, bulk formatting.
    model = CODEX_MODELS.luna; reasoning = 'low'; reasons.push('routine-batch');
  } else if (complexity === 'complex' || complexity === 'large-refactor') {
    model = CODEX_MODELS.sol; reasoning = 'high'; reasons.push('complex-implementation');
  } else {
    reasons.push('default-implementation');
  }

  if (repeatedFailure) { model = CODEX_MODELS.sol; reasoning = 'xhigh'; reasons.push('repeated-failure-escalation'); }

  if (userRequested?.model) { model = resolveCodexModelAlias(userRequested.model); reasons.push('user-requested-model'); }
  if (userRequested?.reasoning && CODEX_REASONING_EFFORTS.includes(userRequested.reasoning)) {
    reasoning = userRequested.reasoning; reasons.push('user-requested-reasoning');
  }

  return Object.freeze({
    schemaVersion: 1,
    model,
    reasoning,
    reasons: Object.freeze(reasons),
    // `max` is reachable only by explicit request, and is reported as such so
    // the eval can see it was never taken by default.
    offDefaultPath: reasoning === 'max' || model === CODEX_MODELS.sol && reasoning === 'max',
    policyRevision: 'kernel-codex-model.v1',
  });
};

// Subagents and Ultra multiply token cost; they pass the same delegation gate
// as every other provider, plus the requirement that the work genuinely splits.
export const SUBAGENT_SUITABLE = Object.freeze(['large-codebase-exploration', 'independent-log-analysis', 'independent-test-analysis', 'non-conflicting-review', 'partitioned-document-analysis']);
export const SUBAGENT_UNSUITABLE = Object.freeze(['parallel-edits-same-file', 'simple-bug-fix', 'sequential-dependency', 'final-authority-judgment']);

export const resolveCodexSubagentPolicy = ({ workShape = null, capsuleAllowsDelegation = false } = {}) => {
  const suitable = SUBAGENT_SUITABLE.includes(String(workShape));
  const allowed = capsuleAllowsDelegation && suitable;
  return Object.freeze({
    allowSubagents: allowed,
    maxSubagents: allowed ? 1 : 0,
    // Ultra fan-out is never a completion condition; the Kernel decides done.
    allowUltra: false,
    ultraRequiresContractApproval: true,
    reason: allowed ? 'contract-approved-independent-work' : (suitable ? 'contract-not-approved' : 'work-shape-unsuitable'),
  });
};

// Fast mode changes throughput, not intelligence. It is an execution setting,
// never prompt text.
export const resolveCodexFastModePolicy = ({ workContext = 'batch', authMode = null } = {}) => {
  const interactive = ['interactive-urgent-fix', 'short-debug-loop', 'user-waiting-exploration'].includes(String(workContext));
  return Object.freeze({
    speedMode: interactive ? 'fast' : 'standard',
    deliveredAs: 'execution-setting',
    includedInPrompt: false,
    authMode: authMode || null,
    // Credit multipliers differ between ChatGPT-login and API-key billing; the
    // Host records what it knows and null when it does not.
    creditMultiplierKnown: null,
  });
};

// Plan mode is for work that is genuinely multi-step or contested. A simple
// edit goes straight to execution.
export const resolveCodexPlanPolicy = ({ actionKind = 'implement', complexity = 'simple', shapes = [] } = {}) => {
  const risky = shapes.some((shape) => HIGH_RISK_SHAPES.includes(String(shape)));
  const needsPlan = actionKind === 'plan' || ['complex', 'ambiguous', 'multi-step', 'approach-comparison'].includes(String(complexity)) || risky;
  return Object.freeze({ usePlanProfile: needsPlan, profile: needsPlan ? 'plan' : 'default' });
};

// Programmatic tool calling suits bounded read-heavy aggregation. It is unfit
// where each result changes the next decision, or where the call mutates.
export const PROGRAMMATIC_TOOL_SUITABLE = Object.freeze(['test-log-filtering', 'static-metadata-aggregation', 'evidence-schema-validation', 'bounded-readonly-aggregation']);
export const PROGRAMMATIC_TOOL_UNSUITABLE = Object.freeze(['iterative-debugging', 'code-mutation', 'destructive-command', 'approval-required', 'final-review-judgment']);

export const resolveProgrammaticToolPolicy = ({ workShape = null, capabilityDetected = false, evaluated = false } = {}) => {
  const suitable = PROGRAMMATIC_TOOL_SUITABLE.includes(String(workShape));
  return Object.freeze({
    // Default off until a representative eval shows no quality regression.
    enabled: Boolean(capabilityDetected && suitable && evaluated),
    reason: !capabilityDetected ? 'provider-unsupported' : (!suitable ? 'work-shape-unsuitable' : (!evaluated ? 'awaiting-evaluation' : 'enabled')),
  });
};

// `reasoning.mode = "pro"` is a Responses API mode, not a model slug, and stays
// off the default path.
export const resolveCodexProModePolicy = ({ capabilityDetected = false, qualityOverLatency = false, evalConfirmedGain = false, explicitlyRequested = false } = {}) => Object.freeze({
  enabled: Boolean(capabilityDetected && qualityOverLatency && evalConfirmedGain && explicitlyRequested),
  reason: capabilityDetected ? 'gated' : 'provider-unsupported',
});
