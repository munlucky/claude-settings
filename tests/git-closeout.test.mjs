import test from 'node:test';
import assert from 'node:assert/strict';
import { executeKernelGitCloseout } from '../scripts/kernel/git/closeout.mjs';

test('Git Closeout - verifies Git closeout execution contract', async () => {
  const gitCloseoutRequest = {
    requested: true,
    mode: 'soft',
    approvalReceipt: 'receipt-123',
    commitSha: 'd'.repeat(40),
  };

  const knowledgeCommitReceipt = {
    status: 'committed',
    revisionAfter: '1',
    committedCount: 1,
  };

  // When no changed files selected, returns skipped
  const resSkipped = await executeKernelGitCloseout({
    runId: 'run-git-1',
    projectId: 'proj-git-1',
    repoRoot: process.cwd(),
    gitCloseoutRequest,
    knowledgeCommitReceipt,
    changedFiles: [],
  });

  assert.ok(resSkipped);
  assert.equal(resSkipped.status, 'skipped');

  // When requested is false, returns skipped
  const resUnrequested = await executeKernelGitCloseout({
    runId: 'run-git-1',
    projectId: 'proj-git-1',
    repoRoot: process.cwd(),
    gitCloseoutRequest: { requested: false },
    knowledgeCommitReceipt,
    changedFiles: ['README.md'],
  });

  assert.ok(resUnrequested);
  assert.equal(resUnrequested.status, 'skipped');
});
