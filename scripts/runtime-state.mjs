#!/usr/bin/env node
import process from 'node:process';

import {
  acquireRunLease,
  assessCompletionAuthority,
  buildRuntimeStatusReadModel,
  cleanupStaleRunLeases,
  degradedRuntimeStatus,
  heartbeatRunLease,
  initRuntimeState,
  migrateRuntimeStateV2,
  recordCompletionDecision,
  recordMemoryPromotionDecision,
  recordRuntimeEvent,
  recordResumeSnapshot,
  recordEvalResult,
  recordToolCall,
  runtimeStoreErrorCode,
  rollbackMemoryPromotionDecision,
  supersedeCompletionDecision,
} from './lib/runtime-state-store.mjs';
import {
  advanceExecutionCursor,
  checkExecutionStep,
  diagnoseExecutionCursor,
  nextExecutionSlice,
  resolveExecutionCursor,
} from './lib/execution-cursor.mjs';

const usage = () => `Usage: node scripts/runtime-state.mjs <init|migrate-v2|status|resolve|next|check-step|advance|diagnose|acquire-run-lease|heartbeat-run-lease|cleanup-stale-leases|record-event|record-tool-call|record-eval-result|record-completion|record-memory-promotion|rollback-memory-promotion|assess-completion|snapshot-resume|supersede-completion> [--json]`;

const parseArgs = (argv) => {
  const [command = ''] = argv;
  const options = { command, json: false };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--manual-repair') {
      options.manualRepair = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return options;
};

const parseJsonOption = (text, name) => {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
};

