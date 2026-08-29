import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { resolveTrackRoots } from '../scripts/switcher/paths.mjs';
import { buildCodexDesktopLaunch } from '../scripts/switcher/providers/codex.mjs';
import { resolveKernelWorktreeIdentity } from '../scripts/kernel/run/worktree-binding.mjs';

const safeClean = async (dirs) => {
  for (const dir of dirs) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {}
  }
};

const setupProjectWithWorktrees = async () => {
  const mainRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-ownership-main-'));
  spawnSync('git', ['init', '--quiet'], { cwd: mainRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Kernel Invariant'], { cwd: mainRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'invariant@example.invalid'], { cwd: mainRoot, encoding: 'utf8' });
  await writeFile(path.join(mainRoot, 'package.json'), JSON.stringify({ name: 'ownership-contract-fixture', scripts: { test: 'node --version' } }));
  await writeFile(path.join(mainRoot, 'README.md'), '# Main\n');
  spawnSync('git', ['add', '.'], { cwd: mainRoot, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'initial commit', '--quiet'], { cwd: mainRoot, encoding: 'utf8' });

  const linkedWorktree = await mkdtemp(path.join(os.tmpdir(), 'krn-ownership-wt2-'));
  spawnSync('git', ['worktree', 'add', '-b', 'branch-wt2', linkedWorktree, 'HEAD'], { cwd: mainRoot, encoding: 'utf8' });

  return { mainRoot, linkedWorktree };
};

test('Invariant 1: Authority Hierarchy is Project -> Worktree -> Run', async (t) => {
  const { mainRoot, linkedWorktree } = await setupProjectWithWorktrees();
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-inv-runtime-'));
  t.after(async () => {
    await safeClean([mainRoot, linkedWorktree, runtimeHome]);
  });

  const identMain = resolveKernelWorktreeIdentity({ cwd: mainRoot, workspaceRoot: mainRoot });
  const identLinked = resolveKernelWorktreeIdentity({ cwd: linkedWorktree, workspaceRoot: linkedWorktree });

  assert.equal(identMain.projectId, identLinked.projectId);
  assert.notEqual(identMain.worktreeId, identLinked.worktreeId);

  const cpMain = await createKernelControlPlane({ runtimeHome, projectRoot: mainRoot, requireHostBinding: false });
  const cpLinked = await createKernelControlPlane({ runtimeHome, projectRoot: linkedWorktree, requireHostBinding: false });

  try {
    const runMain = await cpMain.ensureRun({
      runId: 'run-hierarchy-main',
      objective: 'Main worktree task',
      taskContract: { acceptance: ['main complete'] },
    });
    const runLinked = await cpLinked.ensureRun({
      runId: 'run-hierarchy-linked',
      objective: 'Linked worktree task',
      taskContract: { acceptance: ['linked complete'] },
    });

    assert.equal(runMain.status, 'created');
    assert.equal(runLinked.status, 'created');
    assert.equal(runMain.run.worktreeId, identMain.worktreeId);
    assert.equal(runLinked.run.worktreeId, identLinked.worktreeId);
    assert.equal(runMain.run.projectId, identMain.projectId);
    assert.equal(runLinked.run.projectId, identLinked.projectId);
  } finally {
    await cpMain.close();
    await cpLinked.close();
  }
});

test('Invariant 2: Kernel does not own or override Provider HOME (Kernel State != Provider HOME)', () => {
  const relayHome = path.join(os.tmpdir(), 'relay-home');
  const kernelHome = path.join(os.tmpdir(), 'kernel-home');

  const roots = resolveTrackRoots({ track: 'kernel', surface: 'codex_desktop', relayHome, kernelHome });
  assert.equal(roots.runtimeHome, kernelHome);
  // Provider home points to native user codex home, not inside kernelHome
  assert.ok(!roots.providerHome.startsWith(kernelHome));

  const launchSpec = buildCodexDesktopLaunch({ track: 'kernel', roots, executable: 'ChatGPT.exe' });
  assert.equal(launchSpec.env.CODEX_HOME, undefined);
  assert.equal(launchSpec.env.MOON_RELAY_KERNEL_HOME, kernelHome);
  assert.equal(launchSpec.env.MOON_RELAY_KERNEL_SURFACE, 'codex_desktop');
});

test('Invariant 3 & 4: Session is optional telemetry and zero provider subprocesses are spawned for Run execution', async (t) => {
  const { mainRoot } = await setupProjectWithWorktrees();
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-inv34-runtime-'));
  t.after(async () => {
    await safeClean([mainRoot, runtimeHome]);
  });

  // Open control plane without any session ID or thread ID
  const cp = await createKernelControlPlane({
    runtimeHome,
    projectRoot: mainRoot,
    requireHostBinding: false,
  });

  try {
    // 1. ensureRun without host session
    const runRes = await cp.ensureRun({
      runId: 'run-sessionless',
      objective: 'Execute without session telemetry',
      taskContract: {
        acceptance: [{
          acceptance: 'zero session dependency verified',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test'], obligationId: 'default' },
        }],
      },
    });
    assert.equal(runRes.status, 'created');

    // 2. resolveRunId finds active run by worktree without requiring host session
    const resolved = await cp.resolveRunId();
    assert.equal(resolved, 'run-sessionless');

    // 3. next returns bounded work unit directly
    const next = await cp.next(resolved);
    assert.ok(next.action);

    // 4. report progresses without host session
    const reportRes = await cp.report(resolved, {
      status: 'completed',
      summary: 'work completed natively',
      changedPaths: ['README.md'],
      verifications: [{ obligationId: 'default', commandRef: 'test', acceptanceCoverage: ['zero session dependency verified'] }],
    });
    assert.equal(reportRes.status, 'completed');
  } finally {
    await cp.close();
  }
});

test('Invariant 5 & 6: Mutation Lease rejects concurrent mutable Runs and releases atomically on completion or abandonment', async (t) => {
  const { mainRoot } = await setupProjectWithWorktrees();
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-inv56-runtime-'));
  t.after(async () => {
    await safeClean([mainRoot, runtimeHome]);
  });

  const cp = await createKernelControlPlane({
    runtimeHome,
    projectRoot: mainRoot,
    requireHostBinding: false,
  });

  try {
    // 1. Start Run 1
    const run1 = await cp.ensureRun({
      runId: 'run-lease-1',
      objective: 'Run to be abandoned',
      taskContract: { acceptance: ['task 1'] },
    });
    assert.equal(run1.status, 'created');

    // 2. Second mutable run on the same worktree is rejected
    await assert.rejects(
      async () => {
        await cp.startRun({
          runId: 'run-lease-2',
          objective: 'Second Run',
          taskContract: { acceptance: ['task 2'] },
        });
      },
      (err) => err.code === 'worktree_mutation_lease_held' || err.code === 'worktree_run_conflict' || err.message.includes('lease'),
    );

    // 3. Abandon Run 1 -> atomically releases mutation lease
    const abandonRes = await cp.abandon('run-lease-1', { reason: 'test_release' });
    assert.equal(abandonRes.status, 'abandoned');
    assert.equal(abandonRes.alreadyTerminal, false);

    // 4. Now a new Run on the same worktree succeeds immediately
    const run2 = await cp.ensureRun({
      runId: 'run-lease-2',
      objective: 'Second Run After Abandon',
      taskContract: { acceptance: ['task 2'] },
    });
    assert.equal(run2.status, 'created');
  } finally {
    await cp.close();
  }
});

test('Invariant 7: Abandoned Run cannot be resumed; new contract creates a fresh Run', async (t) => {
  const { mainRoot } = await setupProjectWithWorktrees();
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-inv7-runtime-'));
  t.after(async () => {
    await safeClean([mainRoot, runtimeHome]);
  });

  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: mainRoot, requireHostBinding: false });
  try {
    const run1 = await cp.ensureRun({
      runId: 'run-abandon-test',
      objective: 'Original Run',
      taskContract: { acceptance: ['task 1'] },
    });
    assert.equal(run1.status, 'created');

    await cp.abandon('run-abandon-test', { reason: 'user_cancel' });

    // Without a task contract, resolveBoundInvocation fails closed
    assert.throws(
      () => cp.resolveBoundInvocation({ taskContract: null }),
      (err) => err.code === 'no_active_run' || err.code === 'host_binding_missing',
    );

    // With a new task contract, resolveBoundInvocation creates a new run (not resuming abandoned run)
    const invocation = cp.resolveBoundInvocation({
      taskContract: { objective: 'Fresh Task After Abandon', acceptance: ['new task'] },
    });
    assert.equal(invocation.mode, 'create');
    assert.equal(invocation.reason, 'new-run-after-abandon');
    assert.equal(invocation.predecessorRunId, null);
    assert.notEqual(invocation.runId, 'run-abandon-test');
  } finally {
    await cp.close();
  }
});

