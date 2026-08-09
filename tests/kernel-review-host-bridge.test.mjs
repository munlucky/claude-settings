import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { hashSessionId } from '../scripts/kernel/run/model-route-contract.mjs';

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
