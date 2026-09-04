import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve('.');
const script = path.join(root, 'scripts', 'capability-assets-check.mjs');

test('capability asset base validates manifests, provenance, catalog, and freeze boundary', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'pass');
  assert.equal(report.readOnly, true);
  assert.equal(report.assetCount, 15);
  assert.equal(report.checked.immutableCommits, 33);
  assert.equal(report.checked.proofPaths, 45);
  assert.equal(report.statusCounts.CORE, 9);
  assert.equal(report.statusCounts.HOST, 2);
  assert.equal(report.statusCounts.OPTIONAL, 2);
  assert.equal(report.statusCounts.REFERENCE, 1);
  assert.equal(report.statusCounts.DEPRECATED, 1);
});
