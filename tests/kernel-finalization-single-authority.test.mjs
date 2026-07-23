import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

test('MG-01 Single Authority: Control Plane facade hides legacy mutation methods', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-mg1-test-'));
  const cp = await createKernelControlPlane({ runtimeHome: path.join(tmpRoot, 'kernel'), projectRoot: process.cwd() });

  // Control plane facade must NOT expose these legacy methods
  assert.equal(cp.closeRun, undefined, 'closeRun must not be exposed');
  assert.equal(cp.recordKnowledgeObservations, undefined, 'recordKnowledgeObservations must not be exposed');

  // Control plane facade MUST expose the new finalization surface
  assert.equal(typeof cp.prepareFinalization, 'function', 'prepareFinalization must be exposed');
  assert.equal(typeof cp.approveKnowledgeCandidate, 'function', 'approveKnowledgeCandidate must be exposed');
  assert.equal(typeof cp.recordProof, 'function', 'recordProof must be exposed');
  assert.equal(typeof cp.finalizeRun, 'function', 'finalizeRun must be exposed');
  assert.equal(typeof cp.retryGitCloseout, 'function', 'retryGitCloseout must be exposed');
  assert.equal(typeof cp.getFinalizationStatus, 'function', 'getFinalizationStatus must be exposed');

  await cp.close();
});
