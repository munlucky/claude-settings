import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectProofTier, evidenceTierForProof } from '../scripts/kernel/proof-route.mjs';
import { classifyRisk } from '../scripts/kernel/route.mjs';

test('documentation-only change is T0 while security is hard-floor T3', () => {
  assert.equal(selectProofTier({ behaviorChanging: false }), 'T0');
  assert.equal(selectProofTier({ requestedTier: 'T0', surfaces: ['security_boundary'] }), 'T3');
  assert.equal(evidenceTierForProof('T3'), 'E2');
});

test('route and proof-route share risk surface vocabulary', () => {
  const highRiskSurfaces = ['security_boundary', 'data_migration', 'public_contract', 'schema_change', 'runtime_authority', 'installer'];

  for (const surf of highRiskSurfaces) {
    assert.equal(classifyRisk({ surfaces: [surf] }), 'T3', `classifyRisk should return T3 for ${surf}`);
    assert.equal(selectProofTier({ surfaces: [surf] }), 'T3', `selectProofTier should return T3 for ${surf}`);
  }
});
