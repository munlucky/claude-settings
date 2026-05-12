#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  assertReturnAllowed as assertRuntimeReturnAllowed,
  exportStatusMirror,
  finishLease as finishRuntimeLease,
  heartbeatLease as heartbeatRuntimeLease,
  phaseGoalObjective,
  startLease as startRuntimeLease,
  withDb,
} from './runtime-state.mjs';
import {
  assertReturnAllowedFromFiles,
  hasLocalFallbackCompletion,
  normalizeFinishOutcome,
  staleLeaseReason,
} from './lib/phase-run-lease-policy.mjs';
import {
  readActiveLease,
  readJson,
  resolveLeaseFiles,
  resolveStatusFile,
  utcTimestamp,
  writeActiveLease,
  writeJson,
} from './lib/phase-run-lease-store.mjs';
import {
  countActionablePhases,
  updateStatusLease,
} from './lib/phase-run-lease-status.mjs';

const STALE_LEASE_STATUSES = new Set(['stale', 'superseded-by-local-fallback']);

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

function parseAssignments(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    value = value.replace(/^'/, '').replace(/'$/, '').replace(/'\\''/g, "'");
    values[key] = value;
  }
  return values;
}

async function runtimeStateAssignments(command, args) {
  try {
    switch (command) {
      case 'start-lease': {
        const [statusFile, leaseId, executionBoundary, planDir, executionRoot, runtime, masterPlan = '', dispatcherPid = '', timeBudgetSeconds = '', tokenBudget = ''] = args;
        const result = await withDb((db) => {
          const payload = startRuntimeLease(db, {
            statusFile,
            leaseId,
            executionBoundary,
            planDir,
            executionRoot,
            runtime,
            masterPlan,
            dispatcherPid,
            timeBudgetSeconds,
            tokenBudget,
            objective: phaseGoalObjective(planDir, masterPlan),
          });
          exportStatusMirror(db, statusFile);
          return payload;
        });
        return {
          GOAL_ID: result.goal_id,
          STATUS: result.status,
          ACTIONABLE_PHASES_REMAINING: result.actionablePhasesRemaining,
        };
      }
      case 'heartbeat-lease': {
        const [statusFile, leaseId, currentStage = '', phaseNum = '', phaseTitle = '', completionStatus = ''] = args;
        const result = await withDb((db) => {
          const payload = heartbeatRuntimeLease(db, { statusFile, leaseId, currentStage, phaseNum, phaseTitle, completionStatus });
          if (payload) exportStatusMirror(db, statusFile);
          return payload;
        });
        return result ? {
          LEASE_ID: result.lease_id,
          STATUS: result.status,
          ACTIONABLE_PHASES_REMAINING: result.actionable_phases_remaining,
        } : null;
      }
      case 'finish-lease': {
        const [statusFile, leaseId, returnBoundary = '', stopReasonCode = '', stopReasonDetail = '', completionStatus = '', finalStatus = ''] = args;
        const result = await withDb((db) => {
          const payload = finishRuntimeLease(db, { statusFile, leaseId, returnBoundary, stopReasonCode, stopReasonDetail, completionStatus, finalStatus });
          if (payload) exportStatusMirror(db, statusFile);
          return payload;
        });
        return result ? {
          LEASE_ID: result.lease_id,
          STATUS: result.status,
          ACTIONABLE_PHASES_REMAINING: result.actionable_phases_remaining,
        } : null;
      }
      case 'assert-return-allowed': {
        const [statusFile, leaseId, executionIntent = '', prepareOnly = ''] = args;
        return await withDb((db) => assertRuntimeReturnAllowed(db, { statusFile, leaseId, executionIntent, prepareOnly }));
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
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
    recoveryStatus: 'none',
    completionPath: 'prepared-dispatch',
    returnBoundary: '',
    stopReasonCode: '',
    rawStopReasonCode: '',
    blockingStopReasonCode: '',
    stopReasonDetail: '',
    recoveryEvents: [],
    residualFailures: [],
    unavailableCapabilities: [],
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
  const staleReason = staleLeaseReason(existing);
  if (staleReason) {
    return closeStaleLease({
      statusFile,
      existing,
      staleReason,
      closedAt: now,
    });
  }

  const actionable = countActionablePhases(statusFile || existing.statusFile);
  const payload = {
    ...existing,
    status: 'active',
    lastHeartbeatAt: now,
    currentStage: config.currentStage || existing.currentStage,
    phase: {
      number: config.phaseNum || existing.phase?.number || '',
      title: config.phaseTitle || existing.phase?.title || '',
    },
    actionablePhasesRemaining: actionable,
    completionStatus: config.completionStatus || '',
    returnBoundary: '',
    stopReasonCode: '',
    rawStopReasonCode: '',
    blockingStopReasonCode: '',
    stopReasonDetail: '',
  };
  for (const key of [
    'completedAt',
    'failedAt',
    'finishedAt',
    'finalVerdict',
    'finalStatus',
    'normalizedRunVerdict',
    'historicalWarnings',
    'finalOutcomeSchemaVersion',
    'activeExecutionStatus',
    'activePhaseNumber',
    'updatedAt',
  ]) {
    delete payload[key];
  }

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

function closeStaleLease({ statusFile, existing, staleReason, closedAt }) {
  const actionable = countActionablePhases(statusFile || existing.statusFile);
  const supersededByFallback = hasLocalFallbackCompletion(existing);
  const payload = {
    ...existing,
    status: supersededByFallback ? 'superseded-by-local-fallback' : 'stale',
    completionStatus: supersededByFallback ? 'completed-via-local-fallback' : 'stale',
    recoveryStatus: supersededByFallback ? 'recovered' : (existing.recoveryStatus || 'none'),
    completionPath: supersededByFallback ? 'local-fallback' : (existing.completionPath || 'stale-lease-cleanup'),
    staleReason,
    staleAt: closedAt,
    finishedAt: existing.finishedAt || closedAt,
    lastHeartbeatAt: existing.lastHeartbeatAt || closedAt,
    actionablePhasesRemaining: actionable,
    returnBoundary: supersededByFallback ? 'local-fallback' : (existing.returnBoundary || 'stale-lease-cleanup'),
    stopReasonCode: staleReason,
    rawStopReasonCode: existing.rawStopReasonCode || staleReason,
    blockingStopReasonCode: supersededByFallback ? '' : staleReason,
    stopReasonDetail: `Active phase run lease closed by heartbeat cleanup: ${staleReason}`,
  };

  writeActiveLease(statusFile, payload);
  updateStatusLease(statusFile || existing.statusFile, {
    activeRunLeaseId: null,
    activeExecutionBoundary: null,
    activeExecutionAttachedAt: null,
    activeExecutionHeartbeatAt: null,
    activeExecutionStatus: null,
    activeActionablePhasesRemaining: actionable,
    activeCurrentStage: payload.currentStage || 'lease/stale-cleanup',
    activePhaseNumber: payload.phase?.number || '',
    activePhaseTitle: payload.phase?.title || '',
    lastRunLeaseId: payload.runLeaseId,
    lastExecutionBoundary: payload.executionBoundary,
    lastExecutionAttachedAt: payload.attachedAt,
    lastExecutionHeartbeatAt: payload.lastHeartbeatAt || closedAt,
    lastExecutionStatus: payload.status,
    lastReturnBoundary: payload.returnBoundary,
    lastStopReasonCode: payload.stopReasonCode,
    lastStopReasonDetail: payload.stopReasonDetail,
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
    recoveryStatus: existing.recoveryStatus || 'none',
    completionPath: finishOutcome.status === 'finished' ? 'clean-dispatch' : (existing.completionPath || 'dispatch-stop'),
    returnBoundary: finishOutcome.returnBoundary,
    stopReasonCode: finishOutcome.stopReasonCode,
    rawStopReasonCode: existing.rawStopReasonCode || finishOutcome.stopReasonCode,
    blockingStopReasonCode: finishOutcome.status === 'finished' ? '' : finishOutcome.stopReasonCode,
    stopReasonDetail: finishOutcome.stopReasonDetail,
  };
  if (payload.status !== 'finished') {
    for (const key of [
      'completedAt',
      'finalVerdict',
      'finalStatus',
      'normalizedRunVerdict',
      'historicalWarnings',
      'finalOutcomeSchemaVersion',
      'activeExecutionStatus',
      'activePhaseNumber',
      'updatedAt',
    ]) {
      delete payload[key];
    }
  }

  writeActiveLease(statusFile, payload);
  const keepPausedActiveState = payload.status === 'paused';
  updateStatusLease(statusFile || existing.statusFile, {
    activeRunLeaseId: keepPausedActiveState ? payload.runLeaseId : null,
    activeExecutionBoundary: keepPausedActiveState ? payload.executionBoundary : null,
    activeExecutionAttachedAt: keepPausedActiveState ? payload.attachedAt : null,
    activeExecutionHeartbeatAt: keepPausedActiveState ? now : null,
    activeExecutionStatus: keepPausedActiveState ? payload.status : null,
    activeActionablePhasesRemaining: actionable,
    activeCurrentStage: payload.currentStage || 'finish/handoff',
    activePhaseNumber: payload.phase?.number || '',
    activePhaseTitle: payload.phase?.title || '',
    lastRunLeaseId: payload.runLeaseId,
    lastExecutionBoundary: payload.executionBoundary,
    lastExecutionAttachedAt: payload.attachedAt,
    lastExecutionHeartbeatAt: now,
    lastExecutionStatus: payload.status,
    lastReturnBoundary: payload.returnBoundary,
    lastStopReasonCode: payload.stopReasonCode,
    lastStopReasonDetail: payload.stopReasonDetail,
  });
  return payload;
}

async function assertReturnAllowedWithRuntime(config) {
  const statusFile = resolveStatusFile(config.statusFile);
  const actionable = countActionablePhases(statusFile);
  const executionIntent = String(config.executionIntent || '').toLowerCase() === 'true';
  const prepareOnly = String(config.prepareOnly || '').toLowerCase() === 'true';
  const dbDecision = await runtimeStateAssignments('assert-return-allowed', [
    statusFile,
    config.runLeaseId,
    String(executionIntent),
    String(prepareOnly),
  ]);
  if (dbDecision && dbDecision.RETURN_ALLOWED === 'false') {
    const reason = String(dbDecision.RETURN_REASON || '');
    if (reason.startsWith('paused-goal') || reason.startsWith('budget-limited-goal')) {
      return dbDecision;
    }
  }

  return assertReturnAllowedFromFiles({
    actionable,
    executionIntent,
    prepareOnly,
    existing: (() => {
      const existing = readActiveLease(statusFile);
      return existing?.runLeaseId === config.runLeaseId ? existing : null;
    })(),
  });
}

function selfTest() {
  const tmpRoot = fs.mkdtempSync(path.join(process.env.TMP || process.env.TEMP || '.', 'phase-run-lease-'));
  const originalCwd = process.cwd();
  const originalWorkflowLogDir = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
  try {
    process.chdir(tmpRoot);
    fs.mkdirSync(path.join(tmpRoot, '.claude/docs'), { recursive: true });
    const statusFile = path.join(tmpRoot, '.claude/docs/phase-status.yaml');
    fs.writeFileSync(statusFile, [
      'schemaVersion: "1.0"',
      'phases:',
      '  - number: 1',
      '    status: in_progress',
      '',
    ].join('\n'), 'utf8');

    const missingPid = '99999999';
    startLease({
      statusFile,
      runLeaseId: 'lease-dead-pid',
      executionBoundary: 'delegated-terminal',
      planDir: 'docs/implementation/example',
      executionRoot: tmpRoot,
      runtime: 'codex',
      dispatcherPid: missingPid,
    });
    const deadPidResult = heartbeatLease({
      statusFile,
      runLeaseId: 'lease-dead-pid',
      currentStage: 'execute',
    });
    if (deadPidResult.status !== 'stale' || deadPidResult.staleReason !== 'dead-dispatcher-pid') {
      throw new Error('dead dispatcher PID did not close stale lease');
    }

    const rootText = fs.readFileSync(statusFile, 'utf8');
    if (/activeRunLeaseId:/.test(rootText)) {
      throw new Error('stale cleanup did not clear activeRunLeaseId');
    }

    process.env.PHASE_RUN_LEASE_STALE_SECONDS = '1';
    startLease({
      statusFile,
      runLeaseId: 'lease-ttl',
      executionBoundary: 'delegated-terminal',
      planDir: 'docs/implementation/example',
      executionRoot: tmpRoot,
      runtime: 'codex',
      dispatcherPid: '',
    });
    const activePath = resolveLeaseFiles(statusFile).activeRunFile;
    const activePayload = readJson(activePath);
    activePayload.lastHeartbeatAt = '2026-05-08T00:00:00.000Z';
    writeJson(activePath, activePayload);
    const ttlResult = heartbeatLease({
      statusFile,
      runLeaseId: 'lease-ttl',
      currentStage: 'execute',
    });
    if (ttlResult.status !== 'stale' || ttlResult.staleReason !== 'stale-heartbeat-ttl') {
      throw new Error('heartbeat TTL did not close stale lease');
    }
  } finally {
    if (originalWorkflowLogDir === undefined) {
      delete process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
    } else {
      process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = originalWorkflowLogDir;
    }
    delete process.env.PHASE_RUN_LEASE_STALE_SECONDS;
    process.chdir(originalCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function usage() {
  console.error([
    'Usage:',
    '  phase-run-lease.mjs start <status-file> <run-lease-id> <execution-boundary> <plan-dir> <execution-root> <runtime> [master-plan] [dispatcher-pid]',
    '  phase-run-lease.mjs heartbeat <status-file> <run-lease-id> <current-stage> [phase-num] [phase-title] [completion-status]',
    '  phase-run-lease.mjs finish <status-file> <run-lease-id> <return-boundary> <stop-reason-code> <stop-reason-detail> [completion-status]',
    '  phase-run-lease.mjs assert-return-allowed <status-file> <run-lease-id> <execution-intent> <prepare-only>',
    '  phase-run-lease.mjs self-test',
  ].join('\n'));
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'start': {
    const config = {
      statusFile: args[0],
      runLeaseId: args[1],
      executionBoundary: args[2],
      planDir: args[3],
      executionRoot: args[4],
      runtime: args[5],
      masterPlan: args[6],
      dispatcherPid: args[7],
      timeBudgetSeconds: args[8],
      tokenBudget: args[9],
    };
    const payload = startLease(config) || {};
    await runtimeStateAssignments('start-lease', [
      resolveStatusFile(config.statusFile),
      config.runLeaseId,
      config.executionBoundary,
      config.planDir,
      config.executionRoot,
      config.runtime,
      config.masterPlan || '',
      config.dispatcherPid || '',
      config.timeBudgetSeconds || '',
      config.tokenBudget || '',
    ]);
    printAssignments(payload);
    break;
  }
  case 'heartbeat': {
    const config = {
      statusFile: args[0],
      runLeaseId: args[1],
      currentStage: args[2],
      phaseNum: args[3],
      phaseTitle: args[4],
      completionStatus: args[5],
    };
    const payload = heartbeatLease(config) || {};
    if (payload.runLeaseId) {
      if (STALE_LEASE_STATUSES.has(payload.status)) {
        await runtimeStateAssignments('finish-lease', [
          resolveStatusFile(config.statusFile),
          config.runLeaseId,
          payload.returnBoundary || 'stale-lease-cleanup',
          payload.stopReasonCode || payload.staleReason || 'stale-run-lease',
          payload.stopReasonDetail || '',
          payload.completionStatus || '',
          payload.status || '',
        ]);
      } else {
        await runtimeStateAssignments('heartbeat-lease', [
          resolveStatusFile(config.statusFile),
          config.runLeaseId,
          payload.currentStage || '',
          payload.phase?.number || '',
          payload.phase?.title || '',
          payload.completionStatus || '',
        ]);
      }
    }
    printAssignments(payload);
    break;
  }
  case 'finish': {
    const config = {
      statusFile: args[0],
      runLeaseId: args[1],
      returnBoundary: args[2],
      stopReasonCode: args[3],
      stopReasonDetail: args[4],
      completionStatus: args[5],
    };
    const payload = finishLease(config) || {};
    if (payload.runLeaseId) {
      await runtimeStateAssignments('finish-lease', [
        resolveStatusFile(config.statusFile),
        config.runLeaseId,
        payload.returnBoundary || '',
        payload.stopReasonCode || '',
        payload.stopReasonDetail || '',
        payload.completionStatus || '',
        '',
      ]);
    }
    printAssignments(payload);
    break;
  }
  case 'assert-return-allowed':
    printAssignments(await assertReturnAllowedWithRuntime({
      statusFile: args[0],
      runLeaseId: args[1],
      executionIntent: args[2],
      prepareOnly: args[3],
    }));
    break;
  case 'self-test':
    selfTest();
    process.stdout.write('phase-run-lease self-test passed\n');
    break;
  default:
    usage();
    process.exit(64);
}
