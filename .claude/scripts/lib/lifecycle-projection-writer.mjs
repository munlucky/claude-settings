import fs from 'node:fs';
import path from 'node:path';

const VALID_PID_NAMESPACES = new Set(['windows', 'wsl', 'node-parent']);
const TERMINAL_EVENT_PATTERN = /_(completed|failed|blocked|recovered)$/;

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
  return ['pid', 'childPid', 'dispatcherPid', 'lastChildPid'].some((field) => (
    event[field] !== undefined || patch[field] !== undefined
  ));
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
    const next = targetPayload !== undefined
      ? targetPayload
      : event.writeMode === 'replace'
        ? event.payloadPatch
        : mergeJsonPatch(readJsonObject(target), event.payloadPatch);
    if (!isPlainObject(next)) {
      throw new TypeError(`lifecycle target payload must be an object: ${target}`);
    }
    assertLatestDispatchStatusVocabulary(event, next);
    writeJsonAtomic(target, next);
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
