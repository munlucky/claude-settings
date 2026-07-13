import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWorkflowBundle } from '../scripts/lib/workflow-bundle-resolver.mjs';

test('production bundle resolver loads requiredNow and only activated conditional skills', async () => {
  const baseline = await resolveWorkflowBundle({ bundleId: 'implementation-bundle' });
  assert.deepEqual(baseline.requiredNow, ['implementation-runner']);
  assert.deepEqual(baseline.activated, []);
  const behavior = await resolveWorkflowBundle({ bundleId: 'implementation-bundle', conditions: { behaviorChange: true } });
  assert.deepEqual(behavior.activated, ['test-driven-development']);
  assert.equal(behavior.activated.includes('code-simplifier'), false);
});

test('unknown conditional bundle fails closed', async () => {
  const result = await resolveWorkflowBundle({ bundleId: 'missing-bundle' });
  assert.equal(result.status, 'blocked');
});
