import test from 'node:test';
import assert from 'node:assert/strict';
import { isPathStagable, filterStagingSelection } from '../scripts/kernel/git/staging-policy.mjs';

test('isPathStagable rejects runtime DB, env, and memorygraph files', () => {
  assert.equal(isPathStagable('src/index.mjs'), true);
  assert.equal(isPathStagable('.env'), false);
  assert.equal(isPathStagable('.moonshot-relay/state/runtime-state.sqlite'), false);
  assert.equal(isPathStagable('.claude/memorygraph/graph.json'), false);
});

test('filterStagingSelection separates allowed source paths from hard deny paths', () => {
  const input = ['scripts/kernel/test.mjs', '.env.local', 'state.sqlite'];
  const { selectedPaths, excludedPaths } = filterStagingSelection(input);

  assert.deepEqual(selectedPaths, ['scripts/kernel/test.mjs']);
  assert.deepEqual(excludedPaths, ['.env.local', 'state.sqlite']);
});
