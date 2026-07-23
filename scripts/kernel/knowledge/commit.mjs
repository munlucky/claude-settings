import path from 'node:path';
import crypto from 'node:crypto';
import { loadAllProjectRecords, readProjectRevision, projectKnowledgeDirectory, writeAtomicJsonl, writeAtomicJson } from './store.mjs';
import { advanceProjectRevision } from './revision.mjs';
import { applySupersessions } from './supersession.mjs';
import { buildKnowledgeCommitReceipt } from './receipt.mjs';
import { validateKnowledgeRecord, resolveRecordType } from './records.mjs';

export class KernelKnowledgeCommitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelKnowledgeCommitError';
    this.code = code;
    this.details = details;
  }
}

export async function rebuildKnowledgeProjection(projectId, { env = process.env, stateStore = null } = {}) {
  const root = projectKnowledgeDirectory(projectId, { env });
  const kDir = path.join(root, 'knowledge');
  const factsPath = path.join(kDir, 'semantic', 'verified-facts.jsonl');

  let records = [];
  if (stateStore && typeof stateStore.listKnowledgeRecords === 'function') {
    records = stateStore.listKnowledgeRecords({ projectId, statuses: ['verified', 'committed'] });
  }

  if (records.length > 0) {
    await writeAtomicJsonl(factsPath, records);
  }
}

export async function commitProjectKnowledge({
  runId,
  projectId,
  stateStore = null,
  expectedKnowledgeRevision = null,
  completionDecisionRef = null,
  candidates = [],
  supersessionProposals = [],
  sourceIdentity = 'kernel-source',
  faultInjection = null,
  env = process.env,
} = {}) {
  if (!stateStore || typeof stateStore.getRun !== 'function') {
    throw new KernelKnowledgeCommitError(
      'COMPLETION_AUTHORITY_REQUIRED',
      'Kernel stateStore is required for completion authority'
    );
  }

  const run = stateStore.getRun(runId);
  const completion = stateStore.getCompletionDecision ? stateStore.getCompletionDecision(runId) : null;

  if (!run) {
    throw new KernelKnowledgeCommitError('RUN_NOT_FOUND', `Run ${runId} not found`);
  }
  if (!completion) {
    throw new KernelKnowledgeCommitError('COMPLETION_DECISION_REQUIRED', `Run ${runId} has no authoritative completion decision`);
  }
  if (completion.decision !== 'accepted') {
    throw new KernelKnowledgeCommitError('COMPLETION_NOT_ACCEPTED', `Run ${runId} completion decision is ${completion.decision}`);
  }
  if (run.projectId !== projectId) {
    throw new KernelKnowledgeCommitError('PROJECT_ID_MISMATCH', `Run project mismatch: expected ${projectId} but found ${run.projectId}`);
  }
  if (completion.sourceIdentity !== run.sourceIdentity) {
    throw new KernelKnowledgeCommitError('SOURCE_IDENTITY_MISMATCH', `Completion decision source identity mismatch for run ${runId}`);
  }
  if (completion.mutationRevision !== run.mutationRevision) {
    throw new KernelKnowledgeCommitError('STALE_COMPLETION_DECISION', `Completion decision mutation revision mismatch for run ${runId}`);
  }

  const acceptedCandidates = candidates.filter((c) => c.status === 'verified' || c.status === 'committed');
  const rejectedCandidates = candidates.filter((c) => c.status === 'rejected');

  if (acceptedCandidates.length === 0 && supersessionProposals.length === 0) {
    const currentRevision = String(stateStore.getProjectKnowledgeRevision ? stateStore.getProjectKnowledgeRevision(projectId) : 1);
    const receipt = buildKnowledgeCommitReceipt({
      runId,
      projectId,
      sourceIdentity,
      revisionBefore: currentRevision,
      revisionAfter: currentRevision,
      acceptedCandidates: [],
      rejectedCandidates,
      status: 'no_change',
    });
    return receipt;
  }

  // Format records preserving exact candidate type
  const recordsToCommit = acceptedCandidates.map((cand) => {
    const recType = resolveRecordType(cand.proposedType || cand.type);
    const rec = {
      id: cand.candidateId || cand.id || `rec-${crypto.randomUUID()}`,
      candidateId: cand.candidateId || cand.id,
      projectId,
      type: recType,
      statement: cand.statement,
      scope: cand.scope || [],
      status: 'committed',
      trustTier: 'verified',
      createdAt: new Date().toISOString(),
      evidence: { refs: cand.evidenceRefs || [] },
    };
    validateKnowledgeRecord(rec);
    return rec;
  });

  const transactionId = `tx-${crypto.randomUUID()}`;
  const supersessions = supersessionProposals.map((p) => p.targetId || p);

  let txResult;
  try {
    txResult = stateStore.commitKnowledgeTransaction({
      transactionId,
      runId,
      projectId,
      expectedRevision: expectedKnowledgeRevision,
      records: recordsToCommit,
      supersessions,
      provenance: { runId, sourceIdentity, committedCount: recordsToCommit.length },
      faultInjection,
    });
  } catch (err) {
    throw new KernelKnowledgeCommitError(
      err.message.includes('STALE_KNOWLEDGE_REVISION') ? 'STALE_KNOWLEDGE_REVISION' : 'TRANSACTION_FAILED',
      err.message,
      { originalError: err }
    );
  }

  const { revisionBefore, revisionAfter } = txResult;

  let projectionStatus = 'completed';
  try {
    const root = projectKnowledgeDirectory(projectId, { env });
    const kDir = path.join(root, 'knowledge');
    const factsPath = path.join(kDir, 'semantic', 'verified-facts.jsonl');
    const provLogPath = path.join(kDir, 'provenance', 'prov-log.jsonl');

    await writeAtomicJsonl(factsPath, recordsToCommit);
    const provEntry = {
      runId,
      projectId,
      action: 'commitProjectKnowledge',
      timestamp: new Date().toISOString(),
      committedCount: acceptedCandidates.length,
    };
    await writeAtomicJsonl(provLogPath, [provEntry]);
    await advanceProjectRevision(projectId, { env });
  } catch (projErr) {
    projectionStatus = 'failed';
  }

  const receipt = buildKnowledgeCommitReceipt({
    runId,
    projectId,
    sourceIdentity: completion.sourceIdentity || sourceIdentity,
    mutationRevision: completion.mutationRevision || 1,
    completionDecisionRef: completion.evidenceDigest || completionDecisionRef || `accepted-${runId}`,
    revisionBefore,
    revisionAfter,
    acceptedCandidates,
    rejectedCandidates,
    supersededRecords: supersessions,
    evidenceRefs: acceptedCandidates.flatMap((c) => c.evidenceRefs || []),
    projectionStatus,
    status: 'committed',
  });

  try {
    const root = projectKnowledgeDirectory(projectId, { env });
    const receiptPath = path.join(root, 'receipts', `${runId}-knowledge-closeout.json`);
    await writeAtomicJson(receiptPath, receipt);
  } catch (e) {
    // Non-fatal receipt save error
  }

  return receipt;
}
