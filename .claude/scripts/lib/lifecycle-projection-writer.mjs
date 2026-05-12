import fs from 'node:fs';
import path from 'node:path';

const VALID_PID_NAMESPACES = new Set(['windows', 'wsl', 'node-parent']);
const TERMINAL_EVENT_PATTERN = /_(completed|failed|blocked|recovered)$/;
const ATTEMPT_SCOPED_EVENTS = new Set([
  'preflight_passed',
  'dispatch_prepared',
  'dispatch_started',
  'dispatch_heartbeat',
  'dispatch_completed',
  'dispatch_failed',
  'dispatch_superseded',
  'terminal_blocked_published',
]);
const TERMINAL_ATTEMPT_STATES = new Set([
  'blocked',
  'completed',
  'failed',
  'superseded',
  'superseded-by-local-fallback',
  'verification_blocked',
  'runtime_unhealthy',
]);
const ACTIVE_ATTEMPT_STATES = new Set(['active', 'running', 'in_progress', 'prepared']);
const PROTECTED_TERMINAL_FIELDS = [
  'attemptOutcome',
  'completionStatus',
  'blockingStopReasonCode',
  'stopReasonDetail',
  'finalVerdict',
  'normalizedRunVerdict',
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`lifecycle event requires non-empty ${field}`);
  }
}

function normalizedPhaseNumber(value) {
  if (value === null || value === undefined || value === '') {
    throw new TypeError('lifecycle event requires phaseNumber');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError('lifecycle event phaseNumber must be numeric');
  }
  return String(value);
}

function hasPidEvidence(event) {
  const patch = event.payloadPatch || {};
  return ['pid', 'childPid', 'dispatcherPid', 'lastChildPid'].some((field) => {
    const eventValue = event[field];
    const patchValue = patch[field];
    return (eventValue !== undefined && eventValue !== '')
      || (patchValue !== undefined && patchValue !== '');
  });
}

function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return isPlainObject(parsed) ? parsed : {};
}

function mergeJsonPatch(existing, patch) {
  return {
    ...existing,
    ...patch,
  };
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
}

function isLatestDispatchTarget(filePath) {
  return path.basename(filePath) === 'latest-dispatch.json';
}

function assertLatestDispatchStatusVocabulary(event, payload) {
  if (
    event.targetStateFiles.some(isLatestDispatchTarget)
    && payload.status === event.lifecycleEvent
  ) {
    throw new TypeError('latest-dispatch.status must not store lifecycleEvent values');
  }
}

function lifecycleAttemptId(event = {}) {
  return String(event.attemptId || event.payloadPatch?.attemptId || '').trim();
}

function payloadAttemptId(payload = {}) {
  return String(payload.attemptId || payload.phaseRunLease?.attemptId || '').trim();
}

function isTerminalAttemptPayload(payload = {}) {
  const values = [
    payload.attemptOutcome,
    payload.completionStatus,
    payload.status,
    payload.phaseRunLease?.attemptOutcome,
    payload.phaseRunLease?.completionStatus,
  ].map((value) => String(value || '').trim().toLowerCase());
  return values.some((value) => TERMINAL_ATTEMPT_STATES.has(value)) || Boolean(payload.blockingStopReasonCode);
}

function preserveTerminalAttemptFields(existing = {}, next = {}, event = {}) {
  if (!isTerminalAttemptPayload(existing)) {
    return next;
  }
  const existingAttemptId = payloadAttemptId(existing);
  const incomingAttemptId = lifecycleAttemptId(event);
  if (!existingAttemptId || !incomingAttemptId || existingAttemptId !== incomingAttemptId) {
    return next;
  }

  const protectedPatch = {};
  for (const field of PROTECTED_TERMINAL_FIELDS) {
    const existingValue = existing[field];
    const nextValue = next[field];
    if (existingValue === undefined) {
      continue;
    }
    const nextState = String(nextValue || '').trim().toLowerCase();
    if (nextValue === undefined || nextValue === '' || ACTIVE_ATTEMPT_STATES.has(nextState)) {
      protectedPatch[field] = existingValue;
    }
  }
  return Object.keys(protectedPatch).length > 0 ? { ...next, ...protectedPatch } : next;
}

