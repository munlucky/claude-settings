#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RAW_FIELD_NAMES = new Set([
  'rawGraph',
  'rawOntology',
  'rawMemoryGraph',
  'transcriptBody',
  'runtimeLogBody',
  'browserScrapeBody',
  'secret',
]);

const usage = () => `Usage: node scripts/architecture-contract-bind.mjs --knowledge-slice <file> [--artifact-dir <dir>] [--json]`;

const parseArgs = (argv) => {
  const options = { knowledgeSlice: '', artifactDir: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--knowledge-slice') options.knowledgeSlice = argv[++index] || '';
    else if (arg === '--artifact-dir') options.artifactDir = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

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

const message = (code, text, severity = 'blocking') => ({ code, message: text, severity });

const normalizeSeverity = (severity) => {
  if (severity === 'advisory') return 'info';
  if (['info', 'warning', 'blocking', 'critical'].includes(severity)) return severity;
  return 'info';
};

const contractItem = (item, fallbackPrefix) => ({
  id: item.id || `${fallbackPrefix}.unknown`,
  summary: item.summary || item.statement || item.text || item.id || fallbackPrefix,
  sourceRef: item.sourceRef || '',
  derivedFrom: item.id ? [item.id] : [],
});

const addUnique = (target, value) => {
  if (value && !target.includes(value)) target.push(value);
};

const collectPathBoundaries = (relations) => {
  const pathBoundaries = { ownedPaths: [], readOnlyPaths: [], stagedPaths: [] };
  for (const relation of relations) {
    if (relation.relation === 'owns_path') addUnique(pathBoundaries.ownedPaths, relation.to?.replace(/^CodePath:/, ''));
    if (relation.relation === 'read_only_path') addUnique(pathBoundaries.readOnlyPaths, relation.to?.replace(/^CodePath:/, ''));
    if (relation.relation === 'staged_path') addUnique(pathBoundaries.stagedPaths, relation.to?.replace(/^CodePath:/, ''));
  }
  return pathBoundaries;
};

const findOverlaps = (pathBoundaries) => {
  const seen = new Map();
  const overlaps = [];
  for (const [label, paths] of Object.entries(pathBoundaries)) {
    for (const item of paths) {
      if (seen.has(item)) overlaps.push(`${item} appears in ${seen.get(item)} and ${label}`);
      else seen.set(item, label);
    }
  }
  return overlaps;
};

export const bindArchitectureContract = (knowledgeSlice, options = {}) => {
  const errors = [];
  const warnings = [];
  if (!knowledgeSlice || typeof knowledgeSlice !== 'object') {
    return {
      schemaVersion: 1,
      artifactId: 'ARCHITECTURE_CONTRACT_SLICE',
      owner: 'moonshot-architecture',
      status: 'failed',
      requirements: [],
      asrs: [],
      decisions: [],
      constraints: [],
      enforcementRules: [],
      verificationSignals: [],
      pathBoundaries: { ownedPaths: [], readOnlyPaths: [], stagedPaths: [] },
      handoffRecommendation: { target: 'none', reason: 'invalid knowledge slice', blocking: true },
      warnings: [],
      errors: [message('invalid_knowledge_slice', 'knowledge slice must be an object')],
    };
  }
  if (hasRawField(knowledgeSlice)) {
    errors.push(message('unsafe_raw_payload', 'knowledge slice contains raw graph ontology memory log transcript browser scrape or secret payload'));
  }

  const selected = knowledgeSlice.selected || {};
  const semanticFacts = selected.semanticFacts || [];
  const relations = selected.kgRelations || [];
  const ontologyConstraints = selected.ontologyConstraints || [];
  const requirements = semanticFacts.map((fact) => contractItem(fact, 'REQ'));
  const asrs = relations
    .filter((relation) => relation.relation === 'derives_asr')
    .map((relation) => ({ id: relation.to || relation.id, summary: relation.summary, sourceRef: relation.sourceRef || '', derivedFrom: [relation.id] }));
  const decisions = relations
    .filter((relation) => relation.from?.startsWith('DECISION.') || relation.to?.startsWith('DECISION.') || relation.relation === 'decides')
    .map((relation) => ({ id: relation.from?.startsWith('DECISION.') ? relation.from : relation.to || relation.id, summary: relation.summary, sourceRef: relation.sourceRef || '', derivedFrom: [relation.id] }));
  const constraints = ontologyConstraints.map((constraint) => ({
    id: constraint.id,
    summary: constraint.summary || constraint.id,
    sourceRef: constraint.sourceRef || '',
    derivedFrom: [constraint.id],
    severity: normalizeSeverity(constraint.severity),
    appliesTo: constraint.appliesTo || [],
    enforcedBy: constraint.enforcedBy ? [constraint.enforcedBy] : [],
  }));
  const enforcementRules = [];
  for (const constraint of constraints) {
    for (const rule of constraint.enforcedBy || []) {
      if (!enforcementRules.some((candidate) => candidate.id === rule)) {
        enforcementRules.push({
          id: rule,
          summary: `Enforces ${constraint.id}`,
          commandOrPolicyRef: rule,
          sourceRef: constraint.sourceRef,
        });
      }
    }
  }
  const verificationSignals = relations
    .filter((relation) => relation.relation === 'verified_by')
    .map((relation) => ({
      id: relation.to || relation.id,
      summary: relation.summary || `Verify ${relation.from}`,
      commandOrEvidence: relation.to?.replace(/^VerificationSignal:/, '') || relation.summary || relation.id,
      sourceRef: relation.sourceRef || '',
    }));
  const pathBoundaries = collectPathBoundaries(relations);
  const overlaps = findOverlaps(pathBoundaries);

  for (const constraint of constraints) {
    if (['blocking', 'critical'].includes(constraint.severity) && constraint.enforcedBy.length === 0) {
      errors.push(message('blocking_constraint_without_enforcement', `${constraint.id} has no enforcement rule`));
    }
  }
  if ((requirements.length || decisions.length || constraints.length) && verificationSignals.length === 0) {
    errors.push(message('missing_verification_signal', 'execution handoff requires at least one verification signal'));
  }
  if (options.artifactDir && knowledgeSlice.mode === 'brownfield_codebase') {
    const hasBoundary = pathBoundaries.ownedPaths.length || pathBoundaries.readOnlyPaths.length || pathBoundaries.stagedPaths.length;
    if (!hasBoundary) errors.push(message('brownfield_missing_path_boundary', 'brownfield contract requires owned read-only or staged path boundary'));
  }
  for (const overlap of overlaps) {
    errors.push(message('path_boundary_overlap', overlap));
  }

  const blocking = errors.length > 0;
  const target = blocking ? 'none' : pathBoundaries.stagedPaths.length > 0 ? 'moonshot-phase-runner' : 'moonshot-orchestrator';
  return {
    schemaVersion: 1,
    artifactId: 'ARCHITECTURE_CONTRACT_SLICE',
    owner: 'moonshot-architecture',
    status: blocking ? 'blocked' : knowledgeSlice.status === 'degraded' ? 'degraded' : 'ready',
    sourceKnowledgeSliceRef: options.knowledgeSliceRef || '',
    requirements,
    asrs,
    decisions,
    constraints,
    enforcementRules,
    verificationSignals,
    pathBoundaries,
    handoffRecommendation: {
      target,
      reason: blocking ? 'contract blockers must be resolved before handoff' : `ready for ${target}`,
      blocking,
    },
    warnings,
    errors,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.knowledgeSlice) throw new Error(`Missing --knowledge-slice\n${usage()}`);
  const absoluteSlice = path.resolve(args.knowledgeSlice);
  const slice = JSON.parse(await readFile(absoluteSlice, 'utf8'));
  const result = bindArchitectureContract(slice, {
    artifactDir: args.artifactDir,
    knowledgeSliceRef: args.knowledgeSlice,
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (result.status === 'failed') process.exitCode = 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
