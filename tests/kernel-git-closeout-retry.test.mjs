import test from 'node:test';
import assert from 'node:assert/strict';
import { executeKernelGitCloseout } from '../scripts/kernel/git/closeout.mjs';

test('executeKernelGitCloseout retry skips creating duplicate commit when existingCommitSha is provided', async () => {
  const receipt = await executeKernelGitCloseout({
    runId: 'retry-run-1',
    projectId: 'p-retry',
    repoRoot: process.cwd(),
    gitCloseoutRequest: { requested: true, mode: 'soft', approvalReceipt: 'approval://user/1', existingCommitSha: 'sha-existing-123' },
    knowledgeCommitReceipt: { digest: 'k-digest-1' },
    changedFiles: [],
  });

  assert.equal(receipt.commitSha, 'sha-existing-123');
  assert.equal(receipt.status, 'completed');
});
