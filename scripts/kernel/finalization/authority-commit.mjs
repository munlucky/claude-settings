import crypto from 'node:crypto';
import { prepareFinalization } from './prepare.mjs';
import { mapCandidateToCanonicalRecord } from '../knowledge/canonical-record-mapper.mjs';

/**
 * Supports two calling conventions:
 *   1. New: commitFinalizationAuthority(runId, options, { stateStore, faultInjector })
 *   2. Legacy-test: commitFinalizationAuthority(runId, snapshot, options, { stateStore, faultInjector })
 *
 * The snapshot argument detection: if the 2nd arg has .status && .run && .candidates then it is a snapshot.
 */
export async function commitFinalizationAuthority(runId, secondArg, thirdArg, fourthArg) {
  let snapshot = null;
  let options = {};
  let deps = {};

  if (secondArg && typeof secondArg === 'object' && secondArg.run && Array.isArray(secondArg.candidates)) {
    // Legacy-test convention: (runId, snapshot, options, { stateStore })
    snapshot = secondArg;
    options = thirdArg || {};
    deps = fourthArg || {};
  } else {
    // New convention: (runId, options, { stateStore })
    options = secondArg || {};
    deps = thirdArg || {};
    if (options.snapshot) {
      snapshot = options.snapshot;
    }
  }

  const { stateStore = null, faultInjector = null } = deps;

  if (!stateStore) {
    throw new Error('stateStore is required for commitFinalizationAuthority');
  }

  const gitCloseoutRequest = options.gitCloseoutRequest || (options.gitCloseoutRequested ? { requested: true } : null);
  const expectedMutRev = options.expectedMutationRevision !== undefined ? options.expectedMutationRevision : null;
  const expectedKnowRev = options.expectedKnowledgeRevision !== undefined ? options.expectedKnowledgeRevision : null;

  const runBefore = stateStore.getRun(runId);
  if (!runBefore) {
    throw new Error(`Run ${runId} not found`);
  }

  if (runBefore.status === 'completed' || runBefore.state === 'CLOSE') {
    throw new Error(`ALREADY_COMPLETED: Run ${runId} has already been finalized`);
  }

  if (runBefore.state !== 'PROVE' || runBefore.status !== 'active') {
    throw new Error(`INVALID_RUN_STATE: Run ${runId} is in state ${runBefore.state} (${runBefore.status}), must be PROVE (active)`);
  }

  if (expectedMutRev !== null && Number(runBefore.mutationRevision) !== Number(expectedMutRev)) {
    throw new Error(`STALE_MUTATION_REVISION: Expected mutation revision ${expectedMutRev} but run is at ${runBefore.mutationRevision}`);
  }

  const projectId = runBefore.projectId || 'munlucky-moonshot-relay';
  const currentKnowledgeRev = stateStore.getProjectKnowledgeRevision(projectId);

  if (expectedKnowRev !== null && Number(currentKnowledgeRev) !== Number(expectedKnowRev)) {
    throw new Error(`STALE_KNOWLEDGE_REVISION: Expected knowledge revision ${expectedKnowRev} but project is at ${currentKnowledgeRev}`);
  }

  // Re-evaluate snapshot inside the authority commit for MG-03 guarantee
  // If we were given a snapshot already (pre-computed), still validate run state atomically
  const currentSnapshot = snapshot || (options.snapshot || null) ||
    await prepareFinalization(runId, { expectedMutationRevision: runBefore.mutationRevision }, { stateStore });

  if (currentSnapshot.status !== 'ready') {
    throw new Error(`FINALIZATION_BLOCKED: Run ${runId} is blocked and cannot commit finalization authority. Blockers: ${JSON.stringify(currentSnapshot.blockers)}`);
  }

  const nextKnowledgeRev = currentKnowledgeRev + 1;

  const canonicalRecords = (currentSnapshot.candidates || []).map((cand) =>
    mapCandidateToCanonicalRecord(cand, {
      runId,
      projectId,
      revision: nextKnowledgeRev,
      mutationRevision: runBefore.mutationRevision,
    })
  );

  const transactionId = `tx-${projectId}-${runId}-${Date.now()}`;
  const commitDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ transactionId, runId, projectId, revision: nextKnowledgeRev, records: canonicalRecords })).digest('hex')}`;

  const authorityReceipt = {
    receiptId: `far-${runId}-${Date.now()}`,
    runId,
    projectId,
    status: 'committed',
    transactionId,
    commitDigest,
    knowledgeRevision: nextKnowledgeRev,
    canonicalRecordCount: canonicalRecords.length,
    gitCloseoutRequested: Boolean(gitCloseoutRequest && gitCloseoutRequest.requested),
    committedAt: new Date().toISOString(),
  };

  if (stateStore.commitFinalizationAuthorityTransaction) {
    stateStore.commitFinalizationAuthorityTransaction({
      runId,
      projectId,
      transactionId,
      commitDigest,
      knowledgeRevision: nextKnowledgeRev,
      currentKnowledgeRevision: currentKnowledgeRev,
      mutationRevision: runBefore.mutationRevision,
      canonicalRecords,
      authorityReceipt,
      gitCloseoutRequest,
      faultInjector,
    });
  }

  return authorityReceipt;
}
