import test from 'node:test';
import assert from 'node:assert/strict';
import { CODEX_CAPABILITIES, createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import { resolveCodexProModePolicy } from '../scripts/host/kernel/codex-model-policy.mjs';
import { normalizeProviderCacheCapabilities, resolveProviderPromptPolicy } from '../scripts/host/kernel/provider-prompt-policy.mjs';

test('Responses-API-only features are not assumed on the Codex CLI surface', () => {
  // These exist in OpenAI's documentation; that is not evidence the installed
  // surface exposes them.
  assert.equal(CODEX_CAPABILITIES.supportsPersistedReasoning, false);
  assert.equal(CODEX_CAPABILITIES.supportsProgrammaticToolCalling, false);
  assert.equal(CODEX_CAPABILITIES.supportsProMode, false);
  assert.equal(CODEX_CAPABILITIES.supportsExplicitCacheBreakpoints, false);
  assert.equal(CODEX_CAPABILITIES.supportsUltra, false);
  assert.equal(CODEX_CAPABILITIES.supportsFastMode, false);
});

test('a Host that genuinely has a capability can declare it', () => {
  const adapter = createCodexAdapter({ capabilities: { supportsPersistedReasoning: true, supportsExplicitCacheBreakpoints: true } });
  assert.equal(adapter.capabilities.supportsPersistedReasoning, true);
  assert.equal(normalizeProviderCacheCapabilities(adapter.capabilities).supportsExplicitCacheBreakpoints, true);
});

test('an undeclared capability falls back and is reported as provider-unsupported', () => {
  const policy = resolveProviderPromptPolicy({ provider: 'codex', capabilities: CODEX_CAPABILITIES });
  assert.equal(policy.cachePolicy.providerMode, 'none');
  assert.equal(policy.cachePolicy.unsupportedReason, 'provider-unsupported');
  assert.equal(policy.reasoningPolicy.persistedReasoning, 'current_turn');
});

test('Pro mode requires capability, intent, an eval result, and an explicit request', () => {
  assert.equal(resolveCodexProModePolicy({}).enabled, false);
  assert.equal(resolveCodexProModePolicy({}).reason, 'provider-unsupported');
  const gates = { capabilityDetected: true, qualityOverLatency: true, evalConfirmedGain: true, explicitlyRequested: true };
  assert.equal(resolveCodexProModePolicy(gates).enabled, true);
  for (const gate of Object.keys(gates)) {
    assert.equal(resolveCodexProModePolicy({ ...gates, [gate]: false }).enabled, false, gate);
  }
});

test('an adapter with no launcher reports unsupported instead of pretending to run', async () => {
  const adapter = createCodexAdapter({});
  const result = await adapter.dispatch({
    decision: { role: 'implementer', permissions: 'workspace_write', modelClass: 'value_coding' },
    resolution: { model: null, effort: null },
    executionContract: {},
  });
  assert.equal(result.status, 'unsupported');
});
