import { executeKernelGitCloseout } from './closeout.mjs';

export async function processGitCloseoutOutbox({ stateStore = null, repoRoot = process.cwd() } = {}) {
  if (!stateStore || typeof stateStore.getPendingGitCloseoutJobs !== 'function') {
    return [];
  }

  const pendingJobs = stateStore.getPendingGitCloseoutJobs();
  const results = [];

  for (const job of pendingJobs) {
    if (stateStore.claimGitCloseoutJob && !stateStore.claimGitCloseoutJob(job.jobId)) {
      continue; // Skip if already claimed by another worker
    }

    try {
      const commitReceiptRow = stateStore.getKnowledgeCommitReceipt
        ? stateStore.getKnowledgeCommitReceipt(job.runId)
        : null;

      const receipt = await executeKernelGitCloseout({
        runId: job.runId,
        projectId: job.projectId,
        repoRoot,
        gitCloseoutRequest: { requested: true, mode: job.mode, approvalReceipt: job.approvalReceipt },
        knowledgeCommitReceipt: commitReceiptRow ? commitReceiptRow.receiptJson : { digest: 'outbox' },
        changedFiles: job.selectedPaths || [],
      });

      const nextStatus = receipt.status || 'completed';
      if (stateStore.updateGitCloseoutJobStatus) {
        stateStore.updateGitCloseoutJobStatus(job.jobId, nextStatus, { commitSha: receipt.commitSha, receipt });
      }

      results.push({ jobId: job.jobId, status: nextStatus, receipt });
    } catch (err) {
      if (stateStore.updateGitCloseoutJobStatus) {
        stateStore.updateGitCloseoutJobStatus(job.jobId, 'failed', { errorCode: 'GIT_CLOSEOUT_FAILED', errorMessage: err.message });
      }
      results.push({ jobId: job.jobId, status: 'failed', error: err.message });
    }
  }

  return results;
}
