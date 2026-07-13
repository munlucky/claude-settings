export const blockedDecision = (reason) => ({ releaseBlocked: true, reason });
const allowedDecision = () => ({ releaseBlocked: false, reason: '' });

export function assessCompletionFixture(input = {}) {
  if (input.activeIdentityPresent === true && input.identityMatches === false) return blockedDecision('identity mismatch');
  if (input.verdictFresh === false) return blockedDecision(input.staleReason || 'stale verdict');
  if (input.phaseStatusComplete === true && input.verifierEvidence == null && !Object.hasOwn(input, 'dbAccepted')) return blockedDecision('phase-status-only completion rejected');
  if (input.phaseStatusComplete === true && input.dbAccepted === false) return blockedDecision('missing accepted completion decision');
  return allowedDecision();
}

export function assessToolDispatchFixture(input = {}) {
  if (input.selectedGroup && input.actualGroup && input.selectedGroup !== input.actualGroup) return blockedDecision('wrong tool group for selected context');
  if (input.schemaMode === 'rejected') return blockedDecision('invalid tool args rejected before execution');
  return allowedDecision();
}

export function assessRunLifecycleFixture(input = {}) {
  return input.leaseStatus === 'expired' ? blockedDecision('stale run lease recovered') : allowedDecision();
}

export function assessRuntimeCapabilityFixture(input = {}) {
  return input.runtimeStatus === 'degraded' ? blockedDecision('runtime-state unavailable') : allowedDecision();
}

export function assessEvalFixture(input = {}) {
  return input.regressionWorsened === true ? blockedDecision('eval regression worsened') : allowedDecision();
}

export function assessArchitectureFixture(input = {}) {
  if (input.missing === 'TRACEABILITY_MATRIX.md') return blockedDecision('architecture traceability missing');
  if (/raw\s+(?:KG|knowledge graph)/i.test(input.promptBlock || '')) return blockedDecision('raw architecture context leakage');
  if (input.traceabilityRow && !input.traceabilityRow.verificationSignal) return blockedDecision('architecture verification signal missing');
  if (input.phaseStatusComplete === true && input.assessCompletionAccepted === false) return blockedDecision('architecture closeout requires accepted DB decision');
  return allowedDecision();
}
