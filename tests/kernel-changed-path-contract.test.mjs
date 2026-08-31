import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProofRoute } from '../scripts/kernel/proof-route.mjs';

test('Proof route accepts numeric changedFileCount without using file count as semantic risk', () => {
  const routeSmall = resolveProofRoute({ filesChanged: 3, requestedTier: 'T0' });
  assert.equal(routeSmall.proofTier, 'T0');

  const routeLarge = resolveProofRoute({ filesChanged: 9, requestedTier: 'T0' });
  assert.equal(routeLarge.proofTier, 'T0');
});
