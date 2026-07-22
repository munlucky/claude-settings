import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLivePreflight, adoptLive, LIVE_APPROVAL_TOKEN } from '../scripts/switcher/adoption.mjs';
test('phase 06 preflight is non-mutating and excludes sensitive content', async () => {
  const result = await buildLivePreflight({ sourceRoot: process.cwd(), processProvider: async () => [] });
  assert.equal(result.approvalRequired, true); assert.equal(result.liveMutationCount, 0); assert.equal(result.sensitiveContentRead, false); assert.ok(result.targets.length >= 5);
});
test('phase 06 adoption refuses without explicit approval token', async () => {
  const result = await adoptLive({ sourceRoot: process.cwd(), approved: false, approvalToken: '', processProvider: async () => [] });
  assert.equal(result.status, 'operator_approval_missing'); assert.equal(result.liveMutationCount, 0);
  assert.equal(LIVE_APPROVAL_TOKEN, 'APPROVE_LIVE_HARNESS_SWITCHER');
});
