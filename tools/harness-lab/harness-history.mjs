#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_STATE_ROOT = '.moonshot-relay/harness-lab';
const DEFAULT_RUNS_ROOT = `${DEFAULT_STATE_ROOT}/runs`;
const DEFAULT_EXPERIENCE_ROOT = `${DEFAULT_STATE_ROOT}/experience`;
const INDEX_SCHEMA_VERSION = 'moonshot-harness-experience-index.v1';
const BUILDER_VERSION = 'harness-history-v1';
const FRONTIER_SCHEMA_VERSION = 'moonshot-harness-frontier-report.v1';
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|password\s*=|token\s*=)/i;

const usage = () => `Usage:
  node tools/harness-lab/harness-history.mjs list [--runs-root <dir>] [--experience-root <dir>] [--json]
  node tools/harness-lab/harness-history.mjs show --run-id <id> [--runs-root <dir>] [--json]
  node tools/harness-lab/harness-history.mjs failures --class <failureClass> [--runs-root <dir>] [--experience-root <dir>] [--json]
  node tools/harness-lab/harness-history.mjs build-index [--runs-root <dir>] [--experience-root <dir>] [--json]
  node tools/harness-lab/harness-history.mjs frontier [--runs-root <dir>] [--experience-root <dir>] [--json]`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const toPortable = (filePath) => filePath.split(path.sep).join('/');

