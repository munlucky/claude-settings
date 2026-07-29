import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRequiredHostCapabilities } from '../scripts/kernel/run/required-host-capabilities.mjs';

test('start-time admission checks only capabilities that make completion impossible', () => {
  const contract = {
    acceptance: [{ id: 'AC-1' }],
    risks: ['security'],
    requiredObligations: [],
    flags: {},
    surfaces: [],
  };
  assert.throws(
    () => assertRequiredHostCapabilities(contract, { supportsProofExecution: true }),
    /independent-reviewer, read-only-review/,
  );
  assert.equal(assertRequiredHostCapabilities(contract, {
    supportsProofExecution: true,
    supportsIndependentContext: true,
    supportsReadOnlyReview: true,
  }).admitted, true);
});
