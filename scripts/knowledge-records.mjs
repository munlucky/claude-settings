import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RECORD_TYPES = Object.freeze([
  'policy_anchor',
  'semantic_fact',
  'episodic_observation',
  'kg_relation',
  'ontology_constraint',
  'provenance_event',
  'promotion_candidate',
]);

export const TRUST_TIERS = Object.freeze([
  'authoritative',
  'verified',
  'derived',
  'quarantined',
  'degraded',
]);

export const RAW_EXTERNAL_SOURCE_TYPES = Object.freeze([
  'transcript',
  'browser',
  'tool_output',
  'external',
]);

export const SOURCE_TYPES = Object.freeze([
  'authoritative_doc',
  'repo_file',
  'schema',
  'test',
  'review',
  'transcript',
  'browser',
  'tool_output',
  'external',
  'derived',
]);

export const STORAGE_PATHS = Object.freeze({
  policy_anchor: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/policy/policy-anchors.jsonl',
  semantic_fact: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/semantic/verified-facts.jsonl',
  supersession_log: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/semantic/supersession-log.jsonl',
  episodic_observation: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/episodic/observations.jsonl',
  kg_relation: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/graph/kg-relations.jsonl',
  ontology_constraint: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/ontology/constraints.jsonl',
  provenance_event: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/provenance/prov-log.jsonl',
  promotion_candidate: '%USERPROFILE%/.moonshot-relay/state/projects/<projectId>/knowledge/promotion/promotion-candidates.jsonl',
});

export const RECORD_CONTRACTS = Object.freeze({
  policy_anchor: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'text', 'sourceRef', 'trustTier', 'verifiedAt', 'supersedes'],
    statuses: ['verified', 'superseded', 'archived'],
    transitions: [['verified', 'superseded'], ['superseded', 'archived']],
    trustRequired: true,
  },
  semantic_fact: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'statement', 'sourceType', 'sourceRef', 'trustTier', 'provenanceRef', 'verifiedBy', 'verifiedAt', 'supersedes'],
    statuses: ['staged', 'verified', 'superseded', 'archived', 'rejected'],
    transitions: [['staged', 'verified'], ['verified', 'superseded'], ['superseded', 'archived'], ['staged', 'rejected']],
    trustRequired: true,
  },
  episodic_observation: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'summary', 'sourceType', 'sourceRef', 'observedAt', 'sensitivity'],
    statuses: ['observed', 'staged', 'archived', 'rejected'],
    transitions: [['observed', 'staged'], ['staged', 'archived'], ['observed', 'rejected']],
    trustRequired: false,
  },
  kg_relation: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'from', 'to', 'relation', 'sourceRef', 'trustTier', 'supersedes'],
    statuses: ['derived', 'verified', 'superseded', 'archived', 'rejected'],
    transitions: [['derived', 'verified'], ['verified', 'superseded'], ['superseded', 'archived'], ['derived', 'rejected']],
    trustRequired: true,
  },
  ontology_constraint: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'scope', 'appliesTo', 'severity', 'enforcedBy', 'sourceRef', 'supersedes'],
    statuses: ['staged', 'verified', 'superseded', 'archived', 'rejected'],
    transitions: [['staged', 'verified'], ['verified', 'superseded'], ['superseded', 'archived'], ['staged', 'rejected']],
    trustRequired: false,
  },
  provenance_event: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'subjectId', 'activity', 'agent', 'sourceType', 'sourceRef'],
    statuses: ['observed', 'verified', 'archived'],
    transitions: [['observed', 'verified'], ['verified', 'archived']],
    trustRequired: false,
  },
  promotion_candidate: {
    required: ['type', 'id', 'projectId', 'status', 'createdAt', 'updatedAt', 'targetScope', 'sourceFactId', 'reviewEvidence', 'replayEvidence', 'denialReason'],
    statuses: ['staged', 'verified', 'promoted', 'rejected'],
    transitions: [['staged', 'verified'], ['staged', 'rejected'], ['verified', 'promoted'], ['verified', 'rejected']],
    trustRequired: false,
  },
});

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CROSS_PROJECT_PROMOTION_TARGETS = new Set(['global', 'moonshot-relay']);

