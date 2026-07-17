import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

test('runtime doctor diagnostics contract contains new fields', () => {
  const result = spawnSync(process.execPath, [
    'scripts/doctor.mjs',
    'check',
    '--json'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0 || result.status, result.stderr);
  
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.checks, 'Doctor output should have checks');
  
  // Verify new fields exist
  const checks = payload.checks;
  assert.ok('systemNodeVersion' in checks, 'systemNodeVersion missing');
  assert.ok('runtimeNodeVersion' in checks, 'runtimeNodeVersion missing');
  assert.ok('runtimeExecPath' in checks, 'runtimeExecPath missing');
  assert.ok('runtimeSource' in checks, 'runtimeSource missing');
  assert.ok('platform' in checks, 'platform missing');
  assert.ok('arch' in checks, 'arch missing');
  assert.ok('checksumStatus' in checks, 'checksumStatus missing');
});
