import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

const kernelCli = path.join(process.cwd(), 'bin', 'moon-relay-kernel.mjs');

const makeWorkspace = async ({ prefix, projectId }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  await writeFile(path.join(root, '.moon-relay', 'project.identity.yaml'), `projectId: ${projectId}\n`);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: projectId,
    version: '0.0.1',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));
  return root;
};

const successorAcrossWorktreesSpec = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-successor-worktree-state-'));
  const projectId = 'kernel-successor-worktree-project';
  const firstRoot = await makeWorkspace({ prefix: 'kernel-successor-first', projectId });
  const secondRoot = await makeWorkspace({ prefix: 'kernel-successor-second', projectId });
  const sessionId = 'codex:worktree-session';
  const predecessorRunId = 'codex-worktree-session';
  const contractPath = path.join(secondRoot, 'contract-b.json');
  try {
    const first = await createKernelControlPlane({
      runtimeHome,
      projectRoot: firstRoot,
      requireHostBinding: true,
      env: {
        MOON_RELAY_KERNEL_SESSION_ID: sessionId,
        MOON_RELAY_KERNEL_PROVIDER: 'codex',
        MOON_RELAY_KERNEL_RUN_ID: predecessorRunId,
      },
    });
    try {
      await first.ensureRun({
        runId: predecessorRunId,
        objective: 'contract A in worktree A',
        taskContract: { acceptance: ['worktree A contract completes'] },
      });
    } finally {
      await first.close();
    }

    const store = await openKernelStateStore({ runtimeHome });
    let predecessorWorkspaceId;
    try {
      const run = store.getRun(predecessorRunId);
      predecessorWorkspaceId = run.workspaceId;
      store.persistCompletionDecision(predecessorRunId, {
        decision: 'accepted',
        digest: `sha256:${'b'.repeat(64)}`,
        run,
        decisionPayload: { decision: 'accepted' },
      });
      store.setFinalizationStatus(predecessorRunId, 'completed');
    } finally {
      store.close();
    }

    await writeFile(contractPath, JSON.stringify({
      objective: 'contract B in worktree B',
      acceptance: ['worktree B receives an independent successor'],
    }));
    const result = spawnSync(process.execPath, [
      kernelCli,
      'next',
      '--contract-json',
      contractPath,
      '--session-id',
      sessionId,
      '--project-root',
      secondRoot,
      '--runtime-home',
      runtimeHome,
      '--json',
    ], {
      cwd: secondRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        MOON_RELAY_KERNEL_REEXEC: '1',
        MOON_RELAY_KERNEL_RUN_ID: '',
        MOON_RELAY_KERNEL_SESSION_ID: '',
        MOON_RELAY_KERNEL_PROJECT_ID: '',
        MOON_RELAY_KERNEL_WORKSPACE_ID: '',
        CODEX_THREAD_ID: '',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.notEqual(payload.runId, predecessorRunId);

    const after = await openKernelStateStore({ runtimeHome });
    try {
      const successor = after.getRun(payload.runId);
      assert.equal(successor.projectId, projectId);
      assert.notEqual(successor.workspaceId, predecessorWorkspaceId);
      assert.equal(after.getRun(predecessorRunId).workspaceId, predecessorWorkspaceId);
    } finally {
      after.close();
    }
  } finally {
    await rm(firstRoot, { recursive: true, force: true });
    await rm(secondRoot, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
};
test('a finalized predecessor can hand the same session to a successor in a different worktree', successorAcrossWorktreesSpec);