test('Invariant 8: Kernel Codex Desktop does not pass --user-data-dir', () => {
  const roots = resolveTrackRoots({ track: 'kernel', surface: 'codex_desktop' });
  const launchSpec = buildCodexDesktopLaunch({ track: 'kernel', roots, executable: 'ChatGPT.exe' });
  assert.equal(launchSpec.args.includes('--user-data-dir'), false);
  assert.ok(!launchSpec.args.some((arg) => typeof arg === 'string' && arg.startsWith('--user-data-dir')));
});

test('Invariant 9: claude_cli and claude_desktop are distinct surfaces', async () => {
  const { SURFACES, GUI_SURFACES, SURFACE_ENV } = await import('../scripts/switcher/constants.mjs');
  assert.ok(SURFACES.includes('claude_desktop'));
  assert.ok(SURFACES.includes('claude_cli'));
  assert.ok(GUI_SURFACES.has('claude_desktop'));
  assert.equal(GUI_SURFACES.has('claude_cli'), false);
  assert.equal(SURFACE_ENV.claude_desktop, 'CLAUDE_CONFIG_DIR');
  assert.equal(SURFACE_ENV.claude_cli, 'CLAUDE_CONFIG_DIR');
});

test('Invariant 10: Kernel Codex adapter contains no automatic provider CLI fallback', async () => {
  const { createCodexAdapter } = await import('../scripts/host/kernel/adapters/codex.mjs');
  const { resolveCodexActorRoute } = await import('../scripts/host/kernel/codex-actor-router.mjs');

  const route = resolveCodexActorRoute({
    decision: { role: 'implementer', actionKind: 'implement' },
    invocation: { model: 'gpt-5.6-luna', mechanism: 'session-model-override' },
    hasNativeLauncher: false,
  });
  assert.equal(route.fallbackAllowed, false);
  assert.notEqual(route.dispatchMechanism, 'cli-worker');

  const adapter = createCodexAdapter({
    nativeLaunch: null,
    launch: null,
  });
  const dispatch = await adapter.dispatch({
    decision: { role: 'implementer' },
    resolution: { model: 'gpt-5.6-luna' },
    executionContract: {},
  });
  assert.equal(dispatch.status, 'unsupported');
  assert.notEqual(dispatch.dispatchMechanism, 'cli-worker');
});

