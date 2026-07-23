import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { runGit } from '../scripts/lib/git-safe.mjs';
import { executeKernelGitCloseout, KernelGitCloseoutError } from '../scripts/kernel/git/closeout.mjs';

test('executeKernelGitCloseout isolates pre-staged user changes using temporary index', async () => {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'git-closeout-safety-'));

  // Initialize repo and initial commit
  runGit(tmpRepo, ['init', '-b', 'main']);
  runGit(tmpRepo, ['config', 'user.name', 'Test User']);
  runGit(tmpRepo, ['config', 'user.email', 'test@example.com']);

  const fileA = path.join(tmpRepo, 'fileA.txt');
  const fileB = path.join(tmpRepo, 'fileB.txt');

  await writeFile(fileA, 'Initial A\n');
  runGit(tmpRepo, ['add', 'fileA.txt']);
  runGit(tmpRepo, ['commit', '-m', 'Initial commit']);

  // User pre-stages fileA.txt modification
  await writeFile(fileA, 'User pre-staged change in fileA\n');
  runGit(tmpRepo, ['add', 'fileA.txt']);

  // Kernel creates fileB.txt
  await writeFile(fileB, 'Kernel change in fileB\n');

  const gitCloseoutRequest = {
    requested: true,
    mode: 'commit',
    approvalReceipt: 'receipt-user-app',
  };
  const knowledgeCommitReceipt = {
    digest: 'kc-digest-123',
  };

  const receipt = await executeKernelGitCloseout({
    runId: 'git-run-1',
    projectId: 'test-proj',
    repoRoot: tmpRepo,
    gitCloseoutRequest,
    knowledgeCommitReceipt,
    changedFiles: ['fileB.txt'],
  });

  assert.equal(receipt.status, 'completed');

  // Verify that fileA.txt pre-staged modification is STILL in user's index (staged and uncommitted)
  const statusRes = runGit(tmpRepo, ['status', '--porcelain']);
  const statusOutput = String(statusRes.stdout || '').trim();

  // fileA.txt should be M (staged modification)
  assert.match(statusOutput, /M\s+fileA\.txt/);
});

test('executeKernelGitCloseout rejects detached HEAD', async () => {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'git-detached-test-'));

  runGit(tmpRepo, ['init']);
  runGit(tmpRepo, ['config', 'user.name', 'Test User']);
  runGit(tmpRepo, ['config', 'user.email', 'test@example.com']);

  const fileA = path.join(tmpRepo, 'fileA.txt');
  await writeFile(fileA, 'Initial A\n');
  runGit(tmpRepo, ['add', 'fileA.txt']);
  runGit(tmpRepo, ['commit', '-m', 'Initial commit']);

  // Checkout detached commit SHA
  const sha = String(runGit(tmpRepo, ['rev-parse', 'HEAD']).stdout).trim();
  runGit(tmpRepo, ['checkout', sha]);

  await assert.rejects(
    async () =>
      executeKernelGitCloseout({
        runId: 'git-run-detached',
        projectId: 'test-proj',
        repoRoot: tmpRepo,
        gitCloseoutRequest: { requested: true, mode: 'commit', approvalReceipt: 'receipt-1' },
        knowledgeCommitReceipt: { digest: 'kc-1' },
        changedFiles: ['fileA.txt'],
      }),
    (err) => err instanceof KernelGitCloseoutError && err.code === 'DETACHED_HEAD'
  );
});
