import crypto from 'node:crypto';
import { evaluateReadiness } from './readiness.mjs';
import { mapCandidateToCanonicalRecord } from '../knowledge/canonical-record-mapper.mjs';

export async function commitFinalizationAuthority(runId, snapshot, { gitCloseoutRequest = null } = {}, { stateStore = null } = {}) {
  if (!stateStore) {
    throw new Error('stateStore is required for commitFinalizationAuthority');
  }

  const readiness = evaluateReadiness(snapshot);
  if (!readiness.isReady) {
    throw new Error(`FINALIZATION_BLOCKED: Run ${runId} is blocked and cannot commit finalization authority`);
  }

  const run = stateStore.getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  if (run.status === 'completed') {
    throw new Error(`ALREADY_COMPLETED: Run ${runId} has already been finalized`);
  }

  const projectId = snapshot.projectId || run.projectId || 'munlucky-moonshot-relay';
  const currentRev = Number(stateStore.getLatestProjectRevision ? stateStore.getLatestProjectRevision(projectId) : 0);
  const nextRev = currentRev + 1;

  // Map candidates to canonical typed knowledge records
  const canonicalRecords = (snapshot.candidates || []).map((cand) =>
    mapCandidateToCanonicalRecord(cand, { runId, projectId, revision: nextRev })
  );

  const transactionId = `tx-${projectId}-${runId}-${Date.now()}`;
  const commitDigest = crypto.createHash('sha256').update(JSON.stringify({ transactionId, runId, projectId, revision: nextRev, records: canonicalRecords })).digest('hex');

  const authorityReceipt = {
    receiptId: `far-${runId}-${Date.now()}`,
    runId,
    projectId,
    status: 'committed',
    transactionId,
    commitDigest,
    knowledgeRevision: nextRev,
    canonicalRecordCount: canonicalRecords.length,
    gitCloseoutRequested: Boolean(gitCloseoutRequest && gitCloseoutRequest.requested),
    committedAt: new Date().toISOString(),
  };

  // Perform atomic SQLite transaction
  stateStore.commitFinalizationAuthorityTransaction({
    runId,
    projectId,
    transactionId,
    commitDigest,
    knowledgeRevision: nextRev,
    canonicalRecords,
    authorityReceipt,
    gitCloseoutRequest,
  });

  return authorityReceipt;
}
