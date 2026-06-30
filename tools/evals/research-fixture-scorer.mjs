#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'tests/fixtures/harness-research-fixtures/fixture-manifest.json';
const SCORER_VERSION = 'research-fixture-scorer-v1';

const usage = () => 'Usage: node tools/evals/research-fixture-scorer.mjs score [--manifest <path>] [--json]';

function parseArgs(argv) {
  const [command = 'score', ...rest] = argv;
  const options = {
    command,
    manifest: DEFAULT_MANIFEST,
    json: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = rest[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') return Object.values(payload);
  return [];
}

function resolveArtifactPath(manifestPath, artifactPath) {
  if (!artifactPath) return '';
  if (path.isAbsolute(artifactPath)) return artifactPath;
  const cwdPath = path.resolve(process.cwd(), artifactPath);
  if (existsSync(cwdPath)) return cwdPath;
  return path.resolve(path.dirname(manifestPath), artifactPath);
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function metric({ id, value, threshold, direction, passed, failureClass = 'none', details = {} }) {
  const numericValue = Number(value);
  return {
    id,
    value: numericValue,
    numericValue,
    threshold,
    direction,
    normalizedScore: passed ? 1 : 0,
    status: passed ? 'passed' : 'failed',
    verdict: passed ? 'pass' : 'fail',
    failureClass: passed ? 'none' : failureClass,
    ...details,
  };
}

export async function scoreResearchFixture({
  manifestPath = DEFAULT_MANIFEST,
} = {}) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = await readJson(resolvedManifestPath);
  const artifactPaths = manifest.requiredArtifactPaths || {};
  const resolvedArtifacts = Object.fromEntries(Object.entries(artifactPaths).map(([key, value]) => [
    key,
    resolveArtifactPath(resolvedManifestPath, value),
  ]));
  const requiredKeys = Object.keys(artifactPaths);
  const presentKeys = requiredKeys.filter((key) => existsSync(resolvedArtifacts[key]));
  const requiredArtifactCompleteness = ratio(presentKeys.length, requiredKeys.length || 1);

  const run = existsSync(resolvedArtifacts.run) ? await readJson(resolvedArtifacts.run) : {};
  const evidence = existsSync(resolvedArtifacts.evidence) ? asArray(await readJson(resolvedArtifacts.evidence)) : [];
  const claims = existsSync(resolvedArtifacts.claimLedger) ? asArray(await readJson(resolvedArtifacts.claimLedger)) : [];
  const reportText = existsSync(resolvedArtifacts.report) ? await readFile(resolvedArtifacts.report, 'utf8') : '';

  const primaryNeedle = String(manifest.primarySourceRules?.primarySourceTypeIncludes || 'primary').toLowerCase();
  const primarySourceCount = evidence.filter((entry) => String(entry.source_type || '').toLowerCase().includes(primaryNeedle)).length;
  const evidenceCount = evidence.length;
  const primarySourceRatio = ratio(primarySourceCount, evidenceCount);
  const coveredClaimCount = claims.filter((claim) => Array.isArray(claim.evidence_urls) && claim.evidence_urls.length > 0).length;
  const claimLedgerCoverage = ratio(coveredClaimCount, claims.length);
  const laneFailureCount = Array.isArray(run.failures) ? run.failures.length : 0;
  const queryVariantCount = Array.isArray(run.queries) ? run.queries.length : 0;
  const boundaryAccessItemCount = evidence.filter((entry) => entry.access_status && entry.access_status !== 'ok').length
    + (reportText.match(/access boundaries?/gi) || []).length;
  const adjacentRules = Array.isArray(manifest.adjacentRepoRules) ? manifest.adjacentRepoRules : [];
  const adjacentMatches = evidence
    .filter((entry) => adjacentRules.some((rule) => String(entry.url || '').toLowerCase().includes(String(rule).toLowerCase())))
    .map((entry) => ({
      url: entry.url,
      title: entry.title,
      matchedRule: adjacentRules.find((rule) => String(entry.url || '').toLowerCase().includes(String(rule).toLowerCase())),
    }));
  const adjacentRepoContaminationRatio = ratio(adjacentMatches.length, evidenceCount);

  const metrics = [
    metric({
      id: 'evidenceCount',
      value: evidenceCount,
      threshold: manifest.minimumEvidenceCount,
      direction: 'higher',
      passed: evidenceCount >= Number(manifest.minimumEvidenceCount || 0),
      failureClass: 'research_evidence_count_below_threshold',
    }),
    metric({
      id: 'queryVariantCount',
      value: queryVariantCount,
      threshold: manifest.queryVariants,
      direction: 'higher',
      passed: queryVariantCount === Number(manifest.queryVariants || 0),
      failureClass: 'research_query_variant_mismatch',
    }),
    metric({
      id: 'laneFailureCount',
      value: laneFailureCount,
      threshold: manifest.maximumLaneFailureCount,
      direction: 'lower',
      passed: laneFailureCount <= Number(manifest.maximumLaneFailureCount || 0),
      failureClass: 'research_lane_failure_count_above_threshold',
    }),
    metric({
      id: 'primarySourceRatio',
      value: primarySourceRatio,
      threshold: manifest.minimumPrimarySourceRatio,
      direction: 'higher',
      passed: primarySourceRatio >= Number(manifest.minimumPrimarySourceRatio || 0),
      failureClass: 'research_primary_source_ratio_below_threshold',
    }),
    metric({
      id: 'claimLedgerCoverage',
      value: claimLedgerCoverage,
      threshold: manifest.minimumClaimCoverageRatio,
      direction: 'higher',
      passed: claimLedgerCoverage >= Number(manifest.minimumClaimCoverageRatio || 0),
      failureClass: 'research_claim_coverage_below_threshold',
    }),
    metric({
      id: 'boundaryAccessItemCount',
      value: boundaryAccessItemCount,
      threshold: manifest.requiredBoundaryAccessItemCount,
      direction: 'higher',
      passed: boundaryAccessItemCount >= Number(manifest.requiredBoundaryAccessItemCount || 0),
      failureClass: 'research_boundary_access_missing',
    }),
    metric({
      id: 'adjacentRepoContaminationRatio',
      value: adjacentRepoContaminationRatio,
      threshold: manifest.maximumAdjacentRepoContaminationRatio,
      direction: 'lower',
      passed: adjacentRepoContaminationRatio <= Number(manifest.maximumAdjacentRepoContaminationRatio || 0),
      failureClass: 'research_adjacent_repo_contamination',
      details: { adjacentMatches },
    }),
    metric({
      id: 'requiredArtifactCompleteness',
      value: requiredArtifactCompleteness,
      threshold: manifest.requiredArtifactCompleteness,
      direction: 'higher',
      passed: requiredArtifactCompleteness >= Number(manifest.requiredArtifactCompleteness || 1),
      failureClass: 'research_required_artifact_missing',
      details: { requiredKeys, presentKeys, resolvedArtifacts },
    }),
  ];
  const failedMetrics = metrics.filter((entry) => entry.status === 'failed');
  const normalizedScore = metrics.length > 0
    ? metrics.reduce((sum, entry) => sum + entry.normalizedScore, 0) / metrics.length
    : 0;

  return {
    schemaVersion: 'moonshot-research-fixture-score.v1',
    status: failedMetrics.length === 0 ? 'passed' : 'failed',
    fixtureSetId: manifest.fixtureSetId,
    fixtureId: manifest.fixtureId,
    inputHash: manifest.inputHash,
    scorerVersion: SCORER_VERSION,
    evidenceCount,
    queryVariantCount,
    laneFailureCount,
    primarySourceRatio,
    claimLedgerCoverage,
    boundaryAccessItemCount,
    adjacentRepoContaminationRatio,
    requiredArtifactCompleteness,
    normalizedScore,
    metrics,
    failedMetrics,
    manifestPath: resolvedManifestPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  }
  if (options.command !== 'score') {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  const result = await scoreResearchFixture({ manifestPath: options.manifest });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.fixtureId}: ${result.status} normalizedScore=${result.normalizedScore}`);
  }
  if (result.status !== 'passed') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