export function validateLifecycleTransition(rawEvent = {}) {
  if (!isPlainObject(rawEvent)) {
    throw new TypeError('lifecycle event must be an object');
  }
  assertNonEmptyString(rawEvent.source, 'source');
  assertNonEmptyString(rawEvent.primaryTargetStateFile, 'primaryTargetStateFile');
  assertNonEmptyString(rawEvent.phaseTitle, 'phaseTitle');
  assertNonEmptyString(rawEvent.status, 'status');
  assertNonEmptyString(rawEvent.lifecycleEvent, 'lifecycleEvent');
  if (!Array.isArray(rawEvent.targetStateFiles) || rawEvent.targetStateFiles.length === 0) {
    throw new TypeError('lifecycle event requires targetStateFiles[]');
  }
  for (const target of rawEvent.targetStateFiles) {
    assertNonEmptyString(target, 'targetStateFiles[] entry');
  }
  if (!rawEvent.targetStateFiles.includes(rawEvent.primaryTargetStateFile)) {
    throw new TypeError('primaryTargetStateFile must be included in targetStateFiles[]');
  }
  const phaseNumber = normalizedPhaseNumber(rawEvent.phaseNumber);
  if (!isPlainObject(rawEvent.payloadPatch)) {
    throw new TypeError('lifecycle event requires structured payloadPatch');
  }
  const writeMode = rawEvent.writeMode || 'merge';
  if (!['merge', 'replace'].includes(writeMode)) {
    throw new TypeError('lifecycle event writeMode must be merge or replace');
  }
  if (TERMINAL_EVENT_PATTERN.test(rawEvent.lifecycleEvent) && !rawEvent.completionStatus) {
    throw new TypeError('terminal lifecycle event requires completionStatus');
  }
  if (rawEvent.lifecycleEvent.endsWith('_blocked') && rawEvent.lifecycleEvent !== 'terminal_blocked_published') {
    throw new TypeError('blocked terminal lifecycle event must be terminal_blocked_published');
  }
  if (ATTEMPT_SCOPED_EVENTS.has(rawEvent.lifecycleEvent) && !lifecycleAttemptId(rawEvent)) {
    throw new TypeError(`attempt-scoped lifecycle event requires attemptId: ${rawEvent.lifecycleEvent}`);
  }
  if (hasPidEvidence(rawEvent) && !VALID_PID_NAMESPACES.has(rawEvent.pidNamespace)) {
    throw new TypeError('PID lifecycle evidence requires pidNamespace windows, wsl, or node-parent');
  }
  if (rawEvent.targetPayloads !== undefined && !isPlainObject(rawEvent.targetPayloads)) {
    throw new TypeError('targetPayloads must be an object when provided');
  }
  return {
    ...rawEvent,
    phaseNumber,
    timestamp: rawEvent.timestamp || new Date().toISOString(),
    writeMode,
  };
}

export function recordLifecycleTransition(rawEvent = {}) {
  const event = validateLifecycleTransition(rawEvent);
  const written = [];
  for (const target of event.targetStateFiles) {
    const targetPayload = event.targetPayloads?.[target];
    const existingPayload = readJsonObject(target);
    const next = targetPayload !== undefined
      ? targetPayload
      : event.writeMode === 'replace'
        ? event.payloadPatch
        : mergeJsonPatch(existingPayload, event.payloadPatch);
    const guardedNext = preserveTerminalAttemptFields(existingPayload, next, event);
    if (!isPlainObject(guardedNext)) {
      throw new TypeError(`lifecycle target payload must be an object: ${target}`);
    }
    assertLatestDispatchStatusVocabulary(event, guardedNext);
    writeJsonAtomic(target, guardedNext);
    written.push(target);
  }
  return {
    source: event.source,
    lifecycleEvent: event.lifecycleEvent,
    primaryTargetStateFile: event.primaryTargetStateFile,
    targetStateFiles: [...event.targetStateFiles],
    timestamp: event.timestamp,
    written,
  };
}
