import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane, resolveDeclaredStepForReplan } from '../scripts/kernel/control-plane.mjs';
import { buildProcessEnvironment } from '../scripts/switcher/launch-adapter.mjs';
import './kernel-isolation-wave0.fixture.mjs';
import './kernel-stable-workspace-identity.fixture.mjs';

test('run selection follows explicit, environment, unique-active, and ambiguity order', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-run-resolution-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-run-resolution-state-'));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: root });
  try {
    await cp.startRun({ runId: 'run-one', objective: 'one', taskContract: { acceptance: ['one'] } });
    assert.equal(await cp.resolveRunId({}), 'run-one');
    assert.equal(await cp.resolveRunId({ envRunId: 'run-env' }), 'run-env');
    assert.equal(await cp.resolveRunId({ explicitRunId: 'run-explicit', envRunId: 'run-env' }), 'run-explicit');
    await cp.startRun({ runId: 'run-two', objective: 'two', taskContract: { acceptance: ['two'] } });
    await assert.rejects(() => cp.resolveRunId({}), /ambiguous_active_run/);
  } finally {
    await cp.close();
  }
});

test('Kernel host injects run, project, session, and workspace identity process-scoped', () => {
  const env = buildProcessEnvironment({
    surface: 'codex_cli',
    track: 'kernel',
    roots: { runtimeHome: '/runtime', providerHome: '/provider' },
    runId: 'run-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    baseEnv: { PATH: '/usr/bin' },
  });
  assert.equal(env.MOON_RELAY_KERNEL_RUN_ID, 'run-1');
  assert.equal(env.MOON_RELAY_KERNEL_PROJECT_ID, 'project-1');
  assert.equal(env.MOON_RELAY_KERNEL_SESSION_ID, 'codex-cli:session-1');
  assert.equal(env.MOON_RELAY_KERNEL_PROVIDER, 'codex-cli');
  assert.equal(env.MOON_RELAY_KERNEL_WORKSPACE_ID, 'workspace-1');
});

test('Codex thread identity bootstraps next without explicit Kernel binding variables', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-thread-project-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-thread-state-'));
  const contractPath = path.join(root, 'task-contract.json');
  const threadId = '019fb139-cadf-73e2-93de-568646c75e92';
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'kernel-codex-thread-bootstrap',
    version: '0.0.1',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));
  await writeFile(contractPath, JSON.stringify({
    objective: 'bootstrap from Codex task identity',
    acceptance: ['next returns one authoritative action'],
    constraints: ['remain in the temporary project'],
    nonGoals: ['external mutation'],
  }));

  const result = spawnSync(process.execPath, [
    path.join(process.cwd(), 'bin', 'moon-relay-kernel.mjs'),
    'next',
    '--contract-json',
    contractPath,
    '--project-root',
    root,
    '--runtime-home',
    runtimeHome,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_THREAD_ID: threadId,
      MOON_RELAY_KERNEL_REEXEC: '1',
      MOON_RELAY_KERNEL_HOME: runtimeHome,
      MOON_RELAY_KERNEL_RUN_ID: '',
      MOON_RELAY_KERNEL_SESSION_ID: '',
      MOON_RELAY_KERNEL_PROJECT_ID: '',
      MOON_RELAY_KERNEL_WORKSPACE_ID: '',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.runId, /^run-[0-9a-f-]{36}$/i);
  assert.doesNotMatch(payload.runId, new RegExp(threadId));
  assert.ok(payload.action);
});

test('strict host binding adopts an unowned legacy run once and rejects a second owner', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-legacy-binding-project-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-legacy-binding-state-'));
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'kernel-legacy-binding',
    version: '0.0.1',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));

  const legacy = await createKernelControlPlane({ runtimeHome, projectRoot });
  await legacy.startRun({
    runId: 'legacy-run',
    objective: 'adopt safely',
    taskContract: { acceptance: ['owner binding is one-shot'] },
  });
  await legacy.close();

  const owner = await createKernelControlPlane({
    runtimeHome,
    projectRoot,
    requireHostBinding: true,
    env: { MOON_RELAY_KERNEL_SESSION_ID: 'owner-session', MOON_RELAY_KERNEL_RUN_ID: 'legacy-run' },
  });
  const adopted = await owner.ensureRun({ runId: 'legacy-run' });
  assert.equal(adopted.status, 'resumed');
  await owner.close();

  const claimant = await createKernelControlPlane({
    runtimeHome,
    projectRoot,
    requireHostBinding: true,
    env: { MOON_RELAY_KERNEL_SESSION_ID: 'claimant-session', MOON_RELAY_KERNEL_RUN_ID: 'legacy-run' },
  });
  await assert.rejects(
    claimant.ensureRun({ runId: 'legacy-run' }),
    (error) => error.code === 'host_binding_missing',
  );
  await claimant.close();
});

