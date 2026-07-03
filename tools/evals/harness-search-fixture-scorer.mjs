#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'tests/fixtures/harness-search-fixtures/fixture-manifest.json';
const SCHEMA_VERSION = 'moonshot-harness-search-fixture-score.v1';
const SCORER_VERSION = 'harness-search-fixture-scorer-v1';
const REQUIRED_FIXTURE_FIELDS = ['fixtureId', 'fixtureClass', 'inputHash', 'expectedFailureClass'];
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|password\s*=|token\s*=)/i;

const usage = () => 'Usage: node tools/evals/harness-search-fixture-scorer.mjs score [--manifest <path>] [--out <path>] [--json]';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function parseArgs(argv) {
  const [command = 'score', ...rest] = argv;
  const options = {
    command,
    manifest: DEFAULT_MANIFEST,
    out: '',
    json: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
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
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

function evaluateFixtureIdentity(fixture = {}, manifest = {}) {
  const missingFields = REQUIRED_FIXTURE_FIELDS.filter((field) => !fixture[field]);
  if (!manifest.fixtureSetId) missingFields.push('fixtureSetId');
  if (!manifest.scorerVersion) missingFields.push('scorerVersion');
  return {
    complete: missingFields.length === 0,
    missingFields,
  };
}

function classifyFixture(fixture = {}) {
  const signals = fixture.signals || {};
  if (signals.identityComplete === false) return 'fixture_identity_incomplete';
  if (signals.mutationSafetyViolation === true) return 'mutation_safety_violation';
  if (signals.redactionUnsafe === true) return 'redaction_snapshot_unsafe_field';
  if (Number(signals.staleArtifacts || 0) > 0) return 'stale_artifact';
  if (Number(signals.score ?? 1) < Number(signals.baselineScore ?? 1)) return 'score_drop';
  return 'none';
}

function scoreFixture(fixture, manifest) {
  const identity = evaluateFixtureIdentity(fixture, manifest);
  const unsafePayload = SECRET_PATTERN.test(JSON.stringify(fixture));
  const actualFailureClass = identity.complete ? classifyFixture(fixture) : 'fixture_identity_schema_missing';
  const expectedFailureClass = fixture.expectedFailureClass || '';
  const status = identity.complete && !unsafePayload && actualFailureClass === expectedFailureClass
    ? 'passed'
    : 'failed';
  return {
    fixtureSetId: manifest.fixtureSetId || '',
    fixtureId: fixture.fixtureId || '',
    fixtureClass: fixture.fixtureClass || '',
    inputHash: fixture.inputHash || '',
    scorerVersion: manifest.scorerVersion || SCORER_VERSION,
    status,
    expectedFailureClass,
    actualFailureClass,
    identity,
    unsafePayload,
  };
}

export async function scoreHarnessSearchFixtures({ manifestPath = DEFAULT_MANIFEST } = {}) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = await readJson(resolvedManifestPath);
  const fixtures = Array.isArray(manifest.fixtures) ? manifest.fixtures : [];
  const results = fixtures.map((fixture) => scoreFixture(fixture, manifest));
  const failedFixtures = results.filter((entry) => entry.status !== 'passed');
  const classCoverage = new Set(results.map((entry) => entry.actualFailureClass).filter(Boolean)).size;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: failedFixtures.length === 0 ? 'passed' : 'failed',
    fixtureSetId: manifest.fixtureSetId || '',
    scorerVersion: manifest.scorerVersion || SCORER_VERSION,
    inputHash: `sha256:${sha256(JSON.stringify({
      fixtureSetId: manifest.fixtureSetId || '',
      fixtures: fixtures.map((fixture) => ({
        fixtureId: fixture.fixtureId || '',
        inputHash: fixture.inputHash || '',
        expectedFailureClass: fixture.expectedFailureClass || '',
      })),
    }))}`,
    fixtureCount: fixtures.length,
    classCoverage,
    promotionAuthority: false,
    results,
    failedFixtures,
    manifestPath: resolvedManifestPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(usage());
    return;
  }
  if (options.command !== 'score') {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  const result = await scoreHarnessSearchFixtures({ manifestPath: options.manifest });
  if (options.out) {
    await writeFile(path.resolve(options.out), `${JSON.stringify(result, null, 2)}\n`);
  }
  if (options.json || !options.out) {
    console.log(JSON.stringify(result, null, 2));
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
