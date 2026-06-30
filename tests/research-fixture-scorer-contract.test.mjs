import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { scoreResearchFixture } from '../tools/evals/research-fixture-scorer.mjs';

const root = process.cwd();
const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeResearchFixture({
  evidence = [],
  claims = [],
  run = { queries: ['q1'], failures: [] },
  includeEvidence = true,
  includeClaimLedger = true,
  reportText = '# report\n\nAccess boundaries are tracked.\n',
  thresholds = {},
} = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-research-fixture-'));
  tempRoots.push(dir);
  await mkdir(path.join(dir, 'pack'), { recursive: true });
  const runPath = path.join(dir, 'pack', 'run.json');
  const evidencePath = path.join(dir, 'pack', 'evidence.json');
  const claimLedgerPath = path.join(dir, 'pack', 'claim-ledger.json');
  const reportPath = path.join(dir, 'pack', 'report.md');
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
  if (includeEvidence) {
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (includeClaimLedger) {
    await writeFile(claimLedgerPath, `${JSON.stringify(claims, null, 2)}\n`);
  }
  await writeFile(reportPath, reportText);
  const manifestPath = path.join(dir, 'fixture-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: 'moonshot-research-fixture-manifest.v1',
    fixtureSetId: 'test-research-fixtures',
    fixtureId: 'test-research',
    inputHash: 'sha256:test-research',
    queryVariants: run.queries.length,
    primarySourceRules: { primarySourceTypeIncludes: 'primary' },
    claimLedgerRequired: true,
    minimumEvidenceCount: 1,
    minimumPrimarySourceRatio: 0,
    minimumClaimCoverageRatio: 0,
    maximumAdjacentRepoContaminationRatio: 0.5,
    maximumLaneFailureCount: 0,
    requiredBoundaryAccessItemCount: 1,
    requiredArtifactCompleteness: 1,
    requiredArtifactPaths: {
      run: runPath,
      evidence: evidencePath,
      claimLedger: claimLedgerPath,
      report: reportPath,
    },
    adjacentRepoRules: ['adjacent/noise'],
    ...thresholds,
  }, null, 2)}\n`);
  return manifestPath;
}

test('research fixture scorer passes pinned 2026-06-24 seed fixture without network access', async () => {
  const result = await scoreResearchFixture({
    manifestPath: 'tests/fixtures/harness-research-fixtures/fixture-manifest.json',
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.evidenceCount, 158);
  assert.equal(result.queryVariantCount, 11);
  assert.equal(result.laneFailureCount, 0);
  assert.equal(result.failedMetrics.length, 0);
  assert.equal(result.fixtureSetId, 'moonshot-research-fixtures-v1');
  assert.equal(result.scorerVersion, 'research-fixture-scorer-v1');
});

test('research fixture primary-source threshold is calibrated to the raw seed pack', async () => {
  const manifest = JSON.parse(await readFile(
    path.join(root, 'tests/fixtures/harness-research-fixtures/fixture-manifest.json'),
    'utf8',
  ));
  const result = await scoreResearchFixture({
    manifestPath: 'tests/fixtures/harness-research-fixtures/fixture-manifest.json',
  });

  assert.equal(manifest.minimumPrimarySourceRatio, 0.18);
  assert.ok(result.primarySourceRatio >= manifest.minimumPrimarySourceRatio);
  assert.ok(result.primarySourceRatio < 0.70);
  assert.match(manifest.calibrationNotes.join('\n'), /0\.70/);
  assert.match(manifest.calibrationNotes.join('\n'), /0\.18/);
});

test('research fixture scorer fails missing evidence artifact', async () => {
  const manifestPath = await makeResearchFixture({
    evidence: [{ url: 'https://github.com/source/real', source_type: 'primary repository', access_status: 'ok' }],
    claims: [{ evidence_urls: ['https://github.com/source/real'] }],
    includeEvidence: false,
  });
  const result = await scoreResearchFixture({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedMetrics.some((entry) => entry.id === 'requiredArtifactCompleteness'), true);
});

test('research fixture scorer fails lane failures above threshold', async () => {
  const manifestPath = await makeResearchFixture({
    evidence: [{ url: 'https://github.com/source/real', source_type: 'primary repository', access_status: 'ok' }],
    claims: [{ evidence_urls: ['https://github.com/source/real'] }],
    run: { queries: ['q1'], failures: [{ lane: 'github', reason: 'blocked' }] },
  });
  const result = await scoreResearchFixture({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedMetrics.some((entry) => entry.failureClass === 'research_lane_failure_count_above_threshold'), true);
});

test('research fixture scorer fails primary source ratio below threshold', async () => {
  const manifestPath = await makeResearchFixture({
    evidence: [
      { url: 'https://example.com/article', source_type: 'secondary article', access_status: 'ok' },
      { url: 'https://example.com/blog', source_type: 'secondary blog', access_status: 'ok' },
    ],
    claims: [{ evidence_urls: ['https://example.com/article'] }],
    thresholds: { minimumPrimarySourceRatio: 0.5 },
  });
  const result = await scoreResearchFixture({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedMetrics.some((entry) => entry.failureClass === 'research_primary_source_ratio_below_threshold'), true);
});

test('research fixture scorer fails when boundary/access evidence is absent', async () => {
  const manifestPath = await makeResearchFixture({
    evidence: [{ url: 'https://github.com/source/real', source_type: 'primary repository', access_status: 'ok' }],
    claims: [{ evidence_urls: ['https://github.com/source/real'] }],
    reportText: '# report\n\nNo blocked surfaces recorded.\n',
    thresholds: { requiredBoundaryAccessItemCount: 1 },
  });
  const result = await scoreResearchFixture({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedMetrics.some((entry) => entry.failureClass === 'research_boundary_access_missing'), true);
});

test('research fixture scorer fails adjacent repository contamination above threshold', async () => {
  const manifestPath = await makeResearchFixture({
    evidence: [
      { url: 'https://github.com/adjacent/noise', source_type: 'primary repository', access_status: 'ok' },
      { url: 'https://github.com/source/real', source_type: 'primary repository', access_status: 'ok' },
    ],
    claims: [{ evidence_urls: ['https://github.com/source/real'] }],
    thresholds: { maximumAdjacentRepoContaminationRatio: 0.1 },
  });
  const result = await scoreResearchFixture({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedMetrics.some((entry) => entry.id === 'adjacentRepoContaminationRatio'), true);
  assert.equal(result.failedMetrics.some((entry) => entry.failureClass === 'research_adjacent_repo_contamination'), true);
});

test('research fixture scorer fails missing required artifacts', async () => {
  const manifestPath = await makeResearchFixture({
    evidence: [{ url: 'https://github.com/source/real', source_type: 'primary repository', access_status: 'ok' }],
    claims: [{ evidence_urls: ['https://github.com/source/real'] }],
    includeClaimLedger: false,
  });
  const result = await scoreResearchFixture({ manifestPath });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedMetrics.some((entry) => entry.id === 'requiredArtifactCompleteness'), true);
});

test('harness lab can score research fixture metrics with complete fixture identity', async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-research-lab-'));
  const configRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-research-lab-config-'));
  tempRoots.push(outRoot, configRoot);
  const manifestPath = 'tests/fixtures/harness-research-fixtures/fixture-manifest.json';
  const configPath = path.join(configRoot, 'config.json');
  const metricDefinitions = [
    { id: 'evidenceCount', path: 'evidenceCount', direction: 'higher', min: 50, required: true },
    { id: 'queryVariantCount', path: 'queryVariantCount', direction: 'higher', min: 11, required: true },
    { id: 'laneFailureCount', path: 'laneFailureCount', direction: 'lower', max: 0, required: true },
    { id: 'primarySourceRatio', path: 'primarySourceRatio', direction: 'higher', min: 0.18, required: true },
    { id: 'claimLedgerCoverage', path: 'claimLedgerCoverage', direction: 'higher', min: 0.9, required: true },
    { id: 'boundaryAccessItemCount', path: 'boundaryAccessItemCount', direction: 'higher', min: 1, required: true },
    { id: 'adjacentRepoContaminationRatio', path: 'adjacentRepoContaminationRatio', direction: 'lower', max: 0.1, required: true },
    { id: 'requiredArtifactCompleteness', path: 'requiredArtifactCompleteness', direction: 'higher', min: 1, required: true },
  ].map((entry) => ({
    ...entry,
    fixtureSetId: 'moonshot-research-fixtures-v1',
    fixtureId: 'harness-product-surfaces-2026-06-24',
    inputHash: 'sha256:moonshot-research-2026-06-24-harness-product-surfaces-v1',
    scorerVersion: 'research-fixture-scorer-v1',
  }));
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    fixtureSetId: 'moonshot-research-fixtures-v1',
    scorerVersion: 'research-fixture-scorer-v1',
    suites: [{
      id: 'moonshot-research-fixture',
      description: 'Pinned moonshot-research evidence pack fixture.',
      command: ['<node>', 'tools/evals/research-fixture-scorer.mjs', 'score', '--manifest', manifestPath, '--json'],
      timeoutMs: 120000,
      fixtureId: 'harness-product-surfaces-2026-06-24',
      inputHash: 'sha256:moonshot-research-2026-06-24-harness-product-surfaces-v1',
      metrics: metricDefinitions,
    }],
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    'tools/harness-lab/harness-lab.mjs',
    'run',
    '--candidate-root',
    root,
    '--config',
    configPath,
    '--out',
    outRoot,
    '--run-id',
    'research-fixture-lab',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const metrics = payload.candidate.results[0].metrics;
  assert.equal(payload.status, 'passed');
  assert.equal(metrics.length, metricDefinitions.length);
  assert.equal(metrics.every((entry) => entry.fixtureSetId === 'moonshot-research-fixtures-v1'), true);
  assert.equal(metrics.every((entry) => entry.fixtureId === 'harness-product-surfaces-2026-06-24'), true);
  assert.equal(metrics.every((entry) => entry.inputHash === 'sha256:moonshot-research-2026-06-24-harness-product-surfaces-v1'), true);
  assert.equal(metrics.every((entry) => entry.scorerVersion === 'research-fixture-scorer-v1'), true);
  assert.equal(metrics.every((entry) => entry.status === 'passed'), true);
  assert.match(await readFile(path.join(outRoot, 'research-fixture-lab', 'candidate', 'moonshot-research-fixture', 'stdout.txt'), 'utf8'), /moonshot-research-fixture-score/);
});
