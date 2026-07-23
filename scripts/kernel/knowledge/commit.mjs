import path from 'node:path';
import { loadAllProjectRecords, readProjectRevision, projectKnowledgeDirectory, writeAtomicJsonl, writeAtomicJson } from './store.mjs';
import { advanceProjectRevision } from './revision.mjs';
import { applySupersessions } from './supersession.mjs';
import { buildKnowledgeCommitReceipt } from './receipt.mjs';
import { validateKnowledgeRecord } from './records.mjs';

export class KernelKnowledgeCommitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelKnowledgeCommitError';
    this.code = code;
    this.details = details;
  }
}

export async function commitProjectKnowledge({
  runId,
  projectId,
  expectedKnowledgeRevision = null,
  completionDecisionRef = null,
  stateStore = null,
  isCompletionAccepted = false,
  candidates = [],
  supersessionProposals = [],
  sourceIdentity = 'kernel-source',
  env = process.env,
} = {}) {
  // Fail-closed completion decision validation
  let accepted = Boolean(isCompletionAccepted);

  if (stateStore && typeof stateStore.assessCompletion === 'function') {
    const assessment = stateStore.assessCompletion(runId, { commitDecision: false });
    const run = stateStore.getRun ? stateStore.getRun(runId) : assessment?.run;
    if (!run || run.projectId !== projectId) {
      throw new KernelKnowledgeCommitError(
        'PROJECT_ID_MISMATCH',
        `Run project identity mismatch for run ${runId}: expected ${projectId}`
      );
    }
    accepted = assessment.decision === 'accepted' || run.status === 'completed';
    if (completionDecisionRef && completionDecisionRef !== runId && completionDecisionRef !== `accepted-${runId}`) {
      const dbReceipt = stateStore.getKnowledgeCommitReceipt ? stateStore.getKnowledgeCommitReceipt(runId) : null;
      if (!dbReceipt && assessment.decision !== 'accepted') {
        accepted = false;
      }
    }
  }

  if (!accepted) {
    throw new KernelKnowledgeCommitError(
      'COMPLETION_NOT_ACCEPTED',
      'Verified project knowledge write requires accepted completion decision from Kernel authority'
    );
  }

  const currentRevision = await readProjectRevision(projectId, { env });

  // Optimistic Concurrency Control (OCC) check
  if (expectedKnowledgeRevision !== null && expectedKnowledgeRevision !== undefined && String(expectedKnowledgeRevision) !== String(currentRevision)) {
    throw new KernelKnowledgeCommitError(
      'STALE_KNOWLEDGE_REVISION',
      `Optimistic concurrency control conflict: expected revision ${expectedKnowledgeRevision} but found ${currentRevision}`
    );
  }
  const records = await loadAllProjectRecords(projectId, { env });

  const acceptedCandidates = candidates.filter((c) => c.status === 'verified');
  const rejectedCandidates = candidates.filter((c) => c.status === 'rejected');

  if (acceptedCandidates.length === 0 && supersessionProposals.length === 0) {
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

  // Validate accepted candidate record shapes
  const newVerifiedFacts = [...records.semanticFacts];
  for (const cand of acceptedCandidates) {
    const rec = {
      id: cand.candidateId,
      projectId,
      type: 'semantic_fact',
      statement: cand.statement,
      status: 'committed',
      trustTier: 'verified',
      createdAt: new Date().toISOString(),
      evidence: { refs: cand.evidenceRefs },
    };
    validateKnowledgeRecord(rec);
    newVerifiedFacts.push(rec);
  }

  const { updatedFacts, supersessionLogEntries } = applySupersessions({
    currentFacts: newVerifiedFacts,
    supersessionProposals,
    projectId,
  });

  const root = projectKnowledgeDirectory(projectId, { env });
  const kDir = path.join(root, 'knowledge');

  // Atomic writes
  const factsPath = path.join(kDir, 'semantic', 'verified-facts.jsonl');
  const superLogPath = path.join(kDir, 'semantic', 'supersession-log.jsonl');
  const provLogPath = path.join(kDir, 'provenance', 'prov-log.jsonl');

  await writeAtomicJsonl(factsPath, updatedFacts);
  if (supersessionLogEntries.length > 0) {
    const existingLog = records.supersessionLog || [];
    await writeAtomicJsonl(superLogPath, [...existingLog, ...supersessionLogEntries]);
  }

  const provEntry = {
    runId,
    projectId,
    action: 'commitProjectKnowledge',
    timestamp: new Date().toISOString(),
    committedCount: acceptedCandidates.length,
  };
  await writeAtomicJsonl(provLogPath, [...records.provenanceLog, provEntry]);

  // Advance revision manifest LAST
  const { revisionBefore, revisionAfter } = await advanceProjectRevision(projectId, { env });

  const receipt = buildKnowledgeCommitReceipt({
    runId,
    projectId,
    sourceIdentity,
    revisionBefore,
    revisionAfter,
    acceptedCandidates,
    rejectedCandidates,
    supersededRecords: supersessionProposals.map((p) => p.targetId),
    evidenceRefs: acceptedCandidates.flatMap((c) => c.evidenceRefs || []),
    filesWritten: [factsPath, superLogPath, provLogPath],
    status: 'committed',
  });

  const receiptPath = path.join(root, 'receipts', `${runId}-knowledge-closeout.json`);
  await writeAtomicJson(receiptPath, receipt);

  return receipt;
}
