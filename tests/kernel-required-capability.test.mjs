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
  const admitted = assertRequiredHostCapabilities(contract, { supportsProofExecution: true });
  assert.equal(admitted.admitted, true);
  assert.deepEqual(admitted.required, {
    proofExecution: true,
    independentReviewer: false,
    readOnlyReview: false,
  });
});
