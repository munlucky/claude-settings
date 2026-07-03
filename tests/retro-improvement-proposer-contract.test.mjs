import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runDailyRetro } from '../tools/retro/daily-retro.mjs';
import { proposeImprovements } from '../tools/retro/improvement-proposer.mjs';
import { importCollectRecords } from '../tools/retro/retro-store.mjs';

const root = process.cwd();

test('retro proposer renders deterministic advisory proposals from daily candidates', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-propose-'));
  await importCollectRecords({
    projectId: 'fixture',
    date: '2026-07-03',
    source: path.join(root, 'tests/fixtures/retro/2026-07-03'),
    stateRoot,
  });
  await runDailyRetro({ projectId: 'fixture', date: '2026-07-03', stateRoot });

  const result = await proposeImprovements({ projectId: 'fixture', date: '2026-07-03', stateRoot });
  assert.equal(result.candidates.length, 1);
  assert.match(result.candidates[0].id, /^HARN-20260703-001-acceptance-mapping-missing/);
  assert.equal(result.candidates[0].mapsToSchema, 'schemas/improvement-candidate-v1.schema.json');
  assert.equal(result.candidates[0].promotionAuthority, false);
  assert.equal(result.proposalPaths.length, 1);
});

test('retro proposer rejects unsafe candidate ids from runtime daily retro data', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-propose-unsafe-'));
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
      title: 'Escape proposal root',
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

  await assert.rejects(() => proposeImprovements({
    projectId: 'fixture',
    date: '2026-07-03',
    stateRoot,
  }), /candidate\.id must match/);
});

test('retro proposer rejects runtime candidates with promotion authority', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-propose-authority-'));
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
      title: 'Unsafe authority candidate',
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

  await assert.rejects(() => proposeImprovements({
    projectId: 'fixture',
    date: '2026-07-03',
    stateRoot,
  }), /candidate\.promotionAuthority must be false/);
});
