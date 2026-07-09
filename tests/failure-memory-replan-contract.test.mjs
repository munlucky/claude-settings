import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateFailureReplan } from '../scripts/lib/memory-control-plane-contracts.mjs';

test('repeated failure class requires changed approach', () => {
  const blocked = evaluateFailureReplan([
    { failureClass: 'stale_memory_error', changedApproach: true },
    { failureClass: 'stale_memory_error', changedApproach: false },
  ]);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.violations.includes('repeated failure class stale_memory_error requires changed approach'));

  const passed = evaluateFailureReplan([
    { failureClass: 'stale_memory_error', changedApproach: true },
    { failureClass: 'stale_memory_error', changedApproach: true },
  ]);
  assert.equal(passed.status, 'passed');
});
