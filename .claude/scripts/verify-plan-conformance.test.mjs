import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve('.claude/scripts/verify-plan-conformance.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

test('help prints artifact-level usage and exits zero', () => {
  const result = runCli(['--help']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--phase-doc <path>/);
  assert.match(result.stdout, /--sprint-contract <path>/);
  assert.match(result.stdout, /--qa-report <path>/);
  assert.match(result.stdout, /--scorecard <path>/);
  assert.match(result.stdout, /--handoff <path>/);
});

test('unknown option prints valid usage', () => {
  const result = runCli(['--does-not-exist']);

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Unknown option: --does-not-exist/);
  assert.match(result.stderr, /Usage:/);
  assert.match(result.stderr, /verify-plan-conformance\.mjs --phase-doc <path>/);
});

test('plan-level options print recommended alternatives', () => {
  const result = runCli(['--status-file', '.claude/docs/phase-status.yaml']);

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Unsupported plan-level option/);
  assert.match(result.stderr, /verify-phase-closeout\.mjs --plan-dir <path> --master-plan <path> --status-file <path> --json/);
  assert.match(result.stderr, /verify-plan-conformance\.mjs --phase-doc <path>/);
});
