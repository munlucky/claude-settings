#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
const DEFAULT_STATUS_FILE = path.resolve(process.cwd(), '.claude/docs/phase-status.yaml');
const ACTIVE_RUN_BASENAME = 'active-phase-run.json';
const CURRENT_RUN_BASENAME = 'current-run.json';
const SUCCESS_RETURN_BOUNDARIES = new Set(['success-return']);
const SUCCESS_STOP_REASON_CODES = new Set([
  'plan-directory-complete',
  'success-return',
  'scope_complete',
  'clean_finish',
  'current-session-clean-finish',
]);

function resolveStatusFile(statusFile) {
  if (!statusFile) {
    return DEFAULT_STATUS_FILE;
  }
  return path.resolve(statusFile);
}

function statusFileHash(statusFile) {
  return crypto.createHash('sha1').update(resolveStatusFile(statusFile)).digest('hex').slice(0, 12);
}

function resolveLeaseFiles(statusFile) {
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

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseIsoTimestamp(value) {
  if (!value) {
    return Number.NaN;
  }
  const normalized = String(value).trim().replace(/^"|"$/g, '').replace(/Z$/, '+00:00');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function printAssignments(payload) {
  for (const [key, value] of Object.entries(payload)) {
    process.stdout.write(`${key}=${shellQuote(value)}\n`);
  }
}

function readJson(filePath) {
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

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readStatusBlocks(statusFile) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return [];
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        number: match ? match[1] : null,
        status: '',
        planConfirmed: '',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const stripped = rawLine.trim();
    if (stripped.startsWith('status:')) {
      current.status = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.split(':', 2)[1].trim().toLowerCase();
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function countActionablePhases(statusFile) {
  return readStatusBlocks(statusFile).filter((block) => {
    if (block.planConfirmed === 'false') {
      return false;
    }
    return block.status === 'pending' || block.status === 'in_progress' || block.status === 'failed';
  }).length;
}

function isSuccessLikeStopReason(value) {
  return SUCCESS_STOP_REASON_CODES.has(String(value || '').trim().toLowerCase());
}

function normalizeFinishOutcome({ actionable, returnBoundary, stopReasonCode, stopReasonDetail }) {
  if (actionable === 0) {
    return {
      status: 'finished',
      returnBoundary,
      stopReasonCode,
      stopReasonDetail,
    };
  }

  const normalizedBoundary = String(returnBoundary || '').trim().toLowerCase();
  const normalizedReason = String(stopReasonCode || '').trim().toLowerCase();
  if (SUCCESS_RETURN_BOUNDARIES.has(normalizedBoundary) || isSuccessLikeStopReason(normalizedReason)) {
    const detail = stopReasonDetail
      ? `${stopReasonDetail} Next actionable phase continuation is still required.`
      : 'Actionable phases remain; the dispatcher must continue or pause instead of finishing the plan.';
    return {
      status: 'paused',
      returnBoundary: 'dispatch-paused',
      stopReasonCode: 'actionable-phases-remaining',
      stopReasonDetail: detail,
    };
  }

  return {
    status: 'paused',
    returnBoundary: returnBoundary || 'dispatch-paused',
    stopReasonCode: stopReasonCode || 'actionable-phases-remaining',
    stopReasonDetail: stopReasonDetail || 'Actionable phases remain; execution paused before plan completion.',
  };
}

function upsertRootKey(lines, key, value) {
  const prefix = `${key}:`;
  const rendered = `${prefix} ${value}`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) {
    lines[index] = rendered;
    return lines;
  }
  const insertAt = lines.findIndex((line) => line.startsWith('phases:'));
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, rendered);
    return lines;
  }
  lines.push(rendered);
  return lines;
}

function updateStatusLease(statusFile, fields) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return;
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/).filter((_, index, array) => !(index === array.length - 1 && array[index] === ''));
  const nextLines = [...lines];

  const mapping = {
    activeRunLeaseId: (value) => `"${value}"`,
    activeExecutionBoundary: (value) => `"${value}"`,
    activeExecutionAttachedAt: (value) => `"${value}"`,
    activeExecutionHeartbeatAt: (value) => `"${value}"`,
    activeExecutionStatus: (value) => `"${value}"`,
    activeActionablePhasesRemaining: (value) => String(value),
    activeCurrentStage: (value) => `"${value}"`,
    activePhaseNumber: (value) => value === '' ? 'null' : String(value),
    activePhaseTitle: (value) => value ? `"${value}"` : 'null',
    lastReturnBoundary: (value) => value ? `"${value}"` : 'null',
    lastStopReasonCode: (value) => value ? `"${value}"` : 'null',
    lastStopReasonDetail: (value) => value ? `"${value}"` : 'null',
  };

  for (const [key, formatter] of Object.entries(mapping)) {
    if (fields[key] === undefined) {
      continue;
    }
    upsertRootKey(nextLines, key, formatter(fields[key]));
  }

  fs.writeFileSync(statusFile, `${nextLines.join('\n')}\n`, 'utf8');
}

