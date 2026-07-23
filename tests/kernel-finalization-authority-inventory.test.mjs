import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

test('FAR-SCN-001 Characterization: controlPlane.finalizeRun is the primary public entrypoint', async () => {
  const cp = await createKernelControlPlane({ runtimeHome: process.cwd(), projectRoot: process.cwd() });
  assert.equal(typeof cp.finalizeRun, 'function');
  assert.equal(typeof cp.assessCompletion, 'function');
  assert.equal(typeof cp.retryGitCloseout, 'function');
  await cp.close();
});
