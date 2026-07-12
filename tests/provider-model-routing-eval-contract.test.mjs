import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { evaluateProviderRoutingFixture } from '../tools/evals/provider-model-routing.mjs';

test('shadow evaluation keeps nullable usage and quality fields distinct', async () => {
  const result = await evaluateProviderRoutingFixture(path.join(process.cwd(), 'tests/fixtures/provider-model-routing/shadow-corpus.json'));
  assert.equal(result.status, 'pass');
  assert.equal(result.promotionDecision, 'shadow_only');
  assert.equal(result.distinctUsage, true);
  assert.equal(result.noMutation, true);
  assert.ok(result.results.every((item) => Object.hasOwn(item.usage, 'actualCredits')));
});
