import path from 'node:path';
import { loadAllProjectRecords, readProjectRevision, projectKnowledgeDirectory, writeAtomicJson } from './store.mjs';
import { renderPromptBlock, computeContextDigest } from './context-render.mjs';
import { matchPathScope, calculatePathRelevance } from './path-scope.mjs';

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

  // Filter 2: Path-relevance and objective-aware filtering if changedPaths provided
  if (Array.isArray(changedPaths) && changedPaths.length > 0) {
    selectedFacts = selectedFacts
      .map((fact) => {
        const score = calculatePathRelevance(changedPaths, fact.scope || []);
        return { fact, score };
      })
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ fact }) => fact);

    selectedConstraints = selectedConstraints.filter((constraint) => {
      if (!constraint.scope || constraint.scope.length === 0) return true;
      return changedPaths.some((p) => matchPathScope(p, constraint.scope));
    });
  }

  // Filter 3: Stage-specific filter
  if (stage === 'PROVE' || stage === 'CLOSE') {
    selectedFacts = selectedFacts.filter((f) => f.status === 'verified' || f.status === 'committed');
  }

  const selectedGraph = rawGraphRelations
    .filter(isRecordActive)
    .map((rel) => ({
      from: rel.from,
      to: rel.to,
      relation: rel.relation,
      statement: `${rel.from} ${rel.relation} ${rel.to}`,
    }));

  // Quota enforcement and budget truncation
  const maxBudget = STAGE_BUDGETS[stage] || 1500;
  const promptBlock = renderPromptBlock({
    stage,
    policyAnchors: selectedPolicy,
    semanticFacts: selectedFacts,
    graphSynopsis: selectedGraph,
    ontologyConstraints: selectedConstraints,
  });

  let finalPromptBlock = promptBlock;
  if (promptBlock.length > maxBudget * 4) {
    finalPromptBlock = promptBlock.slice(0, maxBudget * 4) + '\n...[truncated by budget]';
    omittedByPolicy.push({ reason: 'budget_exceeded', maxBudget });
  }

  const contextPackRef = path.join('context-packs', runId, `${stage}.json`);
  const status = 'ready';

  const contextPayload = {
    schemaVersion: 1,
    projectId,
    knowledgeRevision,
    status,
    strictness,
    stage,
    policyAnchors: selectedPolicy,
    semanticFacts: selectedFacts,
    graphSynopsis: selectedGraph,
    ontologyConstraints: selectedConstraints,
    staleOrUnavailable,
    omittedByPolicy,
    promptBlock: finalPromptBlock,
    contextPackRef,
  };

  const digest = computeContextDigest(contextPayload);
  contextPayload.digest = digest;

  // Persist context pack
  const root = projectKnowledgeDirectory(projectId, { env });
  const packPath = path.join(root, 'context-packs', runId, `${stage}.json`);
  await writeAtomicJson(packPath, contextPayload);

  return contextPayload;
}
