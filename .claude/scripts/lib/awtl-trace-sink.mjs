#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { redactText, sha256Hex } from './awtl-redaction.mjs';
import { assertAwtlEvent, validateAwtlEvent } from './awtl-event-schema.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');

export const DEFAULT_TRACE_ROOT = path.join(REPO_ROOT, '.claude/traces');
export const DEFAULT_TRACE_FILE = 'agent_work_trace.jsonl';
export const DEFAULT_JUDGE_RESULT_FILE = 'judge_result.jsonl';
export const DEFAULT_QUARANTINE_FILE = 'agent_work_trace.quarantine.jsonl';
export const DEFAULT_LOCK_FILE = 'agent_work_trace.lock';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureDirectorySync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function appendText(filePath, text) {
  ensureDirectorySync(path.dirname(filePath));
  fs.appendFileSync(filePath, text, 'utf8');
}

function writeText(filePath, text) {
  ensureDirectorySync(path.dirname(filePath));
  fs.writeFileSync(filePath, text, 'utf8');
}

function parseJsonLine(rawLine) {
  if (!rawLine || !rawLine.trim()) {
    return null;
  }
  return JSON.parse(rawLine);
}

function normalizeArray(value, fieldName, options) {
  return value.map((item, index) => deepRedact(item, { ...options, fieldName: `${fieldName}[${index}]` }));
}

function deepRedact(value, options = {}) {
  const fieldName = String(options.fieldName ?? '');
  if (Array.isArray(value)) {
    return normalizeArray(value, fieldName, options);
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = deepRedact(child, { ...options, fieldName: fieldName ? `${fieldName}.${key}` : key });
    }
    return result;
  }
  if (typeof value === 'string') {
    const redacted = redactText(value, {
      preserveLinkability: Boolean(options.preserveLinkability),
    });
    return redacted.value;
  }
  return value;
}

function redactEnvelope(event) {
  const redacted = { ...event };
  if (typeof redacted.summary === 'string') {
    redacted.summary = redactText(redacted.summary, { preserveLinkability: false }).value;
  }
  if (typeof redacted.source === 'string') {
    redacted.source = redactText(redacted.source, { preserveLinkability: false }).value;
  }
  if (redacted.payload !== undefined) {
    redacted.payload = deepRedact(redacted.payload, { fieldName: 'payload', preserveLinkability: false });
  }
  return redacted;
}

function buildQuarantineRecord({ rawLine, reason, sourcePath, lineNumber }) {
  const redacted = redactText(rawLine, { preserveLinkability: true });
  return {
    quarantined_at: new Date().toISOString(),
    reason,
    source_path: sourcePath,
    line_number: lineNumber,
    raw_line_hash: sha256Hex(rawLine),
    raw_line_redacted: redacted.value,
  };
}

function quarantineLine(quarantinePath, rawLine, reason, sourcePath, lineNumber) {
  const record = buildQuarantineRecord({ rawLine, reason, sourcePath, lineNumber });
  appendText(quarantinePath, `${JSON.stringify(record)}\n`);
  return record;
}

