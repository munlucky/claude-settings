import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createCodexAdapter, CODEX_CAPABILITIES } from '../scripts/host/kernel/adapters/codex.mjs';
import { CODEX_PROVIDER_HOME_MISMATCH, resolveCodexProfileDir } from '../scripts/host/kernel/codex-profile-materializer.mjs';
import { CODEX_MAIN_SESSION_POLICY } from '../scripts/host/kernel/codex-session-observer.mjs';

// Regression for a Codex review finding on PR #19: materializeCodexProfiles()
// had no production caller, so an installed Codex session never received the
// Sol/Terra/Luna overlays. The adapter now materializes them into the given
// runtime home before it launches, giving the materializer an actual caller
// without touching the operator's own .codex/ config.

const withTempHome = async (fn) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-adapter-profile-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

const stableParentObserver = async ({ parentSessionId }) => ({
  sessionId: parentSessionId,
  model: CODEX_MAIN_SESSION_POLICY.model,
  effort: CODEX_MAIN_SESSION_POLICY.effort,
});

test('a dispatch with a runtimeHome materializes the profile overlays before launching', async () => {
  await withTempHome(async (runtimeHome) => {
    const adapter = createCodexAdapter({
      runtimeHome,
      env: {
        ...process.env,
        MOON_RELAY_KERNEL_HOME: runtimeHome,
        CODEX_HOME: path.join(runtimeHome, 'providers', 'codex'),
      },
      parentSessionObserver: stableParentObserver,
      launch: async ({ invocation }) => ({ resolvedModel: invocation.model, resolvedEffort: invocation.effort, effortObserved: true, sessionId: 'codex-session-1' }),
    });
    await adapter.dispatch({
      decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
      resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
      parentSessionId: 'codex-parent-session',
      executionContract: {},
    });
    const profileDir = resolveCodexProfileDir({ runtimeHome });
    const config = await readFile(path.join(profileDir, 'config.toml'), 'utf8');
    assert.match(config, /model = "gpt-5\.6-luna"/);
    assert.match(config, /model_reasoning_effort = "max"/);
    const review = await readFile(path.join(profileDir, 'review.config.toml'), 'utf8');
    assert.match(review, /sandbox_mode = "read-only"/);
  });
});

test('a dispatch fails closed before launching when CODEX_HOME disagrees with the provider home', async () => {
  await withTempHome(async (runtimeHome) => {
    let launchCount = 0;
    const adapter = createCodexAdapter({
      runtimeHome,
      env: {
        ...process.env,
        MOON_RELAY_KERNEL_HOME: runtimeHome,
        CODEX_HOME: path.join(runtimeHome, 'other-codex'),
      },
      parentSessionObserver: stableParentObserver,
      launch: async () => {
        launchCount += 1;
        return { resolvedModel: 'gpt-5.6-terra', resolvedEffort: 'medium', effortObserved: true, sessionId: 'must-not-launch' };
      },
    });
    await assert.rejects(
      adapter.dispatch({
        decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
        resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
        parentSessionId: 'codex-parent-session',
        executionContract: {},
      }),
      (error) => {
        assert.equal(error.code, CODEX_PROVIDER_HOME_MISMATCH);
        assert.equal(error.errorCode, CODEX_PROVIDER_HOME_MISMATCH);
        return true;
      },
    );
    assert.equal(launchCount, 0, 'the worker must not launch after provider-home validation fails');
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(path.join(runtimeHome, 'providers')), false, 'the mismatch must fail before profile writes');
  });
});

test('a dispatch without a runtimeHome does not attempt to materialize anything', async () => {
  const adapter = createCodexAdapter({
    capabilities: CODEX_CAPABILITIES,
    parentSessionObserver: stableParentObserver,
    launch: async ({ invocation }) => ({ resolvedModel: invocation.model, resolvedEffort: invocation.effort, effortObserved: true, sessionId: 'codex-session-2' }),
  });
  const result = await adapter.dispatch({
    decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
    resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
    parentSessionId: 'codex-parent-session',
    executionContract: {},
  });
  assert.equal(result.status, 'completed');
});

test('the envelope reaches the Codex launcher alongside the invocation', async () => {
  let seenEnvelope = null;
  const adapter = createCodexAdapter({
    parentSessionObserver: stableParentObserver,
    launch: async ({ envelope, invocation }) => { seenEnvelope = envelope; return { resolvedModel: invocation.model, resolvedEffort: invocation.effort, effortObserved: true, sessionId: 'codex-session-envelope' }; },
  });
  await adapter.dispatch({
    decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
    resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
    parentSessionId: 'codex-parent-session',
    executionContract: {},
    envelope: { cacheIdentity: { prefixDigest: 'sha256:test' } },
  });
  assert.equal(seenEnvelope.cacheIdentity.prefixDigest, 'sha256:test');
});
