// Codex-only actor routing. The Kernel supplies role and provider-neutral work
// shape; this module chooses the concrete Codex dispatch route and session
// policy without changing Kernel completion authority.

import { buildCodexMainSessionPolicy } from './codex-session-observer.mjs';

export const CODEX_ACTOR_ROLES = Object.freeze(['planner', 'implementer', 'debugger', 'reviewer']);

// Native subagents are opt-in delegation. Merely having a launcher or a model
// route never changes the current owner surface into a worker orchestrator.
export const isNativeDelegationRequested = ({ executionMode = null, delegationRequested = false, actionContext = null, executionContract = null } = {}) => {
  const context = actionContext && typeof actionContext === 'object' ? actionContext : {};
  const contract = executionContract && typeof executionContract === 'object' ? executionContract : {};
  return executionMode === 'native-subagent'
    || delegationRequested === true
    || context.executionMode === 'native-subagent'
    || context.delegationRequested === true
    || contract.execution?.mode === 'native-subagent'
    || contract.delegationRequested === true;
};

const repeatedFailure = (decision = {}) => decision.workProfile?.repeatedFailure === true
  || (decision.reasonCodes || []).some((code) => code === 'RETRY_ESCALATION' || code === 'PROTECTED_OBLIGATION_FAILURE' || code === 'ESCALATION_LOCKED');

export const resolveCodexActorRoute = ({
  decision = {},
  invocation = {},
  capabilities = {},
  hasNativeLauncher = false,
  delegationRequested = false,
  parentSessionId = null,
  parentSessionConfig = null,
} = {}) => {
  const role = decision.role === 'reviewer' ? 'reviewer'
    : decision.actionKind === 'debug' ? 'debugger'
      : decision.role === 'planner' ? 'planner'
        : 'implementer';
  const freshSessionRequired = decision.independentContextRequired === true
    || decision.workProfile?.independentContextRequired === true
    || role === 'reviewer'
    || repeatedFailure(decision)
    || invocation.freshSessionRequired === true;
  const independentReviewRequired = role === 'reviewer' && decision.independentContextRequired === true;
  const nativeAvailable = hasNativeLauncher && capabilities.supportsSubagentModel === true;
  const isolatedSessionAvailable = capabilities.supportsIndependentContext === true;
  const dispatchMechanism = delegationRequested && nativeAvailable
    ? 'native-subagent'
    : independentReviewRequired
      ? (isolatedSessionAvailable ? 'independent-review' : 'review-pending')
      : 'owner-direct';
  const executionMode = dispatchMechanism;
  const parentSessionPolicy = buildCodexMainSessionPolicy({
    parentSessionId,
    observed: parentSessionConfig,
  });
  return Object.freeze({
    role,
    requestedModel: invocation.model || null,
    requestedEffort: invocation.effort || null,
    dispatchMechanism,
    sessionPolicy: freshSessionRequired ? 'fresh' : 'reusable',
    freshSessionRequired,
    fallbackAllowed: false,
    ownerDirectAllowed: !independentReviewRequired,
    executionMode,
    delegation: Object.freeze({
      mode: independentReviewRequired ? 'required' : 'optional',
      available: nativeAvailable,
      requested: delegationRequested,
    }),
    execution: Object.freeze({
      role,
      mode: executionMode,
      delegation: independentReviewRequired ? 'required' : 'optional',
    }),
    parentSessionPolicy,
  });
};
