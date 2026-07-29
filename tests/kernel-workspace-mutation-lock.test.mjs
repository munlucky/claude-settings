import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

test('workspace mutation locks fence different runs without a scheduler', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-workspace-lock-'));
  const store = await openKernelStateStore({ runtimeHome });
  try {
    const first = store.acquireWorkspaceMutationLock({ projectId: 'project-1', runId: 'run-1', sessionToken: 'session-1', ttlMs: 60000 });
    assert.equal(first.acquired, true);
    const blocked = store.acquireWorkspaceMutationLock({ projectId: 'project-1', runId: 'run-2', sessionToken: 'session-2', ttlMs: 60000 });
    assert.equal(blocked.acquired, false);
    assert.equal(blocked.lock.holderRunId, 'run-1');
    assert.equal(store.releaseWorkspaceMutationLock({ projectId: 'project-1', runId: 'run-1', sessionToken: 'session-1' }), true);
    const second = store.acquireWorkspaceMutationLock({ projectId: 'project-1', runId: 'run-2', sessionToken: 'session-2', ttlMs: 60000 });
    assert.equal(second.acquired, true);
    assert.ok(second.lock.fencingToken > first.lock.fencingToken);
  } finally {
    store.close();
  }
});
