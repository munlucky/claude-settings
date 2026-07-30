import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { normalizeSessionBinding } from '../scripts/kernel/run/session-binding.mjs';
import { openSqliteDb } from '../scripts/kernel/sqlite-adapter.mjs';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

const cli = path.join(process.cwd(), 'bin', 'moon-relay-kernel.mjs');
const sourceIdentity = `sha256:${'f'.repeat(64)}`;

const register = (store, projectId, workspaceId) => store.registerProjectWorkspace({
  workspaceId,
  identity: { projectId },
  canonicalRoot: `C:\\fixtures\\${workspaceId}`,
  gitCommonDir: null,
  gitWorktreeDir: null,
});

const createRun = (store, { runId, projectId, workspaceId, ownerBindingId = null }) =>
  store.createRun({
    runId,
    objective: runId,
    sourceIdentity,
    projectId,
    workspaceId,
    ownerBindingId,
  });

test('lifecycle diagnostics report ambiguous owners, terminal bindings, orphaned owners, namespace problems, and stale locks', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-lifecycle-doctor-'));
  const store = await openKernelStateStore({ runtimeHome });
  const projectId = 'doctor-project';
  const workspaceId = 'doctor-workspace';
  try {
    register(store, projectId, workspaceId);
    createRun(store, { runId: 'run-terminal', projectId, workspaceId });
    store.createSessionBinding(normalizeSessionBinding({
      bindingId: 'binding-terminal',
      provider: 'codex',
      sessionId: 'codex:shared',
      runId: 'run-terminal',
      projectId,
      workspaceId,
      accessMode: 'owner',
    }));
    const terminal = store.getRun('run-terminal');
    store.persistCompletionDecision('run-terminal', {
      decision: 'accepted',
      digest: `sha256:${'1'.repeat(64)}`,
      run: terminal,
      decisionPayload: { decision: 'accepted' },
    });
    store.createSessionBinding(normalizeSessionBinding({
      bindingId: 'binding-bad-provider',
      provider: 'claude',
      sessionId: 'codex:reviewer',
      runId: 'run-terminal',
      projectId,
      workspaceId,
      accessMode: 'reviewer',
    }));
    createRun(store, {
      runId: 'run-orphan',
      projectId,
      workspaceId,
      ownerBindingId: 'binding-missing',
    });
    store.acquireWorkspaceMutationLockV2({
      workspaceId,
      projectId,
      runId: 'run-terminal',
      sessionToken: 'binding-terminal',
      ttlMs: -1,
    });

    const raw = await openSqliteDb(store.dbPath);
    try {
      raw.exec(`
        DROP INDEX IF EXISTS uq_project_session_active_owner;
        DROP INDEX IF EXISTS uq_run_active_owner;
      `);
      const timestamp = new Date().toISOString();
      raw.prepare(`
        INSERT INTO session_bindings(
          binding_id, session_id, provider, surface, run_id, project_id,
          workspace_id, workspace_root, access_mode, status, created_at,
          expires_at, updated_at
        ) VALUES(?, ?, ?, NULL, ?, ?, ?, NULL, 'owner', 'active', ?, NULL, ?)
      `).run(
        'binding-ambiguous',
        'codex:shared',
        'codex',
        'run-orphan',
        projectId,
        workspaceId,
        timestamp,
        timestamp,
      );
    } finally {
      raw.close();
    }

    const diagnostics = store.diagnoseLifecycleState({ projectId });
    assert.equal(diagnostics.status, 'degraded');
    for (const code of [
      'ambiguous_session_binding',
      'terminal_run_active_binding',
      'orphaned_run_owner',
      'binding_namespace_problem',
      'stale_workspace_lock',
    ]) {
      assert.ok(diagnostics.counts[code] >= 1, code);
    }
  } finally {
    store.close();
    await rm(runtimeHome, { recursive: true, force: true });
  }
});

test('doctor includes clean project lifecycle diagnostics without changing its ready contract', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-lifecycle-doctor-cli-state-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-lifecycle-doctor-cli-project-'));
  try {
    await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
    await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'track: kernel\n');
    await writeFile(
      path.join(projectRoot, '.moon-relay', 'project.identity.yaml'),
      'projectId: doctor-clean-project\n',
    );
    const result = spawnSync(process.execPath, [
      cli,
      'doctor',
      '--runtime-home',
      runtimeHome,
      '--json',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, MOON_RELAY_KERNEL_REEXEC: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, 'ready');
    assert.equal(payload.diagnostics.status, 'ready');
    assert.deepEqual(payload.diagnostics.findings, []);
  } finally {
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
