import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { nowIsoSeconds } from './clock.mjs';
import { recordLifecycleTransition } from './lifecycle-projection-writer.mjs';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
const DEFAULT_STATUS_FILE = path.resolve(process.cwd(), '.claude/docs/phase-status.yaml');
const ACTIVE_RUN_BASENAME = 'active-phase-run.json';
const CURRENT_RUN_BASENAME = 'current-run.json';
const TERMINAL_ATTEMPT_STATES = new Set([
  'blocked',
  'completed',
  'failed',
  'stale',
  'superseded',
  'superseded-by-local-fallback',
  'verification_blocked',
  'runtime_unhealthy',
]);
const TERMINAL_METADATA_FIELDS = [
  'status',
  'completionStatus',
  'attemptOutcome',
  'blockingStopReasonCode',
  'stopReasonDetail',
  'blockerEvidenceRef',
  'blockerEvidenceId',
  'transactionId',
  'originalStopReasonCode',
  'originalStopReasonDetail',
  'supersededByTransactionId',
  'reconciledAt',
  'reconciliationReason',
  'historicalWarnings',
  'finalVerdict',
  'normalizedRunVerdict',
  'returnBoundary',
  'stopReasonCode',
  'rawStopReasonCode',
  'completionPath',
  'completedAt',
  'failedAt',
  'finishedAt',
  'finalOutcomeSchemaVersion',
];

export function resolveStatusFile(statusFile) {
  if (!statusFile) {
    return DEFAULT_STATUS_FILE;
  }
  return path.resolve(statusFile);
}

function statusFileHash(statusFile) {
  return crypto.createHash('sha1').update(resolveStatusFile(statusFile)).digest('hex').slice(0, 12);
}

export function resolveLeaseFiles(statusFile) {
  const resolvedStatusFile = resolveStatusFile(statusFile);
  const defaultLeaseFiles = {
    activeRunFile: path.join(WORKFLOW_LOG_DIR, ACTIVE_RUN_BASENAME),
    currentRunFile: path.join(WORKFLOW_LOG_DIR, CURRENT_RUN_BASENAME),
    mirrorGlobalCurrentRun: true,
  };

  if (resolvedStatusFile === DEFAULT_STATUS_FILE) {
    return defaultLeaseFiles;
  }

  const suffix = statusFileHash(resolvedStatusFile);
  return {
    activeRunFile: path.join(WORKFLOW_LOG_DIR, `active-phase-run-${suffix}.json`),
    currentRunFile: path.join(WORKFLOW_LOG_DIR, `current-run-${suffix}.json`),
    mirrorGlobalCurrentRun: false,
  };
}

export function utcTimestamp() {
  return nowIsoSeconds();
}

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function isTerminalAttempt(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const states = [
    payload.attemptOutcome,
    payload.completionStatus,
    payload.status,
    payload.phaseRunLease?.attemptOutcome,
    payload.phaseRunLease?.completionStatus,
    payload.phaseRunLease?.status,
  ].map(normalizeLower);
  return states.some((value) => TERMINAL_ATTEMPT_STATES.has(value))
    || Boolean(payload.blockingStopReasonCode || payload.phaseRunLease?.blockingStopReasonCode);
}

