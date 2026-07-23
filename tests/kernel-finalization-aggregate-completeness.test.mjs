import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { openKernelStateStore } from '../scripts/kernel/state-store.mjs';
import { prepareFinalization, approveKnowledgeCandidate } from '../scripts/kernel/finalization/prepare.mjs';

test('MG-02 Complete Aggregate: verifies two-step approval and acceptance criteria coverage', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-mg2-test-'));
  const store = await openKernelStateStore({ runtimeHome: path.join(tmpRoot, 'kernel'), relayHome: path.join(tmpRoot, 'relay') });

  store.createRun({
    runId: 'mg2-r1',
    objective: 'aggregate completeness test',
    sourceIdentity: 'src-mg2',
    projectId: 'munlucky-moonshot-relay',
    acceptanceCriteria: ['AC-01', 'AC-02'],
  });

  store.transition('mg2-r1', 'SHAPE');
  store.transition('mg2-r1', 'EXECUTE');
  store.transition('mg2-r1', 'PROVE');

  store.recordVerification('mg2-r1', {
    status: 'passed',
    evidenceRef: 'ev-mg2-1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + '1'.repeat(64),
    sourceIdentity: 'src-mg2',
    acceptanceCoverage: ['AC-01'], // AC-02 uncovered
  });

  // Uncovered criteria -> snapshot blocked
  const snap1 = await prepareFinalization('mg2-r1', {}, { stateStore: store });
  assert.equal(snap1.status, 'blocked');
  assert.ok(snap1.blockers.some((b) => b.type === 'acceptance_criteria_uncovered'));

  // Fulfill AC-02
  store.recordVerification('mg2-r1', {
    status: 'passed',
    evidenceRef: 'ev-mg2-2',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: 'sha256:' + '2'.repeat(64),
    sourceIdentity: 'src-mg2',
    acceptanceCoverage: ['AC-02'],
  });

  const snap2 = await prepareFinalization('mg2-r1', {}, { stateStore: store });
  assert.equal(snap2.status, 'ready');

  store.close();
});
