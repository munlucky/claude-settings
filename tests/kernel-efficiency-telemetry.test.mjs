import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-efficiency-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-efficiency-project-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'efficiency-fixture',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));
  spawnSync('git', ['add', '--all'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture', '--quiet'], { cwd: projectRoot, encoding: 'utf8' });
  return { runtimeHome, projectRoot };
};

test('efficiency telemetry is durable on the existing Run signals ledger', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'efficiency-ledger', objective: 'measure the run' });
    const status = await cp.status('efficiency-ledger');
    const telemetry = status.measurement.efficiencyTelemetry;
    assert.equal(telemetry.status, 'observed');
    assert.ok(Date.parse(telemetry.value.runStartedAt));
    assert.ok(Date.parse(telemetry.value.goalResolvedAt));
    assert.ok(Date.parse(telemetry.value.readinessCompletedAt));
    assert.ok(Date.parse(telemetry.value.firstRepositoryReadAt));
    assert.equal(telemetry.value.reportCount, 0);
    assert.equal(telemetry.value.reportRejectedCount, 0);

    const mutationAt = new Date(Date.now() + 1000).toISOString();
    cp.stateStore.recordRunEfficiency('efficiency-ledger', {
      timestamps: {
        firstMutationAt: mutationAt,
        lastMutationAt: new Date(Date.parse(mutationAt) + 1000).toISOString(),
      },
      increments: { reportCount: 2, verificationTimeoutCount: 1 },
    });
    const persisted = (await cp.status('efficiency-ledger')).measurement.efficiencyTelemetry.value;
    assert.equal(persisted.reportCount, 2);
    assert.equal(persisted.verificationTimeoutCount, 1);
    assert.ok(Number.isInteger(persisted.timeToFirstMutationMs));
    assert.equal(persisted.firstMutationAt, mutationAt);
  } finally {
    await cp.close();
    await rm(fixture.runtimeHome, { recursive: true, force: true });
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test('report scope rejection increments report and scope counters once', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'efficiency-rejection', objective: 'measure rejected reports' });
    await writeFile(path.join(fixture.projectRoot, 'unexpected.mjs'), 'export const unexpected = true;\n');
    const rejected = await cp.report('efficiency-rejection', { summary: 'wrong path claim', changedPaths: [] });
    assert.equal(rejected.status, 'scope-rejected');
    const telemetry = (await cp.status('efficiency-rejection')).measurement.efficiencyTelemetry.value;
    assert.equal(telemetry.reportCount, 1);
    assert.equal(telemetry.reportRejectedCount, 1);
    assert.equal(telemetry.scopeRejectedCount, 1);
  } finally {
    await cp.close();
    await rm(fixture.runtimeHome, { recursive: true, force: true });
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});