function compareStrings(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

export function compareAwtlEvents(left, right) {
  const byRun = compareStrings(left?.run_id, right?.run_id);
  if (byRun !== 0) {
    return byRun;
  }

  const leftIngest = Number(left?.ingest_seq ?? 0);
  const rightIngest = Number(right?.ingest_seq ?? 0);
  if (leftIngest !== rightIngest) {
    return leftIngest - rightIngest;
  }

  const byTimestamp = compareStrings(left?.timestamp, right?.timestamp);
  if (byTimestamp !== 0) {
    return byTimestamp;
  }

  return compareStrings(left?.event_id, right?.event_id);
}

export function sortAwtlEvents(events = []) {
  return [...events].sort(compareAwtlEvents);
}

function resolveTracePaths(options = {}) {
  const traceRoot = path.resolve(options.traceRoot ?? DEFAULT_TRACE_ROOT);
  const traceId = options.traceId ?? options.runId ?? `awtl-${Date.now()}`;
  const traceDir = path.join(traceRoot, traceId);
  return {
    traceRoot,
    traceId,
    traceDir,
    canonicalPath: path.join(traceDir, DEFAULT_TRACE_FILE),
    judgeResultPath: path.join(traceDir, DEFAULT_JUDGE_RESULT_FILE),
    quarantinePath: path.join(traceDir, DEFAULT_QUARANTINE_FILE),
    lockPath: path.join(traceDir, DEFAULT_LOCK_FILE),
  };
}

async function acquireTraceLock(lockPath, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 30000);
  const staleMs = Number(options.staleMs ?? 120000);
  const startedAt = Date.now();

  ensureDirectorySync(path.dirname(lockPath));

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n', 'utf8');
      return () => {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore close failures during cleanup
        }
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore cleanup races
        }
      };
    } catch (error) {
      if (!error || error.code !== 'EEXIST') {
        throw error;
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for trace lock: ${lockPath}`);
      }

      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > staleMs) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        // If stat fails the lock is gone, try again immediately.
      }

      await sleep(25);
    }
  }
}

function parseCanonicalTrace(canonicalPath, quarantinePath) {
  const text = readTextIfExists(canonicalPath);
  if (!text) {
    return {
      events: [],
      quarantined: [],
      nextIngestSeq: 1,
      rewritten: false,
    };
  }

  const events = [];
  const quarantined = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine || !rawLine.trim()) {
      continue;
    }

    try {
      const parsed = parseJsonLine(rawLine);
      const validation = validateAwtlEvent(parsed);
      if (!validation.ok) {
        throw new Error(validation.errors.join('; '));
      }
      events.push(parsed);
    } catch (error) {
      const reason = error?.message || 'invalid-jsonl-line';
      quarantined.push(quarantineLine(quarantinePath, rawLine, reason, canonicalPath, index + 1));
    }
  }

  const nextIngestSeq = events.reduce((max, entry) => Math.max(max, Number(entry.ingest_seq ?? 0)), 0) + 1;

  if (quarantined.length > 0) {
    const canonicalText = events.map((entry) => `${JSON.stringify(entry)}\n`).join('');
    writeText(canonicalPath, canonicalText);
  }

  return {
    events,
    quarantined,
    nextIngestSeq,
    rewritten: quarantined.length > 0,
  };
}

function rewriteJudgeResultIndex(judgeResultPath, events) {
  const judgeResults = events.filter((event) => event.event_type === 'judge_result');
  writeText(judgeResultPath, judgeResults.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
  return judgeResults.length;
}

function validateAndPrepareEvent(event, { ingestSeq, writerSeq, timestamp }) {
  const prepared = redactEnvelope({
    ...event,
    schema_version: event.schema_version ?? 1,
    ingest_seq: ingestSeq,
    writer_seq: writerSeq,
    timestamp: event.timestamp ?? timestamp,
  });
  const validation = validateAwtlEvent(prepared);
  if (!validation.ok) {
    throw new Error(`Invalid AWTL event: ${validation.errors.join('; ')}`);
  }
  return prepared;
}

async function appendEventInternal(event, options, writerSeq) {
  const paths = resolveTracePaths(options);
  ensureDirectorySync(paths.traceDir);
  const releaseLock = await acquireTraceLock(paths.lockPath, options);

  try {
    const state = parseCanonicalTrace(paths.canonicalPath, paths.quarantinePath);
    if (state.rewritten) {
      rewriteJudgeResultIndex(paths.judgeResultPath, state.events);
    }
    const ingestSeq = state.nextIngestSeq;
    const prepared = validateAndPrepareEvent(event, {
      ingestSeq,
      writerSeq,
      timestamp: options.timestamp ?? new Date().toISOString(),
    });
    appendText(paths.canonicalPath, `${JSON.stringify(prepared)}\n`);
    if (prepared.event_type === 'judge_result') {
      appendText(paths.judgeResultPath, `${JSON.stringify(prepared)}\n`);
    }
    return {
      event: prepared,
      traceDir: paths.traceDir,
      canonicalPath: paths.canonicalPath,
      judgeResultPath: paths.judgeResultPath,
      quarantinePath: paths.quarantinePath,
      nextIngestSeq: ingestSeq + 1,
    };
  } finally {
    releaseLock();
  }
}

async function rebuildJudgeResultIndexInternal(options = {}) {
  const paths = resolveTracePaths(options);
  ensureDirectorySync(paths.traceDir);
  const releaseLock = await acquireTraceLock(paths.lockPath, options);

  try {
    const state = parseCanonicalTrace(paths.canonicalPath, paths.quarantinePath);
    const judgeResults = rewriteJudgeResultIndex(paths.judgeResultPath, state.events);
    return {
      traceDir: paths.traceDir,
      canonicalPath: paths.canonicalPath,
      judgeResultPath: paths.judgeResultPath,
      rebuilt: judgeResults.length,
    };
  } finally {
    releaseLock();
  }
}

async function readEventsInternal(options = {}) {
  const paths = resolveTracePaths(options);
  const releaseLock = await acquireTraceLock(paths.lockPath, options);

  try {
    return parseCanonicalTrace(paths.canonicalPath, paths.quarantinePath).events;
  } finally {
    releaseLock();
  }
}

export function createTraceSink(options = {}) {
  const state = {
    queue: Promise.resolve(),
    writerSeq: 0,
    options: { ...options },
  };
  const paths = resolveTracePaths(options);

  return {
    paths,
    appendEvent(event, appendOptions = {}) {
      const next = state.queue.then(async () => {
        state.writerSeq += 1;
        return appendEventInternal(event, { ...state.options, ...appendOptions }, state.writerSeq);
      }, async () => {
        state.writerSeq += 1;
        return appendEventInternal(event, { ...state.options, ...appendOptions }, state.writerSeq);
      });
      state.queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    rebuildJudgeResultIndex(rebuildOptions = {}) {
      const next = state.queue.then(
        () => rebuildJudgeResultIndexInternal({ ...state.options, ...rebuildOptions }),
        () => rebuildJudgeResultIndexInternal({ ...state.options, ...rebuildOptions }),
      );
      state.queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    readEvents(readOptions = {}) {
      return readEventsInternal({ ...state.options, ...readOptions });
    },
  };
}

export function createTraceEvent(baseEvent = {}, options = {}) {
  const event = {
    schema_version: 1,
    event_id: baseEvent.event_id ?? `evt-${randomUUID()}`,
    event_type: baseEvent.event_type ?? 'observation',
    task_id: baseEvent.task_id ?? options.taskId ?? 'task-unknown',
    session_id: baseEvent.session_id ?? options.sessionId ?? 'session-unknown',
    run_id: baseEvent.run_id ?? options.runId ?? 'run-unknown',
    stage: baseEvent.stage ?? 'ready/isolate',
    actor: baseEvent.actor ?? 'codex',
    summary: baseEvent.summary ?? '',
    timestamp: baseEvent.timestamp ?? new Date().toISOString(),
    payload: baseEvent.payload ?? {},
    turn_id: baseEvent.turn_id ?? null,
    span_id: baseEvent.span_id ?? null,
    action_id: baseEvent.action_id ?? null,
    source: baseEvent.source ?? 'codex',
  };
  return assertAwtlEvent({
    ...event,
    ingest_seq: Number.isInteger(baseEvent.ingest_seq) ? baseEvent.ingest_seq : 1,
    writer_seq: Number.isInteger(baseEvent.writer_seq) ? baseEvent.writer_seq : 1,
  });
}

export async function appendAwtlEvent(event, options = {}) {
  const sink = createTraceSink(options);
  return sink.appendEvent(event, options);
}

export async function rebuildJudgeResultIndex(options = {}) {
  return rebuildJudgeResultIndexInternal(options);
}

export async function readAwtlEvents(options = {}) {
  return readEventsInternal(options);
}