function parseArgs(argv) {
  const [command = 'list', ...rest] = argv;
  const options = {
    command,
    runsRoot: DEFAULT_RUNS_ROOT,
    experienceRoot: DEFAULT_EXPERIENCE_ROOT,
    runId: '',
    class: '',
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

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function fileRef(filePath, root) {
  if (!existsSync(filePath)) return null;
  const content = await readFile(filePath);
  return {
    path: toPortable(path.relative(root, filePath)),
    sha256: `sha256:${sha256(content)}`,
  };
}

function safeFailureClass(payload = {}) {
  return payload.failureClass
    || payload.labResultSummary?.failureClass
    || payload.differential?.failureClass
    || payload.candidate?.results?.find((entry) => entry.failureClass)?.failureClass
    || payload.artifactVerdict?.failureClass
    || (payload.status === 'failed' ? 'unknown_failure' : 'none');
}

function safeScore(payload = {}) {
  const values = [
    payload.score,
    payload.normalizedScore,
    payload.labResultSummary?.score,
    payload.candidate?.score,
  ].map(Number).filter((value) => Number.isFinite(value));
  return values.length > 0 ? values[0] : null;
}

function extractIdentity(spec = {}, labResult = {}) {
  const metric = labResult.candidate?.results?.flatMap((result) => result.metrics || [])
    .find((entry) => entry.fixtureSetId || entry.fixtureId || entry.inputHash || entry.scorerVersion) || {};
  return {
    fixtureSetId: labResult.run?.fixtureSetId || spec.fixtureSetId || metric.fixtureSetId || '',
    fixtureId: labResult.run?.fixtureId || spec.fixtureId || metric.fixtureId || '',
    inputHash: labResult.run?.inputHash || spec.inputHash || metric.inputHash || '',
    scorerVersion: labResult.run?.scorerVersion || spec.scorerVersion || metric.scorerVersion || '',
  };
}

function hasCompleteIdentity(identity) {
  return ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'].every((field) => Boolean(identity[field]));
}

function rejectRawBody(record) {
  const text = JSON.stringify(record);
  if (SECRET_PATTERN.test(text)) {
    throw new Error('history output rejected unsafe secret-like content');
  }
  return record;
}

export async function readRunRecord({ runId, runsRoot = DEFAULT_RUNS_ROOT } = {}) {
  if (!runId) throw new Error('--run-id is required');
  const root = path.resolve(runsRoot);
  const runRoot = path.join(root, runId);
  const specPath = path.join(runRoot, 'run-spec.json');
  const labPath = path.join(runRoot, 'lab-result.json');
  const comparePath = path.join(runRoot, 'compare-report.json');
  const closeoutPath = path.join(runRoot, 'lab-closeout-receipt.json');
  const verdictPath = path.join(runRoot, 'verdict.json');
  const proposalPath = path.join(runRoot, 'evolve-proposal.json');
  const snapshotPath = path.join(runRoot, 'environment-snapshot.json');
  const spec = await readJsonIfExists(specPath) || {};
  const labResult = await readJsonIfExists(labPath) || {};
  const compare = await readJsonIfExists(comparePath) || {};
  const closeout = await readJsonIfExists(closeoutPath) || {};
  const verdict = await readJsonIfExists(verdictPath) || {};
  const proposal = await readJsonIfExists(proposalPath) || {};
  const identity = extractIdentity(spec, labResult);
  const failureClass = safeFailureClass(verdict.status ? verdict : labResult);
  const score = safeScore(verdict.status ? verdict : labResult);
  const artifactRefs = Object.fromEntries((await Promise.all([
    ['runSpec', specPath],
    ['labResult', labPath],
    ['compare', comparePath],
    ['closeout', closeoutPath],
    ['verdict', verdictPath],
    ['proposal', proposalPath],
    ['environmentSnapshot', snapshotPath],
  ].map(async ([key, filePath]) => [key, await fileRef(filePath, root)]))).filter(([, ref]) => ref));
  return rejectRawBody({
    schemaVersion: 'moonshot-harness-history-record.v1',
    runId,
    specHash: spec.specHash || labResult.run?.specHash || verdict.specHash || '',
    lifecycle: spec.scope?.lifecyclePath || '',
    backend: spec.backend || '',
    status: verdict.status || labResult.status || closeout.status || 'unknown',
    closeoutStatus: closeout.status || '',
    commitConsumable: closeout.consumableByCommitWorkflow === true,
    failureClass,
    score,
    fixtureIdentity: identity,
    fixtureIdentityComplete: hasCompleteIdentity(identity),
    scorerVersion: identity.scorerVersion,
    hardBlockerMetricsPassed: !['score_drop', 'stale_artifact', 'mutation_safety_violation', 'redaction_snapshot_unsafe_field', 'unknown_failure'].includes(failureClass),
    staleArtifactCount: Number(labResult.artifactConsistency?.staleArtifacts?.length || verdict.artifactVerdict?.staleArtifacts?.length || 0),
    mutationSafetyBlockers: failureClass === 'mutation_safety_violation' ? 1 : 0,
    proposal: proposal.schemaVersion ? {
      schemaVersion: proposal.schemaVersion,
      parentRunId: proposal.parentRunId || '',
      promotionAuthority: false,
    } : null,
    artifacts: artifactRefs,
    promotionAuthority: false,
  });
}

export async function listRunRecords({ runsRoot = DEFAULT_RUNS_ROOT } = {}) {
  const root = path.resolve(runsRoot);
  if (!existsSync(root)) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    records.push(await readRunRecord({ runId: entry.name, runsRoot: root }));
  }
  return records.sort((left, right) => left.runId.localeCompare(right.runId));
}

export async function buildExperienceIndex({
  runsRoot = DEFAULT_RUNS_ROOT,
  experienceRoot = DEFAULT_EXPERIENCE_ROOT,
} = {}) {
  const records = await listRunRecords({ runsRoot });
  const root = path.resolve(experienceRoot);
  await mkdir(root, { recursive: true });
  const previous = await readJsonIfExists(path.join(root, 'index.json'));
  const previousIds = new Set((previous?.runs || []).map((entry) => entry.runId));
  const currentIds = new Set(records.map((entry) => entry.runId));
  const staleEntriesRemoved = [...previousIds].filter((id) => !currentIds.has(id));
  const sourceArtifactHashes = Object.fromEntries(records.flatMap((record) => (
    Object.entries(record.artifacts).map(([key, ref]) => [`${record.runId}:${key}`, ref.sha256])
  )));
  const index = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    builtAt: new Date().toISOString(),
    builderVersion: BUILDER_VERSION,
    rebuildMode: 'overwrite-derived-index-only',
    staleEntriesRemoved,
    sourceArtifactHashes,
    promotionAuthority: false,
    runs: records,
  };
  await rm(path.join(root, 'index.json'), { force: true });
  await writeFile(path.join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

export async function buildFrontierReport({
  runsRoot = DEFAULT_RUNS_ROOT,
  experienceRoot = DEFAULT_EXPERIENCE_ROOT,
} = {}) {
  const index = existsSync(path.join(path.resolve(experienceRoot), 'index.json'))
    ? await readJsonIfExists(path.join(path.resolve(experienceRoot), 'index.json'))
    : await buildExperienceIndex({ runsRoot, experienceRoot });
  const eligibleRecords = (index.runs || [])
    .filter((record) => record.fixtureIdentityComplete && record.hardBlockerMetricsPassed && Number(record.staleArtifactCount || 0) === 0);
  const scorerVersions = [...new Set(eligibleRecords.map((record) => record.scorerVersion || record.fixtureIdentity?.scorerVersion || '').filter(Boolean))].sort();
  const referenceScorerVersion = scorerVersions[0] || '';
  const candidates = (index.runs || [])
    .filter((record) => record.fixtureIdentityComplete && record.hardBlockerMetricsPassed && Number(record.staleArtifactCount || 0) === 0)
    .filter((record) => !referenceScorerVersion || (record.scorerVersion || record.fixtureIdentity?.scorerVersion || '') === referenceScorerVersion)
    .map((record) => ({
      runId: record.runId,
      normalizedScore: Number.isFinite(Number(record.score)) ? Number(record.score) : 0,
      durationMs: null,
      failureClass: record.failureClass,
      staleArtifactCount: record.staleArtifactCount,
      mutationSafetyBlockers: record.mutationSafetyBlockers,
      fixtureIdentity: record.fixtureIdentity,
      scorerVersion: record.scorerVersion || record.fixtureIdentity?.scorerVersion || '',
      promotionAuthority: false,
    }))
    .sort((left, right) => right.normalizedScore - left.normalizedScore || left.runId.localeCompare(right.runId));
  const report = {
    schemaVersion: FRONTIER_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    referenceScorerVersion,
    excludedScorerVersions: scorerVersions.filter((version) => version !== referenceScorerVersion),
    candidateCount: candidates.length,
    candidates,
    excludedCount: (index.runs || []).length - candidates.length,
    promotionAuthority: false,
    promotionAuthorityReason: 'report-only frontier; H0 compare/promote/closeout remains authoritative',
  };
  const root = path.resolve(experienceRoot);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'frontier.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(usage());
    return;
  }
  let result;
  if (options.command === 'list') {
    result = {
      schemaVersion: 'moonshot-harness-history-list.v1',
      runs: await listRunRecords(options),
      promotionAuthority: false,
    };
  } else if (options.command === 'show') {
    result = await readRunRecord(options);
  } else if (options.command === 'failures') {
    const index = existsSync(path.join(path.resolve(options.experienceRoot), 'index.json'))
      ? await readJsonIfExists(path.join(path.resolve(options.experienceRoot), 'index.json'))
      : await buildExperienceIndex(options);
    result = {
      schemaVersion: 'moonshot-harness-history-failures.v1',
      failureClass: options.class || '',
      runs: (index.runs || []).filter((record) => !options.class || record.failureClass === options.class),
      promotionAuthority: false,
    };
  } else if (options.command === 'build-index') {
    result = await buildExperienceIndex(options);
  } else if (options.command === 'frontier') {
    result = await buildFrontierReport(options);
  } else {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${options.command}: ${result.status || result.runs?.length || result.candidateCount || 0}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
