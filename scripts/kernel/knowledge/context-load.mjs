import path from 'node:path';
import { loadAllProjectRecords, readProjectRevision, projectKnowledgeDirectory, writeAtomicJson } from './store.mjs';
import { renderPromptBlock, computeContextDigest, deepRedact } from './context-render.mjs';
import { matchPathScope, scoreRelevance } from './path-scope.mjs';

export const VALID_STAGES = [
  'FRAME',
  'SHAPE',
  'SLICE',
  'SCHEDULE',
  'EXECUTE',
  'PROVE',
  'CLOSE',
];

export const STAGE_BUDGETS = {
  FRAME: 1200,
  SHAPE: 1500,
  SLICE: 1500,
  SCHEDULE: 1200,
  EXECUTE: 2000,
  PROVE: 1500,
  CLOSE: 1000,
};

export const STAGE_TYPE_POLICY = {
  FRAME: ['policy_anchor', 'semantic_fact', 'architecture_decision', 'domain_term', 'ontology_constraint', 'tacit_practice'],
  SHAPE: ['policy_anchor', 'semantic_fact', 'architecture_decision', 'component_boundary', 'api_contract', 'ontology_constraint', 'known_failure_pattern'],
  SLICE: ['policy_anchor', 'semantic_fact', 'architecture_decision', 'component_boundary', 'api_contract'],
  SCHEDULE: ['policy_anchor', 'semantic_fact', 'component_boundary', 'api_contract', 'required_verification'],
  EXECUTE: ['policy_anchor', 'semantic_fact', 'component_boundary', 'api_contract', 'tacit_practice', 'required_verification'],
  PROVE: ['policy_anchor', 'semantic_fact', 'ontology_constraint', 'required_verification', 'known_failure_pattern'],
  CLOSE: ['policy_anchor', 'semantic_fact', 'ontology_constraint', 'required_verification'],
};

export class KernelContextLoadError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelContextLoadError';
    this.code = code;
    this.details = details;
  }
}

export async function buildProjectKnowledgeContext({
  projectId,
  stage = 'FRAME',
  strictness = 'advisory',
  runId = 'standalone-run',
  objective = '',
  changedPaths = [],
  env = process.env,
} = {}) {
  if (!VALID_STAGES.includes(stage)) {
    throw new KernelContextLoadError('INVALID_STAGE', `Invalid stage: ${stage}`);
  }

  const knowledgeRevision = await readProjectRevision(projectId, { env });
  const records = await loadAllProjectRecords(projectId, { env });

  const rawPolicyAnchors = records.policyAnchors || [];
  const rawSemanticFacts = records.semanticFacts || [];
  const rawGraphRelations = records.kgRelations || [];
  const rawOntologyConstraints = records.ontologyConstraints || [];

  const staleOrUnavailable = [];
  const omittedByPolicy = [];

  // Filter 1: Exclude stale or superseded records
  const isRecordActive = (rec) => {
    if (!rec || typeof rec !== 'object') return false;
    if (['superseded', 'rejected', 'archived'].includes(rec.status)) {
      staleOrUnavailable.push({ id: rec.id || 'unknown', reason: `status_${rec.status}` });
      return false;
    }
    if (rec.trustTier === 'quarantined' && stage !== 'FRAME') {
      omittedByPolicy.push({ id: rec.id || 'unknown', reason: 'quarantined_trust_tier' });
      return false;
    }
    return true;
  };

  let selectedPolicy = rawPolicyAnchors.filter(isRecordActive);
  let selectedFacts = rawSemanticFacts.filter(isRecordActive);
  let selectedConstraints = rawOntologyConstraints.filter(isRecordActive);

  // Filter 2: STAGE_TYPE_POLICY filtering
  const allowedTypes = STAGE_TYPE_POLICY[stage] || [];
  if (allowedTypes.length > 0) {
    selectedFacts = selectedFacts.filter((f) => {
      const type = f.type || f.recordType || 'semantic_fact';
      if (allowedTypes.includes(type) || allowedTypes.includes('semantic_fact')) return true;
      omittedByPolicy.push({ id: f.id || 'unknown', reason: `type_${type}_not_in_${stage}` });
      return false;
    });
  }

  // Filter 3: Relevance scoring & ranking (score > 0 || isGlobal === true)
  selectedFacts = selectedFacts
    .map((fact) => {
      const score = scoreRelevance({ item: fact, objective, paths: changedPaths });
      return { fact, score };
    })
    .filter(({ fact, score }) => score > 0 || fact.isGlobal === true || (!fact.scope || fact.scope.length === 0))
    .sort((a, b) => b.score - a.score)
    .map(({ fact }) => fact);

  selectedConstraints = selectedConstraints.filter((constraint) => {
    if (!constraint.scope || constraint.scope.length === 0) return true;
    if (changedPaths.length === 0) return true;
    return changedPaths.some((p) => matchPathScope(p, constraint.scope));
  });

  const selectedGraph = rawGraphRelations
    .filter(isRecordActive)
    .map((rel) => ({
      from: rel.from,
      to: rel.to,
      relation: rel.relation,
      statement: `${rel.from} ${rel.relation} ${rel.to}`,
    }));

  // Record-based budget truncation
  const maxBudgetTokens = STAGE_BUDGETS[stage] || 1500;
  const maxChars = maxBudgetTokens * 4;

  const budgetedFacts = [];
  let currentLength = 0;
  for (const fact of selectedFacts) {
    const factLen = (fact.statement || JSON.stringify(fact)).length + 10;
    if (currentLength + factLen > maxChars) {
      omittedByPolicy.push({ id: fact.id || 'unknown', reason: 'record_budget_exceeded' });
    } else {
      budgetedFacts.push(fact);
      currentLength += factLen;
    }
  }

  const promptBlock = renderPromptBlock({
    stage,
    policyAnchors: selectedPolicy,
    semanticFacts: budgetedFacts,
    graphSynopsis: selectedGraph,
    ontologyConstraints: selectedConstraints,
  });

  const contextPackRef = path.join('context-packs', runId, `${stage}.json`);
  const status = 'ready';

  const rawPayload = {
    schemaVersion: 1,
    projectId,
    knowledgeRevision,
    status,
    strictness,
    stage,
    policyAnchors: selectedPolicy,
    semanticFacts: budgetedFacts,
    graphSynopsis: selectedGraph,
    ontologyConstraints: selectedConstraints,
    staleOrUnavailable,
    omittedByPolicy,
    promptBlock,
    contextPackRef,
  };

  const contextPayload = deepRedact(rawPayload);
  const digest = computeContextDigest(contextPayload);
  contextPayload.digest = digest;

  // Persist context pack
  const root = projectKnowledgeDirectory(projectId, { env });
  const packPath = path.join(root, 'context-packs', runId, `${stage}.json`);
  await writeAtomicJson(packPath, contextPayload);

  return contextPayload;
}
