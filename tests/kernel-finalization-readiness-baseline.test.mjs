import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

test('FAR-SCN-002 Characterization: evaluateCompletion is read-only and does not persist completion decisions', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-base-readiness-'));
  const runtimeHome = path.join(tmpRoot, 'kernel');
  const relayHome = path.join(tmpRoot, 'relay');
  const store = await openKernelStateStore({ runtimeHome, relayHome });

  const run = store.createRun({ runId: 'base-r1', objective: 'baseline check', sourceIdentity: 'src-1', acceptanceCriteria: ['acc-1'] });
  store.transition('base-r1', 'SHAPE');
  store.transition('base-r1', 'EXECUTE');
  store.transition('base-r1', 'PROVE');

  store.recordVerification('base-r1', {
    status: 'passed',
    evidenceRef: 'ev-1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    sourceIdentity: 'src-1',
    acceptanceCoverage: ['acc-1'],
  });

  store.transition('base-r1', 'CLOSE');

  const evaluation = store.evaluateCompletion('base-r1');
  assert.equal(evaluation.decision, 'accepted');

  // Verify that evaluating completion alone did NOT write completion_decisions or change run.status
  const updatedRun = store.getRun('base-r1');
  assert.equal(updatedRun.status, 'active');
  assert.equal(store.getCompletionDecision('base-r1'), null);

  store.close();
});
