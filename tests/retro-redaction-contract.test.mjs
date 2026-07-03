import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCollectRecords } from '../tools/retro/retro-store.mjs';

const root = process.cwd();

test('retro import rejects secret-like content before inbox copy', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'retro-secret-source-'));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-secret-state-'));
  const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/retro/2026-07-03/TASK-001.collect.json'), 'utf8'));
  fixture.candidateLessons[0].summary = 'token=super-secret-value';
  await writeFile(path.join(source, 'TASK-SECRET.collect.json'), `${JSON.stringify(fixture, null, 2)}\n`);

  const result = await importCollectRecords({
    projectId: 'fixture',
    date: '2026-07-03',
    source,
    stateRoot,
  });
  assert.equal(result.imported, 0);
  assert.equal(result.rejected, 1);
  assert.equal(result.promotionAuthority, false);
});

test('retro import rejects api key style secret-like content', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'retro-api-key-source-'));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-api-key-state-'));
  const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/retro/2026-07-03/TASK-001.collect.json'), 'utf8'));
  fixture.candidateLessons[0].summary = 'api_key=super-secret-value';
  await writeFile(path.join(source, 'TASK-API-KEY.collect.json'), `${JSON.stringify(fixture, null, 2)}\n`);

  const result = await importCollectRecords({
    projectId: 'fixture',
    date: '2026-07-03',
    source,
    stateRoot,
  });
  assert.equal(result.imported, 0);
  assert.equal(result.rejected, 1);
  assert.equal(result.promotionAuthority, false);
});

test('retro import rejects raw body fields and transcript-like values', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'retro-raw-source-'));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'retro-raw-state-'));
  const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/retro/2026-07-03/TASK-001.collect.json'), 'utf8'));
  fixture.evidence.rawTranscript = 'User: paste the prompt\nAssistant: raw response body';
  await writeFile(path.join(source, 'TASK-RAW.collect.json'), `${JSON.stringify(fixture, null, 2)}\n`);

  const result = await importCollectRecords({
    projectId: 'fixture',
    date: '2026-07-03',
    source,
    stateRoot,
  });
  assert.equal(result.imported, 0);
  assert.equal(result.rejected, 1);
  assert.equal(result.promotionAuthority, false);
});
