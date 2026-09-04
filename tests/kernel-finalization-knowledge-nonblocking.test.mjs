import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-fin-kn-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-fin-kn-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Kernel Test'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot, encoding: 'utf8' });
  await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
  await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'track: kernel\nproduct: moon-relay-kernel\n');
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'finalization-knowledge-nonblocking',
    version: '0.0.1',
    scripts: { test: 'node -e "process.exit(0)"' },
  }));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const ready = true;\n');
  spawnSync('git', ['add', '.'], { cwd: projectRoot, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: projectRoot, encoding: 'utf8' });
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  await rm(projectRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
};

test('Finalization Wave 5: Knowledge conflict does not fail accepted code delivery and defers knowledge safely', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const runId = 'r-kn-nonblocking';
    await cp.startRun({
      runId,
      objective: 'deliver feature despite knowledge conflict',
      taskContract: {
        riskTier: 'T0',
        acceptance: [{
          acceptance: 'basic unit works',
          evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test'], obligationId: 'default' },
        }],
        allowedPaths: ['app.mjs'],
      },
    });

    await cp.transition(runId, 'EXECUTE');
    await cp.transition(runId, 'PROVE');
    await cp.recordProof(runId, {
      obligationId: 'default',
      status: 'passed',
      evidenceRef: 'ev-fin-pass',
      commandRef: 'test',
      command: 'node -e "process.exit(0)"',
      exitCode: 0,
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      acceptanceCoverage: ['basic unit works'],
    });
    await cp.transition(runId, 'CLOSE');

    const store = cp.stateStore;
    const run = store.getRun(runId);
    const projectId = run.projectId;

    // Simulate an accepted completion decision
    store.recordCompletionDecision(runId, {
      decision: 'accepted',
      sourceIdentity: run.sourceIdentity,
      mutationRevision: run.mutationRevision,
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      decisionJson: { decision: 'accepted' },
    });

    // Advance project knowledge revision in background from 1 to 2 by committing real records
    store.createRun({
      runId: 'r-bg-advance',
      objective: 'bg advance',
      sourceIdentity: run.sourceIdentity,
      workspaceIdentity: run.workspaceIdentity,
      projectId,
      taskContract: { acceptance: ['bg works'] },
    });
    store.recordCompletionDecision('r-bg-advance', {
      decision: 'accepted',
      sourceIdentity: run.sourceIdentity,
      mutationRevision: 1,
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
      decisionJson: { decision: 'accepted' },
    });
    store.commitKnowledgeTransaction({
      transactionId: 'tx-conflict-advance',
      runId: 'r-bg-advance',
      projectId,
      expectedRevision: '1',
      records: [{ id: 'rec-bg-1', type: 'semantic_fact', statement: 'bg fact' }],
      supersessions: [],
      provenance: { runId: 'r-bg-advance', committedCount: 1 },
      noChange: false,
    });
    assert.equal(store.getProjectKnowledgeRevision(projectId), 2, 'Project revision should be advanced to 2');

    // Now finalize runId: knowledge start revision is 1, but store revision is 2.
    // Attempt 1 fails CAS, reloads revision 2, and succeeds on Attempt 2!
    const receipt = await cp.finalizeRun(runId, {
      knowledgeObservations: [
        { proposedType: 'semantic_fact', statement: 'statement recovered on attempt 2' },
      ],
    });
    assert.equal(receipt.completionStatus, 'accepted', 'Code delivery must remain accepted');
    assert.equal(receipt.knowledgeStatus, 'committed', 'CAS retry should commit successfully');
    assert.equal(receipt.knowledgeCommitAttempts, 2, 'Must succeed on attempt 2 after CAS reload');
    assert.equal(store.getProjectKnowledgeRevision(projectId), 3, 'Revision should advance to 3');
    assert.equal(receipt.finalizationStatus, 'completed', 'Finalization should complete');

    // Case 2: Continuous revision conflict across all 3 retries defers knowledge, but Git Closeout still completes!
    let attemptCount = 0;
    const origCommit = store.commitKnowledgeTransaction.bind(store);
    store.commitKnowledgeTransaction = (args) => {
      attemptCount++;
      const current = store.getProjectKnowledgeRevision(projectId);
      store.updateProjectKnowledgeRevision(projectId, current, current + 1);
      throw new Error(`STALE_KNOWLEDGE_REVISION: concurrent race attempt ${attemptCount}`);
    };
    try {
      const deferredRunId = 'r-kn-deferred';
      await writeFile(path.join(fixture.projectRoot, 'change.txt'), 'kernel change\n');
      await cp.startRun({
        runId: deferredRunId,
        objective: 'deferred knowledge test',
        taskContract: {
          riskTier: 'T0',
          acceptance: [{
            acceptance: 'deferred unit works',
            evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test'], obligationId: 'default' },
          }],
          allowedPaths: ['change.txt'],
        },
      });
      await cp.transition(deferredRunId, 'EXECUTE');
      await cp.transition(deferredRunId, 'PROVE');
      await cp.recordProof(deferredRunId, {
        obligationId: 'default',
        status: 'passed',
        evidenceRef: 'ev-fin-pass-2',
        commandRef: 'test',
        command: 'npm test',
        exitCode: 0,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        acceptanceCoverage: ['deferred unit works'],
      });

      const deferredReceipt = await cp.finalizeRun(deferredRunId, {
        knowledgeObservations: [
          { proposedType: 'semantic_fact', statement: 'fact that cannot be committed' },
        ],
        gitCloseoutRequest: {
          requested: true,
          mode: 'soft',
          approvalReceipt: 'approval-deferred-test',
        },
        changedPaths: ['change.txt'],
      });
      assert.equal(attemptCount, 3, 'Must attempt exactly 3 CAS retries');
      assert.equal(deferredReceipt.completionStatus, 'accepted', 'Code delivery must remain accepted');
      assert.equal(deferredReceipt.knowledgeStatus, 'deferred', 'Knowledge status should be marked deferred');
      assert.equal(deferredReceipt.gitCloseoutStatus, 'completed', 'Git closeout must complete successfully despite deferred knowledge');
      assert.ok(deferredReceipt.gitCloseoutReceipt, 'Git closeout receipt must exist');
      assert.ok(deferredReceipt.gitCloseoutReceipt.commitSha, 'Git closeout commitSha must exist');

      // Verify that the commit actually exists in git history
      const headLog = spawnSync('git', ['log', '-1', '--oneline', deferredReceipt.gitCloseoutReceipt.commitSha], {
        cwd: fixture.projectRoot,
        encoding: 'utf8',
      });
      assert.equal(headLog.status, 0, `Git commit must exist: ${headLog.stderr}`);
      assert.match(headLog.stdout, new RegExp(deferredReceipt.gitCloseoutReceipt.commitSha.slice(0, 7)));

      // Verify deferred receipt was recorded in store
      const persistedReceipt = store.getKnowledgeCommitReceipt(deferredRunId)?.receiptJson;
      assert.equal(persistedReceipt?.status, 'deferred');
      assert.equal(persistedReceipt?.reason, 'cas_retry_exhausted');
    } finally {
      store.commitKnowledgeTransaction = origCommit;
    }

    // Verify deferred knowledge survives control plane restart and can be processed
    await cp.close();
    const cp2 = await createKernelControlPlane(fixture);
    try {
      const persistedAfterRestart = cp2.stateStore.getKnowledgeCommitReceipt('r-kn-deferred')?.receiptJson;
      assert.equal(persistedAfterRestart?.status, 'deferred');
      const candidates = cp2.stateStore.getKnowledgeCandidates('r-kn-deferred');
      assert.ok(candidates.length > 0);
    } finally {
      await cp2.close();
    }
  } finally {
    await cleanup(fixture);
  }
});