function mirrorToCurrentRun(statusFile, leasePayload) {
  const leaseFiles = resolveLeaseFiles(statusFile);
  const existing = readJson(leaseFiles.currentRunFile) || {};
  const next = {
    ...existing,
    updatedAt: utcTimestamp(),
    phaseRunLease: leasePayload,
  };
  writeJson(leaseFiles.currentRunFile, next);

  if (!leaseFiles.mirrorGlobalCurrentRun) {
    return;
  }

  const globalCurrentRunFile = path.join(WORKFLOW_LOG_DIR, CURRENT_RUN_BASENAME);
  if (globalCurrentRunFile === leaseFiles.currentRunFile) {
    return;
  }
  writeJson(globalCurrentRunFile, next);
}

function readActiveLease(statusFile) {
  return readJson(resolveLeaseFiles(statusFile).activeRunFile);
}

function writeActiveLease(statusFile, payload) {
  writeJson(resolveLeaseFiles(statusFile).activeRunFile, payload);
  mirrorToCurrentRun(statusFile, payload);
}

function startLease(config) {
  const now = utcTimestamp();
  const statusFile = resolveStatusFile(config.statusFile);
  const actionable = countActionablePhases(statusFile);
  const payload = {
    stateVersion: '1.0',
    runLeaseId: config.runLeaseId,
    status: 'active',
    executionBoundary: config.executionBoundary,
    planDir: config.planDir,
    statusFile: config.statusFile,
    executionRoot: config.executionRoot,
    runtime: config.runtime,
    masterPlan: config.masterPlan || '',
    dispatcherPid: config.dispatcherPid || '',
    attachedAt: now,
    lastHeartbeatAt: now,
    currentStage: 'ready/isolate',
    phase: {
      number: '',
      title: '',
    },
    actionablePhasesRemaining: actionable,
    completionStatus: 'prepared',
    returnBoundary: '',
    stopReasonCode: '',
    stopReasonDetail: '',
  };

  writeActiveLease(statusFile, payload);
  updateStatusLease(statusFile, {
    activeRunLeaseId: config.runLeaseId,
    activeExecutionBoundary: config.executionBoundary,
    activeExecutionAttachedAt: now,
    activeExecutionHeartbeatAt: now,
    activeExecutionStatus: 'active',
    activeActionablePhasesRemaining: actionable,
    activeCurrentStage: 'ready/isolate',
    activePhaseNumber: '',
    activePhaseTitle: '',
    lastReturnBoundary: '',
    lastStopReasonCode: '',
    lastStopReasonDetail: '',
  });

  return payload;
}

function heartbeatLease(config) {
  const statusFile = resolveStatusFile(config.statusFile);
  const existing = readActiveLease(statusFile);
  if (!existing || existing.runLeaseId !== config.runLeaseId) {
    return null;
  }

  const now = utcTimestamp();
  const actionable = countActionablePhases(statusFile || existing.statusFile);
  const payload = {
    ...existing,
    lastHeartbeatAt: now,
    currentStage: config.currentStage || existing.currentStage,
    phase: {
      number: config.phaseNum || existing.phase?.number || '',
      title: config.phaseTitle || existing.phase?.title || '',
    },
    actionablePhasesRemaining: actionable,
    completionStatus: config.completionStatus || existing.completionStatus || '',
  };

  writeActiveLease(statusFile, payload);
  updateStatusLease(statusFile || existing.statusFile, {
    activeRunLeaseId: payload.runLeaseId,
    activeExecutionBoundary: payload.executionBoundary,
    activeExecutionAttachedAt: payload.attachedAt,
    activeExecutionHeartbeatAt: now,
    activeExecutionStatus: payload.status,
    activeActionablePhasesRemaining: actionable,
    activeCurrentStage: payload.currentStage,
    activePhaseNumber: payload.phase.number,
    activePhaseTitle: payload.phase.title,
  });

  return payload;
}