function preserveTerminalMetadata(next, terminalSource) {
  if (!terminalSource) {
    return next;
  }
  const preserved = { ...next };
  for (const field of TERMINAL_METADATA_FIELDS) {
    if (terminalSource[field] !== undefined && terminalSource[field] !== '') {
      preserved[field] = terminalSource[field];
    }
  }
  return preserved;
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function leaseLifecycleEvent(leasePayload, existingPayload = null) {
  if (leasePayload.status === 'active') {
    return existingPayload ? 'lease_heartbeat' : 'lease_started';
  }
  if (['finished', 'completed'].includes(leasePayload.status) || leasePayload.completionStatus === 'completed') {
    return 'lease_completed';
  }
  return 'lease_failed';
}

function phaseIdentity(leasePayload = {}) {
  return {
    phaseNumber: leasePayload.phase?.number || leasePayload.activePhaseNumber || 0,
    phaseTitle: leasePayload.phase?.title || leasePayload.activePhaseTitle || 'phase-run-lease',
  };
}

function writeLeaseProjection({ targetFile, payload, existingPayload = null, primaryTargetStateFile = targetFile }) {
  const projectionPayload = {
    ...payload,
    stateRunId: payload.stateRunId || payload.runLeaseId || '',
  };
  const lifecycleEvent = leaseLifecycleEvent(projectionPayload, existingPayload);
  return recordLifecycleTransition({
    source: 'phase-run-lease-store',
    targetStateFiles: [targetFile],
    primaryTargetStateFile,
    ...phaseIdentity(projectionPayload),
    status: projectionPayload.status || 'unknown',
    completionStatus: projectionPayload.completionStatus
      || (lifecycleEvent === 'lease_completed' ? 'completed' : undefined)
      || (lifecycleEvent === 'lease_failed' ? 'failed' : undefined),
    lifecycleEvent,
    timestamp: utcTimestamp(),
    pidNamespace: projectionPayload.dispatcherPid ? 'node-parent' : undefined,
    payloadPatch: projectionPayload,
    writeMode: 'replace',
  });
}

function mirrorToCurrentRun(statusFile, leasePayload) {
  const leaseFiles = resolveLeaseFiles(statusFile);
  const existing = readJson(leaseFiles.currentRunFile) || {};
  const identityFields = {
    runLeaseId: leasePayload.runLeaseId || existing.runLeaseId || '',
    stateRunId: leasePayload.stateRunId || leasePayload.runLeaseId || existing.stateRunId || '',
    status: leasePayload.status || existing.status || '',
    completionStatus: leasePayload.completionStatus || existing.completionStatus || '',
    executionBoundary: leasePayload.executionBoundary || existing.executionBoundary || '',
    planDir: leasePayload.planDir || existing.planDir || '',
    statusFile: leasePayload.statusFile || existing.statusFile || statusFile || '',
    executionRoot: leasePayload.executionRoot || existing.executionRoot || '',
    masterPlan: leasePayload.masterPlan || existing.masterPlan || '',
    activeExecutionStatus: leasePayload.completionStatus || leasePayload.status || existing.activeExecutionStatus || '',
    activeCurrentStage: leasePayload.currentStage || existing.activeCurrentStage || '',
    activePhaseNumber: leasePayload.phase?.number ?? existing.activePhaseNumber ?? '',
    activePhaseTitle: leasePayload.phase?.title ?? existing.activePhaseTitle ?? '',
    activeActionablePhasesRemaining: leasePayload.actionablePhasesRemaining ?? existing.activeActionablePhasesRemaining ?? '',
  };
  const next = {
    ...existing,
    ...identityFields,
    updatedAt: utcTimestamp(),
    unavailableCapabilities: leasePayload.unavailableCapabilities || existing.unavailableCapabilities || [],
    phaseRunLease: leasePayload,
  };
  const terminalSource = isTerminalAttempt(existing)
    ? existing
    : isTerminalAttempt(leasePayload)
      ? leasePayload
      : null;
  if (leasePayload.status === 'active' && !terminalSource) {
    for (const key of [
      'completedAt',
      'failedAt',
      'finishedAt',
      'finalVerdict',
      'finalStatus',
      'returnBoundary',
      'stopReasonCode',
      'rawStopReasonCode',
      'blockingStopReasonCode',
      'stopReasonDetail',
      'completionPath',
      'normalizedRunVerdict',
      'originalStopReasonCode',
      'originalStopReasonDetail',
      'supersededByTransactionId',
      'reconciledAt',
      'reconciliationReason',
      'historicalWarnings',
      'finalOutcomeSchemaVersion',
    ]) {
      delete next[key];
    }
    if (!leasePayload.completionStatus) {
      next.completionStatus = '';
      next.activeExecutionStatus = leasePayload.status || 'active';
    }
  }
  const projected = preserveTerminalMetadata(next, terminalSource);
  writeLeaseProjection({
    targetFile: leaseFiles.currentRunFile,
    payload: projected,
    existingPayload: existing,
    primaryTargetStateFile: leaseFiles.currentRunFile,
  });

  if (!leaseFiles.mirrorGlobalCurrentRun) {
    return;
  }

  const globalCurrentRunFile = path.join(WORKFLOW_LOG_DIR, CURRENT_RUN_BASENAME);
  if (globalCurrentRunFile === leaseFiles.currentRunFile) {
    return;
  }
  writeLeaseProjection({
    targetFile: globalCurrentRunFile,
    payload: projected,
    existingPayload: readJson(globalCurrentRunFile),
    primaryTargetStateFile: leaseFiles.currentRunFile,
  });
}

export function readActiveLease(statusFile) {
  return readJson(resolveLeaseFiles(statusFile).activeRunFile);
}

export function writeActiveLease(statusFile, payload) {
  const activeRunFile = resolveLeaseFiles(statusFile).activeRunFile;
  writeLeaseProjection({
    targetFile: activeRunFile,
    payload,
    existingPayload: readJson(activeRunFile),
  });
  mirrorToCurrentRun(statusFile, payload);
}
