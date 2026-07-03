import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildExperienceIndex,
  buildFrontierReport,
  listRunRecords,
  readRunRecord,
} from '../tools/harness-lab/harness-history.mjs';
import {
  bindRunKernelToLabResult,
  writeRunKernelStart,
} from '../tools/harness-lab/harness-loop.mjs';

const root = process.cwd();

async function makeHistoryFixture({
  runId = 'history-pass',
  status = 'passed',
  failureClass = 'none',
  score = 1,
  scorerVersion = 'history-scorer-v1',
  staleArtifacts = [],
} = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-history-'));
  const runsRoot = path.join(dir, 'runs');
  const experienceRoot = path.join(dir, 'experience');
  await mkdir(runsRoot, { recursive: true });
  const kernel = await writeRunKernelStart({
    runId,
    sourceRoot: root,
    outRoot: runsRoot,
    lifecyclePath: 'candidate_only',
    backend: 'host',
  });
  await writeFile(path.join(kernel.runRoot, 'lab-result.json'), `${JSON.stringify({
    schemaVersion: 'moonshot-harness-lab-result.v1',
    status,
    score,
    failureClass,
    run: {
      specHash: kernel.specHash,
      fixtureSetId: 'history-fixtures-v1',
      fixtureId: runId,
      inputHash: `sha256:${runId}`,
      scorerVersion,
    },
    artifactConsistency: {
      staleArtifacts,
    },
    candidate: {
      results: [
        {
          status,
          failureClass,
          metrics: [
            {
              id: 'score',
              value: score,
              fixtureSetId: 'history-fixtures-v1',
              fixtureId: runId,
              inputHash: `sha256:${runId}`,
              scorerVersion,
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`);
  await bindRunKernelToLabResult(path.join(kernel.runRoot, 'lab-result.json'), kernel);
  return { dir, runsRoot, experienceRoot, kernel };
}

test('history CLI lists and shows run metadata without promotion authority', async () => {
  const { runsRoot } = await makeHistoryFixture({ runId: 'history-list' });

  const records = await listRunRecords({ runsRoot });
  assert.equal(records.length, 1);
  assert.equal(records[0].runId, 'history-list');
  assert.equal(records[0].promotionAuthority, false);
  assert.equal(records[0].fixtureIdentityComplete, true);

  const shown = await readRunRecord({ runId: 'history-list', runsRoot });
  assert.equal(shown.runId, 'history-list');
  assert.equal(shown.artifacts.runSpec.sha256.startsWith('sha256:'), true);

  const result = spawnSync(process.execPath, [
    'tools/harness-lab/harness-history.mjs',
    'show',
    '--run-id',
    'history-list',
    '--runs-root',
    runsRoot,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).promotionAuthority, false);
});

test('history build-index is idempotent and removes stale derived entries only', async () => {
  const { runsRoot, experienceRoot } = await makeHistoryFixture({ runId: 'history-index' });

  const first = await buildExperienceIndex({ runsRoot, experienceRoot });
  assert.equal(first.schemaVersion, 'moonshot-harness-experience-index.v1');
  assert.equal(first.rebuildMode, 'overwrite-derived-index-only');
  assert.deepEqual(first.staleEntriesRemoved, []);
  assert.equal(existsSync(path.join(experienceRoot, 'index.json')), true);

  const stale = {
    ...first,
    runs: [...first.runs, { runId: 'stale-derived-only' }],
  };
  await writeFile(path.join(experienceRoot, 'index.json'), `${JSON.stringify(stale, null, 2)}\n`);
  const second = await buildExperienceIndex({ runsRoot, experienceRoot });
  assert.deepEqual(second.staleEntriesRemoved, ['stale-derived-only']);
  assert.equal(existsSync(path.join(runsRoot, 'history-index', 'run-spec.json')), true);
});

test('history failures and frontier are advisory and exclude hard blockers', async () => {
  const pass = await makeHistoryFixture({ runId: 'frontier-pass', score: 0.9 });
  await makeHistoryFixture({
    runId: 'frontier-score-drop',
    status: 'failed',
    failureClass: 'score_drop',
    score: 0.2,
  }).then(async (fixture) => {
    await mkdir(pass.runsRoot, { recursive: true });
    const from = path.join(fixture.runsRoot, 'frontier-score-drop');
    const to = path.join(pass.runsRoot, 'frontier-score-drop');
    await import('node:fs/promises').then(({ cp }) => cp(from, to, { recursive: true }));
  });

  const index = await buildExperienceIndex({ runsRoot: pass.runsRoot, experienceRoot: pass.experienceRoot });
  const failures = index.runs.filter((record) => record.failureClass === 'score_drop');
  assert.equal(failures.length, 1);

  const report = await buildFrontierReport({ runsRoot: pass.runsRoot, experienceRoot: pass.experienceRoot });
  assert.equal(report.promotionAuthority, false);
  assert.deepEqual(report.candidates.map((entry) => entry.runId), ['frontier-pass']);
  assert.equal(report.excludedCount, 1);

  const persisted = JSON.parse(await readFile(path.join(pass.experienceRoot, 'frontier.json'), 'utf8'));
  assert.equal(persisted.promotionAuthority, false);
});

test('frontier excludes stale artifacts and incompatible scorer versions', async () => {
  const pass = await makeHistoryFixture({ runId: 'frontier-scorer-a', score: 0.9, scorerVersion: 'history-scorer-a' });
  for (const fixtureOptions of [
    {
      runId: 'frontier-stale-artifact',
      status: 'failed',
      failureClass: 'stale_artifact',
      score: 0.8,
      scorerVersion: 'history-scorer-a',
      staleArtifacts: [{ path: 'lab-result.json', reason: 'hash_mismatch' }],
    },
    {
      runId: 'frontier-scorer-b',
      score: 0.95,
      scorerVersion: 'history-scorer-b',
    },
  ]) {
    await makeHistoryFixture(fixtureOptions).then(async (fixture) => {
      await mkdir(pass.runsRoot, { recursive: true });
      const from = path.join(fixture.runsRoot, fixtureOptions.runId);
      const to = path.join(pass.runsRoot, fixtureOptions.runId);
      await import('node:fs/promises').then(({ cp }) => cp(from, to, { recursive: true }));
    });
  }

  const report = await buildFrontierReport({ runsRoot: pass.runsRoot, experienceRoot: pass.experienceRoot });
  assert.equal(report.referenceScorerVersion, 'history-scorer-a');
  assert.deepEqual(report.excludedScorerVersions, ['history-scorer-b']);
  assert.deepEqual(report.candidates.map((entry) => entry.runId), ['frontier-scorer-a']);
  assert.equal(report.excludedCount, 2);
  assert.equal(report.promotionAuthority, false);
});
