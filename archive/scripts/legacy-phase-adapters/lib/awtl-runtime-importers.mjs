#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { assertAwtlEvent } from './awtl-event-schema.mjs';
const CANONICAL_EVENT_TYPES = new Set([
  'span_start',
  'span_end',
  'action',
  'observation',
  'judge_result',
  'artifact_ref',
  'quarantine',
]);
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}
function clampConfidence(value, fallback = 0.5) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(0, Math.min(1, Number(resolved.toFixed(2))));
}
function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = toText(value, '');
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}
function stableId(prefix, parts = []) {
  const digest = createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex').slice(0, 16);
  return `${prefix}-${digest}`;
}
function collapseWhitespace(value, fallback = '') {
  const text = toText(value, fallback).replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : fallback;
}
function excerpt(value, limit = 120) {
  const text = collapseWhitespace(value, '');
  if (!text) {
    return '';
  }
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
function firstText(record, keys = [], fallback = '') {
  for (const key of keys) {
    if (!key) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const text = toText(record[key], '');
      if (text) {
        return text;
      }
    }
    if (isPlainObject(record.payload) && Object.prototype.hasOwnProperty.call(record.payload, key)) {
      const text = toText(record.payload[key], '');
      if (text) {
        return text;
      }
    }
  }
  return fallback;
}
function firstNumber(record, keys = [], fallback = null) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const numeric = Number(record[key]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    if (isPlainObject(record.payload) && Object.prototype.hasOwnProperty.call(record.payload, key)) {
      const numeric = Number(record.payload[key]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return fallback;
}
function firstBoolean(record, keys = [], fallback = false) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return Boolean(record[key]);
    }
    if (isPlainObject(record.payload) && Object.prototype.hasOwnProperty.call(record.payload, key)) {
      return Boolean(record.payload[key]);
    }
  }
  return fallback;
}
function firstArray(record, keys = [], fallback = []) {
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
    if (isPlainObject(record.payload) && Array.isArray(record.payload[key])) {
      return record.payload[key];
    }
  }
  return fallback;
}
function normalizeSourceRuntimeSchema(record = {}, options = {}, fallback = 'unknown.runtime.schema.v1') {
  return toText(
    options.sourceRuntimeSchema
      ?? options.source_runtime_schema
      ?? record.source_runtime_schema
      ?? record.sourceRuntimeSchema
      ?? record.runtime_schema
      ?? record.runtimeSchema
      ?? fallback,
    fallback,
  );
}
function normalizeImportedAt(record = {}, options = {}) {
  return toText(
    options.importedAt
      ?? options.imported_at
      ?? record.imported_at
      ?? record.importedAt
      ?? new Date().toISOString(),
    new Date().toISOString(),
  );
}
function normalizeEventType(rawType, record = {}) {
  const typeText = toText(rawType, '').toLowerCase();
  if (CANONICAL_EVENT_TYPES.has(typeText)) {
    return typeText;
  }
  if (['session_start', 'rollout_start', 'run_start', 'span_begin'].includes(typeText)) {
    return 'span_start';
  }
  if (['session_end', 'rollout_end', 'run_end', 'span_finish'].includes(typeText)) {
    return 'span_end';
  }
  if (['tool_call', 'command', 'action', 'step', 'tool'].includes(typeText)) {
    return 'action';
  }
  if (['judge', 'judge_result', 'validation', 'review'].includes(typeText)) {
    return 'judge_result';
  }
  if (['artifact', 'artifact_ref', 'artifact-reference'].includes(typeText)) {
    return 'artifact_ref';
  }
  if (['quarantine'].includes(typeText)) {
    return 'quarantine';
  }
  const role = toText(firstText(record, ['role', 'speaker', 'actorRole', 'message_role']), '').toLowerCase();
  if (role === 'tool') {
    return 'action';
  }
  if (role === 'assistant') {
    return firstText(record, ['tool_name', 'action_name', 'command', 'name'], '') ? 'action' : 'observation';
  }
  if (role === 'user' || role === 'system') {
    return 'observation';
  }
  if (firstText(record, ['action_name', 'command', 'tool_name'], '')) {
    return 'action';
  }
  if (firstText(record, ['observation_name', 'message', 'content', 'text', 'span_name'], '')) {
    return 'observation';
  }
  return 'action';
}
function normalizeRecordId(record = {}, index = 0) {
  return toText(
    firstText(record, ['event_id', 'id', 'record_id', 'message_id', 'line_id', 'span_id', 'action_id'], ''),
    `record-${index + 1}`,
  );
}
function normalizeSessionId(record = {}, options = {}, fallback = 'session-import') {
  return toText(
    options.sessionId
      ?? options.session_id
      ?? record.session_id
      ?? record.sessionId
      ?? record.trace_id
      ?? record.traceId
      ?? fallback,
    fallback,
  );
}
function normalizeRunId(record = {}, options = {}, fallback = 'run-import') {
  return toText(
    options.runId
      ?? options.run_id
      ?? record.run_id
      ?? record.runId
      ?? fallback,
    fallback,
  );
}
function normalizeTaskId(record = {}, options = {}, fallback = 'task-import') {
  return toText(
    options.taskId
      ?? options.task_id
      ?? record.task_id
      ?? record.taskId
      ?? fallback,
    fallback,
  );
}
function normalizeStage(record = {}, options = {}, fallback = 'ready/isolate') {
  return toText(
    options.stage
      ?? record.stage
      ?? firstText(record, ['phase_stage', 'phaseStage', 'lifecycle_stage'], '')
      ?? fallback,
    fallback,
  );
}
function normalizeActor(record = {}, options = {}, fallback = 'codex') {
  return toText(
    options.actor
      ?? record.actor
      ?? record.role
      ?? record.source_actor
      ?? record.sourceActor
      ?? fallback,
    fallback,
  );
}
function buildEventPayload(record = {}, options = {}, defaults = {}) {
  const sourceRuntimeSchema = normalizeSourceRuntimeSchema(record, options, defaults.sourceRuntimeSchema ?? 'unknown.runtime.schema.v1');
  const importedAt = normalizeImportedAt(record, options);
  const importConfidence = clampConfidence(
    firstNumber(record, ['import_confidence', 'importConfidence', 'confidence', 'confidence_score'], defaults.importConfidence ?? 0.5),
    defaults.importConfidence ?? 0.5,
  );
  const sourceRuntimeRecordType = toText(
    firstText(record, ['source_runtime_record_type', 'sourceRuntimeRecordType', 'type', 'kind', 'event_type'], ''),
    'unknown',
  );
  const sourceRuntimeRecordId = normalizeRecordId(record, defaults.index ?? 0);
  const sourceRuntimeExcerpt = excerpt(
    firstText(record, ['summary', 'message', 'content', 'text', 'title', 'command', 'detail'], ''),
    120,
  );
  return {
    source_runtime_schema: sourceRuntimeSchema,
    source_runtime_record_type: sourceRuntimeRecordType,
    source_runtime_record_id: sourceRuntimeRecordId,
    source_runtime_excerpt: sourceRuntimeExcerpt,
    import_confidence: importConfidence,
    imported_at: importedAt,
    native_capture: false,
    imported: true,
    import_kind: defaults.importKind ?? 'imported',
    ...defaults.extraPayload,
  };
}
function createBoundaryEvent({
  sourceRuntimeSchema,
  importedAt,
  sessionId,
  runId,
  taskId,
  stage,
  actor,
  spanId,
  spanName,
  source,
  eventType,
  summarySuffix,
  importKind,
  importConfidence = 0.85,
}) {
  const boundarySpanId = spanId ?? stableId('span-import', [sourceRuntimeSchema, sessionId, runId, taskId, importKind ?? 'import']);
  const confidence = clampConfidence(importConfidence, 0.85);
  return assertAwtlEvent({
    schema_version: 1,
    event_id: stableId('evt-import', [sourceRuntimeSchema, sessionId, runId, taskId, eventType, summarySuffix]),
    event_type: eventType,
    task_id: taskId,
    session_id: sessionId,
    run_id: runId,
    stage,
    actor,
    summary: `${spanName} ${summarySuffix}`,
    timestamp: importedAt,
    ingest_seq: eventType === 'span_start' ? 1 : 2,
    writer_seq: eventType === 'span_start' ? 1 : 2,
    span_id: boundarySpanId,
    source,
    payload: {
      span_id: boundarySpanId,
      span_name: spanName,
      source_runtime_schema: sourceRuntimeSchema,
      source_runtime_record_type: 'import_boundary',
      source_runtime_record_id: boundarySpanId,
      source_runtime_excerpt: `${spanName} ${summarySuffix}`,
      import_confidence: confidence,
      imported_at: importedAt,
      native_capture: false,
      imported: true,
      import_kind: importKind ?? 'imported',
    },
  });
}
function deriveClaudeConfidence(record = {}, options = {}) {
  const structured = isPlainObject(record) ? Object.keys(record).length >= 3 : false;
  const hasToolCall = Boolean(firstText(record, ['tool_name', 'action_name', 'command'], ''));
  const role = toText(firstText(record, ['role', 'speaker', 'actorRole', 'message_role'], ''), '').toLowerCase();
  let confidence = 0.3;
  if (structured) {
    confidence += 0.08;
  }
  if (hasToolCall) {
    confidence += 0.12;
  }
  if (role === 'assistant') {
    confidence += 0.03;
  }
  if (role === 'tool') {
    confidence += 0.08;
  }
  if (firstBoolean(record, ['analysis', 'private_reasoning', 'reasoning'], false)) {
    confidence -= 0.08;
  }
  if (toText(options.importConfidence, '') !== '') {
    const explicit = Number(options.importConfidence);
    if (Number.isFinite(explicit)) {
      confidence = explicit;
    }
  }
  return clampConfidence(confidence, 0.3);
}
function deriveCodexConfidence(record = {}, options = {}) {
  const structured = isPlainObject(record) ? Object.keys(record).length >= 4 : false;
  const explicit = Number(options.importConfidence ?? record.import_confidence ?? record.importConfidence);
  if (Number.isFinite(explicit)) {
    return clampConfidence(explicit, 0.72);
  }
  let confidence = 0.72;
  if (structured) {
    confidence += 0.1;
  }
  if (firstText(record, ['span_id', 'action_name', 'event_type', 'type', 'kind'], '')) {
    confidence += 0.05;
  }
  return clampConfidence(confidence, 0.72);
}
function buildCodexImportedEvent(record = {}, options = {}, defaults = {}) {
  const sourceRuntimeSchema = normalizeSourceRuntimeSchema(record, options, defaults.sourceRuntimeSchema ?? 'codex.rollout.session.v1');
  const importedAt = normalizeImportedAt(record, options);
  const sessionId = normalizeSessionId(record, options, defaults.sessionId ?? 'session-import');
  const runId = normalizeRunId(record, options, defaults.runId ?? 'run-import');
  const taskId = normalizeTaskId(record, options, defaults.taskId ?? 'task-import');
  const stage = normalizeStage(record, options, defaults.stage ?? 'ready/isolate');
  const actor = normalizeActor(record, options, defaults.actor ?? 'codex');
  const index = defaults.index ?? 0;
  const eventType = normalizeEventType(firstText(record, ['event_type', 'type', 'kind', 'lifecycle_event'], ''), record);
  const payload = buildEventPayload(record, options, {
    index,
    sourceRuntimeSchema,
    importedAt,
    sessionId,
    runId,
    taskId,
    stage,
    actor,
    importKind: 'codex-imported',
    importConfidence: deriveCodexConfidence(record, options),
    extraPayload: {
      source_runtime_record_kind: firstText(record, ['source_runtime_record_kind', 'kind', 'type', 'event_type', 'lifecycle_event'], 'unknown'),
      source_runtime_record_type: firstText(record, ['source_runtime_record_type', 'kind', 'type', 'event_type', 'lifecycle_event'], 'unknown'),
      source_runtime_record_role: firstText(record, ['role', 'speaker', 'actorRole', 'message_role'], ''),
    },
  });
  payload.native_capture = false;
  payload.import_kind = 'codex-imported';
  payload.import_confidence = deriveCodexConfidence(record, options);
  const spanId = firstText(record, ['span_id', 'spanId'], '');
  const actionId = firstText(record, ['action_id', 'actionId'], '');
  if (eventType === 'span_start' || eventType === 'span_end') {
    payload.span_id = spanId || stableId('span-import', [sourceRuntimeSchema, sessionId, runId, taskId, index, normalizeRecordId(record, index)]);
    payload.span_name = collapseWhitespace(
      firstText(record, ['span_name', 'title', 'name'], ''),
      `${sourceRuntimeSchema} imported span`,
    );
  }
  if (eventType === 'action') {
    payload.action_name = collapseWhitespace(
      firstText(record, ['action_name', 'command', 'tool_name', 'title', 'name'], ''),
      `${sourceRuntimeSchema} imported action`,
    );
  }
  if (eventType === 'observation') {
    payload.observation_name = collapseWhitespace(
      firstText(record, ['observation_name', 'message', 'content', 'text', 'title'], ''),
      `${sourceRuntimeSchema} imported observation`,
    );
  }
  if (eventType === 'judge_result') {
    payload.judge_name = collapseWhitespace(
      firstText(record, ['judge_name', 'name', 'title'], ''),
      `${sourceRuntimeSchema} imported judge`,
    );
    payload.result = toText(firstText(record, ['result', 'outcome', 'verdict'], ''), 'warn');
    if (!['pass', 'fail', 'warn'].includes(payload.result)) {
      payload.result = 'warn';
    }
  }
  if (eventType === 'artifact_ref') {
    const refs = uniqueStrings(firstArray(record, ['artifact_refs', 'artifactRefs', 'artifact_ref'], []));
    payload.artifact_refs = refs.length > 0 ? refs : [collapseWhitespace(firstText(record, ['path', 'artifact_path', 'artifact', 'file_path'], ''), `${sourceRuntimeSchema}`)];
  }
  if (eventType === 'quarantine') {
    payload.quarantine_reason = collapseWhitespace(
      firstText(record, ['quarantine_reason', 'reason', 'detail'], ''),
      `${sourceRuntimeSchema} imported quarantine`,
    );
    payload.source_path = collapseWhitespace(firstText(record, ['source_path', 'path', 'artifact_path'], ''), '');
  }
  const event = {
    schema_version: 1,
    event_id: stableId('evt-import', [sourceRuntimeSchema, sessionId, runId, taskId, index, eventType, normalizeRecordId(record, index)]),
    event_type: eventType,
    task_id: taskId,
    session_id: sessionId,
    run_id: runId,
    stage,
    actor,
    summary: collapseWhitespace(
      firstText(record, ['summary', 'title', 'message', 'content', 'text', 'action_name', 'observation_name', 'span_name'], ''),
      `${sourceRuntimeSchema} imported ${eventType}`,
    ),
    timestamp: toText(firstText(record, ['timestamp', 'created_at', 'createdAt', 'observed_at', 'observedAt'], ''), importedAt),
    ingest_seq: index + 1,
    writer_seq: index + 1,
    source: toText(options.source ?? record.source ?? 'codex-importer', 'codex-importer'),
    payload,
  };
  if (spanId) {
    event.span_id = spanId;
  }
  if (actionId) {
    event.action_id = actionId;
  }
  return assertAwtlEvent(event);
}
function buildClaudeImportedEvent(record = {}, options = {}, defaults = {}) {
  const sourceRuntimeSchema = normalizeSourceRuntimeSchema(record, options, defaults.sourceRuntimeSchema ?? 'claude.code.transcript.v1');
  const importedAt = normalizeImportedAt(record, options);
  const sessionId = normalizeSessionId(record, options, defaults.sessionId ?? 'session-import');
  const runId = normalizeRunId(record, options, defaults.runId ?? 'run-import');
  const taskId = normalizeTaskId(record, options, defaults.taskId ?? 'task-import');
  const stage = normalizeStage(record, options, defaults.stage ?? 'ready/isolate');
  const actor = normalizeActor(record, options, defaults.actor ?? 'claude');
  const index = defaults.index ?? 0;
  const role = toText(firstText(record, ['role', 'speaker', 'actorRole', 'message_role'], ''), '').toLowerCase();
  const inferredEventType = normalizeEventType(firstText(record, ['event_type', 'type', 'kind', 'lifecycle_event'], ''), record);
  const eventType = inferredEventType === 'action' && role === 'user' ? 'observation' : inferredEventType;
  const payload = buildEventPayload(record, options, {
    index,
    sourceRuntimeSchema,
    importedAt,
    sessionId,
    runId,
    taskId,
    stage,
    actor,
    importKind: 'claude-transcript-imported',
    importConfidence: deriveClaudeConfidence(record, options),
    extraPayload: {
      source_runtime_record_kind: firstText(record, ['source_runtime_record_kind', 'kind', 'type', 'event_type', 'lifecycle_event'], 'unknown'),
      source_runtime_record_type: firstText(record, ['source_runtime_record_type', 'kind', 'type', 'event_type', 'lifecycle_event'], 'unknown'),
      source_runtime_record_role: role,
    },
  });
  payload.native_capture = false;
  payload.import_kind = 'claude-transcript-imported';
  payload.import_confidence = deriveClaudeConfidence(record, options);
  const spanId = firstText(record, ['span_id', 'spanId'], '');
  const actionId = firstText(record, ['action_id', 'actionId'], '');
  if (eventType === 'span_start' || eventType === 'span_end') {
    payload.span_id = spanId || stableId('span-import', [sourceRuntimeSchema, sessionId, runId, taskId, index, normalizeRecordId(record, index)]);
    payload.span_name = collapseWhitespace(
      firstText(record, ['span_name', 'title', 'name'], ''),
      `${sourceRuntimeSchema} imported span`,
    );
  }
  if (eventType === 'action') {
    payload.action_name = collapseWhitespace(
      firstText(record, ['action_name', 'command', 'tool_name', 'title', 'name'], ''),
      `${sourceRuntimeSchema} imported action`,
    );
  }
  if (eventType === 'observation') {
    payload.observation_name = collapseWhitespace(
      firstText(record, ['observation_name', 'message', 'content', 'text', 'title'], ''),
      `${sourceRuntimeSchema} imported observation`,
    );
  }
  if (eventType === 'judge_result') {
    payload.judge_name = collapseWhitespace(
      firstText(record, ['judge_name', 'name', 'title'], ''),
      `${sourceRuntimeSchema} imported judge`,
    );
    payload.result = toText(firstText(record, ['result', 'outcome', 'verdict'], ''), 'warn');
    if (!['pass', 'fail', 'warn'].includes(payload.result)) {
      payload.result = 'warn';
    }
  }
  if (eventType === 'artifact_ref') {
    const refs = uniqueStrings(firstArray(record, ['artifact_refs', 'artifactRefs', 'artifact_ref'], []));
    payload.artifact_refs = refs.length > 0 ? refs : [collapseWhitespace(firstText(record, ['path', 'artifact_path', 'artifact', 'file_path'], ''), `${sourceRuntimeSchema}`)];
  }
  if (eventType === 'quarantine') {
    payload.quarantine_reason = collapseWhitespace(
      firstText(record, ['quarantine_reason', 'reason', 'detail'], ''),
      `${sourceRuntimeSchema} imported quarantine`,
    );
    payload.source_path = collapseWhitespace(firstText(record, ['source_path', 'path', 'artifact_path'], ''), '');
  }
  const event = {
    schema_version: 1,
    event_id: stableId('evt-import', [sourceRuntimeSchema, sessionId, runId, taskId, index, eventType, normalizeRecordId(record, index)]),
    event_type: eventType,
    task_id: taskId,
    session_id: sessionId,
    run_id: runId,
    stage,
    actor,
    summary: collapseWhitespace(
      firstText(record, ['summary', 'title', 'message', 'content', 'text', 'action_name', 'observation_name', 'span_name'], ''),
      `${sourceRuntimeSchema} imported ${eventType}`,
    ),
    timestamp: toText(firstText(record, ['timestamp', 'created_at', 'createdAt', 'observed_at', 'observedAt'], ''), importedAt),
    ingest_seq: index + 1,
    writer_seq: index + 1,
    source: toText(options.source ?? record.source ?? 'claude-transcript-importer', 'claude-transcript-importer'),
    payload,
  };
  if (spanId) {
    event.span_id = spanId;
  }
  if (actionId) {
    event.action_id = actionId;
  }
  return assertAwtlEvent(event);
}
export function importCodexRolloutSession(input = {}, options = {}) {
  const normalizedInput = Array.isArray(input) || (input && isPlainObject(input)) ? input : {};
  const sourceRuntimeSchema = normalizeSourceRuntimeSchema(normalizedInput, options, 'codex.rollout.session.v1');
  const importedAt = normalizeImportedAt(normalizedInput, options);
  const records = Array.isArray(normalizedInput)
    ? normalizedInput.filter(Boolean)
    : Array.isArray(normalizedInput.rollout?.events)
      ? normalizedInput.rollout.events.filter(Boolean)
      : Array.isArray(normalizedInput.session?.events)
        ? normalizedInput.session.events.filter(Boolean)
        : Array.isArray(normalizedInput.events)
          ? normalizedInput.events.filter(Boolean)
          : Array.isArray(normalizedInput.records)
            ? normalizedInput.records.filter(Boolean)
            : [];
  const sessionId = normalizeSessionId(normalizedInput, options, 'session-import');
  const runId = normalizeRunId(normalizedInput, options, 'run-import');
  const taskId = normalizeTaskId(normalizedInput, options, 'task-import');
  const stage = normalizeStage(normalizedInput, options, 'ready/isolate');
  const actor = normalizeActor(normalizedInput, options, 'codex');
  const spanName = `${sourceRuntimeSchema} rollout/session import`;
  const spanId = stableId('span-import', [sourceRuntimeSchema, sessionId, runId, taskId, 'codex-rollout']);
  const events = [
    createBoundaryEvent({
      sourceRuntimeSchema,
      importedAt,
      sessionId,
      runId,
      taskId,
      stage,
      actor,
      spanId,
      spanName,
      source: 'codex-importer',
      eventType: 'span_start',
      summarySuffix: 'started',
      importKind: 'codex-rollout',
      importConfidence: 0.85,
    }),
  ];
  records.forEach((record, index) => {
    events.push(buildCodexImportedEvent(record, {
      ...options,
      sourceRuntimeSchema,
      importedAt,
      sessionId,
      runId,
      taskId,
      stage,
      actor,
      source: 'codex-importer',
    }, {
      index,
      sourceRuntimeSchema,
      importedAt,
      sessionId,
      runId,
      taskId,
      stage,
      actor,
    }));
  });
  events.push(createBoundaryEvent({
    sourceRuntimeSchema,
    importedAt,
    sessionId,
    runId,
    taskId,
    stage,
    actor,
    spanId,
    spanName,
    source: 'codex-importer',
    eventType: 'span_end',
    summarySuffix: 'completed',
    importKind: 'codex-rollout',
    importConfidence: 0.85,
  }));
  return events;
}
function parseTranscriptEntries(input = {}) {
  if (Array.isArray(input)) {
    return input.filter(Boolean);
  }
  const transcript = input.transcript ?? input.lines ?? input.messages ?? input.entries ?? input.events ?? input.records;
  if (Array.isArray(transcript)) {
    return transcript.filter(Boolean);
  }
  if (typeof transcript === 'string') {
    return transcript
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          const separator = line.indexOf(':');
          if (separator > 0) {
            return {
              line_number: index + 1,
              role: line.slice(0, separator).trim().toLowerCase(),
              content: line.slice(separator + 1).trim(),
            };
          }
          return {
            line_number: index + 1,
            role: 'assistant',
            content: line,
          };
        }
      });
  }
  return [];
}
export function importClaudeCodeTranscript(input = {}, options = {}) {
  const normalizedInput = Array.isArray(input) || (input && isPlainObject(input)) ? input : {};
  const sourceRuntimeSchema = normalizeSourceRuntimeSchema(normalizedInput, options, 'claude.code.transcript.v1');
  const importedAt = normalizeImportedAt(normalizedInput, options);
  const records = parseTranscriptEntries(normalizedInput);
  const sessionId = normalizeSessionId(normalizedInput, options, 'session-import');
  const runId = normalizeRunId(normalizedInput, options, 'run-import');
  const taskId = normalizeTaskId(normalizedInput, options, 'task-import');
  const stage = normalizeStage(normalizedInput, options, 'ready/isolate');
  const actor = normalizeActor(normalizedInput, options, 'claude');
  const spanName = `${sourceRuntimeSchema} transcript import`;
  const spanId = stableId('span-import', [sourceRuntimeSchema, sessionId, runId, taskId, 'claude-transcript']);
  const events = [
    createBoundaryEvent({
      sourceRuntimeSchema,
      importedAt,
      sessionId,
      runId,
      taskId,
      stage,
      actor,
      spanId,
      spanName,
      source: 'claude-transcript-importer',
      eventType: 'span_start',
      summarySuffix: 'started',
      importKind: 'claude-transcript',
      importConfidence: 0.65,
    }),
  ];
  records.forEach((record, index) => {
    const payloadRole = toText(firstText(record, ['role', 'speaker', 'actorRole', 'message_role'], ''), '').toLowerCase();
    const eventType = normalizeEventType(firstText(record, ['event_type', 'type', 'kind', 'lifecycle_event'], ''), record);
    const adjustedEventType = eventType === 'action' && payloadRole === 'user' ? 'observation' : eventType;
    const rawRecordType = firstText(record, ['event_type', 'type', 'kind', 'lifecycle_event'], 'unknown');
    const importedRecord = {
      ...record,
      source_runtime_record_type: firstText(record, ['source_runtime_record_type'], rawRecordType),
      event_type: adjustedEventType,
      type: adjustedEventType,
    };
    events.push(buildClaudeImportedEvent(importedRecord, {
      ...options,
      sourceRuntimeSchema,
      importedAt,
      sessionId,
      runId,
      taskId,
      stage,
      actor,
      source: 'claude-transcript-importer',
    }, {
      index,
      sourceRuntimeSchema,
      importedAt,
      sessionId,
      runId,
      taskId,
      stage,
      actor,
    }));
  });
  events.push(createBoundaryEvent({
    sourceRuntimeSchema,
    importedAt,
    sessionId,
    runId,
    taskId,
    stage,
    actor,
    spanId,
    spanName,
    source: 'claude-transcript-importer',
    eventType: 'span_end',
    summarySuffix: 'completed',
    importKind: 'claude-transcript',
    importConfidence: 0.65,
  }));
  return events;
}
export function importRuntimeSource(input = {}, options = {}) {
  const sourceRuntime = toText(options.sourceRuntime ?? options.source_runtime ?? input.source_runtime ?? input.sourceRuntime ?? input.runtime ?? '', '').toLowerCase();
  const looksClaude = sourceRuntime.includes('claude')
    || Array.isArray(input.transcript)
    || Array.isArray(input.messages)
    || Array.isArray(input.lines)
    || (Array.isArray(input) && input.some((entry) => isPlainObject(entry) && (Object.prototype.hasOwnProperty.call(entry, 'role') || Object.prototype.hasOwnProperty.call(entry, 'message_role') || Object.prototype.hasOwnProperty.call(entry, 'tool_name'))));
  if (looksClaude) {
    return importClaudeCodeTranscript(input, options);
  }
  return importCodexRolloutSession(input, options);
}
