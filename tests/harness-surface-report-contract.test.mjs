import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const sourceRoot = path.resolve('.');
const script = path.join(sourceRoot, 'scripts', 'harness-surface-report.mjs');
const tempRoots = [];
after(async () => Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true }))));

const run = (...args) => spawnSync(process.execPath, [script, ...args], {
  cwd: sourceRoot,
  encoding: 'utf8',
});

test('surface report inventories every tracked test and current budget passes', () => {
  const reported = run('report', '--source-root', sourceRoot, '--json');
  assert.equal(reported.status, 0, reported.stderr);
  const report = JSON.parse(reported.stdout);
  assert.equal(report.status, 'pass');
  assert.ok(report.totals.files > 0);
  assert.ok(report.totals.nonblankLines > 0);
  assert.equal(report.testInventory.unregisteredCount, 0, report.testInventory.unregistered.join('\n'));

  const checked = run('check', '--source-root', sourceRoot, '--json');
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);
  assert.equal(JSON.parse(checked.stdout).status, 'pass');
});

test('surface check blocks a deterministic over-budget source', async () => {
  const reported = run('report', '--source-root', sourceRoot, '--json');
  assert.equal(reported.status, 0, reported.stderr);
  const report = JSON.parse(reported.stdout);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-surface-budget-'));
  tempRoots.push(tempRoot);
  const config = path.join(tempRoot, 'budget.json');
  await writeFile(config, `${JSON.stringify({
    schemaVersion: 1,
    baseline: { ...report.totals, files: report.totals.files - 1 },
    allowedDelta: { files: 0, nonblankLines: 0, utf8Bytes: 0, estimatedPromptTokens: 0 },
    allowedUnregisteredTests: 0,
  }, null, 2)}\n`);

  const checked = run('check', '--source-root', sourceRoot, '--config', config, '--json');
  assert.equal(checked.status, 1);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.status, 'fail');
  assert.ok(result.blockers.some((blocker) => blocker.metric === 'files'));
});
