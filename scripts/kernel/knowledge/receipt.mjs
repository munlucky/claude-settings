import crypto from 'node:crypto';

export function buildKnowledgeCommitReceipt({
  runId,
  projectId,
  sourceIdentity = 'kernel-source-identity',
  revisionBefore,
  revisionAfter,
  acceptedCandidates = [],
  rejectedCandidates = [],
  supersededRecords = [],
  evidenceRefs = [],
  filesWritten = [],
  status = 'committed',
}) {
  const payload = {
    schemaVersion: 1,
    runId,
    projectId,
    sourceIdentity,
    mutationRevision: 1,
    completionDecisionRef: `accepted-${runId}`,
    revisionBefore,
    revisionAfter,
    acceptedCandidates,
    rejectedCandidates,
    supersededRecords,
    evidenceRefs,
    filesWritten,
    status,
  };

  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  payload.digest = digest;
  return payload;
}