function hasOwn(record, field) {
  return Object.hasOwn(record, field);
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function validateTimestamp(value, field, errors) {
  if (isBlank(value) || !ISO_DATE_TIME.test(value)) {
    errors.push(`${field} must be an ISO-8601 UTC timestamp`);
  }
}

function validateStringArray(value, field, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }

  const seen = new Set();
  for (const item of value) {
    if (isBlank(item)) {
      errors.push(`${field} must contain non-empty strings`);
      continue;
    }
    if (seen.has(item)) {
      errors.push(`${field} must not contain duplicate ids`);
    }
    seen.add(item);
  }
}

function hasVerificationEvidence(record) {
  return !isBlank(record.verifiedBy)
    && !isBlank(record.verifiedAt)
    && !isBlank(record.provenanceRef)
    && ISO_DATE_TIME.test(record.verifiedAt);
}

function isRawExternalSemanticFact(record) {
  return record.type === 'semantic_fact'
    && RAW_EXTERNAL_SOURCE_TYPES.includes(record.sourceType);
}

function canCrossProjectSupersede(record) {
  return record.type === 'promotion_candidate'
    && record.status === 'verified'
    && CROSS_PROJECT_PROMOTION_TARGETS.has(record.targetScope);
}

export function isTransitionAllowed(type, fromStatus, toStatus) {
  const contract = RECORD_CONTRACTS[type];
  if (!contract) return false;
  return contract.transitions.some(([from, to]) => from === fromStatus && to === toStatus);
}

