import { readFile } from 'node:fs/promises';

export const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|password\s*=|token\s*=|api[_-]?key\s*=|x-api-key\s*:|Authorization\s*:\s*Bearer\s+)/i;
export const RAW_CONTENT_KEY_PATTERN = /(?:raw(?:log|logs|body|content|output|prompt|transcript|scrape)|promptarchive|browser(?:scrape|dump)|memorygraphdump|kgdump|ontologydump|transcript)/i;
export const RAW_BODY_MARKER_PATTERN = /(?:^|\n)\s*(?:raw log|raw transcript|begin transcript|stdout|stderr|console|traceback|stack trace|user|assistant|system|tool)\s*:/i;
export const MAX_RETRO_STRING_LENGTH = 1000;
export const RETRO_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TOP_LEVEL_FIELDS = [
  'schemaVersion',
  'projectId',
  'taskId',
  'date',
  'sourceRepo',
  'sourceBranch',
  'commitSha',
  'status',
  'score',
  'execution',
  'failureClasses',
  'reviewFindings',
  'changedFiles',
  'evidence',
  'candidateLessons',
  'redactions',
  'promotionAuthority',
];

export function assertSafeRetroPayload(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (SECRET_PATTERN.test(text)) {
    throw new Error('retro payload rejected unsafe secret-like content');
  }
  assertNoRawRetroContent(payload);
}