function finishLease(config) {
  const statusFile = resolveStatusFile(config.statusFile);
  const existing = readActiveLease(statusFile);
  if (!existing || existing.runLeaseId !== config.runLeaseId) {
    return null;
  }

  const now = utcTimestamp();
  const actionable = countActionablePhases(config.statusFile || existing.statusFile);
  const finishOutcome = normalizeFinishOutcome({
    actionable,
    returnBoundary: config.returnBoundary || '',
    stopReasonCode: config.stopReasonCode || '',
    stopReasonDetail: config.stopReasonDetail || '',
  });
  const payload = {
    ...existing,
    status: finishOutcome.status,
    lastHeartbeatAt: now,
    finishedAt: now,
    actionablePhasesRemaining: actionable,
    completionStatus: config.completionStatus || existing.completionStatus || '',
    returnBoundary: finishOutcome.returnBoundary,
    stopReasonCode: finishOutcome.stopReasonCode,
    stopReasonDetail: finishOutcome.stopReasonDetail,
  };

  writeActiveLease(statusFile, payload);
  updateStatusLease(statusFile || existing.statusFile, {
    activeRunLeaseId: payload.runLeaseId,
    activeExecutionBoundary: payload.executionBoundary,
    activeExecutionAttachedAt: payload.attachedAt,
    activeExecutionHeartbeatAt: now,
    activeExecutionStatus: payload.status,
    activeActionablePhasesRemaining: actionable,
    activeCurrentStage: payload.currentStage || 'finish/handoff',
    activePhaseNumber: payload.phase?.number || '',
    activePhaseTitle: payload.phase?.title || '',
    lastReturnBoundary: payload.returnBoundary,
    lastStopReasonCode: payload.stopReasonCode,
    lastStopReasonDetail: payload.stopReasonDetail,
  });

  return payload;
}

function assertReturnAllowed(config) {
  const statusFile = resolveStatusFile(config.statusFile);
  const actionable = countActionablePhases(statusFile);
  const executionIntent = String(config.executionIntent || '').toLowerCase() === 'true';
  const prepareOnly = String(config.prepareOnly || '').toLowerCase() === 'true';

  if (!executionIntent || prepareOnly) {
    return {
      RETURN_ALLOWED: 'true',
      RETURN_REASON: 'non_execution_or_prepare_only',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  if (actionable === 0) {
    return {
      RETURN_ALLOWED: 'true',
      RETURN_REASON: 'plan_directory_complete',
      ACTIONABLE_PHASES_REMAINING: '0',
    };
  }

  const existing = readActiveLease(statusFile);
  if (!existing || existing.runLeaseId !== config.runLeaseId) {
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'missing-active-run-lease',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  if (existing.status !== 'active') {
    if (existing.status === 'paused') {
      return {
        RETURN_ALLOWED: 'false',
        RETURN_REASON: 'paused-run-lease-with-actionable-phases',
        ACTIONABLE_PHASES_REMAINING: String(actionable),
      };
    }
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'inactive-run-lease-with-actionable-phases',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  const staleSeconds = Number.parseInt(process.env.PHASE_RUN_LEASE_STALE_SECONDS ?? '14400', 10) || 14400;
  const heartbeatAt = parseIsoTimestamp(existing.lastHeartbeatAt);
  if (Number.isNaN(heartbeatAt) || Date.now() - heartbeatAt > staleSeconds * 1000) {
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'stale-run-lease',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  return {
    RETURN_ALLOWED: 'false',
    RETURN_REASON: 'actionable-phases-remaining',
    ACTIONABLE_PHASES_REMAINING: String(actionable),
  };
}

function usage() {
  console.error([
    'Usage:',
    '  phase-run-lease.mjs start <status-file> <run-lease-id> <execution-boundary> <plan-dir> <execution-root> <runtime> [master-plan] [dispatcher-pid]',
    '  phase-run-lease.mjs heartbeat <status-file> <run-lease-id> <current-stage> [phase-num] [phase-title] [completion-status]',
    '  phase-run-lease.mjs finish <status-file> <run-lease-id> <return-boundary> <stop-reason-code> <stop-reason-detail> [completion-status]',
    '  phase-run-lease.mjs assert-return-allowed <status-file> <run-lease-id> <execution-intent> <prepare-only>',
  ].join('\n'));
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'start':
    printAssignments(startLease({
      statusFile: args[0],
      runLeaseId: args[1],
      executionBoundary: args[2],
      planDir: args[3],
      executionRoot: args[4],
      runtime: args[5],
      masterPlan: args[6],
      dispatcherPid: args[7],
    }) || {});
    break;
  case 'heartbeat':
    printAssignments(heartbeatLease({
      statusFile: args[0],
      runLeaseId: args[1],
      currentStage: args[2],
      phaseNum: args[3],
      phaseTitle: args[4],
      completionStatus: args[5],
    }) || {});
    break;
  case 'finish':
    printAssignments(finishLease({
      statusFile: args[0],
      runLeaseId: args[1],
      returnBoundary: args[2],
      stopReasonCode: args[3],
      stopReasonDetail: args[4],
      completionStatus: args[5],
    }) || {});
    break;
  case 'assert-return-allowed':
    printAssignments(assertReturnAllowed({
      statusFile: args[0],
      runLeaseId: args[1],
      executionIntent: args[2],
      prepareOnly: args[3],
    }));
    break;
  default:
    usage();
    process.exit(64);
}
