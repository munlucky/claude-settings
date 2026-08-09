import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { createCodexCliReviewLauncher } from '../scripts/host/kernel/codex-cli-launcher.mjs';
import { runCodexIndependentReview } from '../scripts/host/kernel/codex-review-host.mjs';

const withOwnerRun = async (fn, suffix) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), `kernel-codex-review-project-${suffix}-`));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), `kernel-codex-review-home-${suffix}-`));
  await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
  await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n');
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const runId = `codex-review-${suffix}`;
  const owner = 'codex:owner-session';
  const env = {
    MOON_RELAY_KERNEL_SESSION_ID: owner,
    MOON_RELAY_KERNEL_PROVIDER: 'codex',
    MOON_RELAY_KERNEL_RUN_ID: runId,
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, env, requireHostBinding: true });
  try {
    await controlPlane.ensureRun({
      runId,
      objective: 'review a protected change',
      taskContract: { acceptance: ['secure'], securityBoundary: true, riskTier: 'T3' },
    });
    await controlPlane.transition(runId, 'EXECUTE');
    await controlPlane.transition(runId, 'PROVE');
    return await fn({ controlPlane, runId, projectRoot, runtimeHome, owner, env });
  } finally {
    await controlPlane.close();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
};

test('Codex CLI launcher enforces an explicit model, fresh session, read-only sandbox, and structured output', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-launcher-'));
  let observed = null;
  const spawnImpl = (command, args) => {
    observed = { command, args };
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(async () => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      await writeFile(outputPath, JSON.stringify({ verdict: 'pass', findings: [], risks: [], evidenceRefs: ['src/a.mjs:1'] }));
      child.stdout.end([
        JSON.stringify({ type: 'thread.started', thread_id: 'reviewer-thread' }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 } }),
      ].join('\n'));
      child.stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  try {
    const launch = createCodexCliReviewLauncher({ projectRoot, spawnImpl });
    const result = await launch({
      invocation: { model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only', freshSessionRequired: true },
      executionCapsule: { role: 'reviewer' },
      executionContract: { permissions: 'read_only' },
    });
    assert.equal(result.sessionId, 'reviewer-thread');
    assert.equal(result.resolvedModel, 'gpt-5.6-sol');
    assert.equal(result.inputTokens, 10);
    assert.ok(observed.args.includes('read-only'));
    assert.ok(observed.args.includes('gpt-5.6-sol'));
    assert.ok(observed.args.includes('--output-schema'));
    assert.ok(observed.args.includes('--output-last-message'));
    assert.ok(observed.args.includes('--ignore-user-config'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('Codex review Host records a complete routed receipt from a distinct read-only session', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    const result = await runCodexIndependentReview({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      env,
      launch: async ({ invocation }) => {
        assert.equal(invocation.sandbox, 'read-only');
        assert.equal(invocation.freshSessionRequired, true);
        return {
          status: 'completed',
          resolvedModel: invocation.model,
          sessionId: 'codex:independent-reviewer',
          outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['package.json:1'] },
        };
      },
    });
    assert.match(result.reviewReceiptId, /^review-receipt-/);
    assert.equal(result.verdict, 'pass');
    const receipt = controlPlane.listReviewReceipts(runId).find((item) => item.receiptId === result.reviewReceiptId);
    assert.equal(receipt.reviewer.enforcementStatus, 'enforced');
    assert.equal(receipt.reviewer.modelClass, 'frontier_reasoning');
    assert.notEqual(receipt.reviewer.actorSessionId, receipt.implementer.actorSessionId);
    assert.deepEqual(receipt.acceptanceCoverage, []);
  }, 'pass');
});

test('Codex review Host rejects a reviewer session equal to the owner session', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    await assert.rejects(() => runCodexIndependentReview({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      env,
      launch: async ({ invocation }) => ({
        status: 'completed',
        resolvedModel: invocation.model,
        sessionId: owner,
        outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: [] },
      }),
    }), /incomplete_review_chain|reviewing session is the implementing session/);
    assert.equal(controlPlane.listReviewReceipts(runId).length, 0);
  }, 'same-session');
});
