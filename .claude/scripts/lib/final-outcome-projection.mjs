import crypto from 'node:crypto';

export const STATUS_PROJECTION_SCHEMA_VERSION = 'final-outcome-v1';
export const WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION = '1.0';
export const SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION = '1.0';

const CANONICAL_RUN_VERDICTS = new Set(['success', 'success_with_warning']);
const LEGACY_COMPLETE_RUN_VERDICTS = new Set(['complete', 'success', 'success_with_warning']);
const BLOCKED_RUN_VERDICTS = new Set(['blocked', 'verification_blocked', 'failed']);
const BLOCKER_COMPLETION_STATUSES = new Set(['blocked', 'verification_blocked']);

export function isBlockedPhaseStatus(status) {
  return /blocked|unhealthy/i.test(String(status || ''));
}

export function isPhaseConfirmed(phase = {}) {
  return String(phase.planConfirmed ?? true).toLowerCase() !== 'false';
}

export function actionablePhases(phases = []) {
  return phases.filter((phase) => isPhaseConfirmed(phase) && !isBlockedPhaseStatus(phase.status));
}

export function phaseProjectionCounts(phases = []) {
  const confirmed = phases.filter((phase) => isPhaseConfirmed(phase));
  const actionable = actionablePhases(phases);
  const blocked = confirmed.filter((phase) => isBlockedPhaseStatus(phase.status)).length;
  const completed = actionable.filter((phase) => String(phase.status || '') === 'completed').length;
  const pending = actionable.filter((phase) => String(phase.status || '') === 'pending').length;
  const remaining = Math.max(actionable.length - completed, 0);
  return {
    planned: confirmed.length,
    completed,
    blocked,
    pending,
    remaining,
  };
}

export function normalizeFinalRunVerdict({ phase = {}, statusRoot = {}, historicalWarnings = [] } = {}) {
  const raw = String(phase.normalizedRunVerdict || statusRoot.normalizedRunVerdict || '').trim().toLowerCase();
  if (raw === 'success_with_warning' || historicalWarnings.length > 0) {
    return 'success_with_warning';
  }
  if (BLOCKED_RUN_VERDICTS.has(raw) || isUnrecoveredBlockerTerminalState(phase) || isUnrecoveredBlockerTerminalState(statusRoot)) {
    return '';
  }
  if (LEGACY_COMPLETE_RUN_VERDICTS.has(raw)) {
    return 'success';
  }
  return historicalWarnings.length > 0 ? 'success_with_warning' : 'success';
}

export function isUnrecoveredBlockerTerminalState(state = {}) {
  const finalVerdict = String(state.finalVerdict || '').trim().toLowerCase();
  const completionStatus = String(state.completionStatus || '').trim().toLowerCase();
  const blockingReason = String(state.blockingStopReasonCode || state.blockingReasonCode || state.stopReasonCode || '').trim();
  return finalVerdict === 'blocked'
    || BLOCKER_COMPLETION_STATUSES.has(completionStatus)
    || (Boolean(blockingReason) && finalVerdict !== 'complete');
}

export function isFinalCompleteProjection({ statusRoot = {}, phases = [] } = {}) {
  const rootVerdict = String(statusRoot.finalVerdict || '').trim().toLowerCase();
  const runVerdict = String(statusRoot.normalizedRunVerdict || '').trim().toLowerCase();
  const actionable = actionablePhases(phases);
  return !isUnrecoveredBlockerTerminalState(statusRoot)
    && rootVerdict === 'complete'
    && LEGACY_COMPLETE_RUN_VERDICTS.has(runVerdict)
    && actionable.length > 0
    && actionable.every((phase) => String(phase.status || '') === 'completed');
}

