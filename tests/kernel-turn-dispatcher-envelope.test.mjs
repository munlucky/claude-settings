import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { buildTurnPromptEnvelope, dispatchKernelTurn } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createClaudeAdapter } from '../scripts/host/kernel/adapters/claude.mjs';

// Regression for a Codex review finding on PR #19: buildPromptEnvelope was
// exercised only by the replay corpus and unit tests, never by a real
// dispatch, so a real Claude/Codex turn's receipt never carried a
// prefixDigest or cache policy. dispatchKernelTurn now computes the envelope
// on every turn and forwards it to both the adapter and the usage receipt.

const FRONTIER_ENV = { MOON_RELAY_KERNEL_MODEL_FRONTIER: 'configured-frontier', MOON_RELAY_KERNEL_MODEL_VALUE: 'configured-value' };

const withRun = async (fn) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-envelope-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-envelope-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-envelope', objective: 'exercise the prompt envelope on a live dispatch' });
    return await fn(cp, 'r-envelope');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
};

test('buildTurnPromptEnvelope compiles a real cache identity from a next() payload', () => {
  const envelope = buildTurnPromptEnvelope({
    modelInput: {
      objective: 'Ship the feature',
      acceptance: ['it works'],
      constraints: [],
      nonGoals: [],
      evidence: [{ obligationId: 'default', status: 'pending', evidenceDigest: 'sha256:aaa' }],
      action: { type: 'implement', guidance: 'go', obligations: [{ obligationId: 'default' }] },
      step: { stepId: 'step-1', objective: 'go', allowedPaths: ['src/'], forbiddenPaths: [] },
    },
    decision: { runId: 'r-1', role: 'implementer', actionKind: 'implement', riskTier: 'T1', modelClass: 'value_coding' },
    resolution: { model: 'model-a', effort: 'high' },
    hostCapabilities: { surface: 'claude' },
  });
  assert.match(envelope.cacheIdentity.prefixDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(envelope.cacheIdentity.resolvedModel, 'model-a');
  assert.equal(envelope.control.runId, 'r-1');
  assert.equal(envelope.control.stepId, 'step-1');
});

test('a real dispatch records a non-null prefix digest and cache mode on the receipt', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({
      launch: async ({ invocation, envelope }) => {
        // A real launcher would read envelope.segments for cache breakpoints;
        // this fake just proves the envelope actually arrived.
        assert.ok(envelope, 'launch() must receive the prompt envelope');
        assert.match(envelope.cacheIdentity.prefixDigest, /^sha256:[a-f0-9]{64}$/);
        return { resolvedModel: invocation.model, sessionId: 'claude-session-1' };
      },
    });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: createModelRegistry({ surface: 'claude', env: FRONTIER_ENV }) });
    assert.equal(result.dispatched, true);
    assert.ok(result.envelope);
    assert.match(result.receipt.promptPrefixDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.receipt.promptPrefixDigest, result.envelope.cacheIdentity.prefixDigest);
    assert.equal(result.receipt.cacheMode, 'shadow');
    assert.ok(result.receipt.sessionLineageId);
  });
});

test('computing the envelope does not change the legacy execution contract sent to the worker', async () => {
  await withRun(async (cp, runId) => {
    let seenContract = null;
    const adapter = createClaudeAdapter({
      launch: async ({ invocation, executionContract }) => {
        seenContract = executionContract;
        return { resolvedModel: invocation.model, sessionId: 'claude-session-1' };
      },
    });
    await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: createModelRegistry({ surface: 'claude', env: FRONTIER_ENV }) });
    assert.ok(seenContract);
    assert.equal(typeof seenContract.objective, 'string');
    assert.ok(!Object.hasOwn(seenContract, 'envelope'));
  });
});
