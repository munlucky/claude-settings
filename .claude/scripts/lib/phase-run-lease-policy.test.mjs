import assert from 'node:assert/strict';
import test from 'node:test';

import { assertReturnAllowedFromFiles, normalizeFinishOutcome } from './phase-run-lease-policy.mjs';

test('assert-return-allowed reports dead dispatcher pid as stale active lease', () => {
  const decision = assertReturnAllowedFromFiles({
    actionable: 1,
    executionIntent: true,
    prepareOnly: false,
    existing: {
      status: 'active',
      dispatcherPid: '99999999',
      lastHeartbeatAt: new Date().toISOString(),
    },
  });

  assert.equal(decision.RETURN_ALLOWED, 'false');
  assert.equal(decision.RETURN_REASON, 'stale-run-lease:dead-dispatcher-pid');
  assert.equal(decision.STALE_REASON, 'dead-dispatcher-pid');
  assert.equal(decision.ACTIONABLE_PHASES_REMAINING, '1');
});

test('assert-return-allowed preserves stale heartbeat classification', () => {
  const decision = assertReturnAllowedFromFiles({
    actionable: 1,
    executionIntent: true,
    prepareOnly: false,
    existing: {
      status: 'active',
      dispatcherPid: '',
      lastHeartbeatAt: '2026-05-08T00:00:00.000Z',
    },
  });

  assert.equal(decision.RETURN_ALLOWED, 'false');
  assert.equal(decision.RETURN_REASON, 'stale-run-lease:stale-heartbeat-ttl');
  assert.equal(decision.STALE_REASON, 'stale-heartbeat-ttl');
  assert.equal(decision.ACTIONABLE_PHASES_REMAINING, '1');
});

test('terminal blocked finish remains blocked even when actionable phases remain', () => {
  const outcome = normalizeFinishOutcome({
    actionable: 2,
    returnBoundary: 'terminal-blocked',
    stopReasonCode: 'scorecard-verdict-blocked',
    stopReasonDetail: 'scorecard verdict blocked',
  });

  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.returnBoundary, 'terminal-blocked');
  assert.equal(outcome.stopReasonCode, 'scorecard-verdict-blocked');
});
