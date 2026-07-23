import test from 'node:test';
import assert from 'node:assert/strict';
import { executeKernelGitCloseout, KernelGitCloseoutError } from '../scripts/kernel/git/closeout.mjs';

test('executeKernelGitCloseout fails closed when knowledge receipt is missing or request is invalid', async () => {
  await assert.rejects(
    async () =>
      executeKernelGitCloseout({
        runId: 'r-git-1',
        projectId: 'p-git-1',
        repoRoot: process.cwd(),
        gitCloseoutRequest: { requested: true, approvalReceipt: 'approval://user/1' },
        knowledgeCommitReceipt: null,
      }),
    (err) => err instanceof KernelGitCloseoutError && err.code === 'KNOWLEDGE_RECEIPT_REQUIRED'
  );
});
