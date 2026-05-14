import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_STATE_HEADERS = Object.freeze([
  'stateRunId',
  'transitionId',
  'projectionStatus',
  'planDir',
  'statusFile',
  'status',
  'phase',
  'attempt',
  'owner',
  'reason',
  'runRoot',
  'updated',
]);

const ALLOWED_STATUSES = new Set(['active', 'blocked', 'complete', 'cancelled']);
const TERMINAL_STATUSES = new Set(['complete', 'cancelled']);
const ACTIVE_COMPATIBILITY_FIELDS = [
  'activePhaseDoc',
  'activePhaseDocPath',
  'activePhaseNumber',
  'activePhaseTitle',
  'activeExecutionStatus',
  'completionStatus',
  'attemptOutcome',
  'dispatchStage',
];
const TERMINAL_COMPATIBILITY_FIELDS = [
  'stopReasonCode',
  'rawStopReasonCode',
  'blockingStopReasonCode',
  'stopReasonDetail',
  'blockedAt',
  'completedAt',
  'cancelledAt',
  'finalVerdict',
  'normalizedRunVerdict',
];

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function nonEmpty(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new TypeError(`simple run state requires ${field}`);
  }
  return normalized;
}

function stableId(parts) {
  return crypto.createHash('sha1').update(parts.map((part) => String(part ?? '')).join('\u0000')).digest('hex').slice(0, 16);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeHeaderValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'unknown';
  }
  return String(value).replace(/\r?\n/g, ' ').trim();
}

function resolveStatePath(options = {}) {
  if (options.statePath) {
    return options.statePath;
  }
  const stateRunId = nonEmpty(options.stateRunId, 'stateRunId or statePath');
  return path.join(resolveRunRoot(stateRunId, options), 'STATE.md');
}

function normalizeState(input = {}, options = {}) {
  const stateRunId = normalizeHeaderValue(input.stateRunId ?? options.stateRunId);
  const transitionId = normalizeHeaderValue(input.transitionId ?? options.transitionId ?? stableId([stateRunId, input.status, input.attempt, nowIso()]));
  const runRoot = normalizeHeaderValue(input.runRoot ?? options.runRoot ?? resolveRunRoot(stateRunId, options));
  return {
    stateRunId,
    transitionId,
    projectionStatus: normalizeHeaderValue(input.projectionStatus ?? 'committed'),
    planDir: normalizeHeaderValue(input.planDir ?? options.planDir),
    statusFile: normalizeHeaderValue(input.statusFile ?? options.statusFile),
    status: normalizeHeaderValue(input.status),
    phase: normalizeHeaderValue(input.phase ?? options.phase),
    attempt: normalizeHeaderValue(input.attempt ?? options.attempt),
    owner: normalizeHeaderValue(input.owner ?? options.owner),
    reason: normalizeHeaderValue(input.reason ?? options.reason),
    runRoot,
    updated: normalizeHeaderValue(input.updated ?? options.updated ?? nowIso()),
  };
}

export function resolveRunRoot(stateRunId, { rootDir = process.cwd(), runRoot } = {}) {
  if (runRoot) {
    return runRoot;
  }
  return path.join(rootDir, '.claude', 'logs', 'simple-run-state', nonEmpty(stateRunId, 'stateRunId'));
}

export function formatStateMarkdown(state, { body = '' } = {}) {
  const normalized = normalizeState(state);
  const lines = [
    '# Simple Run State',
    '',
    ...REQUIRED_STATE_HEADERS.map((header) => `${header}: ${normalized[header]}`),
    '',
  ];
  if (body) {
    lines.push(String(body).replace(/\r\n/g, '\n').trimEnd(), '');
  }
  return `${lines.join('\n')}`;
}

export function parseStateMarkdown(text) {
  const headers = {};
  const diagnostics = [];
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) {
      continue;
    }
    headers[match[1]] = match[2].trim() || 'unknown';
  }

  for (const header of REQUIRED_STATE_HEADERS) {
    if (!Object.prototype.hasOwnProperty.call(headers, header)) {
      headers[header] = 'unknown';
      diagnostics.push({ type: 'missing_required_header', header });
    }
  }

  if (!ALLOWED_STATUSES.has(headers.status)) {
    diagnostics.push({ type: 'invalid_status', status: headers.status });
  }
  if (!['pending', 'committed', 'unknown'].includes(headers.projectionStatus)) {
    diagnostics.push({ type: 'invalid_projection_status', projectionStatus: headers.projectionStatus });
  }

  return {
    state: normalizeState(headers),
    diagnostics,
  };
}

export function classifyStartupState(readResult) {
  if (!readResult?.exists) {
    return 'resume-state-missing';
  }
  if (readResult.state?.projectionStatus === 'pending') {
    return 'incomplete_transaction';
  }
  if (['active', 'blocked'].includes(readResult.state?.status)) {
    return 'resume-required';
  }
  return 'clean_start';
}

