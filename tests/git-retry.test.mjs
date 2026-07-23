import test from 'node:test';
import assert from 'node:assert/strict';
import { retryGitCloseout } from '../scripts/kernel/git/closeout.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Git Retry - handles git closeout retries safely', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'mr-test-git-retry-'));
  const store = await openKernelStateStore({ runtimeHome: tmp });
  try {
    store.createRun({
      runId: 'run-git-retry-1',
      objective: 'Git retry test',
      sourceIdentity: 'cand-12345678901234567890123456789012',
      projectId: 'proj-1',
    });

    store.recordGitCloseoutReceipt('run-git-retry-1', {
      projectId: 'proj-1',
      mode: 'push',
      pushStatus: 'completed',
      parity: 'matched',
      status: 'completed',
      receiptJson: {
        runId: 'run-git-retry-1',
        projectId: 'proj-1',
        status: 'completed',
      },
    });

    const res = await retryGitCloseout('run-git-retry-1', {
      stateStore: store,
      repoRoot: process.cwd(),
    });

    assert.ok(res);
    assert.equal(res.status, 'completed');
  } finally {
    store.close();
    await rm(tmp, { recursive: true, force: true });
  }
});
