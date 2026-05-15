#!/usr/bin/env node

import crypto from 'node:crypto';
import path from 'node:path';

import { createTraceEvent, createTraceSink, DEFAULT_TRACE_ROOT } from './awtl-trace-sink.mjs';

function isAbsoluteOrTraversal(candidate) {
  return path.isAbsolute(candidate) || candidate.split(/[\\/]/).includes('..');
}

export function normalizeRepoRelativePath(candidate, repoRoot = process.cwd()) {
  const value = String(candidate ?? '').trim();
  if (!value) {
    return '';
  }

  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (isAbsoluteOrTraversal(normalized)) {
    const relative = path.relative(repoRoot, normalized).replace(/\\/g, '/');
    if (!relative || relative.startsWith('..')) {
      return '';
    }
    return relative;
  }

  return normalized;
}

export function normalizeArtifactRefs(artifactRefs = [], repoRoot = process.cwd()) {
  return artifactRefs
    .map((entry) => normalizeRepoRelativePath(entry, repoRoot))
    .filter((entry) => entry.length > 0);
}

function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function createPhaseHarnessCaptureSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const traceRoot = options.traceRoot ?? DEFAULT_TRACE_ROOT;
  const runId = toText(options.runId, options.traceId || 'run-unknown');
  const traceId = toText(options.traceId, runId);
  const taskId = toText(options.taskId, 'task-unknown');
  const sessionId = toText(options.sessionId, `session-${runId}`);
  const stage = toText(options.stage, 'ready/isolate');
  const actor = toText(options.actor, 'codex');
  const source = toText(options.source, 'moonshot-orchestrator');
  const sink = createTraceSink({ traceRoot, traceId, runId, taskId, sessionId });

  const state = {
    runSpanId: '',
    attemptSpanId: '',
    currentTurnId: '',
    currentTurnSeq: 0,
    currentAttemptIndex: 0,
    actionSeq: 0,
    spanSeq: 0,
  };

  function nextActionId(prefix = 'action') {
    state.actionSeq += 1;
    return `${prefix}-${state.actionSeq}-${crypto.randomUUID().slice(0, 8)}`;
  }

  function nextSpanId(prefix = 'span') {
    state.spanSeq += 1;
    return `${prefix}-${state.spanSeq}-${crypto.randomUUID().slice(0, 8)}`;
  }

  function beginTurn(details = {}) {
    if (toText(details.turnId, '')) {
      state.currentTurnId = toText(details.turnId, '');
      state.currentAttemptIndex = Number.isInteger(details.attemptIndex) ? details.attemptIndex : toInt(details.attemptIndex, state.currentAttemptIndex || 0);
      return {
        turnId: state.currentTurnId,
        attemptIndex: state.currentAttemptIndex,
        turnSeq: state.currentTurnSeq,
      };
    }

    const phaseNum = toText(details.phaseNum, 'phase');
    const attemptIndex = Number.isInteger(details.attemptIndex)
      ? details.attemptIndex
      : toInt(details.attemptIndex, state.currentAttemptIndex || 1);
    state.currentAttemptIndex = attemptIndex;
    state.currentTurnSeq += 1;
    const turnSeq = state.currentTurnSeq;
    const turnId = `turn-${phaseNum}-${attemptIndex}-${turnSeq}-${crypto.randomUUID().slice(0, 8)}`;
    state.currentTurnId = turnId;
    return {
      turnId,
      attemptIndex,
      turnSeq,
    };
  }

  async function emit(eventType, payload, overrides = {}) {
    try {
      const event = createTraceEvent({
        event_type: eventType,
        task_id: taskId,
        session_id: sessionId,
        run_id: runId,
        stage: overrides.stage ?? stage,
        actor: overrides.actor ?? actor,
        summary: overrides.summary ?? '',
        payload,
        turn_id: overrides.turnId ?? state.currentTurnId ?? null,
        span_id: overrides.spanId ?? null,
        action_id: overrides.actionId ?? null,
        source: overrides.source ?? source,
      }, {
        runId,
        taskId,
        sessionId,
      });
      const result = await sink.appendEvent(event);
      return {
        ok: true,
        event: result.event,
        traceDir: result.traceDir,
        canonicalPath: result.canonicalPath,
        judgeResultPath: result.judgeResultPath,
        quarantinePath: result.quarantinePath,
      };
    } catch (error) {
      return {
        ok: false,
        error,
      };
    }
  }

  async function recordRunStarted(details = {}) {
    const spanId = toText(details.spanId, nextSpanId('run'));
    state.runSpanId = spanId;
    return emit(
      'span_start',
      {
        span_id: spanId,
        span_name: toText(details.spanName, 'run'),
        lifecycle_event: 'run_started',
        phase_num: toText(details.phaseNum, ''),
        phase_title: toText(details.phaseTitle, ''),
      },
      {
        spanId,
        summary: details.summary ?? 'run_started',
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? null,
      },
    );
  }

  async function recordRunCompleted(details = {}) {
    const spanId = toText(details.spanId, state.runSpanId || nextSpanId('run'));
    return emit(
      'span_end',
      {
        span_id: spanId,
        span_name: toText(details.spanName, 'run'),
        lifecycle_event: 'run_completed',
        completion_status: toText(details.completionStatus, ''),
      },
      {
        spanId,
        summary: details.summary ?? 'run_completed',
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? null,
      },
    );
  }

  async function recordAttemptStarted(details = {}) {
    const spanId = toText(details.spanId, nextSpanId('attempt'));
    state.attemptSpanId = spanId;
    beginTurn(details);
    return emit(
      'span_start',
      {
        span_id: spanId,
        span_name: toText(details.spanName, 'attempt'),
        lifecycle_event: 'attempt_started',
        parent_span_id: toText(details.parentSpanId, state.runSpanId || ''),
        attempt_index: toText(details.attemptIndex, ''),
      },
      {
        spanId,
        summary: details.summary ?? 'attempt_started',
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordSpanStarted(details = {}) {
    const spanId = toText(details.spanId, nextSpanId(toText(details.spanName, 'span')));
    return emit(
      'span_start',
      {
        span_id: spanId,
        span_name: toText(details.spanName, 'span'),
        lifecycle_event: 'span_started',
        parent_span_id: toText(details.parentSpanId, state.attemptSpanId || state.runSpanId || ''),
      },
      {
        spanId,
        summary: details.summary ?? `span_started:${toText(details.spanName, 'span')}`,
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordSpanCompleted(details = {}) {
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || nextSpanId('span'));
    return emit(
      'span_end',
      {
        span_id: spanId,
        span_name: toText(details.spanName, 'span'),
        lifecycle_event: 'span_completed',
        parent_span_id: toText(details.parentSpanId, state.attemptSpanId || state.runSpanId || ''),
      },
      {
        spanId,
        summary: details.summary ?? `span_completed:${toText(details.spanName, 'span')}`,
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordActionStarted(details = {}) {
    const actionId = toText(details.actionId, nextActionId(toText(details.actionName, 'action')));
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || '');
    return emit(
      'action',
      {
        action_name: toText(details.actionName, 'action'),
        lifecycle_event: 'action_started',
        parent_span_id: toText(details.parentSpanId, spanId),
        action_result: '',
      },
      {
        actionId,
        spanId: spanId || null,
        summary: details.summary ?? `action_started:${toText(details.actionName, 'action')}`,
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordActionCompleted(details = {}) {
    const actionId = toText(details.actionId, nextActionId(toText(details.actionName, 'action')));
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || '');
    return emit(
      'action',
      {
        action_name: toText(details.actionName, 'action'),
        lifecycle_event: 'action_completed',
        parent_span_id: toText(details.parentSpanId, spanId),
        action_result: toText(details.actionResult, ''),
        exit_code: Number.isInteger(details.exitCode) ? details.exitCode : null,
      },
      {
        actionId,
        spanId: spanId || null,
        summary: details.summary ?? `action_completed:${toText(details.actionName, 'action')}`,
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordJudgeResult(details = {}) {
    const actionId = toText(details.actionId, '');
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || '');
    return emit(
      'judge_result',
      {
        judge_name: toText(details.judgeName, 'phase-verifier'),
        result: toText(details.result, 'warn'),
        lifecycle_event: 'judge_result',
        source_action_id: actionId,
        artifact_refs: normalizeArtifactRefs(details.artifactRefs ?? [], repoRoot),
        detail: toText(details.detail, ''),
      },
      {
        actionId: actionId || null,
        spanId: spanId || null,
        summary: details.summary ?? `judge_result:${toText(details.judgeName, 'phase-verifier')}:${toText(details.result, 'warn')}`,
        stage: details.stage ?? 'verify',
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordMemoryRead(details = {}) {
    const actionId = toText(details.actionId, '');
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || '');
    return emit(
      'observation',
      {
        observation_name: 'memory_read',
        lifecycle_event: 'memory_read',
        query_hash: toText(details.queryHash, ''),
        node_ids: Array.isArray(details.nodeIds) ? details.nodeIds.map((entry) => toText(entry, '')).filter(Boolean) : [],
        tags: Array.isArray(details.tags) ? details.tags.map((entry) => toText(entry, '')).filter(Boolean) : [],
        scope: toText(details.scope, ''),
        result_count: Number.isInteger(details.resultCount) ? details.resultCount : null,
      },
      {
        actionId: actionId || null,
        spanId: spanId || null,
        summary: details.summary ?? 'memory_read',
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordFileReconciliation(details = {}) {
    const actionId = toText(details.actionId, '');
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || '');
    return emit(
      'artifact_ref',
      {
        artifact_refs: normalizeArtifactRefs(details.artifactRefs ?? [], repoRoot),
        lifecycle_event: 'file_reconciliation',
        reconcile_mode: toText(details.reconcileMode, ''),
      },
      {
        actionId: actionId || null,
        spanId: spanId || null,
        summary: details.summary ?? 'file_reconciliation',
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  async function recordPrivacyEvent(details = {}) {
    const actionId = toText(details.actionId, '');
    const spanId = toText(details.spanId, state.attemptSpanId || state.runSpanId || '');
    return emit(
      'observation',
      {
        observation_name: 'privacy_event',
        lifecycle_event: 'privacy_event',
        privacy_event: toText(details.privacyEvent, 'unknown'),
        redaction_mode: toText(details.redactionMode, ''),
        detail_hash: toText(details.detailHash, ''),
      },
      {
        actionId: actionId || null,
        spanId: spanId || null,
        summary: details.summary ?? 'privacy_event',
        stage: details.stage ?? stage,
        actor: details.actor ?? actor,
        source: details.source ?? source,
        turnId: details.turnId ?? state.currentTurnId ?? null,
      },
    );
  }

  return {
    sink,
    paths: sink.paths,
    state,
    beginTurn,
    recordRunStarted,
    recordRunCompleted,
    recordAttemptStarted,
    recordSpanStarted,
    recordSpanCompleted,
    recordActionStarted,
    recordActionCompleted,
    recordJudgeResult,
    recordMemoryRead,
    recordFileReconciliation,
    recordPrivacyEvent,
  };
}
