#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateHarnessStateInvariants,
} from './lib/harness-state-invariants.mjs';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const DEFAULT_WORKFLOW_DIR = '.claude/logs/workflow-enforcement';
const STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];
const DELEGATED_ORPHAN_REJECTION = 'delegated_loop_cannot_adopt_orphan';
const INTENT_SCHEMA_VERSION = 1;

function utcTimestamp(now = '') {
  if (now) {
    const parsed = new Date(now);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid --now value: ${now}`);
    }
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function resolvePath(filePath, root = process.cwd()) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, value: null };
  }
  return { exists: true, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

function parsePhaseStatusDocument(text) {
  const phases = [];
  const root = {};
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let current = null;

  for (const line of lines) {
    const start = line.match(/^\s*-\s+number:\s*(\d+)/);
    if (start) {
      if (current) phases.push(current);
      current = { number: Number(start[1]) };
      continue;
    }

    if (current) {
      const field = line.match(/^ {4}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
      if (field) {
        current[field[1]] = stripQuotes(field[2]);
      }
      continue;
    }

    const rootField = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (rootField) {
      root[rootField[1]] = stripQuotes(rootField[2]);
    }
  }

  if (current) phases.push(current);
  return { root, phases };
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tempFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
}

function isFailedDelegatedState(payload = {}) {
  const fields = [
    payload.status,
    payload.completionStatus,
    payload.activeExecutionStatus,
    payload.failureClass,
    payload.stopReasonCode,
    payload.stopReasonDetail,
    payload.workflowKind,
    payload.executionMode,
    payload.returnBoundary,
    payload.phaseRunLease?.status,
    payload.phaseRunLease?.completionStatus,
    payload.phaseRunLease?.stopReasonCode,
  ].map((value) => String(value || '').toLowerCase());

  const failed = fields.some((value) => value.includes('failed') || value.includes('failure'));
  const delegated = fields.some((value) => value.includes('delegated') || value.includes('terminal'));
  return failed && delegated;
}

function resolveRunId(payload = {}) {
  return payload.runLeaseId
    || payload.runId
    || payload.phaseRunLease?.runLeaseId
    || payload.phaseRunLease?.runId
    || payload.activeRunLeaseId
    || '';
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function stableTransactionId(seed) {
  return `reconciliation-${crypto.createHash('sha1').update(String(seed || '')).digest('hex').slice(0, 16)}`;
}

function phaseSlug(rawConfig = {}) {
  return String(rawConfig.phaseSlug || rawConfig.phaseTitle || rawConfig.phase || 'phase-closeout-reconciliation')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'phase-closeout-reconciliation';
}

function resolveIntentPaths(rawConfig, root, workflowDir) {
  const baseDir = rawConfig.executionRoot
    ? path.join(resolvePath(rawConfig.executionRoot, root), phaseSlug(rawConfig))
    : workflowDir;
  const intentPath = rawConfig.reconciliationIntentPath
    ? resolvePath(rawConfig.reconciliationIntentPath, root)
    : path.join(baseDir, 'reconciliation-intent.json');
  const markerDir = path.dirname(intentPath);
  return {
    intentPath,
    partialMarkerPath: path.join(markerDir, 'reconciliation-partial.json'),
    successMarkerPath: path.join(markerDir, 'reconciliation-success.json'),
  };
}

function scanReconciliationTargets(root, workflowDir) {
  const touchedProjectionPaths = [];
  const failedPayloads = [];
  for (const basename of STATE_FILES) {
    const filePath = path.join(workflowDir, basename);
    const { exists, value } = readJson(filePath);
    if (!exists) {
      continue;
    }
    if (isFailedDelegatedState(value || {})) {
      touchedProjectionPaths.push(relativePath(root, filePath));
      failedPayloads.push(value || {});
    }
  }
  return { touchedProjectionPaths, failedPayloads };
}

function originalStopReasonFields(rawConfig, failedPayloads) {
  const source = failedPayloads[0] || {};
  const code = String(firstPresent(
    rawConfig.originalStopReason,
    source.originalStopReason,
    source.stopReasonCode,
    source.stopReasonDetail,
    source.phaseRunLease?.originalStopReason,
    source.phaseRunLease?.stopReasonCode,
  ));
  const detail = String(firstPresent(
    rawConfig.originalStopReasonDetail,
    source.originalStopReasonDetail,
    source.stopReasonDetail,
    source.phaseRunLease?.stopReasonDetail,
    code,
  ));
  return { code, detail };
}

function writeReconciliationIntent(rawConfig, root, workflowDir, supersededAt, fallbackRunId) {
  const paths = resolveIntentPaths(rawConfig, root, workflowDir);
  const existingRead = readJson(paths.intentPath);
  const existing = existingRead.exists ? existingRead.value : null;
  if (existing && existing.status === 'success' && fs.existsSync(resolvePath(existing.successMarkerPath || paths.successMarkerPath, root))) {
    return { intent: existing, paths, resumed: false, alreadySuccessful: true };
  }

  const { touchedProjectionPaths, failedPayloads } = scanReconciliationTargets(root, workflowDir);
  const originalStopReason = originalStopReasonFields(rawConfig, failedPayloads);
  const transactionId = existing?.transactionId
    || rawConfig.transactionId
    || stableTransactionId(`${fallbackRunId}|${paths.intentPath}|${originalStopReason.code}`);
  const intent = {
    schemaVersion: INTENT_SCHEMA_VERSION,
    transactionId,
    phaseNumber: Number.parseInt(String(rawConfig.phase || rawConfig.phaseNumber || 0), 10) || 0,
    phaseSlug: phaseSlug(rawConfig),
    createdAt: existing?.createdAt || supersededAt,
    updatedAt: supersededAt,
    reconciliationReason: String(firstPresent(rawConfig.reconciliationReason, rawConfig.reason, 'local fallback reconciliation')),
    originalStopReasonCode: originalStopReason.code,
    originalStopReasonDetail: originalStopReason.detail,
    touchedProjectionPaths,
    sqliteEventTargets: ['runtime_events'],
    status: existing?.status && existing.status !== 'success' ? existing.status : 'pending',
    partialMarkerPath: relativePath(root, paths.partialMarkerPath),
    successMarkerPath: relativePath(root, paths.successMarkerPath),
    historicalWarnings: [
      ...normalizeArray(existing?.historicalWarnings),
      ...normalizeArray(rawConfig.historicalWarnings),
    ],
  };
  writeJsonAtomic(paths.intentPath, intent);
  return { intent, paths, resumed: Boolean(existing), alreadySuccessful: false };
}

function writeReconciliationPartial(paths, intent, completedSteps, pendingSteps, error, timestamp) {
  const partial = {
    schemaVersion: INTENT_SCHEMA_VERSION,
    transactionId: intent.transactionId,
    status: 'partial',
    completedSteps,
    pendingSteps,
    lastError: error instanceof Error ? error.message : String(error || ''),
    updatedAt: timestamp,
  };
  writeJsonAtomic(paths.partialMarkerPath, partial);
  writeJsonAtomic(paths.intentPath, {
    ...intent,
    status: 'partial',
    updatedAt: timestamp,
  });
}

function writeReconciliationSuccess(paths, intent, touchedPaths, verifierResult, timestamp) {
  const success = {
    schemaVersion: INTENT_SCHEMA_VERSION,
    transactionId: intent.transactionId,
    status: 'success',
    reconciledAt: timestamp,
    touchedPaths,
    finalVerifierResult: verifierResult,
  };
  writeJsonAtomic(paths.successMarkerPath, success);
  writeJsonAtomic(paths.intentPath, {
    ...intent,
    status: 'success',
    reconciledAt: timestamp,
    updatedAt: timestamp,
  });
}

function recoveryEvent(config, payload, originalStatus, originalCompletionStatus, originalStopReason) {
  return {
    type: 'delegated-terminal-local-fallback',
    source: 'phase-closeout-reconciler',
    occurredAt: config.supersededAt,
    fromStatus: String(firstPresent(originalCompletionStatus, originalStatus, 'failed')),
    toStatus: 'completed-via-local-fallback',
    evidencePath: config.evidencePath || '.claude/logs/agent-loop/debug.jsonl',
    blockingBeforeRecovery: true,
    rawStopReasonCode: originalStopReason,
    fallbackRunId: config.fallbackRunId,
    supersededRunLeaseId: resolveRunId(payload),
    transactionId: config.transactionId,
  };
}

function residualFailure(config, payload, originalStatus, originalCompletionStatus, originalStopReason) {
  return {
    type: 'primary-executor-failure',
    source: 'phase-closeout-reconciler',
    occurredAt: config.supersededAt,
    status: String(firstPresent(originalCompletionStatus, originalStatus, 'failed')),
    failureClass: firstPresent(payload.failureClass, 'executor-failure'),
    rawStopReasonCode: originalStopReason,
    evidencePath: config.evidencePath || '.claude/logs/agent-loop/debug.jsonl',
    recoveredBy: config.fallbackRunId,
    transactionId: config.transactionId,
  };
}

function appendDebugLog(root, event, details) {
  const logPath = resolvePath(path.join('.claude', 'logs', 'agent-loop', 'debug.jsonl'), root);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify({
    timestamp: details.supersededAt,
    source: 'phase-closeout-reconciler',
    event,
    ...details,
  })}\n`, 'utf8');
  return logPath;
}

