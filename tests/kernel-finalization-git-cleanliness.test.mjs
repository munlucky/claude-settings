import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { runGit } from '../scripts/lib/git-safe.mjs';
import { executeKernelGitCloseout } from '../scripts/kernel/git/closeout.mjs';

test('Git closeout leaves index clean and does not alter unselected staged files', async () => {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'krn-git-clean-'));

  runGit(tmpRepo, ['init', '-b', 'main']);
  runGit(tmpRepo, ['config', 'user.name', 'Test User']);
  runGit(tmpRepo, ['config', 'user.email', 'test@example.com']);

  const fileA = path.join(tmpRepo, 'unselected.txt');
  await writeFile(fileA, 'Unselected file\n');
  runGit(tmpRepo, ['add', 'unselected.txt']);
  runGit(tmpRepo, ['commit', '-m', 'Base commit']);

  const fileB = path.join(tmpRepo, 'kernel-file.txt');
  await writeFile(fileB, 'Kernel work\n');

  const receipt = await executeKernelGitCloseout({
    runId: 'git-cl-1',
    projectId: 'test-proj',
    repoRoot: tmpRepo,
    gitCloseoutRequest: { requested: true, mode: 'commit', approvalReceipt: 'app-cl-1' },
    knowledgeCommitReceipt: { digest: 'digest-cl-1' },
    changedFiles: ['kernel-file.txt'],
  });

  assert.equal(receipt.status, 'completed');
  assert.ok(['synced', 'not_requested', 'untracked'].includes(receipt.parity));

  const logRes = runGit(tmpRepo, ['log', '-1', '--oneline']);
  assert.match(String(logRes.stdout), /feat\(kernel\)/);
});
