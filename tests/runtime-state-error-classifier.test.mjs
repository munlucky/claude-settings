import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  degradedRuntimeStatus,
  recoveryHintForRuntimeReason,
  runtimeStoreErrorCode,
} from '../scripts/lib/runtime-state-store.mjs';

const errorWith = (message, code = '') => {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
};

test('runtimeStoreErrorCode classifies typed runtime setup and open failures', () => {
  assert.equal(runtimeStoreErrorCode(errorWith('Native sqlite support disabled', 'MOONSHOT_RUNTIME_NATIVE_MISSING')), 'missing_native_module');
  assert.equal(runtimeStoreErrorCode(errorWith('permission denied', 'EACCES')), 'permission_denied');
  assert.equal(runtimeStoreErrorCode(errorWith('managed sandbox blocked filesystem access')), 'sandbox_denied');
  assert.equal(runtimeStoreErrorCode(errorWith('database is locked', 'SQLITE_BUSY')), 'db_lock_timeout');
  assert.equal(runtimeStoreErrorCode(errorWith('no such table: runs')), 'schema_mismatch');
  assert.equal(runtimeStoreErrorCode(errorWith('mkdir failed for parent directory')), 'unresolved_db_path');
  assert.equal(runtimeStoreErrorCode(errorWith('unknown sqlite open error')), 'schema_or_open_failure');
});

test('degradedRuntimeStatus exposes recoveryHint and reason-specific next action', () => {
  const status = degradedRuntimeStatus('permission_denied', 'C:/tmp/runtime-state.sqlite', 'access is denied');

  assert.equal(status.runtimeCapabilityStatus.status, 'degraded');
  assert.equal(status.runtimeCapabilityStatus.reason, 'permission_denied');
  assert.match(status.runtimeCapabilityStatus.recoveryHint, /permission/i);
  assert.equal(status.resumeBrief.nextAction, status.runtimeCapabilityStatus.recoveryHint);
});

test('unknown degraded reasons normalize to schema_or_open_failure', () => {
  const status = degradedRuntimeStatus('future_unknown_reason');

  assert.equal(status.runtimeCapabilityStatus.reason, 'schema_or_open_failure');
  assert.equal(status.resumeBrief.nextAction, recoveryHintForRuntimeReason('schema_or_open_failure'));
});