function readRequiredJson(filePath, code) {
  if (!fs.existsSync(filePath)) {
    const error = new Error(`${code}: ${filePath}`);
    error.code = code;
    throw error;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (cause) {
    const error = new Error(`${code}: invalid JSON at ${filePath}`);
    error.code = code;
    error.cause = cause;
    throw error;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateAdoptionMetadata(metadata) {
  const errors = [];
  if (!nonEmptyString(metadata?.adoptedBy)) {
    errors.push('adoptedBy');
  }
  if (!nonEmptyString(metadata?.adoptionReason)) {
    errors.push('adoptionReason');
  }
  if (metadata?.reconciledFrom !== 'orphan_projection') {
    errors.push('reconciledFrom');
  }
  const sourceProjectionPaths = metadata?.sourceProjectionPaths;
  if (
    !Array.isArray(sourceProjectionPaths)
    || sourceProjectionPaths.length === 0
    || sourceProjectionPaths.some((entry) => !nonEmptyString(entry))
  ) {
    errors.push('sourceProjectionPaths');
  }
  if (!Array.isArray(metadata?.reverificationCommands) || metadata.reverificationCommands.length === 0) {
    errors.push('reverificationCommands');
  } else {
    metadata.reverificationCommands.forEach((entry, index) => {
      if (!nonEmptyString(entry?.command)) {
        errors.push(`reverificationCommands[${index}].command`);
      }
      if (!nonEmptyString(entry?.cwd)) {
        errors.push(`reverificationCommands[${index}].cwd`);
      }
      if (!nonEmptyString(entry?.expectedSignal)) {
        errors.push(`reverificationCommands[${index}].expectedSignal`);
      }
    });
  }
  return errors;
}

function writeReverificationCapture(filePath, commands, recordedAt) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = commands.map((entry) => JSON.stringify({
    recordedAt,
    source: 'phase-closeout-reconciler',
    command: entry.command,
    cwd: entry.cwd,
    expectedSignal: entry.expectedSignal,
  }));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function manualOrphanReconcile(rawConfig) {
  if (String(rawConfig.mode || '').trim() !== 'manual' || rawConfig.adoptOrphan !== true) {
    const error = new Error(`${DELEGATED_ORPHAN_REJECTION}: orphan adoption requires reconcile --mode manual --adopt-orphan`);
    error.code = DELEGATED_ORPHAN_REJECTION;
    throw error;
  }

  const root = rawConfig.root ? resolvePath(rawConfig.root) : process.cwd();
  const adoptedAt = utcTimestamp(rawConfig.now || '');
  const adoptionMetadataPath = rawConfig.adoptionMetadata
    ? resolvePath(rawConfig.adoptionMetadata, root)
    : '';
  if (!adoptionMetadataPath) {
    const error = new Error('missing_adoption_metadata: --adoption-metadata is required');
    error.code = 'missing_adoption_metadata';
    throw error;
  }

  const metadata = readRequiredJson(adoptionMetadataPath, 'missing_adoption_metadata');
  const validationErrors = validateAdoptionMetadata(metadata);
  if (validationErrors.length > 0) {
    const error = new Error(`adoption_metadata_invalid: ${validationErrors.join(', ')}`);
    error.code = 'adoption_metadata_invalid';
    error.validationErrors = validationErrors;
    throw error;
  }

  const verifierRerunCapturePath = resolvePath(
    metadata.verifierRerunCapturePath || path.join(path.dirname(adoptionMetadataPath), 'reverification-commands.jsonl'),
    root,
  );
  const normalized = {
    schemaVersion: 1,
    ...metadata,
    reconciledFrom: 'orphan_projection',
    adoptionStatus: 'adopted_but_unverified',
    completionStatus: 'adopted_but_unverified',
    verifierPassRequired: true,
    verifierRerunCapturePath: relativePath(root, verifierRerunCapturePath),
    adoptedAt,
  };

  writeJsonAtomic(adoptionMetadataPath, normalized);
  writeReverificationCapture(verifierRerunCapturePath, normalized.reverificationCommands, adoptedAt);
  const debugLogPath = appendDebugLog(root, 'manual-orphan-reconcile-pending', {
    adoptedAt,
    adoptionMetadataPath: relativePath(root, adoptionMetadataPath),
    verifierRerunCapturePath: relativePath(root, verifierRerunCapturePath),
    sourceProjectionPaths: normalized.sourceProjectionPaths,
    completionStatus: normalized.completionStatus,
  });

  return {
    ok: true,
    status: 'adopted_but_unverified',
    completionStatus: 'adopted_but_unverified',
    reconciledFrom: 'orphan_projection',
    adoptionMetadataPath: relativePath(root, adoptionMetadataPath),
    verifierRerunCapturePath: relativePath(root, verifierRerunCapturePath),
    requiredVerifierPass: true,
    debugLogPath: relativePath(root, debugLogPath),
  };
}

function reconcilePayload(payload, config) {
  const supersededRunLeaseId = resolveRunId(payload);
  const executionBoundary = String(firstPresent(
    config.executionBoundary,
    payload.executionBoundary,
    payload.executionMode,
    payload.phaseRunLease?.executionBoundary,
    payload.phaseRunLease?.executionMode,
    'delegated-terminal',
  ));
  const returnBoundary = String(firstPresent(
    config.returnBoundary,
    payload.returnBoundary,
    payload.phaseRunLease?.returnBoundary,
    config.completionBoundary,
    'local-fallback',
  ));
  const fallbackReason = String(firstPresent(config.fallbackReason, config.reason, payload.fallbackReason, payload.stopReasonCode, 'local-fallback-closeout'));
  const originalWorkerExitCode = String(firstPresent(
    config.originalWorkerExitCode,
    payload.originalWorkerExitCode,
    payload.exitCode,
    payload.workerExitCode,
    payload.phaseRunLease?.originalWorkerExitCode,
    payload.phaseRunLease?.exitCode,
  ));
  const originalStopReason = String(firstPresent(
    config.originalStopReason,
    payload.originalStopReason,
    payload.stopReasonCode,
    payload.stopReasonDetail,
    payload.phaseRunLease?.originalStopReason,
    payload.phaseRunLease?.stopReasonCode,
  ));
  const originalStatus = firstPresent(payload.originalStatus, payload.status);
  const originalCompletionStatus = firstPresent(payload.originalCompletionStatus, payload.completionStatus);
  const recovery = recoveryEvent(config, payload, originalStatus, originalCompletionStatus, originalStopReason);
  const residual = residualFailure(config, payload, originalStatus, originalCompletionStatus, originalStopReason);
  const next = {
    ...payload,
    status: 'superseded-by-local-fallback',
    completionStatus: 'completed-via-local-fallback',
    recoveryStatus: 'recovered',
    completionPath: 'local-fallback',
    transactionId: config.transactionId,
    executionBoundary,
    returnBoundary,
    fallbackReason,
    rawStopReasonCode: firstPresent(payload.rawStopReasonCode, originalStopReason),
    blockingStopReasonCode: '',
    originalWorkerExitCode,
    originalStopReason,
    originalStatus,
    originalCompletionStatus,
    fallbackRunId: config.fallbackRunId,
    supersededRunLeaseId,
    supersededByTransactionId: config.transactionId,
    supersededAt: config.supersededAt,
    reconciledAt: config.supersededAt,
    reconciliationReason: config.reason,
    originalStopReasonCode: originalStopReason,
    originalStopReasonDetail: firstPresent(payload.originalStopReasonDetail, payload.stopReasonDetail, payload.phaseRunLease?.stopReasonDetail, originalStopReason),
    historicalWarnings: [
      ...normalizeArray(payload.historicalWarnings),
      ...normalizeArray(config.historicalWarnings),
    ],
    supersededReason: config.reason,
    completionBoundary: config.completionBoundary,
    recoveryEvents: [...normalizeArray(payload.recoveryEvents), recovery],
    residualFailures: [...normalizeArray(payload.residualFailures), residual],
    localFallbackCompletion: {
      runId: config.fallbackRunId,
      completionStatus: 'completed-via-local-fallback',
      recoveryStatus: 'recovered',
      reason: config.reason,
      completedAt: config.supersededAt,
      completionBoundary: config.completionBoundary,
      executionBoundary,
      returnBoundary,
      fallbackReason,
      originalWorkerExitCode,
      originalStopReason,
      rawStopReasonCode: firstPresent(payload.rawStopReasonCode, originalStopReason),
      blockingStopReasonCode: '',
      supersededRunLeaseId,
      transactionId: config.transactionId,
    },
  };

  if (next.phaseRunLease && typeof next.phaseRunLease === 'object') {
    next.phaseRunLease = {
      ...next.phaseRunLease,
      status: 'superseded-by-local-fallback',
      completionStatus: 'completed-via-local-fallback',
      recoveryStatus: 'recovered',
      completionPath: 'local-fallback',
      transactionId: config.transactionId,
      fallbackRunId: config.fallbackRunId,
      supersededRunLeaseId,
      supersededAt: config.supersededAt,
      executionBoundary,
      returnBoundary,
      fallbackReason,
      originalWorkerExitCode,
      originalStopReason,
      rawStopReasonCode: firstPresent(next.phaseRunLease.rawStopReasonCode, originalStopReason),
      blockingStopReasonCode: '',
      stopReasonCode: next.phaseRunLease.stopReasonCode || config.reason,
      supersededByTransactionId: config.transactionId,
      reconciledAt: config.supersededAt,
      reconciliationReason: config.reason,
      originalStopReasonCode: originalStopReason,
      originalStopReasonDetail: firstPresent(next.phaseRunLease.originalStopReasonDetail, next.phaseRunLease.stopReasonDetail, originalStopReason),
      historicalWarnings: [
        ...normalizeArray(next.phaseRunLease.historicalWarnings),
        ...normalizeArray(config.historicalWarnings),
      ],
      recoveryEvents: [...normalizeArray(next.phaseRunLease.recoveryEvents), recovery],
      residualFailures: [...normalizeArray(next.phaseRunLease.residualFailures), residual],
    };
  }

  return { next, supersededRunLeaseId };
}

function mirrorFallbackCompletion(fallbackPath, existing, config) {
  const next = {
    ...(existing || {}),
    runId: config.fallbackRunId,
    status: 'completed',
    completionStatus: 'completed-via-local-fallback',
    reason: config.reason,
    completedAt: existing?.completedAt || config.supersededAt,
    reconciledAt: config.supersededAt,
    completionBoundary: existing?.completionBoundary || config.completionBoundary,
    transactionId: config.transactionId,
  };
  writeJsonAtomic(fallbackPath, next);
  return next;
}

export async function reconcilePhaseCloseout(rawConfig = {}) {
  if (rawConfig.adoptOrphan === true || rawConfig.command === 'reconcile') {
    return manualOrphanReconcile(rawConfig);
  }

  const root = rawConfig.root ? resolvePath(rawConfig.root) : process.cwd();
  const statusFile = resolvePath(rawConfig.statusFile || DEFAULT_STATUS_FILE, root);
  const workflowDir = resolvePath(rawConfig.workflowDir || DEFAULT_WORKFLOW_DIR, root);
  const supersededAt = utcTimestamp(rawConfig.now || '');
  const fallbackRunId = String(rawConfig.fallbackRunId || '').trim() || `local-fallback-${supersededAt.replace(/[:.]/g, '-')}`;
  const reason = String(rawConfig.reason || 'local-fallback-closeout').trim();
  const completionBoundary = String(rawConfig.completionBoundary || 'phase_only').trim();
  const warnings = [];
  const reconciledFiles = [];
  const skippedFiles = [];
  const supersededRunLeaseIds = [];
  const { intent, paths: reconciliationPaths, resumed, alreadySuccessful } = writeReconciliationIntent(
    rawConfig,
    root,
    workflowDir,
    supersededAt,
    fallbackRunId,
  );
  const completedSteps = ['intent-written'];

  if (alreadySuccessful) {
    return {
      ok: true,
      completionStatus: 'completed-via-local-fallback',
      completionBoundary,
      fallbackRunId,
      transactionId: intent.transactionId,
      resumed,
      intentStatus: 'success',
      reconciliationIntentPath: relativePath(root, reconciliationPaths.intentPath),
      successMarkerPath: relativePath(root, reconciliationPaths.successMarkerPath),
      warnings: [],
      reconciledFiles: [],
      skippedFiles: [],
      supersededRunLeaseIds: [],
    };
  }

  try {
    if (process.env.PHASE_RECONCILER_TEST_FAIL_AFTER_INTENT === '1') {
      throw new Error('injected failure after reconciliation intent');
    }
    for (const basename of STATE_FILES) {
    const filePath = path.join(workflowDir, basename);
    const { exists, value } = readJson(filePath);
    if (!exists) {
      warnings.push({ code: 'state-file-missing', file: relativePath(root, filePath) });
      continue;
    }
    if (!isFailedDelegatedState(value || {})) {
      skippedFiles.push(relativePath(root, filePath));
      continue;
    }

    const { next, supersededRunLeaseId } = reconcilePayload(value || {}, {
      fallbackRunId,
      reason,
      fallbackReason: rawConfig.fallbackReason || reason,
      supersededAt,
      completionBoundary,
      transactionId: intent.transactionId,
      historicalWarnings: intent.historicalWarnings,
      executionBoundary: rawConfig.executionBoundary || '',
      returnBoundary: rawConfig.returnBoundary || 'local-fallback',
      originalWorkerExitCode: rawConfig.originalWorkerExitCode || '',
      originalStopReason: rawConfig.originalStopReason || '',
    });
    writeJsonAtomic(filePath, next);
    reconciledFiles.push(relativePath(root, filePath));
    completedSteps.push(`projection:${relativePath(root, filePath)}`);
    if (supersededRunLeaseId) {
      supersededRunLeaseIds.push(supersededRunLeaseId);
    }
  }

  const fallbackPath = path.join(workflowDir, `${fallbackRunId}.json`);
  const fallbackRead = readJson(fallbackPath);
  const fallbackCompletion = mirrorFallbackCompletion(
    fallbackPath,
    fallbackRead.exists ? fallbackRead.value : null,
    { fallbackRunId, reason, supersededAt, completionBoundary, transactionId: intent.transactionId },
  );
  completedSteps.push(`fallback:${relativePath(root, fallbackPath)}`);
  const statusDocument = fs.existsSync(statusFile)
    ? parsePhaseStatusDocument(fs.readFileSync(statusFile, 'utf8'))
    : { root: {}, phases: [] };
  const postReconcileInvariants = evaluateHarnessStateInvariants({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    statusPath: statusFile,
    workflowDir,
    now: supersededAt,
  });

  const summary = {
    ok: true,
    statusFile: relativePath(root, statusFile),
    workflowDir: relativePath(root, workflowDir),
    fallbackRunId,
    transactionId: intent.transactionId,
    resumed,
    intentStatus: 'success',
    reconciliationIntentPath: relativePath(root, reconciliationPaths.intentPath),
    partialMarkerPath: relativePath(root, reconciliationPaths.partialMarkerPath),
    successMarkerPath: relativePath(root, reconciliationPaths.successMarkerPath),
    completionStatus: 'completed-via-local-fallback',
    completionBoundary,
    reason,
    supersededRunLeaseId: supersededRunLeaseIds[0] || '',
    supersededRunLeaseIds: [...new Set(supersededRunLeaseIds)],
    supersededAt,
    reconciledFiles,
    skippedFiles,
    warnings,
    postReconcileViolations: postReconcileInvariants.violations,
    degradedEvidence: postReconcileInvariants.degradedEvidence,
    fallbackCompletion,
  };

  const debugLogPath = appendDebugLog(root, 'phase-closeout-reconciler-summary', summary);
  completedSteps.push(`debug-log:${relativePath(root, debugLogPath)}`);
  writeReconciliationSuccess(
    reconciliationPaths,
    intent,
    [...reconciledFiles, relativePath(root, fallbackPath), relativePath(root, debugLogPath)],
    { ok: true, postReconcileViolations: summary.postReconcileViolations.length },
    supersededAt,
  );
  return {
    ...summary,
    debugLogPath: relativePath(root, debugLogPath),
  };
  } catch (error) {
    const pendingSteps = ['projection-writes', 'fallback-marker', 'debug-summary', 'success-marker']
      .filter((step) => !completedSteps.some((completed) => completed.includes(step)));
    writeReconciliationPartial(reconciliationPaths, intent, completedSteps, pendingSteps, error, supersededAt);
    throw error;
  }
}

function parseArgs(argv) {
  const result = {};
  const args = [...argv];
  if (args[0] === 'reconcile') {
    result.command = args.shift();
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--mode':
        result.mode = args.shift() || '';
        break;
      case '--adopt-orphan':
        result.adoptOrphan = true;
        break;
      case '--plan-dir':
        result.planDir = args.shift() || '';
        break;
      case '--phase':
        result.phase = args.shift() || '';
        break;
      case '--adoption-metadata':
        result.adoptionMetadata = args.shift() || '';
        break;
      case '--status-file':
        result.statusFile = args.shift() || '';
        break;
      case '--workflow-dir':
        result.workflowDir = args.shift() || '';
        break;
      case '--fallback-run-id':
        result.fallbackRunId = args.shift() || '';
        break;
      case '--reason':
        result.reason = args.shift() || '';
        break;
      case '--fallback-reason':
        result.fallbackReason = args.shift() || '';
        break;
      case '--execution-boundary':
        result.executionBoundary = args.shift() || '';
        break;
      case '--return-boundary':
        result.returnBoundary = args.shift() || '';
        break;
      case '--original-worker-exit-code':
        result.originalWorkerExitCode = args.shift() || '';
        break;
      case '--original-stop-reason':
        result.originalStopReason = args.shift() || '';
        break;
      case '--now':
        result.now = args.shift() || '';
        break;
      case '--root':
        result.root = args.shift() || '';
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function printHelp() {
  process.stdout.write(`Usage:
  node .claude/scripts/phase-closeout-reconciler.mjs [options]
  node .claude/scripts/phase-closeout-reconciler.mjs reconcile --mode manual --adopt-orphan --adoption-metadata <path>

Options:
  --status-file <path>       Default: ${DEFAULT_STATUS_FILE}
  --workflow-dir <path>      Default: ${DEFAULT_WORKFLOW_DIR}
  --fallback-run-id <id>     Local fallback run id to record
  --reason <reason>          Default: local-fallback-closeout
  --fallback-reason <reason> Stable fallback reason field
  --execution-boundary <name> Original worker boundary, default delegated-terminal
  --return-boundary <name>   Return boundary, default local-fallback
  --original-worker-exit-code <code>
  --original-stop-reason <reason>
  --now <iso>                Deterministic timestamp for tests
  --root <path>              Repository root for relative paths
  --mode <manual|auto>       Orphan adoption requires reconcile --mode manual
  --adopt-orphan             Valid only with reconcile --mode manual
  --adoption-metadata <path> Required JSON metadata for manual orphan reconcile
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await reconcilePhaseCloseout(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}${os.EOL}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(64);
  });
}
