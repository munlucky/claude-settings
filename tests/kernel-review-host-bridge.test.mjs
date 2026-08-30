import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { hashSessionId } from '../scripts/kernel/run/model-route-contract.mjs';
import { dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';

test('reviewer outcome cannot pass without the complete host-recorded chain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-bridge-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-bridge-state-'));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'node -e "process.exit(0)"' } }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: root });
  try {
    await cp.startRun({ runId: 'review-chain', objective: 'secure change', taskContract: { acceptance: ['secure'], securityBoundary: true } });
    await assert.rejects(() => cp.ingestReviewerOutcome({
      runId: 'review-chain',
      stepId: 'step-1-1',
      capsuleId: 'capsule-missing',
      routeDecisionId: 'route-missing',
      usageReceiptId: 'usage-missing',
      reviewerSessionId: 'reviewer',
      outcome: { verdict: 'pass', findings: [], evidenceRefs: [], reviewedMutationRevision: 0 },
    }), /incomplete_review_chain/);
    assert.equal(cp.listReviewReceipts('review-chain').length, 0);
  } finally {
    await cp.close();
  }
});

test('an owner-bound two-command run supplies truthful implementation provenance to review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-owner-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-owner-state-'));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'node -e "process.exit(0)"' } }));
  const env = {
    MOON_RELAY_KERNEL_SESSION_ID: 'owner-session',
    MOON_RELAY_KERNEL_RUN_ID: 'owner-review-chain',
  };
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: root, env, requireHostBinding: true });
  try {
    await cp.ensureRun({
      runId: 'owner-review-chain',
      objective: 'secure change',
      taskContract: { acceptance: ['secure'], securityBoundary: true },
    });
    const capsule = await cp.buildReviewerCapsule('owner-review-chain', {
      stage: 'engineering',
      obligationId: 'security-review',
    });
    assert.equal(capsule.implementationReceipt.actorSessionId, hashSessionId('unknown-host:owner-session'));
    assert.equal(capsule.implementationReceipt.usageReceiptId, undefined);
  } finally {
    await cp.close();
  }
});

test('the native Host review bridge ingests the observed outcome into a Kernel review receipt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-native-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-review-native-state-'));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'track: kernel\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'node -e "process.exit(0)"' } }));
  await writeFile(path.join(root, 'app.mjs'), 'export const value = 0;\n');
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot: root });
  try {
    await cp.startRun({
      runId: 'native-review-chain',
      objective: 'secure change',
      taskContract: {
        surfaces: ['security_boundary'],
        acceptance: ['secure'],
        allowedPaths: ['app.mjs'],
      },
    });
    const implementer = createClaudeAdapter({
      launch: async ({ invocation }) => ({
        resolvedModel: invocation.model,
        observedModel: invocation.model,
        resolvedEffort: invocation.effort,
        observedEffort: invocation.effort,
        sessionId: 'native-review-implementer',
      }),
    });
    const implementation = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'native-review-chain',
      adapter: implementer,
      registry: createModelRegistry({
        surface: 'claude',
        env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' },
      }),
      actionContext: { executionMode: 'native-subagent', delegationRequested: true },
    });
    await writeFile(path.join(root, 'app.mjs'), 'export const value = 1;\n');
    await cp.report('native-review-chain', {
      summary: 'implemented',
      capsuleId: implementation.executionCapsule.capsuleId,
      stepId: implementation.executionCapsule.stepId,
      changedPaths: ['app.mjs'],
    });
    await cp.transition('native-review-chain', 'SHAPE');
    await cp.transition('native-review-chain', 'EXECUTE');
    await cp.transition('native-review-chain', 'PROVE');
    const reviewedRun = await cp.getRun('native-review-chain');
    let nativeRequest = null;
    const reviewer = createCodexAdapter({
      nativeAgentHost: {
        spawn_agent: async (payload) => {
          nativeRequest = payload;
          return {
            session_id: 'native-reviewer-session',
            terminalEvents: [{ type: 'turn.completed', model: 'gpt-5.6-sol', reasoning_effort: 'xhigh' }],
            outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['review://native'] },
          };
        },
      },
      parentSessionObserver: async ({ parentSessionId }) => ({
        sessionId: parentSessionId,
        model: 'gpt-5.6-sol',
        effort: 'xhigh',
      }),
    });
    const result = await dispatchKernelTurn({
      controlPlane: cp,
      runId: 'native-review-chain',
      adapter: reviewer,
      registry: createModelRegistry({ surface: 'codex', env: { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'gpt-5.6-sol' } }),
      parentSessionId: 'native-owner-session',
      actionContext: {
        actionKind: 'review_engineering',
        obligationId: 'security-review',
        executionMode: 'native-subagent',
        delegationRequested: true,
        changedPaths: ['app.mjs'],
      },
    });
    assert.equal(nativeRequest.task_name, 'kernel_reviewer');
    assert.equal(nativeRequest.child_session.canCommit, false);
    assert.equal(nativeRequest.execution_capsule.permissions.filesystem, 'read_only');
    assert.equal(nativeRequest.execution_capsule.mutationRevision, undefined, 'control provenance stays out of the model-visible capsule');
    assert.equal(result.review.review.verdict, 'pass');
    assert.match(result.reviewReceiptId, /^review-receipt-[a-f0-9]{24}$/);
    assert.equal(result.reviewReceipt.reviewer.usageReceiptId, result.receipt.receiptId);
    assert.equal(result.reviewReceipt.subject.mutationRevision, reviewedRun.mutationRevision);
    assert.equal(cp.listReviewReceipts('native-review-chain').length, 1);
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