export function readState(options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const statePath = resolveStatePath(options);
  if (!fsImpl.existsSync(statePath)) {
    return {
      exists: false,
      statePath,
      state: null,
      diagnostics: [{ type: 'missing_state_file', statePath }],
      startupClassification: 'resume-state-missing',
    };
  }

  const parsed = parseStateMarkdown(fsImpl.readFileSync(statePath, 'utf8'));
  const result = {
    exists: true,
    statePath,
    state: parsed.state,
    diagnostics: parsed.diagnostics,
  };
  return {
    ...result,
    startupClassification: classifyStartupState(result),
  };
}

export function writeState(state, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const statePath = resolveStatePath({ ...options, stateRunId: state.stateRunId, runRoot: state.runRoot });
  fsImpl.mkdirSync(path.dirname(statePath), { recursive: true });
  fsImpl.writeFileSync(statePath, formatStateMarkdown(state, { body: options.body }), 'utf8');
  return { statePath, state: normalizeState(state, options) };
}

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function readJsonFile(filePath, code) {
  if (!fs.existsSync(filePath)) {
    const error = new Error(`${code}: ${filePath}`);
    error.code = code;
    throw error;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function jsonlHasRecord(filePath, predicate) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .some((line) => {
      try {
        return predicate(JSON.parse(line));
      } catch {
        return false;
      }
    });
}

export function resolveReconciliationIntentPath(stateRunId, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const runsRoot = options.runsRoot ?? path.join(rootDir, 'runs');
  return path.join(runsRoot, nonEmpty(stateRunId, 'stateRunId'), 'reconciliation-intent.json');
}

export function readReconciliationIntent(stateRunId, options = {}) {
  const primaryPath = options.intentPath ?? resolveReconciliationIntentPath(stateRunId, options);
  if (fs.existsSync(primaryPath)) {
    return {
      intent: readJsonFile(primaryPath, 'invalid_reconciliation_intent'),
      intentPath: primaryPath,
      source: 'run_scoped',
    };
  }

  if (options.globalIntentPath && fs.existsSync(options.globalIntentPath)) {
    const intent = readJsonFile(options.globalIntentPath, 'invalid_reconciliation_intent');
    if (String(intent.stateRunId || '').trim() !== String(stateRunId).trim()) {
      const error = new Error(`reconciliation intent stateRunId mismatch: ${intent.stateRunId || 'unknown'} != ${stateRunId}`);
      error.code = 'reconciliation_intent_state_run_mismatch';
      throw error;
    }
    return {
      intent,
      intentPath: options.globalIntentPath,
      source: 'global_alias',
    };
  }

  const error = new Error(`missing reconciliation intent for stateRunId: ${stateRunId}`);
  error.code = 'missing_reconciliation_intent';
  throw error;
}

export function validateReconciliationIntent(options = {}) {
  const stateRunId = nonEmpty(options.stateRunId, 'stateRunId');
  const transactionId = nonEmpty(options.transactionId, 'transactionId');
  const blockerEvidenceId = nonEmpty(options.blockerEvidenceId, 'blockerEvidenceId');
  const projectionManifestPath = nonEmpty(options.projectionManifestPath, 'projectionManifestPath');
  const blockerEvidencePath = nonEmpty(options.blockerEvidencePath, 'blockerEvidencePath');
  const { intent, intentPath, source } = readReconciliationIntent(stateRunId, options);

  const expected = {
    stateRunId,
    transactionId,
    blockerEvidenceId,
    projectionManifestSha256: sha256File(projectionManifestPath),
  };
  const actual = {
    stateRunId: String(intent.stateRunId || '').trim(),
    transactionId: String(intent.transactionId || '').trim(),
    blockerEvidenceId: String(intent.blockerEvidenceId || '').trim(),
    projectionManifestSha256: String(intent.projectionManifestSha256 || '').trim(),
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (actual[field] !== expectedValue) {
      const error = new Error(`reconciliation intent ${field} mismatch: ${actual[field] || 'unknown'} != ${expectedValue}`);
      error.code = `reconciliation_intent_${field}_mismatch`;
      throw error;
    }
  }
  if (!jsonlHasRecord(blockerEvidencePath, (record) => record.id === blockerEvidenceId)) {
    const error = new Error(`reconciliation intent blockerEvidenceId not found: ${blockerEvidenceId}`);
    error.code = 'reconciliation_intent_blocker_evidence_missing';
    throw error;
  }
  const manifest = readJsonFile(projectionManifestPath, 'missing_projection_manifest');
  if (!Array.isArray(manifest.blockerEvidenceIds) || !manifest.blockerEvidenceIds.includes(blockerEvidenceId)) {
    const error = new Error(`projection manifest missing blockerEvidenceId: ${blockerEvidenceId}`);
    error.code = 'projection_manifest_blocker_evidence_mismatch';
    throw error;
  }
  if (String(manifest.transactionId || '').trim() !== transactionId) {
    const error = new Error(`projection manifest transactionId mismatch: ${manifest.transactionId || 'unknown'} != ${transactionId}`);
    error.code = 'projection_manifest_transaction_mismatch';
    throw error;
  }

  return {
    ok: true,
    intent,
    intentPath,
    source,
    projectionManifestSha256: expected.projectionManifestSha256,
  };
}

export function assertCanTransition(previous, next, options = {}) {
  if (!next || !ALLOWED_STATUSES.has(next.status)) {
    throw new TypeError(`unsupported next state status: ${next?.status ?? 'unknown'}`);
  }
  if (!previous) {
    return true;
  }
  if (TERMINAL_STATUSES.has(previous.status) && next.status === 'active') {
    throw new Error(`unsafe transition rejected: ${previous.status} -> active`);
  }
  const sameAttemptBlockedRestart = previous.status === 'blocked'
    && next.status === 'active'
    && String(previous.attempt ?? '') === String(next.attempt ?? '');
  if (sameAttemptBlockedRestart) {
    if (!options.reconciliationIntentOptions) {
      throw new Error('unsafe transition rejected: blocked -> active requires a new attempt or reconciliation intent');
    }
    validateReconciliationIntent(options.reconciliationIntentOptions);
  }
  return true;
}

export function withStateTransition(nextState, options = {}, writeProjectionsFn = () => {}) {
  const current = readState(options);
  const previous = current.exists ? current.state : null;
  const transitionId = nextState.transitionId ?? stableId([nextState.stateRunId ?? options.stateRunId, nextState.status, nextState.attempt, nowIso()]);
  const pendingState = normalizeState({
    ...nextState,
    transitionId,
    projectionStatus: 'pending',
    updated: options.updated ?? nowIso(),
  }, options);

  assertCanTransition(previous, pendingState, options);
  writeState(pendingState, options);

  const commit = (projectionResult) => {
    const committedState = normalizeState({
      ...pendingState,
      projectionStatus: 'committed',
      updated: options.committedAt ?? nowIso(),
    }, options);
    writeState(committedState, options);
    return {
      state: committedState,
      previous,
      transitionId,
      projectionResult,
      statePath: resolveStatePath({ ...options, stateRunId: committedState.stateRunId, runRoot: committedState.runRoot }),
    };
  };

  const projectionResult = writeProjectionsFn(pendingState);
  return isPromiseLike(projectionResult)
    ? projectionResult.then(commit)
    : commit(projectionResult);
}

export function scrubCompatibilityProjection(payload = {}, state = {}, { targetKind = 'generic', previousPayload = {} } = {}) {
  const next = { ...previousPayload, ...payload };
  const status = String(state.status ?? next.status ?? '').trim();
  next.status = status || 'unknown';
  next.phaseNumber = state.phase ?? next.phaseNumber;
  next.attemptId = state.attempt ?? next.attemptId;
  next.updatedAt = state.updated ?? next.updatedAt;
  next.projectionStatus = state.projectionStatus ?? next.projectionStatus;
  next.targetKind = targetKind;

  if (status === 'blocked') {
    next.activeExecutionStatus = 'blocked';
    next.completionStatus = 'blocked';
    next.attemptOutcome = 'blocked';
    next.childAlive = false;
    if (next.liveness && typeof next.liveness === 'object' && !Array.isArray(next.liveness)) {
      next.liveness = { ...next.liveness, childAlive: false };
    }
    next.dispatchStage = 'terminal_blocked';
    next.stopReasonCode = state.reason ?? next.stopReasonCode ?? 'blocked';
    next.rawStopReasonCode = next.stopReasonCode;
    next.blockingStopReasonCode = next.stopReasonCode;
    next.stopReasonDetail = next.stopReasonDetail ?? state.reason ?? 'blocked';
    next.blockedAt = state.updated ?? next.blockedAt;
  } else if (status === 'active') {
    next.activeExecutionStatus = 'active';
    next.completionStatus = 'in_progress';
    next.attemptOutcome = 'in_progress';
    next.dispatchStage = 'execute';
    for (const field of TERMINAL_COMPATIBILITY_FIELDS) {
      delete next[field];
    }
  } else if (TERMINAL_STATUSES.has(status)) {
    for (const field of ACTIVE_COMPATIBILITY_FIELDS) {
      delete next[field];
    }
    next.completionStatus = status === 'complete' ? 'completed' : status;
    next.attemptOutcome = next.completionStatus;
    next.childAlive = false;
    if (next.liveness && typeof next.liveness === 'object' && !Array.isArray(next.liveness)) {
      next.liveness = { ...next.liveness, childAlive: false };
    }
    next.finalVerdict = status;
    next.normalizedRunVerdict = status;
    next[status === 'complete' ? 'completedAt' : 'cancelledAt'] = state.updated ?? next.updatedAt;
  }

  return next;
}
