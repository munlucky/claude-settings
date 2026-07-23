import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { runGit } from '../scripts/lib/git-safe.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization } from '../scripts/kernel/finalization/prepare.mjs';
import { commitFinalizationAuthority } from '../scripts/kernel/finalization/authority-commit.mjs';
import { processGitCloseoutOutbox } from '../scripts/kernel/git/closeout-outbox.mjs';

test('MG-05 Git Outbox E2E: outbox worker processes enqueued git closeout job cleanly', async () => {
  const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'krn-outbox-e2e-repo-'));
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-outbox-e2e-store-'));

  runGit(tmpRepo, ['init', '-b', 'main']);
  runGit(tmpRepo, ['config', 'user.name', 'Test User']);
  runGit(tmpRepo, ['config', 'user.email', 'test@example.com']);

  const fileA = path.join(tmpRepo, 'base.txt');
  await writeFile(fileA, 'Base content\n');
  runGit(tmpRepo, ['add', 'base.txt']);
  runGit(tmpRepo, ['commit', '-m', 'Initial commit']);

  const fileB = path.join(tmpRepo, 'work.txt');
  await writeFile(fileB, 'New work\n');
  // work.txt is untracked but will be referenced via selectedPaths in the git closeout request

  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({ runId: 'out-e2e-r1', objective: 'outbox E2E test', sourceIdentity: 'src-out-e2e', projectId: 'test-proj' });
  store.transition('out-e2e-r1', 'SHAPE');
  store.transition('out-e2e-r1', 'EXECUTE');
  store.transition('out-e2e-r1', 'PROVE');

  store.recordVerification('out-e2e-r1', {
    status: 'passed',
    evidenceRef: 'ev-out-e2e',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + '7'.repeat(64),
    sourceIdentity: 'src-out-e2e',
  });

  const snapshot = await prepareFinalization('out-e2e-r1', {}, { stateStore: store });
  await commitFinalizationAuthority('out-e2e-r1', snapshot, {
    gitCloseoutRequest: {
      requested: true,
      mode: 'commit',
      approvalReceipt: 'app-out-e2e',
      selectedPaths: ['work.txt'],
    },
  }, { stateStore: store });

  const outboxResults = await processGitCloseoutOutbox({ stateStore: store, repoRoot: tmpRepo });
  assert.equal(outboxResults.length, 1);
  assert.equal(outboxResults[0].status, 'completed');

  const logRes = runGit(tmpRepo, ['log', '-1', '--oneline']);
  assert.match(String(logRes.stdout), /feat\(kernel\)/);

  store.close();
});
