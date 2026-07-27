// Bounded context selection for an Execution Capsule (K1 §6.5).
//
// A capsule is not "everything the Kernel knows" — it is the smallest set of
// facts a fresh worker session needs. Selection is therefore deterministic and
// budgeted: the same persisted state must produce the same capsule, and an
// over-budget capsule is reduced in a fixed priority order rather than
// truncated wherever the serializer happened to run out.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { matchPathScope } from '../knowledge/path-scope.mjs';
import { canonicalJson } from '../canonical-digest.mjs';

export const CAPSULE_BUDGET = Object.freeze({
  maxRelevantFiles: 20,
  maxRelevantSymbols: 30,
  maxKnowledgeRecords: 15,
  maxArchitectureRecords: 10,
  maxKnownFailures: 10,
  maxSerializedBytes: 65536,
});

// Paths whose CONTENT is a secret. The capsule never carries file bodies, but
// naming these files still tells a worker where to look, and a digest of one is
// a fingerprint of a credential — so they are excluded outright.
const SENSITIVE_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i,
  /(^|\/)secrets?\//i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /credential|password|token[-_]?store/i,
];

export const isSensitivePath = (candidate) => {
  const value = String(candidate || '').replaceAll('\\', '/');
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
};

const normalize = (candidate) => String(candidate || '').replaceAll('\\', '/').replace(/^\.\//, '');

// §6.5 reduction order, lowest value first. Reducing in a declared order is
// what makes an over-budget capsule deterministic instead of arbitrary.
export const CAPSULE_REDUCTION_ORDER = Object.freeze([
  { field: 'semanticFacts', label: 'knowledge-record' },
  { field: 'knownFailures', label: 'known-failure' },
  { field: 'architectureRecords', label: 'architecture-record' },
  { field: 'relevantSymbols', label: 'relevant-symbol' },
  { field: 'adjacentFiles', label: 'adjacent-file' },
  { field: 'acceptanceFiles', label: 'acceptance-file' },
]);

// Selection tiers, highest priority first: the step's own scope, then files the
// acceptance criteria point at, then neighbours of the changed paths.
const FILE_TIERS = Object.freeze([
  { tier: 1, group: 'scopeFiles', reason: 'inside the work unit scope' },
  { tier: 2, group: 'acceptanceFiles', reason: 'named by the acceptance criteria' },
  { tier: 3, group: 'adjacentFiles', reason: 'adjacent to a changed path' },
]);

const fileDigest = (projectRoot, relative) => {
  try {
    const absolute = path.join(projectRoot, relative);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return null;
    return `sha256:${createHash('sha256').update(readFileSync(absolute)).digest('hex')}`;
  } catch {
    return null;
  }
};

const directoriesOf = (paths = []) => new Set(paths.map((entry) => path.posix.dirname(normalize(entry))).filter((dir) => dir && dir !== '.'));

// Classifies every candidate file into a tier and returns them in a stable
// order. Sorting by (tier, path) — never by filesystem order — is what makes a
// rebuilt capsule byte-identical.
export const rankRelevantFiles = ({
  candidates = [],
  allowedPaths = [],
  acceptancePaths = [],
  changedPaths = [],
  projectRoot = process.cwd(),
  limit = CAPSULE_BUDGET.maxRelevantFiles,
} = {}) => {
  const scoped = allowedPaths.filter((entry) => entry && entry !== '**');
  const acceptanceSet = new Set(acceptancePaths.map(normalize));
  const changedDirs = directoriesOf(changedPaths);
  const ranked = [];

  for (const candidate of candidates) {
    const relative = normalize(candidate);
    if (!relative || isSensitivePath(relative)) continue;
    let tier = null;
    if (scoped.length > 0 && matchPathScope(relative, scoped)) tier = 1;
    else if (acceptanceSet.has(relative)) tier = 2;
    else if (changedDirs.has(path.posix.dirname(relative))) tier = 3;
    if (tier === null) continue;
    ranked.push({ tier, path: relative });
  }

  ranked.sort((a, b) => (a.tier - b.tier) || a.path.localeCompare(b.path));
  return ranked.slice(0, limit).map((entry) => ({
    path: entry.path,
    reason: FILE_TIERS.find((item) => item.tier === entry.tier).reason,
    group: FILE_TIERS.find((item) => item.tier === entry.tier).group,
    digest: fileDigest(projectRoot, entry.path),
  }));
};

const recordSummary = (record) => {
  const statement = record?.statement || record?.summary || record?.title || '';
  return String(statement).slice(0, 400);
};

// Knowledge already arrives redacted and budgeted from the knowledge context
// build; here it is narrowed to the capsule's own scope and split so that
// architecture decisions and API contracts survive reduction longer than a
// general semantic fact.
export const selectKnowledgeRecords = ({
  knowledgeContext = null,
  allowedPaths = [],
  budget = CAPSULE_BUDGET,
} = {}) => {
  const records = [
    ...(knowledgeContext?.policyAnchors || []),
    ...(knowledgeContext?.semanticFacts || []),
  ];
  const scoped = allowedPaths.filter((entry) => entry && entry !== '**');
  const inScope = (record) => {
    if (!Array.isArray(record?.scope) || record.scope.length === 0) return true;
    if (scoped.length === 0) return true;
    return record.scope.some((entry) => matchPathScope(normalize(entry), scoped) || matchPathScope(normalize(scoped[0]), [entry]));
  };

  const architectureTypes = new Set(['architecture_decision', 'component_boundary', 'api_contract']);
  const failureTypes = new Set(['known_failure_pattern']);
  const architectureRecords = [];
  const knowledgeRecords = [];
  const knownFailures = [];

  for (const record of records) {
    if (!inScope(record)) continue;
    const type = record.type || record.recordType || 'semantic_fact';
    const entry = {
      recordId: String(record.id || record.recordId || 'unknown'),
      summary: recordSummary(record),
      revision: Number.isInteger(record.revision) ? record.revision : null,
    };
    if (architectureTypes.has(type)) architectureRecords.push(entry);
    else if (failureTypes.has(type)) knownFailures.push(entry);
    else knowledgeRecords.push(entry);
  }

  const byId = (a, b) => a.recordId.localeCompare(b.recordId);
  return {
    knowledgeRecords: knowledgeRecords.sort(byId).slice(0, budget.maxKnowledgeRecords),
    architectureRecords: architectureRecords.sort(byId).slice(0, budget.maxArchitectureRecords),
    knownFailurePatterns: knownFailures.sort(byId).slice(0, budget.maxKnownFailures),
  };
};

const listsOf = (capsule) => ({
  semanticFacts: capsule.repositoryContext?.knowledgeRecords,
  knownFailures: capsule.repositoryContext?.baseline?.knownFailures,
  architectureRecords: capsule.repositoryContext?.architectureRecords,
  relevantSymbols: capsule.repositoryContext?.relevantSymbols,
  adjacentFiles: capsule.repositoryContext?.relevantFiles,
  acceptanceFiles: capsule.repositoryContext?.relevantFiles,
});

const serializedBytes = (capsule) => Buffer.byteLength(canonicalJson(capsule), 'utf8');

// Enforces the per-list caps first, then shrinks by the declared order until the
// serialized capsule fits. Every drop is reported: a capsule that silently lost
// context would look complete to the worker that receives it.
export const applyCapsuleBudget = (capsule, budget = CAPSULE_BUDGET) => {
  const working = JSON.parse(JSON.stringify(capsule));
  const reductions = [];
  const repository = working.repositoryContext || {};

  const cap = (list, max, label) => {
    if (!Array.isArray(list) || list.length <= max) return list;
    reductions.push({ label, kind: 'cap', dropped: list.length - max, limit: max });
    return list.slice(0, max);
  };

  repository.relevantFiles = cap(repository.relevantFiles, budget.maxRelevantFiles, 'relevant-file');
  repository.relevantSymbols = cap(repository.relevantSymbols, budget.maxRelevantSymbols, 'relevant-symbol');
  repository.knowledgeRecords = cap(repository.knowledgeRecords, budget.maxKnowledgeRecords, 'knowledge-record');
  repository.architectureRecords = cap(repository.architectureRecords, budget.maxArchitectureRecords, 'architecture-record');
  if (repository.baseline?.knownFailures) {
    repository.baseline.knownFailures = cap(repository.baseline.knownFailures, budget.maxKnownFailures, 'known-failure');
  }
  working.repositoryContext = repository;

  for (const step of CAPSULE_REDUCTION_ORDER) {
    while (serializedBytes(working) > budget.maxSerializedBytes) {
      const lists = listsOf(working);
      const list = lists[step.field];
      if (!Array.isArray(list) || list.length === 0) break;
      // Files reduce from the lowest-priority tail, which the ranking already
      // placed last, so acceptance-tier files outlive adjacent-tier ones.
      list.pop();
      const existing = reductions.find((entry) => entry.label === step.label && entry.kind === 'budget');
      if (existing) existing.dropped += 1;
      else reductions.push({ label: step.label, kind: 'budget', dropped: 1, limit: budget.maxSerializedBytes });
    }
    if (serializedBytes(working) <= budget.maxSerializedBytes) break;
  }

  return {
    capsule: working,
    reductions,
    serializedBytes: serializedBytes(working),
    withinBudget: serializedBytes(working) <= budget.maxSerializedBytes,
  };
};

// Scope enforcement (K1 §6.9-5). A change outside the capsule's work unit is a
// contract violation, not a style problem, so the report is refused.
export const findScopeViolations = ({ changedPaths = [], allowedPaths = [], forbiddenPaths = [] } = {}) => {
  const allowed = allowedPaths.filter(Boolean);
  const forbidden = forbiddenPaths.filter(Boolean);
  const violations = [];
  for (const changed of changedPaths) {
    const relative = normalize(changed);
    if (!relative) continue;
    if (forbidden.length > 0 && matchPathScope(relative, forbidden)) {
      violations.push({ path: relative, reason: 'forbidden-path' });
      continue;
    }
    // An empty or `**` allowlist declares the whole workspace; only a narrowed
    // scope can be violated.
    if (allowed.length === 0 || allowed.includes('**')) continue;
    if (!matchPathScope(relative, allowed)) violations.push({ path: relative, reason: 'outside-allowed-paths' });
  }
  return violations;
};
