import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

test('Kernel finalization orchestration (finalizeRun) executes full accepted lifecycle', async () => {
  const tmpHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-fin-test-'));
  const cp = await createKernelControlPlane({ runtimeHome: tmpHome, projectRoot: process.cwd() });

  const runId = 'fin-run-1';
  const run = await cp.startRun({
    runId,
    objective: 'Finalize orchestration test',
    taskContract: { riskTier: 'T0', acceptance: ['acc-1'] },
  });

  assert.equal(run.state, 'FRAME');

  await cp.transition(runId, 'SHAPE');
  await cp.transition(runId, 'SLICE');
  await cp.transition(runId, 'SCHEDULE');
  await cp.transition(runId, 'EXECUTE');
  await cp.transition(runId, 'PROVE');
  await cp.recordProof(runId, {
    obligationId: 'default',
    status: 'passed',
    evidenceRef: 'ev-fin-1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
    acceptanceCoverage: ['acc-1'],
  });

  const finalizationReceipt = await cp.finalizeRun(runId, {
    knowledgeObservations: [
      {
        proposedType: 'semantic_fact',
        statement: 'Finalization orchestration executed cleanly.',
        scope: ['scripts/kernel/**'],
        evidenceRefs: [`sha256:${'a'.repeat(64)}`],
      },
    ],
    gitCloseoutRequest: { requested: false },
  });

  assert.equal(finalizationReceipt.completionStatus, 'accepted');
  assert.equal(finalizationReceipt.knowledgeStatus, 'committed');
  assert.equal(finalizationReceipt.gitCloseoutStatus, 'skipped');
  assert.ok(finalizationReceipt.knowledgeCommitReceipt);
  assert.equal(finalizationReceipt.knowledgeCommitReceipt.status, 'committed');

  await cp.close();
});
