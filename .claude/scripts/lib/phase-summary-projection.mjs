import {
  SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION,
  buildFinalOutcomeProjectionHash,
  parseFinalOutcomeSummary,
  phaseProjectionCounts,
} from './final-outcome-projection.mjs';

export const SUMMARY_PROJECTION_SCHEMA_VERSION = '1.0';

const COMPLETED_STATES = new Set(['complete', 'completed', 'success', 'success_with_warning']);
const FAILURE_STATES = new Set(['blocked', 'failed', 'failure', 'unhealthy']);

function normalizedText(value = '') {
  return String(value ?? '').trim().toLowerCase();
}

function hasHistoricalWarnings({ statusRoot = {}, workflowStates = [] } = {}) {
  if (Array.isArray(statusRoot.historicalWarnings) && statusRoot.historicalWarnings.length > 0) {
    return true;
  }
  if (normalizedText(statusRoot.normalizedRunVerdict) === 'success_with_warning') {
    return true;
  }
  return workflowStates.some((state) => (
    Array.isArray(state.historicalWarnings) && state.historicalWarnings.length > 0
  ) || normalizedText(state.normalizedRunVerdict) === 'success_with_warning');
}

function runtimeState(statusRoot = {}) {
  const finalVerdict = normalizedText(statusRoot.finalVerdict);
  const normalizedRunVerdict = normalizedText(statusRoot.normalizedRunVerdict);
  if (finalVerdict === 'complete' || COMPLETED_STATES.has(normalizedRunVerdict)) {
    return 'completed';
  }
  return normalizedText(statusRoot.activeExecutionStatus) || normalizedRunVerdict || finalVerdict || 'unknown';
}

function activeFailedCount({ statusRoot = {}, phases = [] } = {}) {
  if (runtimeState(statusRoot) === 'completed') {
    return 0;
  }
  return phases.filter((phase) => FAILURE_STATES.has(normalizedText(phase.status))).length;
}

export function buildPhaseSummaryProjection({
  statusRoot = {},
  phases = [],
  workflowStates = [],
  repositoryCloseout = {},
  generatedAt = '',
  projectionHash = '',
} = {}) {
  const counts = phaseProjectionCounts(phases);
  const resolvedHash = projectionHash || buildFinalOutcomeProjectionHash({ statusRoot, phases, workflowStates });
  const state = runtimeState(statusRoot);
  const failed = activeFailedCount({ statusRoot, phases });
  const repositoryState = normalizedText(
    repositoryCloseout.state
    ?? repositoryCloseout.status
    ?? statusRoot.repositoryCloseoutStatus
    ?? statusRoot.repositoryState
    ?? '',
  );

  return {
    schemaVersion: SUMMARY_PROJECTION_SCHEMA_VERSION,
    finalOutcomeSchemaVersion: SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION,
    projectionHash: resolvedHash,
    generatedAt,
    runtime: {
      completed: counts.completed,
      failed,
      state,
      historicalWarnings: hasHistoricalWarnings({ statusRoot, workflowStates }),
    },
    repository: {
      state: repositoryState,
    },
  };
}

export function renderPhaseSummaryProjection(input = {}) {
  const projection = buildPhaseSummaryProjection(input);
  const lines = [
    '# Agent Loop Current Summary',
    '',
    `summaryProjectionSchemaVersion: "${projection.schemaVersion}"`,
    `Final outcome schema: ${projection.finalOutcomeSchemaVersion}`,
    `Final outcome projection hash: ${projection.projectionHash}`,
    `Generated at: ${projection.generatedAt}`,
    '',
    '## Runtime',
    `Completed ${projection.runtime.completed}`,
    `Failed ${projection.runtime.failed}`,
    `State ${projection.runtime.state}`,
  ];

  if (projection.runtime.historicalWarnings) {
    lines.push('Runtime completed with historical warnings');
  }

  if (projection.repository.state) {
    lines.push('', '## Repository Closeout', `State ${projection.repository.state}`);
  }

  return `${lines.join('\n')}\n`;
}

export function parsePhaseSummaryProjection(summaryText = '') {
  const parsed = parseFinalOutcomeSummary(summaryText);
  const schemaMatch = String(summaryText).match(/^summaryProjectionSchemaVersion:\s*"?([^"\r\n]+)"?\s*$/m);
  return {
    ...parsed,
    summaryProjectionSchemaVersion: schemaMatch?.[1]?.trim() || '',
  };
}