export function validateTransition(type, fromStatus, toStatus) {
  const errors = [];
  const contract = RECORD_CONTRACTS[type];

  if (!contract) {
    errors.push(`unknown type: ${type}`);
  } else if (!isTransitionAllowed(type, fromStatus, toStatus)) {
    errors.push(`invalid ${type} transition: ${fromStatus} -> ${toStatus}`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateKnowledgeRecord(record) {
  const errors = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, errors: ['record must be an object'] };
  }

  if (!RECORD_TYPES.includes(record.type)) {
    return { ok: false, errors: [`unknown type: ${String(record.type)}`] };
  }

  const contract = RECORD_CONTRACTS[record.type];
  for (const field of contract.required) {
    if (!hasOwn(record, field)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const field of ['id', 'projectId']) {
    if (hasOwn(record, field) && isBlank(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of ['createdAt', 'updatedAt', 'verifiedAt', 'observedAt']) {
    if (hasOwn(record, field)) {
      validateTimestamp(record[field], field, errors);
    }
  }

  if (!contract.statuses.includes(record.status)) {
    errors.push(`invalid ${record.type} status: ${String(record.status)}`);
  }

  if (hasOwn(record, 'trustTier') && !TRUST_TIERS.includes(record.trustTier)) {
    errors.push(`invalid trustTier: ${String(record.trustTier)}`);
  }

  if (hasOwn(record, 'sourceType') && !SOURCE_TYPES.includes(record.sourceType)) {
    errors.push(`invalid sourceType: ${String(record.sourceType)}`);
  }

  if (contract.trustRequired && !TRUST_TIERS.includes(record.trustTier)) {
    errors.push(`${record.type} requires trustTier`);
  }

  for (const field of ['supersedes', 'derivedFrom', 'appliesTo']) {
    if (hasOwn(record, field)) {
      validateStringArray(record[field], field, errors);
    }
  }

  if (record.type === 'semantic_fact') {
    if (isRawExternalSemanticFact(record) && !hasVerificationEvidence(record)) {
      errors.push('raw external semantic_fact requires verifiedBy, verifiedAt, and provenanceRef');
    }
    if (isRawExternalSemanticFact(record) && !['verified', 'authoritative'].includes(record.trustTier)) {
      errors.push('raw external semantic_fact must be promoted only at verified or authoritative trust');
    }
    if (record.status === 'verified' && !hasVerificationEvidence(record)) {
      errors.push('verified semantic_fact requires verification evidence');
    }
  }

  if (record.type === 'promotion_candidate' && record.status === 'verified') {
    for (const field of ['reviewEvidence', 'replayEvidence']) {
      if (isBlank(record[field])) {
        errors.push(`verified promotion_candidate requires ${field}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function parseJsonl(text, options = {}) {
  const sourceName = options.sourceName || 'jsonl';
  const records = [];
  const lineNumbers = [];
  const errors = [];
  const lines = String(text ?? '').split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === '') return;

    try {
      records.push(JSON.parse(line));
      lineNumbers.push(lineNumber);
    } catch (error) {
      errors.push(`${sourceName}:${lineNumber}: invalid JSON: ${error.message}`);
    }
  });

  return { ok: errors.length === 0, records, lineNumbers, errors };
}

export function parseAndValidateJsonl(text, options = {}) {
  const parsed = parseJsonl(text, options);
  const errors = [...parsed.errors];
  const sourceName = options.sourceName || 'jsonl';
  const idToLine = new Map();

  parsed.records.forEach((record, index) => {
    if (record && typeof record.id === 'string') {
      idToLine.set(record.id, parsed.lineNumbers[index]);
    }

    const validation = validateKnowledgeRecord(record);
    if (!validation.ok) {
      const lineNumber = parsed.lineNumbers[index];
      for (const error of validation.errors) {
        errors.push(`${sourceName}:${lineNumber}: ${error}`);
      }
    }
  });

  const supersession = validateSupersession(parsed.records);
  for (const cycle of supersession.cycles) {
    const firstId = cycle[0];
    const lineNumber = idToLine.get(firstId);
    const location = lineNumber ? `${sourceName}:${lineNumber}` : sourceName;
    errors.push(`${location}: supersession cycle detected: ${cycle.join(' -> ')}`);
  }

  for (const violation of supersession.crossProjectViolations) {
    const lineNumber = idToLine.get(violation.id);
    const location = lineNumber ? `${sourceName}:${lineNumber}` : sourceName;
    errors.push(
      `${location}: cross-project supersession blocked: ${violation.id} (${violation.projectId}) -> ${violation.supersedes} (${violation.supersededProjectId})`,
    );
  }

  return { ok: errors.length === 0, records: parsed.records, errors };
}

export function validateSupersession(records) {
  const byId = new Map();
  const cycles = [];
  const crossProjectViolations = [];

  for (const record of records || []) {
    if (record && typeof record.id === 'string') {
      byId.set(record.id, record);
    }
  }

  for (const record of byId.values()) {
    const supersedes = Array.isArray(record.supersedes) ? record.supersedes : [];
    for (const supersededId of supersedes) {
      const superseded = byId.get(supersededId);
      if (!superseded) continue;
      if (record.projectId !== superseded.projectId && !canCrossProjectSupersede(record)) {
        crossProjectViolations.push({
          id: record.id,
          projectId: record.projectId,
          supersedes: superseded.id,
          supersededProjectId: superseded.projectId,
        });
      }
    }
  }

  const state = new Map();
  const stack = [];

  function visit(id) {
    const marker = state.get(id);
    if (marker === 'visiting') {
      const cycleStart = stack.indexOf(id);
      cycles.push([...stack.slice(cycleStart), id]);
      return;
    }
    if (marker === 'visited') return;

    state.set(id, 'visiting');
    stack.push(id);

    const record = byId.get(id);
    const supersedes = Array.isArray(record?.supersedes) ? record.supersedes : [];
    for (const nextId of supersedes) {
      if (byId.has(nextId)) {
        visit(nextId);
      }
    }

    stack.pop();
    state.set(id, 'visited');
  }

  for (const id of byId.keys()) {
    visit(id);
  }

  return {
    ok: cycles.length === 0 && crossProjectViolations.length === 0,
    cycles,
    crossProjectViolations,
  };
}

export function readAndValidateJsonlFile(filePath) {
  return parseAndValidateJsonl(fs.readFileSync(filePath, 'utf8'), { sourceName: filePath });
}

function printUsage() {
  console.log('Usage: node knowledge-records.mjs validate-jsonl <path>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , command, filePath] = process.argv;
  if (command !== 'validate-jsonl' || !filePath) {
    printUsage();
    process.exitCode = 2;
  } else {
    const result = readAndValidateJsonlFile(filePath);
    if (!result.ok) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, records: result.records.length }));
    }
  }
}
