// Codex-only actor routing. The Kernel supplies role and provider-neutral work
// shape; this module chooses the concrete Codex dispatch route and session
// policy without changing Kernel completion authority.

import { buildCodexMainSessionPolicy } from './codex-session-observer.mjs';

export const CODEX_ACTOR_ROLES = Object.freeze(['planner', 'implementer', 'debugger', 'reviewer']);

const repeatedFailure = (decision = {}) => decision.workProfile?.repeatedFailure === true
  || (decision.reasonCodes || []).some((code) => code === 'RETRY_ESCALATION' || code === 'PROTECTED_OBLIGATION_FAILURE' || code === 'ESCALATION_LOCKED');

export const resolveCodexActorRoute = ({
  decision = {},
  invocation = {},
  capabilities = {},
  hasNativeLauncher = false,
  hasCliLauncher = false,
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
  const nativeAvailable = hasNativeLauncher && capabilities.supportsSubagentModel === true;
  const dispatchMechanism = nativeAvailable
    ? 'native-subagent'
    : hasCliLauncher
      ? 'cli-worker'
      : invocation.mechanism || 'session-model-override';
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
    fallbackAllowed: nativeAvailable && hasCliLauncher,
    parentMayImplement: false,
    nestedDelegationAllowed: false,
    parentSessionPolicy,
  });
};
