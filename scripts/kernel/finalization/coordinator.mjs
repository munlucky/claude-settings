import { prepareFinalization } from './prepare.mjs';
import { evaluateReadiness } from './readiness.mjs';
import { commitFinalizationAuthority } from './authority-commit.mjs';
import { rebuildKnowledgeProjection } from '../knowledge/projection.mjs';
import { executeKernelGitCloseout } from '../git/closeout.mjs';

export async function finalizeRunCoordinator(runId, { observations = [], gitCloseoutRequest = null, repoRoot = process.cwd() } = {}, { stateStore = null } = {}) {
  if (!stateStore) {
    throw new Error('stateStore is required for finalizeRunCoordinator');
  }

  // 1. Re-entrant Prepare Step
  const snapshot = await prepareFinalization(runId, { observations }, { stateStore });
  const readiness = evaluateReadiness(snapshot);

  if (!readiness.isReady) {
    const blockedReceipt = {
      schemaVersion: 1,
      runId,
      projectId: snapshot.projectId,
      status: 'blocked',
      completionStatus: 'blocked',
      knowledgeStatus: 'blocked',
      projectionStatus: 'none',
      gitCloseoutStatus: 'skipped',
      finalizationStatus: 'blocked',
      snapshot,
      blockers: snapshot.blockers,
    };
    stateStore.recordFinalizationReceipt ? stateStore.recordFinalizationReceipt(runId, blockedReceipt) : null;
    return blockedReceipt;
  }

  // 2. Atomic SQLite Authority Transaction
  const authorityReceipt = await commitFinalizationAuthority(runId, snapshot, { gitCloseoutRequest }, { stateStore });

  // 3. Derived Knowledge Projection (best-effort / rebuildable)
  let projectionStatus = 'completed';
  try {
    if (typeof rebuildKnowledgeProjection === 'function') {
      await rebuildKnowledgeProjection(snapshot.projectId, { stateStore, rootDir: repoRoot });
    }
  } catch (err) {
    projectionStatus = 'rebuild_deferred';
  }

  // 4. Optional Git Closeout Delivery
  let gitCloseoutReceipt = { status: 'skipped' };
  if (gitCloseoutRequest && gitCloseoutRequest.requested) {
    try {
      gitCloseoutReceipt = await executeKernelGitCloseout({
        runId,
        projectId: snapshot.projectId,
        repoRoot,
        gitCloseoutRequest,
        knowledgeCommitReceipt: { digest: authorityReceipt.commitDigest },
        changedFiles: snapshot.candidates.flatMap((c) => c.scope || []),
      });
    } catch (err) {
      gitCloseoutReceipt = { status: 'failed', error: err.message };
    }
  }

  // 5. Finalization Receipt
  const nowStr = new Date().toISOString();
  const finalizationReceipt = {
    schemaVersion: 1,
    receiptId: `fin-${runId}-${Date.now()}`,
    runId,
    projectId: snapshot.projectId,
    status: 'completed',
    completionStatus: 'accepted',
    knowledgeStatus: authorityReceipt.status || 'committed',
    projectionStatus,
    gitCloseoutStatus: gitCloseoutReceipt.status || 'skipped',
    finalizationStatus: 'completed',
    authorityReceipt,
    completionResult: { decision: 'accepted' },
    knowledgeCommitReceipt: authorityReceipt,
    gitCloseoutReceipt,
    createdAt: nowStr,
    updatedAt: nowStr,
    completedAt: nowStr,
  };

  stateStore.recordFinalizationReceipt ? stateStore.recordFinalizationReceipt(runId, finalizationReceipt) : null;

  return finalizationReceipt;
}
