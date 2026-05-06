#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { normalizeArtifactRefs } from './awtl-harness-capture.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');
const SCHEMA_PATH = path.resolve(MODULE_DIR, '../../schemas/awtl-failed-turn-case-v1.schema.json');

export const DEFAULT_FAILED_TURN_CASE_OUTPUT = path.join(REPO_ROOT, '.claude/cache/awtl/failed_turn_cases.jsonl');

let cachedSchema = null;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadSchemaFile() {
  if (cachedSchema) {
    return cachedSchema;
  }
  cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return cachedSchema;
}

function stableCaseId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex').slice(0, 16);
  return `awtl-failed-turn-case-${digest}`;
}

function buildPreventionHint(attribution = {}, options = {}) {
  const failureType = toText(attribution?.failureTypeInfo?.failure_type, 'verification_failure');
  const failureClass = toText(attribution?.failureTypeInfo?.failure_class, 'verification');
  const artifactRefs = uniqueStrings(attribution?.failedArtifactRefs ?? []);
  const memoryReadNodeIds = uniqueStrings(attribution?.memoryReadNodeIds ?? []);
  const blockHint = failureType === 'verification_failure' && failureClass === 'verification'
    ? 'Keep the retry narrow and deterministic.'
    : `Treat this as a ${failureClass} blocker until the surrounding condition is cleared.`;
  const artifactClause = artifactRefs.length > 0
    ? `the same artifact set (${artifactRefs.join(', ')})`
    : 'the same artifact set';
  const memoryClause = memoryReadNodeIds.length > 0
    ? ` and re-read memory nodes ${memoryReadNodeIds.join(', ')}`
    : '';
  const scopeClause = toText(options.scope, 'next-run recall');

  return `For ${scopeClause}, rerun the failing verifier against ${artifactClause}${memoryClause}; confirm the same turn still reproduces before promotion. ${blockHint}`;
}

function buildApplicability(attribution = {}, options = {}) {
  const failureEvent = isPlainObject(attribution.failureEvent) ? attribution.failureEvent : {};
  const turnId = toText(options.turnId ?? attribution.failureTurnId ?? failureEvent.turn_id ?? failureEvent.turnId, '');
  const applicability = {
    scope: toText(options.scope, 'next-run recall'),
    run_id: toText(options.runId ?? attribution.runId ?? failureEvent.run_id, ''),
    trace_id: toText(options.traceId ?? attribution.traceId ?? '', ''),
    failure_type: toText(attribution?.failureTypeInfo?.failure_type, 'verification_failure'),
    failure_class: toText(attribution?.failureTypeInfo?.failure_class, 'verification'),
  };

  if (typeof options.confidence === 'number') {
    applicability.confidence = options.confidence;
  }

  return applicability;
}

function buildEvidenceRefs(attribution = {}, turnId = '') {
  const evidence = new Set();
  if (attribution?.failureEvent?.event_id) {
    evidence.add(`trace:event:${attribution.failureEvent.event_id}`);
  }
  if (turnId) {
    evidence.add(`trace:turn:${turnId}`);
  }
  for (const ref of attribution?.evidenceRefs ?? []) {
    evidence.add(toText(ref, ''));
  }
  for (const ref of attribution?.failedArtifactRefs ?? []) {
    evidence.add(ref);
  }
  for (const nodeId of attribution?.memoryReadNodeIds ?? []) {
    evidence.add(`memory:node:${nodeId}`);
  }
  return [...evidence].filter(Boolean);
}

function buildCaseId({ turnId, failureEventId, artifactRefs, memoryReadNodeIds, preventionHint }) {
  return stableCaseId({
    turn_id: toText(turnId, ''),
    failure_event_id: toText(failureEventId, ''),
    artifact_refs: uniqueStrings(artifactRefs ?? []),
    memory_read_node_ids: uniqueStrings(memoryReadNodeIds ?? []),
    prevention_hint: toText(preventionHint, ''),
  });
}

export function getFailedTurnCaseSchema() {
  return loadSchemaFile();
}

export function buildFailedTurnCase(attribution = {}, options = {}) {
  if (!attribution || !attribution.failureEvent) {
    throw new Error('attribution.failureEvent is required');
  }

  const failureEvent = attribution.failureEvent;
  const turnId = toText(options.turnId ?? attribution.failureTurnId ?? failureEvent.turn_id ?? failureEvent.turnId, '');
  const failureEventId = toText(failureEvent.event_id, '');
  const artifactRefs = normalizeArtifactRefs(attribution.failedArtifactRefs ?? failureEvent.payload?.artifact_refs ?? [], options.repoRoot ?? REPO_ROOT);
  const memoryReadNodeIds = uniqueStrings(attribution.memoryReadNodeIds ?? []);
  const preventionHint = buildPreventionHint(attribution, {
    scope: options.scope,
  });
  const evidenceRefs = buildEvidenceRefs(attribution, turnId);

  return {
    schema_version: 1,
    case_id: buildCaseId({
      turnId,
      failureEventId,
      artifactRefs,
      memoryReadNodeIds,
      preventionHint,
    }),
    created_at: toText(options.createdAt ?? new Date().toISOString(), new Date().toISOString()),
    turn_id: turnId,
    failure_turn_id: turnId,
    failure_event_id: failureEventId,
    artifact_refs: artifactRefs,
    memory_read_node_ids: memoryReadNodeIds,
    prevention_hint: preventionHint,
    applicability: buildApplicability(attribution, {
      scope: options.scope,
      runId: options.runId,
      traceId: options.traceId,
      confidence: options.confidence,
      turnId,
    }),
    evidence_refs: evidenceRefs,
  };
}

