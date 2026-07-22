import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { installKernel, uninstallKernel } from '../scripts/kernel/installer.mjs';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

const unavailableFields = ['providerModelIdentity', 'actualInputTokens', 'actualOutputTokens', 'falseCompletionDecision', 'retryCount', 'replanCount', 'userInterventionCount', 'wallClockMs'];

test('measurement schema is closed and status exposes typed unavailable fields', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/kernel.measurement.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.additionalProperties, false);
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-measurement-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-measurement-project-'));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  await cp.startRun({ runId: 'measurement-status', objective: 'measurement contract' });
  const status = await cp.status('measurement-status');
  assert.equal(status.measurement.schemaVersion, 1);
  assert.equal(status.measurement.harnessIdentity, 'moon-relay-kernel');
  assert.match(status.measurement.sourceIdentity, /^[a-zA-Z0-9_.:/-]+$/);
  assert.ok(status.measurement.estimatedStaticTokens > 0);
  for (const field of unavailableFields) {
    assert.equal(status.measurement[field].status, 'unavailable', field);
    assert.ok(status.measurement[field].reason, field);
  }
  assert.equal(status.measurement.contaminationSignals.status, 'observed');
  await cp.close();
});

test('disposable installed CLI exposes schema-shaped context receipt and measurement', async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-measurement-installed-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-measurement-installed-home-'));
  await installKernel({ targetRoot, sourceRoot: process.cwd() });
  const cli = path.join(targetRoot, '.moon-relay', 'kernel-payload', 'bin', 'moon-relay-kernel.mjs');
  const env = { ...process.env, MOON_RELAY_KERNEL_HOME: runtimeHome };
  const run = spawnSync(process.execPath, [cli, 'start-run', '--project-root', targetRoot, '--run-id', 'installed-measurement', '--objective', 'installed measurement'], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const context = spawnSync(process.execPath, [cli, 'context', '--project-root', targetRoot, '--run-id', 'installed-measurement', '--json'], { env, encoding: 'utf8' });
  assert.equal(context.status, 0, context.stderr);
  const contextResult = JSON.parse(context.stdout);
  assert.match(contextResult.promptBlock, /## Stable Principles/);
  assert.ok(contextResult.receipt.included.some((entry) => entry.id === 'capability-decision-installed-measurement'));
  const status = spawnSync(process.execPath, [cli, 'status', '--project-root', targetRoot, '--run-id', 'installed-measurement', '--json'], { env, encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  const statusResult = JSON.parse(status.stdout);
  assert.equal(statusResult.measurement.harnessIdentity, 'moon-relay-kernel');
  assert.equal(statusResult.measurement.actualInputTokens.status, 'unavailable');
  const uninstall = await uninstallKernel({ targetRoot });
  assert.equal(uninstall.status, 'uninstalled');
});