test('owner contract revision replans an active step when its allowed scope expands', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-scope-replan-project-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-scope-replan-state-'));
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'kernel-scope-replan',
    version: '0.0.1',
    scripts: {
      'lint:kernel': 'node -e "process.exit(0)"',
      'test:ok': 'node -e "process.exit(0)"',
    },
  }));
  const env = {
    MOON_RELAY_KERNEL_SESSION_ID: 'scope-owner',
    MOON_RELAY_KERNEL_RUN_ID: 'scope-run',
  };
  const cp = await createKernelControlPlane({
    runtimeHome,
    projectRoot,
    requireHostBinding: true,
    env,
  });

  const baseContract = {
    objective: 'expand a blocked work unit safely',
    acceptance: ['scope expansion is durable'],
    requiredObligations: ['static-analysis'],
    steps: [{
      objective: 'bounded implementation',
      allowedPaths: ['scripts/kernel/**', 'tests/**'],
      obligationIds: ['static-analysis'],
    }],
  };
  await cp.ensureRun({ runId: 'scope-run', objective: baseContract.objective, taskContract: baseContract });
  const before = cp.getCurrentStep('scope-run');
  await cp.report('scope-run', {
    blocker: {
      reason: 'unsupported-verification',
      detail: 'package.json is not yet in scope',
    },
  });

  const amended = {
    ...baseContract,
    steps: [{
      ...baseContract.steps[0],
      allowedPaths: [...baseContract.steps[0].allowedPaths, 'package.json'],
    }],
  };
  const resumed = await cp.ensureRun({ runId: 'scope-run', objective: amended.objective, taskContract: amended });
  const after = cp.getCurrentStep('scope-run');

  assert.equal(resumed.status, 'resumed');
  assert.equal(after.planRevision, before.planRevision + 1);
  assert.ok(after.allowedPaths.includes('package.json'));
  assert.equal(cp.getRunSteps('scope-run').find((step) => step.stepId === before.stepId).state, 'superseded');
  assert.equal((await cp.getRun('scope-run')).status, 'active');
  const revisionAfterAtomicResume = (await cp.getRun('scope-run')).planRevision;
  const retried = await cp.ensureRun({ runId: 'scope-run', objective: amended.objective, taskContract: amended });
  assert.equal(retried.run.status, 'active');
  assert.equal(retried.run.planRevision, revisionAfterAtomicResume, 'retry must not replan or strand the run after atomic unblock');
  await cp.close();
});

test('scope replan selects a declared step by objective before sequence fallback', () => {
  const waveFive = {
    objective: 'Wave 5',
    allowedPaths: ['scripts/kernel/**', 'package.json'],
  };
  const resolved = resolveDeclaredStepForReplan({
    steps: [
      { objective: 'Wave 0', allowedPaths: ['tests/**'] },
      waveFive,
    ],
  }, {
    stepId: 'step-2-1',
    sequence: 1,
    objective: 'Wave 5',
  });

  assert.equal(resolved, waveFive);
});

test('strict control plane rejects a Host workspace id that differs from computed identity', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-workspace-spoof-project-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-workspace-spoof-state-'));
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'workspace-spoof', version: '0.0.1' }));
  await assert.rejects(
    createKernelControlPlane({
      runtimeHome,
      projectRoot,
      requireHostBinding: true,
      env: {
        MOON_RELAY_KERNEL_SESSION_ID: 'owner',
        MOON_RELAY_KERNEL_RUN_ID: 'run',
        MOON_RELAY_KERNEL_WORKSPACE_ID: 'host-spoofed-workspace',
      },
    }),
    (error) => error.code === 'run_workspace_mismatch',
  );
});

test('public switcher launch forwards all strict task binding flags', async () => {
  const source = await readFile(path.join(process.cwd(), 'bin', 'moon-harness-switcher.mjs'), 'utf8');
  for (const flag of ['--run-id', '--project-id', '--session-id', '--workspace-id']) {
    assert.match(source, new RegExp(flag));
  }
  assert.match(source, /taskBinding/);
});
