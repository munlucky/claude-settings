const ACTIVE_STATUSES = new Set(['prepared', 'running', 'active', 'in_progress']);
const TERMINAL_STATUSES = new Set([
  'completed',
  'superseded',
  'superseded-by-local-fallback',
  'failed',
  'blocked',
  'verification_blocked',
  'runtime_unhealthy',
]);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhaseNumber(value) {
  const parsed = Number.parseInt(normalizeText(value).replace(/^0+/, '') || '0', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function firstPhaseNumber(...values) {
  for (const value of values) {
    const phaseNumber = normalizePhaseNumber(value);
    if (phaseNumber) {
      return phaseNumber;
    }
  }
  return null;
}

export function workflowStateClass(payload = {}) {
  const status = normalizeLower(
    payload.attemptOutcome
      || payload.completionStatus
      || payload.activeExecutionStatus
      || payload.status,
  );
  if (ACTIVE_STATUSES.has(status)) {
    return 'active';
  }
  if (TERMINAL_STATUSES.has(status)) {
    return 'terminal';
  }
  return 'unknown';
}

export function workflowPhaseNumber(payload = {}) {
  return firstPhaseNumber(
    payload.phase?.number,
    payload.phaseNumber,
    payload.activePhaseNumber,
    payload.phaseRunLease?.phase?.number,
    payload.phaseRunLease?.activePhaseNumber,
  );
}

export function terminalPhaseNumber(payload = {}) {
  return firstPhaseNumber(
    payload.completedPhaseNumber,
    payload.terminalEvent?.phaseNumber,
    payload.lifecycleTerminalEvent?.phaseNumber,
    payload.lifecycleEvent?.phaseNumber,
    payload.completion?.phaseNumber,
    payload.phaseRunLease?.completedPhaseNumber,
    payload.phaseRunLease?.terminalEvent?.phaseNumber,
  );
}

export function evaluatePointerInvariant({ phaseStatus = {}, workflowState = {} } = {}) {
  const stateClass = workflowStateClass(workflowState);
  const workflowPhase = workflowPhaseNumber(workflowState);
  const activePhase = normalizePhaseNumber(phaseStatus.activePhaseNumber);

  if (!workflowPhase) {
    return {
      ok: false,
      stateClass,
      code: 'workflow_phase_identity_missing',
      message: 'Workflow state must carry a structured phase identity.',
    };
  }

  if (stateClass === 'active') {
    const ok = Boolean(activePhase && workflowPhase === activePhase);
    return {
      ok,
      stateClass,
      workflowPhaseNumber: workflowPhase,
      activePhaseNumber: activePhase,
      code: ok ? 'active_pointer_match' : 'active_pointer_mismatch',
      message: ok
        ? 'Active workflow phase matches phase-status.activePhaseNumber.'
        : 'Prepared/running workflow phase must match phase-status.activePhaseNumber.',
    };
  }

  if (stateClass === 'terminal') {
    const terminalPhase = terminalPhaseNumber(workflowState);
    const ok = Boolean(terminalPhase && workflowPhase === terminalPhase);
    return {
      ok,
      stateClass,
      workflowPhaseNumber: workflowPhase,
      terminalPhaseNumber: terminalPhase,
      activePhaseNumber: activePhase,
      code: ok ? 'terminal_pointer_match' : 'terminal_phase_identity_missing_or_mismatch',
      message: ok
        ? 'Terminal workflow phase matches structured terminal phase identity.'
        : 'Terminal workflow state must match completedPhaseNumber or a structured terminal lifecycle event phaseNumber.',
    };
  }

  return {
    ok: false,
    stateClass,
    workflowPhaseNumber: workflowPhase,
    activePhaseNumber: activePhase,
    code: 'workflow_state_class_unknown',
    message: 'Workflow status must be classified as active or terminal before pointer checks.',
  };
}
