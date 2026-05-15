import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const LEDGER_CLASSES = new Set([
  'broad_search_timeout',
  'raw_diff_output_timeout',
  'phaseRuntimeParity_timeout',
  'upstream_runtime_stall',
  'unknown_timeout',
]);

const DECISION_RESULTS = new Set([
  'do_not_retry',
  'bounded_retry',
  'route_to_long_budget',
  'stop_and_handoff',
]);

const CLASS_POLICY = Object.freeze({
  broad_search_timeout: {
    rootCause: 'diagnostic_broad_search_budget_exceeded',
    retryPolicy: 'do_not_retry_same_run; require_debug_opt_in',
    sameRunDecisionResult: 'do_not_retry',
  },
  raw_diff_output_timeout: {
    rootCause: 'unbounded_raw_diff_output_in_worker_log',
    retryPolicy: 'bounded_retry_with_diff_stat_name_only_check_or_path_limited_raw_diff',
    sameRunDecisionResult: 'bounded_retry',
    repeatedDecisionResult: 'stop_and_handoff',
  },
  phaseRuntimeParity_timeout: {
    rootCause: 'heavyweight_verifier_in_short_phase_loop',
    retryPolicy: 'do_not_retry_same_run; route_to_long_budget',
    sameRunDecisionResult: 'route_to_long_budget',
  },
  upstream_runtime_stall: {
    rootCause: 'runtime_stream_reconnect_or_stall',
    retryPolicy: 'follow_runtime_fallback_or_stop_policy',
    sameRunDecisionResult: 'stop_and_handoff',
  },
  unknown_timeout: {
    rootCause: 'timeout_classification_unresolved',
    retryPolicy: 'one_bounded_retry_then_stop_and_handoff',
    sameRunDecisionResult: 'bounded_retry',
    repeatedDecisionResult: 'stop_and_handoff',
  },
});

export const DEFAULT_TIMEOUT_LEDGER_PATH = path.join('.claude', 'logs', 'agent-loop', 'timeout-ledger.jsonl');

export function normalizeTimeoutClass(value) {
  const raw = String(value || '').trim();
  if (raw === 'codex_upstream_stream_stalled') {
    return 'upstream_runtime_stall';
  }
  if (/phaseRuntimeParity.*timeout|runtime parity.*timeout/i.test(raw)) {
    return 'phaseRuntimeParity_timeout';
  }
  return LEDGER_CLASSES.has(raw) ? raw : 'unknown_timeout';
}

export function timeoutPolicyFor(timeoutClass, { repeated = false } = {}) {
  const normalized = normalizeTimeoutClass(timeoutClass);
  const policy = CLASS_POLICY[normalized] || CLASS_POLICY.unknown_timeout;
  const sameRunDecisionResult = repeated && policy.repeatedDecisionResult
    ? policy.repeatedDecisionResult
    : policy.sameRunDecisionResult;
  return {
    class: normalized,
    rootCause: policy.rootCause,
    retryPolicy: policy.retryPolicy,
    sameRunDecisionResult,
  };
}

export function stableCommandFingerprint(input = {}) {
  const payload = {
    command: String(input.command || ''),
    timeoutClass: normalizeTimeoutClass(input.class || input.timeoutClass),
    verifierId: String(input.verifierId || ''),
    runtimeTarget: String(input.runtimeTarget || input.runtime || ''),
    referencePlanHash: String(input.referencePlanHash || ''),
  };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export function timeoutLedgerKey(record = {}) {
  return [
    String(record.runId || ''),
    String(record.phase || ''),
    String(record.commandFingerprint || ''),
    normalizeTimeoutClass(record.class),
  ].join('\u0000');
}

function readLedgerRecords(ledgerPath) {
  if (!ledgerPath || !fs.existsSync(ledgerPath)) {
    return [];
  }
  return fs.readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function hasSameRunTimeoutRecord(ledgerPath, record) {
  const key = timeoutLedgerKey(record);
  return readLedgerRecords(ledgerPath).some((entry) => timeoutLedgerKey(entry) === key);
}

export function buildTimeoutLedgerRecord(input = {}) {
  const timeoutClass = normalizeTimeoutClass(input.class || input.timeoutClass);
  const provisional = {
    runId: String(input.runId || ''),
    phase: Number.parseInt(String(input.phase ?? ''), 10),
    command: String(input.command || ''),
    commandFingerprint: String(input.commandFingerprint || ''),
    class: timeoutClass,
  };
  if (!provisional.commandFingerprint) {
    provisional.commandFingerprint = stableCommandFingerprint({
      command: provisional.command,
      class: timeoutClass,
      verifierId: input.verifierId,
      runtimeTarget: input.runtimeTarget || input.runtime,
      referencePlanHash: input.referencePlanHash,
    });
  }
  const repeated = Boolean(input.repeated);
  const policy = timeoutPolicyFor(timeoutClass, { repeated });
  const record = {
    timestamp: input.timestamp || new Date().toISOString(),
    runId: provisional.runId,
    phase: provisional.phase,
    command: provisional.command,
    commandFingerprint: provisional.commandFingerprint,
    timeoutMs: Number.parseInt(String(input.timeoutMs ?? ''), 10),
    class: policy.class,
    rootCause: input.rootCause || policy.rootCause,
    retryPolicy: input.retryPolicy || policy.retryPolicy,
    sameRunDecisionResult: input.sameRunDecisionResult || policy.sameRunDecisionResult,
    blockedVerdictPath: String(input.blockedVerdictPath || ''),
  };
  validateTimeoutLedgerRecord(record);
  return record;
}

export function validateTimeoutLedgerRecord(record = {}) {
  const required = ['timestamp', 'runId', 'phase', 'command', 'commandFingerprint', 'timeoutMs', 'class', 'rootCause', 'retryPolicy', 'sameRunDecisionResult'];
  for (const key of required) {
    const value = record[key];
    if (value === null || value === undefined || value === '') {
      throw new Error(`timeout ledger record missing ${key}`);
    }
  }
  if (!Number.isInteger(record.phase) || record.phase <= 0) {
    throw new Error('timeout ledger phase must be a positive integer');
  }
  if (!Number.isInteger(record.timeoutMs) || record.timeoutMs <= 0) {
    throw new Error('timeout ledger timeoutMs must be a positive integer');
  }
  if (!LEDGER_CLASSES.has(record.class)) {
    throw new Error(`unsupported timeout class: ${record.class}`);
  }
  if (!DECISION_RESULTS.has(record.sameRunDecisionResult)) {
    throw new Error(`unsupported sameRunDecisionResult: ${record.sameRunDecisionResult}`);
  }
  if (record.class === 'phaseRuntimeParity_timeout' && !record.blockedVerdictPath) {
    throw new Error('phaseRuntimeParity_timeout requires blockedVerdictPath');
  }
  return true;
}

export function appendTimeoutLedgerRecord(ledgerPath, record) {
  validateTimeoutLedgerRecord(record);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export function recordTimeoutDecision(input = {}) {
  const ledgerPath = input.ledgerPath || DEFAULT_TIMEOUT_LEDGER_PATH;
  const baseRecord = buildTimeoutLedgerRecord({ ...input, repeated: false });
  const repeated = hasSameRunTimeoutRecord(ledgerPath, baseRecord);
  const record = buildTimeoutLedgerRecord({ ...input, repeated });
  appendTimeoutLedgerRecord(ledgerPath, record);
  return { record, repeated, sameRunDecisionResult: record.sameRunDecisionResult };
}