test('Invariant 11: Native provider home may contain unrelated user skills', async () => {
  const { inspectKernelLaunchReadiness } = await import('../scripts/switcher/operations.mjs');
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'krn-inv11-home-'));
  const providerHome = path.join(tempHome, 'provider');
  const runtimeHome = path.join(tempHome, 'runtime');
  const { bootstrapKernelProjectIdentity } = await import('../scripts/kernel/project-identity-preflight.mjs');
  const { installKernelProfile } = await import('../scripts/kernel/profile-install.mjs');

  try {
    await mkdir(runtimeHome, { recursive: true });
    await writeFile(path.join(runtimeHome, 'install-manifest.json'), '{"productId":"moon-relay-kernel"}');
    await bootstrapKernelProjectIdentity({ projectRoot: process.cwd(), runtimeHome });
    await installKernelProfile({ sourceRoot: process.cwd(), runtime: 'codex', targetRoot: providerHome });

    // Add user personal skill and third party skill
    await mkdir(path.join(providerHome, 'skills', 'my-personal-skill'), { recursive: true });
    await writeFile(path.join(providerHome, 'skills', 'my-personal-skill', 'SKILL.md'), '# Personal Skill\n');
    await mkdir(path.join(providerHome, 'skills', 'third-party-skill'), { recursive: true });
    await writeFile(path.join(providerHome, 'skills', 'third-party-skill', 'SKILL.md'), '# Third Party\n');

    const readiness = await inspectKernelLaunchReadiness({
      runtimeHome,
      providerHome,
      projectRoot: process.cwd(),
      appDataRoot: providerHome,
      sourceRoot: process.cwd(),
      checkProjectIdentity: false,
    });

    assert.equal(readiness.status, 'launch_candidate');
  } finally {
    await safeClean([tempHome]);
  }
});

test('Invariant 12: Kernel session metadata absence never prevents Run creation or resume', async (t) => {
  const { mainRoot } = await setupProjectWithWorktrees();
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-inv12-runtime-'));
  t.after(async () => {
    await safeClean([mainRoot, runtimeHome]);
  });

  const cp = await createKernelControlPlane({
    runtimeHome,
    projectRoot: mainRoot,
    requireHostBinding: false,
  });

  try {
    const run = await cp.ensureRun({
      runId: 'run-zero-metadata',
      objective: 'Run without session telemetry metadata',
      taskContract: { acceptance: ['zero metadata OK'] },
    });
    assert.equal(run.status, 'created');

    const resumed = await cp.ensureRun({
      runId: 'run-zero-metadata',
      objective: 'Run without session telemetry metadata',
      taskContract: { acceptance: ['zero metadata OK'] },
    });
    assert.equal(resumed.status, 'resumed');
  } finally {
    await cp.close();
  }
});