export function buildFinalOutcomeProjectionHash({ statusRoot = {}, phases = [], workflowStates = [] } = {}) {
  const counts = phaseProjectionCounts(phases);
  const workflowProjection = workflowStates
    .map((state) => ({
      basename: state.basename || '',
      status: state.status || '',
      completionStatus: state.completionStatus || '',
      finalOutcomeSchemaVersion: state.finalOutcomeSchemaVersion || '',
      finalVerdict: state.finalVerdict || '',
      normalizedRunVerdict: state.normalizedRunVerdict || '',
      stopReasonCode: state.stopReasonCode || '',
    }))
    .sort((a, b) => a.basename.localeCompare(b.basename));
  const payload = {
    projectionSchemaVersion: statusRoot.projectionSchemaVersion || '',
    finalVerdict: statusRoot.finalVerdict || '',
    normalizedRunVerdict: statusRoot.normalizedRunVerdict || '',
    lastStopReasonCode: statusRoot.lastStopReasonCode || '',
    activeExecutionStatus: statusRoot.activeExecutionStatus || '',
    activePlannedPhases: Number(statusRoot.activePlannedPhases ?? Number.NaN),
    activeCompletedPhases: Number(statusRoot.activeCompletedPhases ?? Number.NaN),
    activeBlockedPhases: Number(statusRoot.activeBlockedPhases ?? Number.NaN),
    activePendingPhases: Number(statusRoot.activePendingPhases ?? Number.NaN),
    activeRemainingPhases: Number(statusRoot.activeRemainingPhases ?? Number.NaN),
    activeActionablePhasesRemaining: Number(statusRoot.activeActionablePhasesRemaining ?? Number.NaN),
    counts,
    phases: actionablePhases(phases).map((phase) => ({
      number: Number(phase.number),
      status: phase.status || '',
      lastOutcome: phase.lastOutcome || '',
    })),
    workflowProjection,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function parseFinalOutcomeSummary(summaryText = '') {
  const schemaMatch = String(summaryText).match(/^Final outcome schema:\s*(.+)$/m);
  const hashMatch = String(summaryText).match(/^Final outcome projection hash:\s*([a-f0-9]+)$/m);
  return {
    finalOutcomeSchemaVersion: schemaMatch?.[1]?.trim() || '',
    projectionHash: hashMatch?.[1]?.trim() || '',
  };
}

export function renderFinalOutcomeSummary({ projectionHash, generatedAt }) {
  return [
    '# Agent Loop Current Summary',
    '',
    `Final outcome schema: ${SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION}`,
    `Final outcome projection hash: ${projectionHash}`,
    `Generated at: ${generatedAt}`,
    '',
  ].join('\n');
}

export function canonicalProjectionIssues({ statusRoot = {}, phases = [], workflowStates = [], summary = {} } = {}) {
  const issues = [];
  const counts = phaseProjectionCounts(phases);
  const expectedHash = buildFinalOutcomeProjectionHash({ statusRoot, phases, workflowStates });
  const runVerdict = String(statusRoot.normalizedRunVerdict || '').trim().toLowerCase();
  const rootBlockerTerminal = isUnrecoveredBlockerTerminalState(statusRoot);

  if (!isFinalCompleteProjection({ statusRoot, phases })) {
    issues.push(rootBlockerTerminal ? 'blocker_terminal_not_final_complete' : 'final_projection_incomplete');
  }
  if (statusRoot.projectionSchemaVersion !== STATUS_PROJECTION_SCHEMA_VERSION) {
    issues.push('status_projection_schema_stale');
  }
  if (!rootBlockerTerminal && !CANONICAL_RUN_VERDICTS.has(runVerdict)) {
    issues.push('run_verdict_not_canonical');
  }
  if (
    Number(statusRoot.activePlannedPhases) !== counts.planned
    || Number(statusRoot.activeCompletedPhases) !== counts.completed
    || Number(statusRoot.activeBlockedPhases) !== counts.blocked
    || Number(statusRoot.activePendingPhases) !== counts.pending
    || Number(statusRoot.activeRemainingPhases) !== counts.remaining
    || Number(statusRoot.activeActionablePhasesRemaining) !== counts.remaining
  ) {
    issues.push('phase_counter_projection_mismatch');
  }
  for (const state of workflowStates) {
    const basename = state.basename || 'workflow-state';
    const workflowBlockerTerminal = isUnrecoveredBlockerTerminalState(state);
    if (state.finalOutcomeSchemaVersion !== WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION) {
      issues.push(`${basename}:workflow_schema_stale`);
    }
    if (!workflowBlockerTerminal && !CANONICAL_RUN_VERDICTS.has(String(state.normalizedRunVerdict || '').trim().toLowerCase())) {
      issues.push(`${basename}:run_verdict_not_canonical`);
    }
  }
  if (
    summary.finalOutcomeSchemaVersion !== SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION
    || summary.projectionHash !== expectedHash
  ) {
    issues.push('summary_projection_stale');
  }
  return [...new Set(issues)];
}

export function isCanonicalFinalCompleteProjection(input = {}) {
  return canonicalProjectionIssues(input).length === 0;
}
