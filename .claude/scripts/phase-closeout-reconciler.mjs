#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const DEFAULT_WORKFLOW_DIR = '.claude/logs/workflow-enforcement';
const STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];

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
  const next = {
    ...payload,
    status: 'superseded-by-local-fallback',
    completionStatus: 'completed-via-local-fallback',
    executionBoundary,
    returnBoundary,
    fallbackReason,
    originalWorkerExitCode,
    originalStopReason,
    originalStatus: firstPresent(payload.originalStatus, payload.status),
    originalCompletionStatus: firstPresent(payload.originalCompletionStatus, payload.completionStatus),
    fallbackRunId: config.fallbackRunId,
    supersededRunLeaseId,
    supersededAt: config.supersededAt,
    supersededReason: config.reason,
    completionBoundary: config.completionBoundary,
    localFallbackCompletion: {
      runId: config.fallbackRunId,
      completionStatus: 'completed-via-local-fallback',
      reason: config.reason,
      completedAt: config.supersededAt,
      completionBoundary: config.completionBoundary,
      executionBoundary,
      returnBoundary,
      fallbackReason,
      originalWorkerExitCode,
      originalStopReason,
      supersededRunLeaseId,
    },
  };

  if (next.phaseRunLease && typeof next.phaseRunLease === 'object') {
    next.phaseRunLease = {
      ...next.phaseRunLease,
      status: 'superseded-by-local-fallback',
      completionStatus: 'completed-via-local-fallback',
      fallbackRunId: config.fallbackRunId,
      supersededRunLeaseId,
      supersededAt: config.supersededAt,
      executionBoundary,
      returnBoundary,
      fallbackReason,
      originalWorkerExitCode,
      originalStopReason,
      stopReasonCode: next.phaseRunLease.stopReasonCode || config.reason,
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
  };
  writeJsonAtomic(fallbackPath, next);
  return next;
}

export async function reconcilePhaseCloseout(rawConfig = {}) {
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

  for (const basename of STATE_FILES) {
    const filePath = path.join(workflowDir, basename);
    const { exists, value } = readJson(filePath);
    if (!exists) {
      warnings.push({ code: 'state-file-missing', file: path.relative(root, filePath).replace(/\\/g, '/') });
      continue;
    }
    if (!isFailedDelegatedState(value || {})) {
      skippedFiles.push(path.relative(root, filePath).replace(/\\/g, '/'));
      continue;
    }

    const { next, supersededRunLeaseId } = reconcilePayload(value || {}, {
      fallbackRunId,
      reason,
      fallbackReason: rawConfig.fallbackReason || reason,
      supersededAt,
      completionBoundary,
      executionBoundary: rawConfig.executionBoundary || '',
      returnBoundary: rawConfig.returnBoundary || 'local-fallback',
      originalWorkerExitCode: rawConfig.originalWorkerExitCode || '',
      originalStopReason: rawConfig.originalStopReason || '',
    });
    writeJsonAtomic(filePath, next);
    reconciledFiles.push(path.relative(root, filePath).replace(/\\/g, '/'));
    if (supersededRunLeaseId) {
      supersededRunLeaseIds.push(supersededRunLeaseId);
    }
  }

  const fallbackPath = path.join(workflowDir, `${fallbackRunId}.json`);
  const fallbackRead = readJson(fallbackPath);
  const fallbackCompletion = mirrorFallbackCompletion(
    fallbackPath,
    fallbackRead.exists ? fallbackRead.value : null,
    { fallbackRunId, reason, supersededAt, completionBoundary },
  );

  const summary = {
    ok: true,
    statusFile: path.relative(root, statusFile).replace(/\\/g, '/'),
    workflowDir: path.relative(root, workflowDir).replace(/\\/g, '/'),
    fallbackRunId,
    completionStatus: 'completed-via-local-fallback',
    completionBoundary,
    reason,
    supersededRunLeaseId: supersededRunLeaseIds[0] || '',
    supersededRunLeaseIds: [...new Set(supersededRunLeaseIds)],
    supersededAt,
    reconciledFiles,
    skippedFiles,
    warnings,
    fallbackCompletion,
  };

  const debugLogPath = appendDebugLog(root, 'phase-closeout-reconciler-summary', summary);
  return {
    ...summary,
    debugLogPath: path.relative(root, debugLogPath).replace(/\\/g, '/'),
  };
}

function parseArgs(argv) {
  const result = {};
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
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
