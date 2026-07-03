import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runDailyRetro } from '../tools/retro/daily-retro.mjs';
import { buildRetroPatterns } from '../tools/retro/retro-patterns.mjs';
import { importCollectRecords } from '../tools/retro/retro-store.mjs';

const root = process.cwd();

test('daily retro aggregates repeated failure classes and writes advisory reports', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-daily-'));
  await importCollectRecords({
    projectId: 'fixture',
    date: '2026-07-03',
    source: path.join(root, 'tests/fixtures/retro/2026-07-03'),
    stateRoot,
  });

  const { report, outRoot } = await runDailyRetro({
    projectId: 'fixture',
    date: '2026-07-03',
    stateRoot,
  });

  assert.equal(report.schemaVersion, 'retro.daily.v1');
  assert.equal(report.sourceCount, 3);
  assert.equal(report.summary.partial, 2);
  assert.equal(report.repeatedFailureClasses.length, 1);
  assert.equal(report.repeatedFailureClasses[0].failureClass, 'acceptance_mapping_missing');
  assert.equal(report.improvementCandidates[0].promotionAuthority, false);
  assert.equal(report.promotionAuthority, false);
  assert.match(await readFile(path.join(outRoot, 'daily-retro.md'), 'utf8'), /promotionAuthority=false/);
});

test('daily pattern aggregation counts each failure class once per task', () => {
  const { repeatedFailureClasses, improvementCandidates } = buildRetroPatterns({
    projectId: 'fixture',
    date: '2026-07-03',
    records: [
      {
        taskId: 'TASK-DUPE',
        failureClasses: ['acceptance_mapping_missing', 'acceptance_mapping_missing'],
        reviewFindings: { critical: 0 },
      },
    ],
  });

  assert.deepEqual(repeatedFailureClasses, []);
  assert.deepEqual(improvementCandidates, []);
});
