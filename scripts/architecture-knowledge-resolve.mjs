#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseJsonl } from './knowledge-records.mjs';
import { resolveProjectIdentity } from './project-identity.mjs';

const VALID_MODES = new Set(['greenfield_prd', 'brownfield_codebase', 'hybrid_prd_plus_existing_repo', 'meta_harness_design']);
const VALID_STAGES = new Set(['intake', 'plan', 'execute', 'verify', 'finish']);
const RAW_FIELD_NAMES = new Set([
  'rawGraph',
  'rawOntology',
  'rawMemoryGraph',
  'transcriptBody',
  'runtimeLogBody',
  'browserScrapeBody',
  'secret',
]);
const KNOWLEDGE_FILES = Object.freeze([
  ['policy_anchor', ['policy', 'policy-anchors.jsonl']],
  ['semantic_fact', ['semantic', 'verified-facts.jsonl']],
  ['kg_relation', ['graph', 'kg-relations.jsonl']],
  ['ontology_constraint', ['ontology', 'constraints.jsonl']],
]);
const TRUST_WEIGHT = Object.freeze({
  authoritative: 5,
  verified: 4,
  derived: 3,
  degraded: 2,
  quarantined: 1,
});
const STATUS_WEIGHT = Object.freeze({
  verified: 5,
  authoritative: 5,
  staged: 3,
  derived: 3,
  observed: 2,
  degraded: 1,
});
const SEVERITY_WEIGHT = Object.freeze({
  critical: 5,
  blocking: 4,
  warning: 3,
  advisory: 2,
  info: 1,
});

const usage = () => `Usage: node scripts/architecture-knowledge-resolve.mjs --cwd <path> --mode <mode> --stage <stage> --objective <text> [--changed-files-json <json>] [--path-hints-json <json>] [--knowledge-root <dir>] [--json]`;

