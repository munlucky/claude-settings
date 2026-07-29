import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createCodexAdapter, CODEX_CAPABILITIES } from '../scripts/host/kernel/adapters/codex.mjs';
import { resolveCodexProfileDir } from '../scripts/host/kernel/codex-profile-materializer.mjs';

// Regression for a Codex review finding on PR #19: materializeCodexProfiles()
// had no production caller, so an installed Codex session never received the
// Sol/Terra/Luna overlays. The adapter now materializes them into the given
// runtime home before it launches, giving the materializer an actual caller
// without touching the operator's own .codex/ config.

const withTempHome = async (fn) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-adapter-profile-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

test('a dispatch with a runtimeHome materializes the profile overlays before launching', async () => {
  await withTempHome(async (runtimeHome) => {
    const adapter = createCodexAdapter({
      runtimeHome,
      launch: async () => ({ resolvedModel: 'gpt-5.6-terra', sessionId: 'codex-session-1' }),
    });
    await adapter.dispatch({
      decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
      resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
      executionContract: {},
    });
    const profileDir = resolveCodexProfileDir({ runtimeHome });
    const config = await readFile(path.join(profileDir, 'config.toml'), 'utf8');
    assert.match(config, /model = "gpt-5\.6-terra"/);
    const review = await readFile(path.join(profileDir, 'review.config.toml'), 'utf8');
    assert.match(review, /sandbox_mode = "read-only"/);
  });
});

test('a dispatch without a runtimeHome does not attempt to materialize anything', async () => {
  const adapter = createCodexAdapter({
    capabilities: CODEX_CAPABILITIES,
    launch: async () => ({ resolvedModel: 'gpt-5.6-terra', sessionId: 'codex-session-2' }),
  });
  const result = await adapter.dispatch({
    decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
    resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
    executionContract: {},
  });
  assert.equal(result.status, 'completed');
});

test('the envelope reaches the Codex launcher alongside the invocation', async () => {
  let seenEnvelope = null;
  const adapter = createCodexAdapter({
    launch: async ({ envelope }) => { seenEnvelope = envelope; return { resolvedModel: 'gpt-5.6-terra' }; },
  });
  await adapter.dispatch({
    decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
    resolution: { model: 'gpt-5.6-terra', effort: 'medium' },
    executionContract: {},
    envelope: { cacheIdentity: { prefixDigest: 'sha256:test' } },
  });
  assert.equal(seenEnvelope.cacheIdentity.prefixDigest, 'sha256:test');
});
