import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCacheEconomics, normalizeModelUsageReceipt } from '../scripts/kernel/run/model-route-contract.mjs';

const receipt = (overrides) => normalizeModelUsageReceipt({
  decisionId: 'route-abcdef12',
  runId: 'run-1',
  hostSurface: 'claude',
  actorSessionId: `sha256:${'a'.repeat(64)}`,
  enforcementStatus: 'advisory',
  resultStatus: 'completed',
  ...overrides,
});

test('the eligible hit ratio compares reads against the cacheable prefix', () => {
  const summary = summarizeCacheEconomics([receipt({ eligiblePrefixTokens: 1000, cacheReadInputTokens: 900 })]);
  assert.equal(summary.eligibleHitRatio, 0.9);
});

test('the write/read ratio exposes an unprofitable prefix', () => {
  const summary = summarizeCacheEconomics([receipt({ cacheReadInputTokens: 400, cacheWriteInputTokens: 100 })]);
  assert.equal(summary.writeReadRatio, 0.25);
});

test('a ratio with a zero or unmeasured denominator is null, not zero', () => {
  assert.equal(summarizeCacheEconomics([receipt({ cacheReadInputTokens: 100 })]).eligibleHitRatio, null);
  assert.equal(summarizeCacheEconomics([receipt({ cacheReadInputTokens: 0, cacheWriteInputTokens: 0 })]).writeReadRatio, null);
  assert.equal(summarizeCacheEconomics([]).totalInputCacheRatio, null);
});

test('unmeasured totals stay null instead of summing to zero', () => {
  const summary = summarizeCacheEconomics([receipt({}), receipt({})]);
  assert.equal(summary.totals.cacheReadInputTokens, null);
  assert.equal(summary.totals.eligiblePrefixTokens, null);
  assert.equal(summary.receipts, 2);
});

test('the reasoning ratio is computed from reported tokens only', () => {
  const summary = summarizeCacheEconomics([receipt({ reasoningTokens: 50, outputTokens: 200 })]);
  assert.equal(summary.reasoningRatio, 0.25);
});

test('miss reasons are counted so a regression points at its cause', () => {
  const summary = summarizeCacheEconomics([
    receipt({ cacheMissReason: 'cold-prefix' }),
    receipt({ cacheMissReason: 'cold-prefix' }),
    receipt({ cacheMissReason: 'tool-schema-changed' }),
  ]);
  assert.deepEqual(summary.missReasons, { 'cold-prefix': 2, 'tool-schema-changed': 1 });
});
