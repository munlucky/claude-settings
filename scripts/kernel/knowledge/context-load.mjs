import path from 'node:path';
import { loadAllProjectRecords, readProjectRevision, projectKnowledgeDirectory, writeAtomicJson } from './store.mjs';
import { renderPromptBlock, computeContextDigest } from './context-render.mjs';

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
  env = process.env,
} = {}) {
  if (!VALID_STAGES.includes(stage)) {
    throw new KernelContextLoadError('INVALID_STAGE', `Invalid stage: ${stage}`);
  }

  const knowledgeRevision = await readProjectRevision(projectId, { env });
  const records = await loadAllProjectRecords(projectId, { env });

  const policyAnchors = records.policyAnchors || [];
  const semanticFacts = records.semanticFacts || [];
  const graphSynopsis = (records.kgRelations || []).map((rel) => ({
    from: rel.from,
    to: rel.to,
    relation: rel.relation,
    statement: `${rel.from} ${rel.relation} ${rel.to}`,
  }));
  const ontologyConstraints = records.ontologyConstraints || [];

  const staleOrUnavailable = [];
  const omittedByPolicy = [];

  // Filter based on stage relevance
  let selectedPolicy = policyAnchors;
  let selectedFacts = semanticFacts;
  let selectedGraph = graphSynopsis;
  let selectedConstraints = ontologyConstraints;

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
    // Truncate cleanly if tokens exceed estimate
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
