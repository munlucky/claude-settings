import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { buildProcessEnvironment } from '../scripts/switcher/launch-adapter.mjs';

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

test('Kernel host injects run, project, and session identity process-scoped', () => {
  const env = buildProcessEnvironment({
    surface: 'codex_cli',
    track: 'kernel',
    roots: { runtimeHome: '/runtime', providerHome: '/provider' },
    runId: 'run-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    baseEnv: { PATH: '/usr/bin' },
  });
  assert.equal(env.MOON_RELAY_KERNEL_RUN_ID, 'run-1');
  assert.equal(env.MOON_RELAY_KERNEL_PROJECT_ID, 'project-1');
  assert.equal(env.MOON_RELAY_KERNEL_SESSION_ID, 'session-1');
});
