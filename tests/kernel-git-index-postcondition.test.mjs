import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { runGit } from '../scripts/lib/git-safe.mjs';
import { executeKernelGitCloseout } from '../scripts/kernel/git/closeout.mjs';

test('FAR-SCN-009 Characterization: Git closeout preserves working directory postconditions', async () => {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'krn-git-post-'));

  runGit(tmpRepo, ['init', '-b', 'main']);
  runGit(tmpRepo, ['config', 'user.name', 'Test User']);
  runGit(tmpRepo, ['config', 'user.email', 'test@example.com']);

  const fileA = path.join(tmpRepo, 'fileA.txt');
  await writeFile(fileA, 'Initial A\n');
  runGit(tmpRepo, ['add', 'fileA.txt']);
  runGit(tmpRepo, ['commit', '-m', 'Initial commit']);

  // Unstaged change in fileA
  await writeFile(fileA, 'Modified A\n');

  // Kernel fileB
  const fileB = path.join(tmpRepo, 'fileB.txt');
  await writeFile(fileB, 'Kernel B\n');

  const receipt = await executeKernelGitCloseout({
    runId: 'git-post-1',
    projectId: 'test-proj',
    repoRoot: tmpRepo,
    gitCloseoutRequest: { requested: true, mode: 'commit', approvalReceipt: 'app-1' },
    knowledgeCommitReceipt: { digest: 'kc-1' },
    changedFiles: ['fileB.txt'],
  });

  assert.equal(receipt.status, 'completed');

  // Verify fileA unstaged modification is preserved
  const statusRes = runGit(tmpRepo, ['status', '--porcelain']);
  assert.match(String(statusRes.stdout), /M\s+fileA\.txt/);
});
