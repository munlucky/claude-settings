import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCacheEconomics, normalizeModelUsageReceipt } from '../scripts/kernel/run/model-route-contract.mjs';

const receipt = (sessionLineageId) => normalizeModelUsageReceipt({
  decisionId: 'route-abcdef12',
  runId: 'run-1',
  hostSurface: 'codex',
  actorSessionId: `sha256:${'a'.repeat(64)}`,
  enforcementStatus: 'advisory',
  resultStatus: 'completed',
  sessionLineageId,
});

test('four turns on one lineage report a 75% continuation rate', () => {
  // The first turn of a lineage opens it; the rest continue it.
  const summary = summarizeCacheEconomics([receipt('l-1'), receipt('l-1'), receipt('l-1'), receipt('l-1')]);
  assert.equal(summary.sessionContinuationRate, 0.75);
});

test('four turns on four lineages report no continuation at all', () => {
  const summary = summarizeCacheEconomics([receipt('l-1'), receipt('l-2'), receipt('l-3'), receipt('l-4')]);
  assert.equal(summary.sessionContinuationRate, 0);
});

test('turns without a recorded lineage are excluded rather than counted as misses', () => {
  const summary = summarizeCacheEconomics([receipt(null), receipt(null)]);
  assert.equal(summary.sessionContinuationRate, null);
});

test('a mixed set counts only the turns that reported a lineage', () => {
  const summary = summarizeCacheEconomics([receipt('l-1'), receipt('l-1'), receipt(null)]);
  assert.equal(summary.sessionContinuationRate, 0.5);
});
