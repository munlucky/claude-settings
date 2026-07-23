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
  isCompletionAccepted = true,
  candidates = [],
  supersessionProposals = [],
  sourceIdentity = 'kernel-source',
  env = process.env,
} = {}) {
  // Precondition: Completion MUST be accepted before verified knowledge write
  if (!isCompletionAccepted) {
    throw new KernelKnowledgeCommitError(
      'COMPLETION_NOT_ACCEPTED',
      'Verified project knowledge write requires accepted completion decision'
    );
  }

  const currentRevision = await readProjectRevision(projectId, { env });
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
