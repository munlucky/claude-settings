import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const attemptScript = fileURLToPath(new URL('./agent-loop-phase-attempt.mjs', import.meta.url));

function decide(timeoutClass, repeated = false) {
  const result = spawnSync(process.execPath, [
    attemptScript,
    'decide-timeout-policy',
    timeoutClass,
    repeated ? 'true' : 'false',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('same run timeout policy maps no retry, bounded retry, and long budget route', () => {
  assert.match(decide('broad_search_timeout'), /ACTION='stop-loop'/);
  assert.match(decide('broad_search_timeout'), /SAME_RUN_DECISION_RESULT='do_not_retry'/);
  assert.match(decide('raw_diff_output_timeout'), /ACTION='retry-timeout'/);
  assert.match(decide('raw_diff_output_timeout'), /SAME_RUN_DECISION_RESULT='bounded_retry'/);
  assert.match(decide('raw_diff_output_timeout', true), /SAME_RUN_DECISION_RESULT='stop_and_handoff'/);
  assert.match(decide('phaseRuntimeParity_timeout'), /ACTION='route-long-budget'/);
  assert.match(decide('phaseRuntimeParity_timeout'), /SAME_RUN_DECISION_RESULT='route_to_long_budget'/);
});
