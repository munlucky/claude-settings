import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { probeNetworkEnforcement, resolveNetworkExecution, NetworkPolicyUnenforceableError } from '../scripts/kernel/proof/network-policy.mjs';
import { executeTrustedProof } from '../scripts/kernel/proof/proof-executor.mjs';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

test('inherited policy honestly records no isolation', () => {
  const resolved = resolveNetworkExecution({ policy: 'inherited', env: {} });
  assert.equal(resolved.networkIsolation, 'none');
  assert.equal(resolved.enforced, false);
});

test('blocked/required refuse to claim isolation when no sandbox is available', () => {
  assert.equal(probeNetworkEnforcement({ env: {} }).enforceable, false);
  assert.throws(() => resolveNetworkExecution({ policy: 'blocked', env: {} }), NetworkPolicyUnenforceableError);
  assert.throws(() => resolveNetworkExecution({ policy: 'required', env: {} }), NetworkPolicyUnenforceableError);
});

test('blocked is only honored when the host declares a real sandbox', () => {
  const env = { MOON_RELAY_KERNEL_NETWORK_SANDBOX: 'firejail' };
  const probe = probeNetworkEnforcement({ env });
  assert.equal(probe.enforceable, true);
  const resolved = resolveNetworkExecution({ policy: 'blocked', env });
  assert.equal(resolved.networkIsolation, 'blocked');
  assert.equal(resolved.enforced, true);
  assert.equal(resolved.mechanism, 'firejail');
});

test('trusted proof records isolation none under inherited policy', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-net-'));
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { 'test:ok': 'node -e "process.exit(0)"' } }));
  try {
    const execution = executeTrustedProof({ projectRoot, commandRef: 'test:ok', timeoutMs: 60000 });
    assert.equal(execution.networkIsolation, 'none');
    assert.equal(execution.networkPolicy, 'inherited');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('report blocks the run when a required network policy cannot be enforced', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-net-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-net-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { 'test:ok': 'node -e "process.exit(0)"' } }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-net', objective: 'x' });
    const res = await cp.report('r-net', {
      summary: 'needs isolation',
      verifications: [{ obligationId: 'default', commandRef: 'test:ok', networkPolicy: 'required' }],
    });
    assert.equal(res.status, 'blocked');
    assert.equal(res.blockedReason, 'network-policy');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
