import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';

const validDigest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('natural PROVE -> verification -> CLOSE workflow results in accepted completion', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  const run = s.createRun({ runId: 'r1', objective: 'x', sourceIdentity: 'src-1' });
  assert.equal(run.schemaVersion, 1);
  assert.equal(run.currentState, 'FRAME');
  assert.equal(run.mutationRevision, 0);

  s.transition('r1', 'SHAPE');
  s.transition('r1', 'EXECUTE');
  s.transition('r1', 'PROVE');

  s.recordVerification('r1', {
    status: 'passed',
    evidenceRef: 'evidence://test/1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-1',
  });

  s.transition('r1', 'CLOSE');

  const comp = s.assessCompletion('r1', { expectedSourceIdentity: 'src-1' });
  assert.equal(comp.decision, 'accepted');
  assert.equal(comp.run.status, 'completed');

  s.close();
});

test('multi-obligation proof contract requires all declared obligations to pass', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-multi-ob-'));
  const s = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s.createRun({
    runId: 'r-t3',
    objective: 'security boundary mutation',
    sourceIdentity: 'src-t3',
    proofTier: 'T3',
    evidenceTier: 'E2',
    requiredObligations: ['static-analysis', 'unit-test'],
  });

  s.transition('r-t3', 'SHAPE');
  s.transition('r-t3', 'EXECUTE');
  s.transition('r-t3', 'PROVE');

  // Verify only 1 of 2 obligations
  s.recordVerification('r-t3', {
    obligationId: 'static-analysis',
    status: 'passed',
    evidenceRef: 'evidence://static/1',
    command: 'npm run lint',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-t3',
  });

  // Should be blocked because 'unit-test' obligation is missing
  assert.equal(s.assessCompletion('r-t3').decision, 'blocked');

  // Transition to EXECUTE then PROVE to complete missing obligation
  s.transition('r-t3', 'EXECUTE');
  s.transition('r-t3', 'PROVE');

  // Re-verify both obligations at current mutation revision
  s.recordVerification('r-t3', {
    obligationId: 'static-analysis',
    status: 'passed',
    evidenceRef: 'evidence://static/2',
    command: 'npm run lint',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-t3',
  });

  s.recordVerification('r-t3', {
    obligationId: 'unit-test',
    status: 'passed',
    evidenceRef: 'evidence://unit/1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-t3',
  });

  s.transition('r-t3', 'CLOSE');

  const comp = s.assessCompletion('r-t3');
  assert.equal(comp.decision, 'accepted');
  assert.equal(comp.run.status, 'completed');

  s.close();
});

test('multi-connection OCC prevents state conflicts across independent DB handles', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-state-conn-'));
  const s1 = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });
  const s2 = await openKernelStateStore({ runtimeHome: h, relayHome: path.join(h, '..', 'relay') });

  s1.createRun({ runId: 'r-conn', objective: 'concurrency test', sourceIdentity: 'src-conn' });
  const run1 = s1.getRun('r-conn');

  // Connection 1 transitions run to SHAPE
  s1.transition('r-conn', 'SHAPE');

  // Connection 2 attempts transition using stale revision 0 from run1
  assert.throws(
    () => s2.transition('r-conn', 'EXECUTE', { expectedRevision: run1.revision }),
    /STALE_RUN_REVISION/
  );

  s1.close();
  s2.close();
});