function assertNoRawRetroContent(value, pointer = '$') {
  if (typeof value === 'string') {
    if (value.length > MAX_RETRO_STRING_LENGTH) {
      throw new Error(`retro payload rejected oversized string at ${pointer}`);
    }
    if (RAW_BODY_MARKER_PATTERN.test(value)) {
      throw new Error(`retro payload rejected raw body marker at ${pointer}`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawRetroContent(entry, `${pointer}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^A-Za-z0-9]/g, '');
    const isRedactionFlag = pointer === '$.redactions' && key === 'rawLogsCopied';
    if (!isRedactionFlag && RAW_CONTENT_KEY_PATTERN.test(normalizedKey)) {
      throw new Error(`retro payload rejected raw content field: ${pointer}.${key}`);
    }
    assertNoRawRetroContent(entry, `${pointer}.${key}`);
  }
}

export function normalizeStatus(value) {
  const upper = String(value || '').toUpperCase();
  if (['FULL', 'PASS', 'PASSED', 'COMPLETE'].includes(upper)) return 'FULL';
  if (['PARTIAL', 'DEGRADED', 'WARN', 'WARNING'].includes(upper)) return 'PARTIAL';
  if (['NO', 'FAIL', 'FAILED', 'BLOCKED'].includes(upper)) return 'NO';
  return 'PARTIAL';
}

export function normalizeScorePayload(payload = {}) {
  const rawTotal = payload.total ?? payload.score ?? payload.normalizedScore ?? payload.summary?.total ?? null;
  const total = Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : null;
  const rawStatus = payload.status ?? payload.summary?.status ?? '';
  const status = rawStatus ? normalizeStatus(rawStatus) : 'UNKNOWN';
  const hardGatesPassed = payload.hardGatesPassed === true
    || payload.hardGates?.passed === true
    || status === 'FULL';
  return { total, status, hardGatesPassed };
}

export function normalizeReviewFindings(payload = {}) {
  const findings = payload.reviewFindings || payload.findings || {};
  return {
    critical: Number(findings.critical || payload.critical || 0),
    important: Number(findings.important || findings.high || payload.important || 0),
    minor: Number(findings.minor || findings.low || payload.minor || 0),
  };
}

export function normalizeFailureClasses(...payloads) {
  const values = payloads.flatMap((payload = {}) => [
    payload.failureClass,
    ...(payload.failureClasses || []),
    ...(payload.failures || []).map((entry) => entry.failureClass || entry.class),
  ]);
  return [...new Set(values.filter(Boolean).map((value) => String(value)))].sort();
}

export async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error('--date must be YYYY-MM-DD');
  }
}

export function validateRetroIdentifier(value, name) {
  if (!RETRO_IDENTIFIER_PATTERN.test(String(value || ''))) {
    throw new Error(`${name} must match ${RETRO_IDENTIFIER_PATTERN}`);
  }
}

export function validateCollectRecord(record) {
  const required = [
    'schemaVersion',
    'projectId',
    'taskId',
    'date',
    'status',
    'score',
    'execution',
    'failureClasses',
    'reviewFindings',
    'evidence',
    'candidateLessons',
    'redactions',
    'promotionAuthority',
  ];
  for (const field of required) {
    if (!(field in record)) throw new Error(`collect record missing required field: ${field}`);
  }
  assertAllowedKeys(record, TOP_LEVEL_FIELDS, '$');
  if (record.schemaVersion !== 'retro.collect.v1') throw new Error('unsupported collect schemaVersion');
  if (!record.projectId || !record.taskId) throw new Error('collect record projectId and taskId are required');
  validateRetroIdentifier(record.projectId, 'projectId');
  validateRetroIdentifier(record.taskId, 'taskId');
  validateDate(record.date);
  if (!['FULL', 'PARTIAL', 'NO'].includes(record.status)) throw new Error(`invalid collect status: ${record.status}`);
  validateScore(record.score);
  validateExecution(record.execution);
  validateFailureClasses(record.failureClasses);
  validateReviewFindings(record.reviewFindings);
  validateChangedFiles(record.changedFiles);
  validateEvidence(record.evidence);
  validateCandidateLessons(record.candidateLessons);
  if (record.promotionAuthority !== false) throw new Error('collect record promotionAuthority must be false');
  if (record.redactions?.rawLogsCopied !== false || record.redactions?.secretsDetected !== false) {
    throw new Error('collect record redactions must confirm raw logs and secrets were not copied');
  }
  assertAllowedKeys(record.redactions, ['rawLogsCopied', 'secretsDetected'], '$.redactions');
  assertSafeRetroPayload(record);
  return record;
}

export function validateImprovementCandidate(candidate) {
  assertAllowedKeys(candidate, [
    'id',
    'title',
    'priority',
    'targetArea',
    'expectedImpact',
    'risk',
    'evidencePatternIds',
    'mapsToSchema',
    'promotionAuthority',
  ], '$.candidate');
  validateRetroIdentifier(candidate.id, 'candidate.id');
  for (const field of ['title', 'targetArea', 'expectedImpact', 'risk']) {
    if (!candidate[field] || typeof candidate[field] !== 'string') {
      throw new Error(`candidate.${field} must be a non-empty string`);
    }
  }
  if (!['P0', 'P1', 'P2', 'P3'].includes(candidate.priority)) {
    throw new Error(`candidate.priority is invalid: ${candidate.priority}`);
  }
  if (!Array.isArray(candidate.evidencePatternIds) || candidate.evidencePatternIds.length === 0) {
    throw new Error('candidate.evidencePatternIds must contain at least one pattern id');
  }
  if (candidate.evidencePatternIds.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error('candidate.evidencePatternIds entries must be non-empty strings');
  }
  if (candidate.mapsToSchema !== 'schemas/improvement-candidate-v1.schema.json') {
    throw new Error('candidate.mapsToSchema is invalid');
  }
  if (candidate.promotionAuthority !== false) {
    throw new Error('candidate.promotionAuthority must be false');
  }
  assertSafeRetroPayload(candidate);
  return candidate;
}

function assertAllowedKeys(value, allowed, pointer) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`collect record ${pointer} must be an object`);
  }
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allow.has(key)) throw new Error(`collect record contains unknown field: ${pointer}.${key}`);
  }
}

function assertIntegerAtLeast(value, min, pointer) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`collect record ${pointer} must be an integer >= ${min}`);
  }
}

function validateScore(score) {
  assertAllowedKeys(score, ['total', 'status', 'hardGatesPassed'], '$.score');
  if (!['FULL', 'PARTIAL', 'NO', 'UNKNOWN'].includes(score.status)) {
    throw new Error(`invalid score status: ${score.status}`);
  }
  if (score.total !== null && score.total !== undefined) {
    if (!Number.isFinite(score.total) || score.total < 0 || score.total > 1) {
      throw new Error('collect record score.total must be between 0 and 1');
    }
  }
  if ('hardGatesPassed' in score && typeof score.hardGatesPassed !== 'boolean') {
    throw new Error('collect record score.hardGatesPassed must be boolean');
  }
}

function validateExecution(execution) {
  assertAllowedKeys(execution, ['startedAt', 'closedAt', 'replanCount', 'verifyCount', 'reviewCount'], '$.execution');
  for (const field of ['replanCount', 'verifyCount', 'reviewCount']) {
    assertIntegerAtLeast(execution[field], 0, `$.execution.${field}`);
  }
}

function validateFailureClasses(failureClasses) {
  if (!Array.isArray(failureClasses)) throw new Error('collect record failureClasses must be an array');
  const seen = new Set();
  for (const failureClass of failureClasses) {
    if (typeof failureClass !== 'string' || !failureClass) {
      throw new Error('collect record failureClasses entries must be non-empty strings');
    }
    if (seen.has(failureClass)) throw new Error(`collect record failureClasses must be unique: ${failureClass}`);
    seen.add(failureClass);
  }
}

function validateReviewFindings(reviewFindings) {
  assertAllowedKeys(reviewFindings, ['critical', 'important', 'minor'], '$.reviewFindings');
  for (const field of ['critical', 'important', 'minor']) {
    assertIntegerAtLeast(reviewFindings[field], 0, `$.reviewFindings.${field}`);
  }
}

function validateChangedFiles(changedFiles) {
  if (changedFiles === undefined) return;
  assertAllowedKeys(changedFiles, ['count', 'paths'], '$.changedFiles');
  assertIntegerAtLeast(changedFiles.count, 0, '$.changedFiles.count');
  if (!Array.isArray(changedFiles.paths) || changedFiles.paths.some((entry) => typeof entry !== 'string')) {
    throw new Error('collect record changedFiles.paths must be a string array');
  }
}

function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('collect record evidence must be an object');
  }
  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value !== 'string') throw new Error(`collect record evidence.${key} must be a string`);
    if (value.length > MAX_RETRO_STRING_LENGTH) throw new Error(`collect record evidence.${key} is too long`);
  }
}

function validateCandidateLessons(candidateLessons) {
  if (!Array.isArray(candidateLessons)) throw new Error('collect record candidateLessons must be an array');
  for (const [index, lesson] of candidateLessons.entries()) {
    assertAllowedKeys(lesson, ['type', 'summary', 'confidence'], `$.candidateLessons[${index}]`);
    if (!lesson.type || typeof lesson.type !== 'string') throw new Error(`collect record candidateLessons[${index}].type is required`);
    if (!lesson.summary || typeof lesson.summary !== 'string') throw new Error(`collect record candidateLessons[${index}].summary is required`);
    if (lesson.summary.length > MAX_RETRO_STRING_LENGTH) throw new Error(`collect record candidateLessons[${index}].summary is too long`);
    if (!['low', 'medium', 'high'].includes(lesson.confidence)) {
      throw new Error(`collect record candidateLessons[${index}].confidence is invalid`);
    }
  }
}
