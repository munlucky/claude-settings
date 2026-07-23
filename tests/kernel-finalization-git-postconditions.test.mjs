import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { runGit } from '../scripts/lib/git-safe.mjs';
import { executeKernelGitCloseout } from '../scripts/kernel/git/closeout.mjs';

test('MG-05 Git Index Postconditions: index is clean and working tree diff is preserved', async () => {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'krn-git-post-'));

  runGit(tmpRepo, ['init', '-b', 'main']);
  runGit(tmpRepo, ['config', 'user.name', 'Test User']);
  runGit(tmpRepo, ['config', 'user.email', 'test@example.com']);

  const baseFile = path.join(tmpRepo, 'base.txt');
  await writeFile(baseFile, 'Base line\n');
  runGit(tmpRepo, ['add', 'base.txt']);
  runGit(tmpRepo, ['commit', '-m', 'Base commit']);

  const selectedFile = path.join(tmpRepo, 'selected.txt');
  await writeFile(selectedFile, 'Selected content\n');

  const receipt = await executeKernelGitCloseout({
    runId: 'git-post-1',
    projectId: 'test-proj',
    repoRoot: tmpRepo,
    gitCloseoutRequest: { requested: true, mode: 'commit', approvalReceipt: 'app-post-1' },
    knowledgeCommitReceipt: { digest: 'digest-post-1' },
    changedFiles: ['selected.txt'],
  });

  assert.equal(receipt.status, 'completed');

  // Verify postconditions
  const cachedDiff = runGit(tmpRepo, ['diff', '--cached', '--quiet']);
  assert.equal(cachedDiff.status, 0); // index clean

  const workingDiff = runGit(tmpRepo, ['diff', '--quiet', '--', 'selected.txt']);
  assert.equal(workingDiff.status, 0); // selected file clean

  const revList = runGit(tmpRepo, ['rev-list', '--count', 'HEAD']);
  assert.equal(Number(String(revList.stdout).trim()), 2);
});
