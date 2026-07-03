import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { scoreHarnessSearchFixtures } from '../tools/evals/harness-search-fixture-scorer.mjs';

test('harness search fixtures cover required failure classes with complete identity', async () => {
  const result = await scoreHarnessSearchFixtures();

  assert.equal(result.status, 'passed');
  assert.equal(result.fixtureSetId, 'harness-search-fixtures-v1');
  assert.equal(result.scorerVersion, 'harness-search-fixture-scorer-v1');
  assert.equal(result.promotionAuthority, false);
  assert.equal(result.fixtureCount, 5);
  assert.deepEqual(result.results.map((entry) => entry.actualFailureClass).sort(), [
    'fixture_identity_incomplete',
    'mutation_safety_violation',
    'redaction_snapshot_unsafe_field',
    'score_drop',
    'stale_artifact',
  ]);
  for (const entry of result.results) {
    assert.equal(entry.identity.complete, true, `${entry.fixtureId} should have complete fixture identity`);
  }
});

test('harness search scorer fails before comparison when identity fields are missing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-search-fixture-'));
  const manifestPath = path.join(dir, 'fixture-manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-search-fixtures.v1',
    fixtureSetId: 'harness-search-fixtures-v1',
    scorerVersion: 'harness-search-fixture-scorer-v1',
    fixtures: [
      {
        fixtureId: 'missing-input-hash',
        fixtureClass: 'score_drop',
        expectedFailureClass: 'score_drop',
        signals: {
          identityComplete: true,
          score: 0.1,
          baselineScore: 0.9,
        },
      },
    ],
  }, null, 2));

  const result = await scoreHarnessSearchFixtures({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedFixtures[0].identity.complete, false);
  assert.deepEqual(result.failedFixtures[0].identity.missingFields, ['inputHash']);
});

test('harness search scorer rejects unsafe fixture payloads', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-search-fixture-secret-'));
  const manifestPath = path.join(dir, 'fixture-manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: 'moonshot-harness-search-fixtures.v1',
    fixtureSetId: 'harness-search-fixtures-v1',
    scorerVersion: 'harness-search-fixture-scorer-v1',
    fixtures: [
      {
        fixtureId: 'unsafe',
        fixtureClass: 'redaction_snapshot_unsafe_field',
        inputHash: 'sha256:unsafe',
        expectedFailureClass: 'redaction_snapshot_unsafe_field',
        signals: {
          identityComplete: true,
          redactionUnsafe: true,
          sample: 'token=sk-1234567890abcdef',
        },
      },
    ],
  }, null, 2));

  const result = await scoreHarnessSearchFixtures({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedFixtures[0].unsafePayload, true);
});
