import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { dispatchKernelTurn, resolveTurnModelPolicy } from '../scripts/host/kernel/turn-dispatcher.mjs';
import { createModelRegistry } from '../scripts/host/kernel/model-registry.mjs';
import { createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import { CODEX_MODELS } from '../scripts/host/kernel/codex-model-policy.mjs';

// Regression for a Codex review finding on PR #19: MOON_RELAY_KERNEL_MODEL_
// POLICY_MODE=on had no runtime consumer — dispatchKernelTurn only ever
// resolved the logical class through the registry, never the Wave 5/6
// Sol/Terra/Luna or Claude-effort recommendation.

const withRun = async (fn) => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-modelpolicy-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-modelpolicy-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-modelpolicy', objective: 'exercise the model-policy mode switch' });
    return await fn(cp, 'r-modelpolicy');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
};

test('resolveTurnModelPolicy recommends Terra/medium for a routine Codex implement turn', () => {
  const recommendation = resolveTurnModelPolicy({
    decision: { actionKind: 'implement', riskTier: 'T1', reasonCodes: ['ACTION_DEFAULT'] },
    hostCapabilities: { surface: 'codex' },
  });
  assert.equal(recommendation.model, CODEX_MODELS.terra);
  assert.equal(recommendation.effort, 'medium');
});

test('resolveTurnModelPolicy recommends a Claude effort with no model override', () => {
  const recommendation = resolveTurnModelPolicy({
    decision: { actionKind: 'review_engineering', riskTier: 'T1', reasonCodes: ['ACTION_DEFAULT'] },
    hostCapabilities: { surface: 'claude' },
  });
  assert.equal(recommendation.model, null);
  assert.equal(recommendation.effort, 'medium');
});

test('an unrecognized surface gets no recommendation', () => {
  assert.equal(resolveTurnModelPolicy({ decision: { actionKind: 'implement', reasonCodes: [] }, hostCapabilities: { surface: 'fable' } }), null);
});

test('shadow mode (the default) computes the recommendation but does not apply it', async () => {
  await withRun(async (cp, runId) => {
    const adapter = createCodexAdapter({ launch: async () => ({ resolvedModel: 'host-configured', sessionId: 'codex-session-1' }) });
    const result = await dispatchKernelTurn({ controlPlane: cp, runId, adapter, registry: createModelRegistry({ surface: 'codex' }) });
    assert.equal(result.dispatched, true);
    // No env var configured on the registry, so resolution.model stays
    // whatever the (unconfigured) registry produced — not the Terra
    // recommendation — because MOON_RELAY_KERNEL_MODEL_POLICY_MODE defaults
    // to shadow.
    assert.notEqual(result.resolution.model, CODEX_MODELS.terra);
  });
});

test('MOON_RELAY_KERNEL_MODEL_POLICY_MODE=on applies the recommendation to the actual dispatch', async () => {
  await withRun(async (cp, runId) => {
    let seenResolution = null;
    const adapter = createCodexAdapter({
      launch: async ({ invocation }) => { seenResolution = invocation; return { resolvedModel: invocation.model, sessionId: 'codex-session-2' }; },
    });
    const result = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry: createModelRegistry({ surface: 'codex' }),
      env: { MOON_RELAY_KERNEL_MODEL_POLICY_MODE: 'on' },
    });
    assert.equal(result.dispatched, true);
    assert.equal(result.resolution.model, CODEX_MODELS.terra);
    assert.equal(result.resolution.effort, 'medium');
    assert.equal(result.resolution.source, 'model-policy');
    assert.equal(seenResolution.model, CODEX_MODELS.terra, 'the adapter must dispatch with the applied resolution, not the registry default');
  });
});

test('model-policy mode never claims enforced on Claude with no concrete model configured', async () => {
  // Regression: Claude's recommendation supplies only an effort (model:
  // null). Applying it unconditionally still flipped source/enforcementIntent
  // to 'model-policy'/'enforced' even though resolution.model stayed null —
  // which is exactly what admission's checkRoleRules() uses to decide a T3
  // review ran on a proven, enforced model. A registry with nothing
  // configured must keep reporting an unenforced, no-model resolution.
  const { createClaudeAdapter } = await import('../scripts/host/kernel/adapters/claude.mjs');
  await withRun(async (cp, runId) => {
    const adapter = createClaudeAdapter({ launch: async () => ({ sessionId: 'claude-session-3' }) });
    const result = await dispatchKernelTurn({
      controlPlane: cp,
      runId,
      adapter,
      registry: createModelRegistry({ surface: 'claude' }),
      env: { MOON_RELAY_KERNEL_MODEL_POLICY_MODE: 'on' },
    });
    assert.equal(result.resolution.model, null);
    assert.notEqual(result.resolution.source, 'model-policy');
    assert.notEqual(result.resolution.enforcementIntent, 'enforced');
  });
});

test('an ESCALATION_LOCKED decision keeps the Codex recommendation on Sol/xhigh', () => {
  // Regression: resolveModelRoute() emits 'ESCALATION_LOCKED' to hold an
  // already-escalated obligation on frontier_reasoning across its retries.
  // isRepeatedFailure() previously did not recognize this reason code, so a
  // subsequent implement turn under MOON_RELAY_KERNEL_MODEL_POLICY_MODE=on
  // fell through to the default Terra/medium recommendation and silently
  // undid the lock.
  const recommendation = resolveTurnModelPolicy({
    decision: { actionKind: 'implement', riskTier: 'T1', reasonCodes: ['ESCALATION_LOCKED'] },
    hostCapabilities: { surface: 'codex' },
  });
  assert.equal(recommendation.model, CODEX_MODELS.sol);
  assert.equal(recommendation.effort, 'xhigh');
});