export function validateFailedTurnCase(caseValue = {}) {
  const schema = loadSchemaFile();
  const errors = [];

  if (!isPlainObject(caseValue)) {
    return { ok: false, errors: ['case must be an object'], schema };
  }

  for (const field of schema.required || []) {
    if (!(field in caseValue)) {
      errors.push(`${field} is required`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(caseValue)) {
      if (!Object.hasOwn(schema.properties, key)) {
        errors.push(`${key} is not allowed`);
      }
    }
  }

  if (caseValue.schema_version !== 1) {
    errors.push('schema_version must be 1');
  }
  if (typeof caseValue.case_id !== 'string' || caseValue.case_id.length === 0) {
    errors.push('case_id must be a non-empty string');
  }
  if (typeof caseValue.created_at !== 'string' || Number.isNaN(Date.parse(caseValue.created_at))) {
    errors.push('created_at must be an RFC 3339 date-time string');
  }
  if (typeof caseValue.turn_id !== 'string' || caseValue.turn_id.length === 0) {
    errors.push('turn_id must be a non-empty string');
  }
  if (typeof caseValue.failure_turn_id !== 'string' || caseValue.failure_turn_id.length === 0) {
    errors.push('failure_turn_id must be a non-empty string');
  }
  if (caseValue.turn_id !== caseValue.failure_turn_id) {
    errors.push('turn_id and failure_turn_id must match');
  }
  if (typeof caseValue.failure_event_id !== 'string' || caseValue.failure_event_id.length === 0) {
    errors.push('failure_event_id must be a non-empty string');
  }
  if (!Array.isArray(caseValue.artifact_refs) || caseValue.artifact_refs.length === 0 || caseValue.artifact_refs.some((value) => typeof value !== 'string' || value.length === 0)) {
    errors.push('artifact_refs must be a non-empty array of strings');
  }
  if (!Array.isArray(caseValue.memory_read_node_ids) || caseValue.memory_read_node_ids.some((value) => typeof value !== 'string' || value.length === 0)) {
    errors.push('memory_read_node_ids must be an array of strings');
  }
  if (typeof caseValue.prevention_hint !== 'string' || caseValue.prevention_hint.length === 0) {
    errors.push('prevention_hint must be a non-empty string');
  }
  if (!isPlainObject(caseValue.applicability)) {
    errors.push('applicability must be an object');
  } else {
    for (const key of Object.keys(caseValue.applicability)) {
      if (!Object.hasOwn(schema.properties.applicability.properties, key)) {
        errors.push(`applicability.${key} is not allowed`);
      }
    }
    if (typeof caseValue.applicability.scope !== 'string' || caseValue.applicability.scope.length === 0) {
      errors.push('applicability.scope must be a non-empty string');
    }
    if (typeof caseValue.applicability.run_id !== 'string' || caseValue.applicability.run_id.length === 0) {
      errors.push('applicability.run_id must be a non-empty string');
    }
    if (typeof caseValue.applicability.trace_id !== 'string' || caseValue.applicability.trace_id.length === 0) {
      errors.push('applicability.trace_id must be a non-empty string');
    }
    if (typeof caseValue.applicability.failure_type !== 'string' || caseValue.applicability.failure_type.length === 0) {
      errors.push('applicability.failure_type must be a non-empty string');
    }
    if (typeof caseValue.applicability.failure_class !== 'string' || caseValue.applicability.failure_class.length === 0) {
      errors.push('applicability.failure_class must be a non-empty string');
    }
    if ('confidence' in caseValue.applicability && caseValue.applicability.confidence !== null && (typeof caseValue.applicability.confidence !== 'number' || caseValue.applicability.confidence < 0 || caseValue.applicability.confidence > 1)) {
      errors.push('applicability.confidence must be a number between 0 and 1 when present');
    }
  }
  if (!Array.isArray(caseValue.evidence_refs) || caseValue.evidence_refs.length === 0 || caseValue.evidence_refs.some((value) => typeof value !== 'string' || value.length === 0)) {
    errors.push('evidence_refs must be a non-empty array of strings');
  }

  return {
    ok: errors.length === 0,
    errors,
    schema,
  };
}

export function assertFailedTurnCase(caseValue = {}) {
  const result = validateFailedTurnCase(caseValue);
  if (!result.ok) {
    const error = new Error(`Invalid failed turn case: ${result.errors.join('; ')}`);
    error.errors = result.errors;
    throw error;
  }
  return caseValue;
}

export function writeFailedTurnCasesJsonl(outputPath, cases = [], options = {}) {
  const filePath = path.resolve(outputPath);
  ensureDir(filePath);
  const writeMode = options.append === false ? 'w' : 'a';
  const lines = [];

  for (const caseValue of cases) {
    const checked = assertFailedTurnCase(caseValue);
    lines.push(`${JSON.stringify(checked)}\n`);
  }

  fs.writeFileSync(filePath, lines.join(''), { encoding: 'utf8', flag: writeMode });
  return {
    outputPath: filePath,
    count: cases.length,
  };
}
