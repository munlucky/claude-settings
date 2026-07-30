import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

test('workspace mutation locks allow different worktrees and fence the same checkout', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-workspace-lock-'));
  const store = await openKernelStateStore({ runtimeHome });
  try {
    const first = store.acquireWorkspaceMutationLockV2({ workspaceId: 'workspace-a', projectId: 'project-1', runId: 'run-1', sessionToken: 'session-1', ttlMs: 60000 });
    assert.equal(first.acquired, true);
    const parallel = store.acquireWorkspaceMutationLockV2({ workspaceId: 'workspace-b', projectId: 'project-1', runId: 'run-2', sessionToken: 'session-2', ttlMs: 60000 });
    assert.equal(parallel.acquired, true);
    const blocked = store.acquireWorkspaceMutationLockV2({ workspaceId: 'workspace-a', projectId: 'project-1', runId: 'run-3', sessionToken: 'session-3', ttlMs: 60000 });
    assert.equal(blocked.acquired, false);
    assert.equal(blocked.lock.holderRunId, 'run-1');
  } finally {
    store.close();
  }
});