const parseArgs = (argv) => {
  const options = {
    cwd: process.cwd(),
    mode: '',
    stage: '',
    objective: '',
    changedFilesJson: '[]',
    pathHintsJson: '[]',
    knowledgeRoot: '',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cwd') options.cwd = argv[++index] || options.cwd;
    else if (arg === '--mode') options.mode = argv[++index] || '';
    else if (arg === '--stage') options.stage = argv[++index] || '';
    else if (arg === '--objective') options.objective = argv[++index] || '';
    else if (arg === '--changed-files-json') options.changedFilesJson = argv[++index] || '[]';
    else if (arg === '--path-hints-json') options.pathHintsJson = argv[++index] || '[]';
    else if (arg === '--knowledge-root') options.knowledgeRoot = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const parseJsonArray = (value, label) => {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map((item) => String(item));
  } catch (error) {
    throw new Error(`${label} must be a JSON array: ${error.message}`);
  }
};

const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const normalize = (value) => String(value || '').replaceAll('\\', '/').toLowerCase();

const tokenize = (value) => (
  normalize(value)
    .split(/[^a-z0-9가-힣._/-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
);

const hasRawField = (value, seen = new Set()) => {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasRawField(item, seen));
  for (const [key, nested] of Object.entries(value)) {
    if (RAW_FIELD_NAMES.has(key)) return true;
    if (hasRawField(nested, seen)) return true;
  }
  return false;
};

const globLikeMatch = (pattern, candidate) => {
  const normalizedPattern = normalize(pattern);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedPattern || !normalizedCandidate) return false;
  if (normalizedPattern === normalizedCandidate) return true;
  if (!normalizedPattern.includes('*')) return normalizedCandidate.includes(normalizedPattern);
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '.*')
    .replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`).test(normalizedCandidate);
};

const stageApplies = (record, stage) => {
  if (!Array.isArray(record.stages) || record.stages.length === 0) return true;
  return record.stages.includes(stage);
};

const textForRecord = (record) => [
  record.id,
  record.type,
  record.text,
  record.statement,
  record.summary,
  record.scope,
  record.from,
  record.to,
  record.relation,
  record.sourceRef,
  ...(Array.isArray(record.appliesTo) ? record.appliesTo : []),
].filter(Boolean).join(' ');

const scoreRecord = (record, { objectiveTokens, changedFiles, pathHints, stage }) => {
  if (!stageApplies(record, stage)) return { selected: false, score: 0, reasons: ['stage_not_applicable'] };

  const reasons = [];
  const haystack = normalize(textForRecord(record));
  let score = 0;

  for (const token of objectiveTokens) {
    if (haystack.includes(token)) {
      score += 3;
      reasons.push(`objective:${token}`);
    }
  }

  const recordPaths = [
    record.sourceRef,
    ...(Array.isArray(record.appliesTo) ? record.appliesTo : []),
  ].filter(Boolean);
  for (const candidate of [...changedFiles, ...pathHints]) {
    if (recordPaths.some((recordPath) => globLikeMatch(recordPath, candidate) || globLikeMatch(candidate, recordPath))) {
      score += 5;
      reasons.push(`path:${candidate}`);
    }
  }

  score += TRUST_WEIGHT[record.trustTier] || 0;
  score += STATUS_WEIGHT[record.status] || 0;
  score += SEVERITY_WEIGHT[record.severity] || 0;

  const critical = ['blocking', 'critical'].includes(record.severity)
    && (recordPaths.length === 0 || changedFiles.some((file) => recordPaths.some((recordPath) => globLikeMatch(recordPath, file))));
  if (critical) {
    score += 10;
    reasons.push(`severity:${record.severity}`);
  }

  return { selected: score > 0 && reasons.length > 0, score, reasons };
};

const compactBase = (record, summary, extra = {}) => ({
  id: record.id,
  type: record.type,
  summary,
  sourceRef: record.sourceRef || '',
  provenanceRef: record.provenanceRef || '',
  trustTier: record.trustTier || (record.type === 'ontology_constraint' ? 'verified' : 'derived'),
  status: record.status || '',
  stages: Array.isArray(record.stages) ? record.stages : [],
  severity: record.severity === 'advisory' ? 'info' : record.severity,
  ...extra,
});

const compactRecord = (record) => {
  if (record.type === 'policy_anchor') {
    return compactBase(record, record.text || record.summary || record.id);
  }
  if (record.type === 'semantic_fact') {
    return compactBase(record, record.statement || record.summary || record.id);
  }
  if (record.type === 'kg_relation') {
    return compactBase(record, `${record.from} ${record.relation} ${record.to}`, {
      from: record.from,
      to: record.to,
      relation: record.relation,
    });
  }
  if (record.type === 'ontology_constraint') {
    return compactBase(record, record.scope || record.summary || record.id, {
      appliesTo: Array.isArray(record.appliesTo) ? record.appliesTo : [],
      enforcedBy: record.enforcedBy || '',
    });
  }
  return compactBase(record, record.summary || record.id);
};

const readKnowledgeRecords = async (knowledgeRoot) => {
  const records = [];
  const warnings = [];
  let configuredFiles = 0;
  for (const [type, segments] of KNOWLEDGE_FILES) {
    const filePath = path.join(knowledgeRoot, ...segments);
    if (!await exists(filePath)) continue;
    configuredFiles += 1;
    const parsed = parseJsonl(await readFile(filePath, 'utf8'), { sourceName: filePath });
    if (!parsed.ok) {
      warnings.push({ code: 'invalid_jsonl', message: parsed.errors.join('; '), severity: 'warning' });
      continue;
    }
    for (const record of parsed.records) {
      records.push({ ...record, type: record.type || type, __sourceFile: filePath });
    }
  }
  return { records, warnings, configuredFiles };
};

const parseInlineArray = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
};

const parseScalar = (value) => {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return parseInlineArray(trimmed);
  return trimmed;
};

export const parseKnowledgeAnchors = (text) => {
  const anchors = [];
  let inFence = false;
  let inAnchors = false;
  let active = null;
  let activeArrayKey = '';

  const finish = () => {
    if (active?.id) anchors.push(active);
    active = null;
    activeArrayKey = '';
  };

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed || trimmed.startsWith('#')) continue;

    if (/^knowledgeAnchors:\s*$/.test(trimmed)) {
      finish();
      inAnchors = true;
      continue;
    }
    if (!inAnchors) continue;
    if (indent === 0 && /^[A-Za-z0-9_-]+:\s*/.test(trimmed) && !trimmed.startsWith('- ')) {
      finish();
      inAnchors = false;
      continue;
    }
    if (trimmed.startsWith('- ')) {
      const body = trimmed.slice(2);
      if (/^[A-Za-z0-9_-]+:\s*/.test(body)) {
        finish();
        active = {};
        const [key, ...rest] = body.split(':');
        active[key.trim()] = parseScalar(rest.join(':'));
      } else if (activeArrayKey && active) {
        active[activeArrayKey].push(parseScalar(body));
      }
      continue;
    }
    if (!active) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (value === '') {
      active[key] = [];
      activeArrayKey = key;
    } else {
      active[key] = parseScalar(value);
      activeArrayKey = '';
    }
  }
  finish();
  return anchors;
};

const anchorMatches = (anchor, objectiveTokens, changedFiles) => {
  const keywords = Array.isArray(anchor.keywords) ? anchor.keywords : [];
  const mustConsult = Array.isArray(anchor.mustConsultFor) ? anchor.mustConsultFor : [];
  const haystack = normalize([...keywords, ...mustConsult, anchor.summary, anchor.title, anchor.id].filter(Boolean).join(' '));
  const objectiveMatch = objectiveTokens.some((token) => haystack.includes(token));
  const pathMatch = changedFiles.some((file) => normalize(file).includes(normalize(anchor.id)) || normalize(anchor.package).includes(normalize(file)));
  return { matched: objectiveMatch || pathMatch, reason: objectiveMatch ? 'objective matched anchor keywords' : pathMatch ? 'path matched anchor package' : 'not applicable' };
};

const resolveAnchors = async (cwd, objectiveTokens, changedFiles) => {
  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!await exists(agentsPath)) return [];
  const anchors = parseKnowledgeAnchors(await readFile(agentsPath, 'utf8'));
  const result = [];
  for (const anchor of anchors) {
    const match = anchorMatches(anchor, objectiveTokens, changedFiles);
    const packagePath = anchor.package ? path.resolve(cwd, anchor.package) : '';
    const startHere = anchor.startHere || '';
    const startPath = packagePath && startHere ? path.resolve(packagePath, startHere) : '';
    const consulted = match.matched && (!startPath || await exists(startPath));
    result.push({
      id: anchor.id,
      status: consulted ? 'consulted' : match.matched ? 'unavailable' : 'skipped',
      reason: consulted ? match.reason : match.matched ? 'matched but startHere is unavailable' : match.reason,
      package: anchor.package || '',
      startHere,
      consumedPaths: consulted && startHere ? [startHere] : [],
    });
  }
  return result;
};

export const buildApplicableKnowledgeSlice = async (options) => {
  const cwd = path.resolve(options.cwd || process.cwd());
  const mode = options.mode;
  const stage = options.stage;
  if (!VALID_MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);
  if (!VALID_STAGES.has(stage)) throw new Error(`Unsupported stage: ${stage}`);

  const changedFiles = options.changedFiles || [];
  const pathHints = options.pathHints || [];
  const objectiveTokens = tokenize(options.objective);
  const identity = resolveProjectIdentity({ cwd });
  const knowledgeRoot = path.resolve(options.knowledgeRoot || identity.namespaces.knowledgeRoot);
  const { records, warnings, configuredFiles } = await readKnowledgeRecords(knowledgeRoot);

  const selected = {
    policyAnchors: [],
    semanticFacts: [],
    kgRelations: [],
    ontologyConstraints: [],
    knowledgeAnchors: await resolveAnchors(cwd, objectiveTokens, changedFiles),
  };
  const skipped = [];

  for (const record of records) {
    if (hasRawField(record)) {
      skipped.push({ id: record.id || record.__sourceFile, type: record.type, reason: 'unsafe raw payload field omitted', sourceRef: record.sourceRef || record.__sourceFile });
      continue;
    }
    const scored = scoreRecord(record, { objectiveTokens, changedFiles, pathHints, stage });
    if (!scored.selected) {
      skipped.push({ id: record.id || record.__sourceFile, type: record.type, reason: scored.reasons[0] || 'not applicable', sourceRef: record.sourceRef || record.__sourceFile });
      continue;
    }
    const compact = compactRecord(record);
    if (record.type === 'policy_anchor') selected.policyAnchors.push(compact);
    else if (record.type === 'semantic_fact') selected.semanticFacts.push(compact);
    else if (record.type === 'kg_relation') selected.kgRelations.push(compact);
    else if (record.type === 'ontology_constraint') selected.ontologyConstraints.push(compact);
  }

  const hasSelected = Object.values(selected).some((items) => items.length > 0);
  const status = configuredFiles === 0 ? 'degraded' : hasSelected ? 'ready' : 'degraded';
  const unavailableCount = configuredFiles === 0 ? 1 : 0;
  const allWarnings = [...warnings];
  if (configuredFiles === 0) {
    allWarnings.push({ code: 'knowledge_not_configured', message: `no knowledge records found under ${knowledgeRoot}`, severity: 'warning' });
  }

  return {
    schemaVersion: 1,
    artifactId: 'APPLICABLE_KNOWLEDGE_SLICE',
    owner: 'moonshot-architecture',
    mode,
    stage,
    status,
    objectiveRef: options.objective ? 'inline-objective' : '',
    selected,
    skipped,
    blocking: false,
    warnings: allWarnings,
    errors: [],
    metadata: {
      knowledgeRevision: '',
      contextPackRef: '',
      unavailableCount,
    },
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = await buildApplicableKnowledgeSlice({
    cwd: args.cwd,
    mode: args.mode,
    stage: args.stage,
    objective: args.objective,
    changedFiles: parseJsonArray(args.changedFilesJson, '--changed-files-json'),
    pathHints: parseJsonArray(args.pathHintsJson, '--path-hints-json'),
    knowledgeRoot: args.knowledgeRoot,
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
