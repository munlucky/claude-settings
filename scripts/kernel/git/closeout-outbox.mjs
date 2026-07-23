import { executeKernelGitCloseout } from './closeout.mjs';

export async function processGitCloseoutOutbox({ stateStore = null, repoRoot = process.cwd() } = {}) {
  if (!stateStore || typeof stateStore.getPendingGitCloseoutJobs !== 'function') {
    return [];
  }

  const pendingJobs = stateStore.getPendingGitCloseoutJobs();
  const results = [];

  for (const job of pendingJobs) {
    try {
      const commitReceiptRow = stateStore.getKnowledgeCommitReceipt(job.runId);
      const receipt = await executeKernelGitCloseout({
        runId: job.runId,
        projectId: job.projectId,
        repoRoot,
        gitCloseoutRequest: { requested: true, mode: job.mode, approvalReceipt: job.approvalReceipt },
        knowledgeCommitReceipt: commitReceiptRow ? commitReceiptRow.receiptJson : { digest: 'outbox' },
      });

      stateStore.updateGitCloseoutJobStatus(job.jobId, 'completed', { receipt });
      results.push({ jobId: job.jobId, status: 'completed', receipt });
    } catch (err) {
      stateStore.updateGitCloseoutJobStatus(job.jobId, 'failed', { error: err.message });
      results.push({ jobId: job.jobId, status: 'failed', error: err.message });
    }
  }

  return results;
}
