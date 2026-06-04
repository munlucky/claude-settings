import fs from 'node:fs';
import path from 'node:path';

import { parsePhaseStatusDocument, readText, resolvePath } from './phase-closeout-parsers.mjs';
import { resolveRuntimeStateRoot } from '../../../../scripts/lib/runtime-state-root.mjs';

export const PHASE_EVENT_VERSION = 1;

export const PHASE_EVENT_TYPES = new Set([
  'contract.created',
  'contract.frozen',
  'contract.changed',
  'ambiguity.evaluated',
  'workset.started',
  'workset.completed',
  'verification.passed',
  'verification.failed',
  'retry.requested',
  'recovery.started',
  'closeout.normalized',
  'phase.status.updated',
]);

const REQUIRED_FIELDS = [
  'eventVersion',
  'eventType',
  'runId',
  'phaseId',
  'contractSnapshotId',
  'source',
  'payload',
  'timestamp',
];

const SENSITIVE_PAYLOAD_KEYS = /(^|\.)(prompt|rawPrompt|secret|token|password|apiKey|memoryGraphRaw|codeReviewGraphRaw|transcript)$/i;

export function defaultPhaseEventLedgerPath(statusFile = '.claude/docs/phase-status.yaml') {
  const resolvedStatus = resolvePath(statusFile);
  const repoRoot = resolvedStatus.includes(`${path.sep}.claude${path.sep}`)
    ? resolvedStatus.slice(0, resolvedStatus.indexOf(`${path.sep}.claude${path.sep}`))
    : process.cwd();
  return path.join(resolveRuntimeStateRoot(repoRoot), 'logs', 'workflow-enforcement', 'events.jsonl');
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function payloadHasSensitiveKeys(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.some((entry, index) => payloadHasSensitiveKeys(entry, `${prefix}.${index}`));
  }
  if (!plainObject(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nestedValue]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    return SENSITIVE_PAYLOAD_KEYS.test(nextPath) || payloadHasSensitiveKeys(nestedValue, nextPath);
  });
}

export function validatePhaseEvent(event) {
  const errors = [];
  if (!plainObject(event)) {
    return { ok: false, errors: ['event must be an object'] };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in event)) {
      errors.push(`missing ${field}`);
    }
  }
  if (event.eventVersion !== PHASE_EVENT_VERSION) {
    errors.push(`eventVersion must be ${PHASE_EVENT_VERSION}`);
  }
  if (!PHASE_EVENT_TYPES.has(event.eventType)) {
    errors.push(`unsupported eventType ${event.eventType || 'missing'}`);
  }
  for (const field of ['runId', 'phaseId', 'contractSnapshotId', 'source', 'timestamp']) {
    if (typeof event[field] !== 'string' || event[field].trim() === '') {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (Number.isNaN(Date.parse(String(event.timestamp || '')))) {
    errors.push('timestamp must be ISO-parseable');
  }
  if (!plainObject(event.payload)) {
    errors.push('payload must be an object');
  } else if (payloadHasSensitiveKeys(event.payload)) {
    errors.push('payload contains disallowed raw prompt, secret, transcript, or graph content key');
  }
  return { ok: errors.length === 0, errors };
}

export function appendPhaseEvent(ledgerPath, event) {
  const validation = validatePhaseEvent(event);
  if (!validation.ok) {
    throw new Error(`invalid phase event: ${validation.errors.join('; ')}`);
  }
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' });
}

export function readPhaseEvents(ledgerPath) {
  if (!ledgerPath || !fs.existsSync(ledgerPath)) {
    return { exists: false, events: [], errors: [] };
  }
  const events = [];
  const errors = [];
  const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) {
      return;
    }
    try {
      const event = JSON.parse(line);
      const validation = validatePhaseEvent(event);
      if (!validation.ok) {
        errors.push({ line: index + 1, errors: validation.errors });
      } else {
        events.push(event);
      }
    } catch (error) {
      errors.push({ line: index + 1, errors: [`invalid JSON: ${error.message}`] });
    }
  });
  return { exists: true, events, errors };
}

export function replayPhaseEvents(events, phaseId) {
  const projection = {
    phaseId: String(phaseId),
    status: '',
    worksets: new Map(),
    verificationVerdict: '',
    closeoutStatus: '',
    lastEventType: '',
  };
  for (const event of events.filter((entry) => String(entry.phaseId) === String(phaseId))) {
    projection.lastEventType = event.eventType;
    if (event.eventType === 'phase.status.updated' && event.payload.status) {
      projection.status = String(event.payload.status);
    } else if (event.eventType === 'workset.started' && event.payload.taskId) {
      projection.worksets.set(String(event.payload.taskId), 'in_progress');
    } else if (event.eventType === 'workset.completed' && event.payload.taskId) {
      projection.worksets.set(String(event.payload.taskId), 'completed');
    } else if (event.eventType === 'verification.passed') {
      projection.verificationVerdict = 'passed';
    } else if (event.eventType === 'verification.failed') {
      projection.verificationVerdict = 'failed';
    } else if (event.eventType === 'closeout.normalized' && event.payload.status) {
      projection.closeoutStatus = String(event.payload.status);
    }
  }
  return projection;
}

export function comparePhaseReplayToReadModel({ ledgerPath, statusFile, phaseNumber }) {
  const ledger = readPhaseEvents(ledgerPath);
  const violations = ledger.errors.map((entry) => ({
    code: 'event-ledger-invalid',
    message: `${path.relative(process.cwd(), ledgerPath)} line ${entry.line}: ${entry.errors.join('; ')}`,
  }));
  if (!ledger.exists || ledger.events.length === 0) {
    return { ok: violations.length === 0, exists: ledger.exists, violations, projection: null };
  }

  const projection = replayPhaseEvents(ledger.events, String(phaseNumber));
  const hasPhaseEvents = ledger.events.some((event) => String(event.phaseId) === String(phaseNumber));
  if (!hasPhaseEvents) {
    return { ok: violations.length === 0, exists: true, violations, projection };
  }

  const statusDocument = parsePhaseStatusDocument(readText(statusFile));
  const phase = statusDocument.phases.find((entry) => String(entry.number) === String(phaseNumber));
  if (projection.status && phase && projection.status !== phase.status) {
    violations.push({
      code: 'event-ledger-read-model-mismatch',
      message: `phase ${phaseNumber} event replay status is ${projection.status}, but phase-status.yaml is ${phase.status}.`,
    });
  }
  return { ok: violations.length === 0, exists: true, violations, projection };
}
