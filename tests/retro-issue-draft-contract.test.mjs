import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runDailyRetro } from '../tools/retro/daily-retro.mjs';
import { writeIssueDrafts } from '../tools/retro/issue-draft-writer.mjs';
import { importCollectRecords } from '../tools/retro/retro-store.mjs';

const root = process.cwd();

test('retro issue-draft writes local drafts only with fingerprint metadata', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-issue-'));
  await importCollectRecords({
    projectId: 'fixture',
    date: '2026-07-03',
    source: path.join(root, 'tests/fixtures/retro/2026-07-03'),
    stateRoot,
  });
  await runDailyRetro({ projectId: 'fixture', date: '2026-07-03', stateRoot });

  const result = await writeIssueDrafts({ projectId: 'fixture', date: '2026-07-03', stateRoot });
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].remoteWrite, false);
  assert.equal(result.drafts[0].promotionAuthority, false);
  const body = await readFile(result.drafts[0].bodyPath, 'utf8');
  assert.match(body, /moonshot-retro:fingerprint=/);
  assert.match(body, /No GitHub write was performed/);
});

test('retro issue-draft rejects unsafe candidate ids from runtime daily retro data', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-issue-unsafe-'));
  const dailyRoot = path.join(stateRoot, 'daily', '2026-07-03');
  await mkdir(dailyRoot, { recursive: true });
  await writeFile(path.join(dailyRoot, 'daily-retro.json'), `${JSON.stringify({
    schemaVersion: 'retro.daily.v1',
    projectId: 'fixture',
    date: '2026-07-03',
    sourceCount: 1,
    summary: { full: 0, partial: 1, no: 0, averageScore: 0.5 },
    repeatedFailureClasses: [],
    rootPatterns: [],
    improvementCandidates: [{
      id: '../escaped-candidate',
      title: 'Escape issue root',
      priority: 'P1',
      targetArea: 'workflow',
      expectedImpact: 'Should be rejected.',
      risk: 'Path traversal.',
      evidencePatternIds: [],
      mapsToSchema: 'schemas/improvement-candidate-v1.schema.json',
      promotionAuthority: false,
    }],
    promotionAuthority: false,
  }, null, 2)}\n`);

  await assert.rejects(() => writeIssueDrafts({
    projectId: 'fixture',
    date: '2026-07-03',
    stateRoot,
  }), /candidate\.id must match/);
});

test('retro issue-draft rejects runtime candidates with promotion authority', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-issue-authority-'));
  const dailyRoot = path.join(stateRoot, 'daily', '2026-07-03');
  await mkdir(dailyRoot, { recursive: true });
  await writeFile(path.join(dailyRoot, 'daily-retro.json'), `${JSON.stringify({
    schemaVersion: 'retro.daily.v1',
    projectId: 'fixture',
    date: '2026-07-03',
    sourceCount: 1,
    summary: { completed: 1, full: 0, partial: 1, no: 0, averageScore: 0.5, totalReplans: 0 },
    repeatedFailureClasses: [],
    rootPatterns: [],
    improvementCandidates: [{
      id: 'HARN-20260703-999-safe',
      title: 'Unsafe issue candidate',
      priority: 'P1',
      targetArea: 'workflow',
      expectedImpact: 'Should be rejected.',
      risk: 'Escalates authority.',
      evidencePatternIds: ['PAT-20260703-999'],
      mapsToSchema: 'schemas/improvement-candidate-v1.schema.json',
      promotionAuthority: true,
    }],
    promotionAuthority: false,
  }, null, 2)}\n`);

  await assert.rejects(() => writeIssueDrafts({
    projectId: 'fixture',
    date: '2026-07-03',
    stateRoot,
  }), /candidate\.promotionAuthority must be false/);
});
