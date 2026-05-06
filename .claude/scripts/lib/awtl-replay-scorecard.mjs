#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');

export const DEFAULT_REPLAY_SCORECARD_OUTPUT = path.join(REPO_ROOT, '.claude/cache/awtl/replay_scorecard.jsonl');

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

function normalizeStatus(value) {
  const text = toText(value, '').toLowerCase();
  if (!text) {
    return 'recorded';
  }
  if (['promoted', 'written', 'success', 'passed', 'ok'].includes(text)) {
    return 'promoted';
  }
  if (['blocked', 'skip', 'skipped', 'unavailable', 'denied'].includes(text)) {
    return text === 'skip' ? 'skipped' : text;
  }
  if (['stale', 'risky'].includes(text)) {
    return text;
  }
  return text;
}

function normalizeDecision(value) {
  const text = toText(value, '').toLowerCase();
  if (!text) {
    return 'recorded';
  }
  if (['promote', 'write', 'store', 'accept', 'approved'].includes(text)) {
    return 'promote';
  }
  if (['skip', 'deny', 'blocked', 'reject', 'unavailable'].includes(text)) {
    return text;
  }
  return text;
}

function recordKeys(record = {}) {
  return uniqueStrings([
    record.record_id,
    record.recordId,
    record.case_id,
    record.caseId,
    record.candidate_id,
    record.candidateId,
    record.failure_turn_id,
    record.failureTurnId,
    record.run_id,
    record.runId,
    record.trace_id,
    record.traceId,
  ]);
}

export function buildReplayScorecardRecord(input = {}, options = {}) {
  const createdAt = toText(input.created_at ?? input.createdAt ?? options.createdAt ?? new Date().toISOString(), new Date().toISOString());
  const status = normalizeStatus(input.status ?? input.result ?? input.outcome ?? input.decision_status);
  const decision = normalizeDecision(input.decision ?? input.action ?? input.result ?? status);
  const denialCodes = uniqueStrings(input.denial_codes ?? input.denialCodes ?? []);
  const appliesTo = uniqueStrings(input.applies_to ?? input.appliesTo ?? []);
  const doesNotApplyTo = uniqueStrings(input.does_not_apply_to ?? input.doesNotApplyTo ?? []);
  const validatedBy = toText(input.validated_by ?? input.validatedBy ?? options.validatedBy ?? 'replay', 'replay');
  const lastValidatedAt = toText(input.last_validated_at ?? input.lastValidatedAt ?? options.lastValidatedAt ?? createdAt, createdAt);

  return {
    schema_version: 1,
    record_id: toText(input.record_id ?? input.recordId ?? options.recordId ?? `${toText(input.candidate_id ?? input.candidateId ?? input.case_id ?? input.caseId, 'replay')}:${createdAt}`),
    created_at: createdAt,
    status,
    decision,
    candidate_id: toText(input.candidate_id ?? input.candidateId ?? '', ''),
    case_id: toText(input.case_id ?? input.caseId ?? '', ''),
    run_id: toText(input.run_id ?? input.runId ?? '', ''),
    trace_id: toText(input.trace_id ?? input.traceId ?? '', ''),
    failure_turn_id: toText(input.failure_turn_id ?? input.failureTurnId ?? '', ''),
    validated_by: validatedBy,
    last_validated_at: lastValidatedAt,
    memory_graph_status: toText(input.memory_graph_status ?? input.memoryGraphStatus ?? '', ''),
    replay_status: toText(input.replay_status ?? input.replayStatus ?? '', ''),
    risk_level: toText(input.risk_level ?? input.riskLevel ?? '', ''),
    denial_codes: denialCodes,
    applies_to: appliesTo,
    does_not_apply_to: doesNotApplyTo,
    evidence_refs: uniqueStrings(input.evidence_refs ?? input.evidenceRefs ?? []),
    notes: toText(input.notes ?? '', ''),
  };
}

export function appendReplayScorecardRecord(outputPath, input = {}, options = {}) {
  const filePath = path.resolve(outputPath);
  ensureDir(filePath);
  const record = buildReplayScorecardRecord(input, options);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return {
    outputPath: filePath,
    record,
  };
}

export function loadReplayScorecardRecords(scorecardPath = DEFAULT_REPLAY_SCORECARD_OUTPUT) {
  const resolvedPath = path.resolve(scorecardPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      scorecardPath: resolvedPath,
      loaded: false,
      records: [],
      warnings: ['scorecard-missing'],
    };
  }

  const records = [];
  const warnings = [];
  const rawLines = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/);
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (!isPlainObject(parsed)) {
        warnings.push('invalid-scorecard-entry');
        continue;
      }
      records.push(buildReplayScorecardRecord(parsed));
    } catch (error) {
      warnings.push(`unparseable-line:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    scorecardPath: resolvedPath,
    loaded: true,
    records,
    warnings,
  };
}

export function buildReplayScorecardIndex(records = []) {
  const index = new Map();
  for (const record of records) {
    for (const key of recordKeys(record)) {
      index.set(key, record);
    }
  }
  return index;
}

export function readLatestReplayScorecardRecord(source = DEFAULT_REPLAY_SCORECARD_OUTPUT, query = {}) {
  const loaded = Array.isArray(source)
    ? { loaded: true, records: source, warnings: [], scorecardPath: '' }
    : loadReplayScorecardRecords(source);
  const index = buildReplayScorecardIndex(loaded.records);
  const queryKeys = uniqueStrings([
    query.record_id ?? query.recordId,
    query.case_id ?? query.caseId,
    query.candidate_id ?? query.candidateId,
    query.failure_turn_id ?? query.failureTurnId,
    query.run_id ?? query.runId,
    query.trace_id ?? query.traceId,
  ]);

  for (const key of queryKeys) {
    if (index.has(key)) {
      return index.get(key);
    }
  }

  return null;
}

export function isReplayScorecardStaleOrRisky(record = {}) {
  const status = normalizeStatus(record.status ?? record.result ?? record.outcome);
  const riskLevel = toText(record.risk_level ?? record.riskLevel ?? '', '').toLowerCase();
  return ['stale', 'risky'].includes(status) || ['stale', 'risky'].includes(riskLevel);
}

export function isReplayScorecardExcluded(record = {}) {
  const status = normalizeStatus(record.status ?? record.result ?? record.outcome);
  return isReplayScorecardStaleOrRisky(record) || ['blocked', 'skipped', 'unavailable', 'denied'].includes(status);
}
