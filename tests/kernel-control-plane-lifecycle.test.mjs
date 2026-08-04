import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { normalizeSessionBinding } from '../scripts/kernel/run/session-binding.mjs';
import { resolveKernelProjectIdentity } from '../scripts/kernel/project-identity.mjs';

test('KernelControlPlane wires full knowledge lifecycle end-to-end', async () => {
  const tmpRuntimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-cp-test-'));

  const cp = await createKernelControlPlane({
    runtimeHome: tmpRuntimeHome,
    projectRoot: process.cwd(),
  });

  // Step 1: startRun automatically resolves project identity & records FRAME knowledge context receipt
  const run = await cp.startRun({
    runId: 'cp-run-1',
    objective: 'Implement end-to-end knowledge lifecycle',
    taskContract: { filesChanged: ['scripts/kernel/control-plane.mjs'] },
  });

  assert.ok(run.projectId);
  assert.equal(run.state, 'FRAME');

  // Step 2: buildStageContext loads knowledge context for EXECUTE
  await cp.transition('cp-run-1', 'SHAPE');
  await cp.transition('cp-run-1', 'EXECUTE');
  const executeContext = await cp.buildStageContext('cp-run-1', {
    stage: 'EXECUTE',
    taskContract: { changedFiles: ['scripts/kernel/control-plane.mjs'] },
  });

  assert.ok(executeContext.knowledgeContext);
  assert.equal(executeContext.knowledgeContext.status, 'ready');

  // Step 3: recordProof in PROVE extracts and reviews candidates
  await cp.transition('cp-run-1', 'PROVE');
  const proofRun = await cp.recordProof('cp-run-1', {
    obligationId: 'default',
    status: 'passed',
    command: 'node --test tests/kernel-git-closeout.test.mjs',
    evidenceRef: 'proof-1',
    evidenceDigest: 'sha256:' + 'a'.repeat(64),
    acceptanceCoverage: [],
    changedFiles: ['scripts/kernel/control-plane.mjs'],
  });

  assert.equal(proofRun.state, 'PROVE');

  // Step 4: finalizeRun yields accepted decision & triggers knowledge commit
  const finalizationReceipt = await cp.finalizeRun('cp-run-1');

  if (finalizationReceipt.completionStatus !== 'accepted') {
    throw new Error(`Completion not accepted: status=${finalizationReceipt.completionStatus}`);
  }
  assert.equal(finalizationReceipt.completionStatus, 'accepted');
  assert.ok(finalizationReceipt.knowledgeCommitReceipt, `Expected knowledgeCommitReceipt but got error: ${finalizationReceipt.knowledgeCommitError}`);
  assert.ok(['committed', 'no_change'].includes(finalizationReceipt.knowledgeCommitReceipt.status));

  await cp.close();
});

test('public Kernel control-plane bootstrap reconciles terminal bindings from prior sessions', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-cp-binding-cleanup-'));
  const first = await createKernelControlPlane({
    runtimeHome,
    projectRoot: process.cwd(),
  });
  const projectId = resolveKernelProjectIdentity({ cwd: process.cwd() }).projectId;
  try {
    first.stateStore.createRun({
      runId: 'cp-terminal-binding',
      objective: 'terminal binding cleanup',
      sourceIdentity: `sha256:${'e'.repeat(64)}`,
      projectId,
    });
    first.stateStore.createSessionBinding(normalizeSessionBinding({
      bindingId: 'cp-terminal-binding-owner',
      provider: 'codex',
      sessionId: 'codex:old-cp-session',
      runId: 'cp-terminal-binding',
      projectId,
      accessMode: 'owner',
    }));
    first.stateStore.persistCompletionDecision('cp-terminal-binding', {
      decision: 'accepted',
      digest: `sha256:${'f'.repeat(64)}`,
      run: first.stateStore.getRun('cp-terminal-binding'),
      decisionPayload: { decision: 'accepted' },
    });
    assert.equal(
      first.stateStore.getActiveOwnerBinding({ projectId, sessionId: 'codex:old-cp-session' }).bindingId,
      'cp-terminal-binding-owner',
    );
    await first.close();

    const second = await createKernelControlPlane({
      runtimeHome,
      projectRoot: process.cwd(),
    });
    try {
      assert.equal(
        second.stateStore.getActiveOwnerBinding({ projectId, sessionId: 'codex:old-cp-session' }),
        null,
      );
      assert.equal(second.stateStore.diagnoseLifecycleState({ projectId }).counts.terminal_run_active_binding || 0, 0);
    } finally {
      await second.close();
    }
  } finally {
    try { await first.close(); } catch {}
    await rm(runtimeHome, { recursive: true, force: true });
  }
});