const requireOption = (options, key) => {
  if (!options[key]) {
    throw new Error(`Missing required option --${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
  }
  return options[key];
};

const writeResult = (result, json) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status || 'ok');
  }
};

const runtimeStoreErrorCodes = new Set([
  'missing_native_module',
  'permission_denied',
  'sandbox_denied',
  'schema_mismatch',
  'migration_required',
  'schema_or_open_failure',
  'db_lock_timeout',
  'unresolved_db_path',
]);

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let result;

  try {
    if (options.command === 'init') {
      result = await initRuntimeState();
    } else if (options.command === 'migrate-v2') {
      result = await migrateRuntimeStateV2({
        confirmTempDb: options.confirmTempDb === 'true' || options.confirmTempDb === '1',
      });
    } else if (options.command === 'status') {
      result = await buildRuntimeStatusReadModel({
        runId: options.runId || '',
        goalId: options.goalId || '',
      });
    } else if (options.command === 'resolve') {
      const sliceInput = parseJsonOption(options.sliceJson, '--slice-json');
      result = await resolveExecutionCursor({
        ...sliceInput,
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        planId: requireOption(options, 'planId'),
        phaseId: requireOption(options, 'phaseId'),
        workspaceId: options.workspaceId || '',
        identity: parseJsonOption(options.identityJson, '--identity-json'),
      });
    } else if (options.command === 'next') {
      result = await nextExecutionSlice({
        runId: requireOption(options, 'runId'), goalId: requireOption(options, 'goalId'),
        workspaceId: options.workspaceId || '', identity: parseJsonOption(options.identityJson, '--identity-json'),
      });
    } else if (options.command === 'check-step' || options.command === 'advance') {
      const input = {
        runId: requireOption(options, 'runId'), goalId: requireOption(options, 'goalId'),
        expectedCursorRevision: requireOption(options, 'expectedCursorRevision'),
        evidence: parseJsonOption(options.evidenceJson, '--evidence-json'),
        workspaceId: options.workspaceId || '', identity: parseJsonOption(options.identityJson, '--identity-json'),
      };
      result = options.command === 'check-step' ? await checkExecutionStep(input) : await advanceExecutionCursor(input);
    } else if (options.command === 'diagnose') {
      result = await diagnoseExecutionCursor({
        runId: requireOption(options, 'runId'), goalId: requireOption(options, 'goalId'),
        expectedCursorRevision: requireOption(options, 'expectedCursorRevision'),
        failureClass: options.failureClass || 'unclassified', workspaceId: options.workspaceId || '',
        identity: parseJsonOption(options.identityJson, '--identity-json'),
      });
    } else if (options.command === 'acquire-run-lease') {
      result = await acquireRunLease({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        workspaceId: options.workspaceId || '',
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        allowParallel: options.allowParallel === 'true' || options.allowParallel === '1',
        leaseTtlMs: options.leaseTtlMs,
      });
    } else if (options.command === 'heartbeat-run-lease') {
      result = await heartbeatRunLease({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        leaseTtlMs: options.leaseTtlMs,
      });
    } else if (options.command === 'cleanup-stale-leases') {
      result = await cleanupStaleRunLeases({
        reason: options.reason || 'lease_ttl_expired',
      });
    } else if (options.command === 'record-event') {
      result = await recordRuntimeEvent({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        eventType: requireOption(options, 'eventType'),
        severity: options.severity || 'info',
        payload: parseJsonOption(options.payloadJson, '--payload-json'),
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'record-completion') {
      result = await recordCompletionDecision({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        status: requireOption(options, 'status'),
        reason: options.reason || '',
        evidence: parseJsonOption(options.evidenceJson, '--evidence-json'),
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        writer: options.writer || 'runtime-state',
        manualRepair: options.manualRepair === true,
        approvalId: options.approvalId || '',
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'record-tool-call') {
      result = await recordToolCall({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        eventId: options.eventId || null,
        toolGroup: requireOption(options, 'toolGroup'),
        toolName: requireOption(options, 'toolName'),
        status: requireOption(options, 'status'),
        schemaMode: requireOption(options, 'schemaMode'),
        approvalRequired: options.approvalRequired === 'true' || options.approvalRequired === '1',
        payload: parseJsonOption(options.payloadJson, '--payload-json'),
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'record-eval-result') {
      result = await recordEvalResult({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        suite: requireOption(options, 'suite'),
        status: requireOption(options, 'status'),
        score: parseJsonOption(options.scoreJson, '--score-json'),
        regressionWorsened: options.regressionWorsened === 'true' || options.regressionWorsened === '1',
        evidence: parseJsonOption(options.evidenceJson, '--evidence-json'),
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'record-memory-promotion') {
      result = await recordMemoryPromotionDecision({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        memoryId: requireOption(options, 'memoryId'),
        status: requireOption(options, 'status'),
        reason: options.reason || '',
        evidence: parseJsonOption(options.evidenceJson, '--evidence-json'),
        reviewer: parseJsonOption(options.reviewerJson, '--reviewer-json'),
        replay: parseJsonOption(options.replayJson, '--replay-json'),
        rollbackPlan: parseJsonOption(options.rollbackJson, '--rollback-json'),
        scopeOwner: options.scopeOwner || '',
        staleAfter: options.staleAfter || null,
        supersedesDecisionId: options.supersedesDecisionId || null,
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'rollback-memory-promotion') {
      result = await rollbackMemoryPromotionDecision({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        memoryId: options.memoryId || '',
        decisionId: options.decisionId || '',
        reason: options.reason || 'memory promotion rolled back',
        rollbackEvidence: parseJsonOption(options.rollbackEvidenceJson, '--rollback-evidence-json'),
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'assess-completion') {
      result = await assessCompletionAuthority({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
      });
    } else if (options.command === 'snapshot-resume') {
      result = await recordResumeSnapshot({
        runId: requireOption(options, 'runId'),
        goalId: requireOption(options, 'goalId'),
        status: parseJsonOption(options.statusJson, '--status-json'),
        resumeBrief: parseJsonOption(options.resumeBriefJson, '--resume-brief-json'),
        identity: parseJsonOption(options.identityJson, '--identity-json'),
        workspaceId: options.workspaceId || '',
      });
    } else if (options.command === 'supersede-completion') {
      result = await supersedeCompletionDecision({
        decisionId: requireOption(options, 'decisionId'),
        reason: options.reason || 'superseded',
      });
    } else if (options.command === '--help' || options.command === '-h') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown command: ${options.command}\n${usage()}`);
    }
  } catch (error) {
    const runtimeReason = runtimeStoreErrorCode(error, 'runtime-state cli');
    if (!runtimeStoreErrorCodes.has(runtimeReason)) {
      throw error;
    }
    result = degradedRuntimeStatus(runtimeReason, undefined, error.message);
  }

  writeResult(result, options.json);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
