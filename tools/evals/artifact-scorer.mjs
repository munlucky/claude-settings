#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'moonshot-artifact-scorer-result.v1';
const SCORER_VERSION = '1';

const usage = () => `Usage:
  node tools/evals/artifact-scorer.mjs score --manifest <json> --fixture-id <id> --output-root <dir> [--out <json>] [--json]

Scores an already-produced artifact tree for a fixed harness fixture.`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => `sha256:${sha256(await readFile(filePath))}`;
const toPortable = (filePath) => filePath.split(path.sep).join('/');

function parseArgs(argv) {
  const [command = 'score', ...rest] = argv;
  const options = {
    command,
    manifest: '',
    fixtureId: '',
    outputRoot: '',
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

function selectFixture(manifest, fixtureId) {
  const fixtures = Array.isArray(manifest.fixtures) ? manifest.fixtures : [];
  const fixture = fixtures.find((entry) => entry.fixtureId === fixtureId);
  if (!fixture) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }
  return fixture;
}

function requiredSectionsFor(artifact) {
  return Array.isArray(artifact.requiredSections) ? artifact.requiredSections : [];
}

async function scoreArtifact(outputRoot, artifact) {
  const artifactPath = artifact.path || '';
  const absolutePath = path.resolve(outputRoot, artifactPath);
  const exists = existsSync(absolutePath);
  const result = {
    path: toPortable(artifactPath),
    required: artifact.required === true,
    exists,
    sha256: '',
    schemaValid: true,
    requiredSectionsPresent: 0,
    requiredSectionsTotal: requiredSectionsFor(artifact).length,
  };

  if (!exists) {
    result.schemaValid = false;
    return result;
  }

  const info = await lstat(absolutePath);
  if (!info.isFile()) {
    result.schemaValid = false;
    return result;
  }

  result.sha256 = await sha256File(absolutePath);
  const content = await readFile(absolutePath, 'utf8').catch(() => '');
  const sections = requiredSectionsFor(artifact);
  result.requiredSectionsPresent = sections.filter((section) => content.includes(section)).length;
  result.schemaValid = result.requiredSectionsPresent === result.requiredSectionsTotal;
  return result;
}

export async function scoreFixture({ manifestPath, fixtureId, outputRoot }) {
  const manifest = await readJson(manifestPath);
  const fixture = selectFixture(manifest, fixtureId);
  const expectedArtifacts = Array.isArray(fixture.expectedArtifacts) ? fixture.expectedArtifacts : [];
  const artifacts = [];
  for (const artifact of expectedArtifacts) {
    artifacts.push(await scoreArtifact(outputRoot, artifact));
  }

  const requiredArtifacts = artifacts.filter((artifact) => artifact.required);
  const missingRequired = requiredArtifacts.filter((artifact) => !artifact.exists);
  const invalidArtifacts = artifacts.filter((artifact) => artifact.exists && !artifact.schemaValid);
  const requiredSectionTotal = artifacts.reduce((sum, artifact) => sum + artifact.requiredSectionsTotal, 0);
  const requiredSectionPresent = artifacts.reduce((sum, artifact) => sum + artifact.requiredSectionsPresent, 0);
  const failures = [
    ...missingRequired.map((artifact) => ({
      failureClass: 'artifact_missing',
      artifactPath: artifact.path,
      message: 'required artifact missing',
    })),
    ...invalidArtifacts.map((artifact) => ({
      failureClass: 'artifact_schema_invalid',
      artifactPath: artifact.path,
      message: 'artifact failed required section checks',
    })),
  ];
  const passed = failures.length === 0;

  return {
    schemaVersion: SCHEMA_VERSION,
    fixtureSetId: manifest.fixtureSetId || '',
    fixtureId: fixture.fixtureId,
    inputHash: fixture.inputHash || '',
    scorerVersion: SCORER_VERSION,
    status: passed ? 'passed' : 'failed',
    passed,
    metrics: {
      artifactPresenceRate: artifacts.length === 0 ? 1 : artifacts.filter((artifact) => artifact.exists).length / artifacts.length,
      schemaValidityRate: artifacts.length === 0 ? 1 : artifacts.filter((artifact) => artifact.schemaValid).length / artifacts.length,
      requiredSectionCoverage: requiredSectionTotal === 0 ? 1 : requiredSectionPresent / requiredSectionTotal,
      missingRequiredCount: missingRequired.length,
    },
    artifacts,
    failures,
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
  if (!options.manifest || !options.fixtureId || !options.outputRoot) {
    throw new Error(`Missing --manifest, --fixture-id, or --output-root\n${usage()}`);
  }
  const result = await scoreFixture({
    manifestPath: options.manifest,
    fixtureId: options.fixtureId,
    outputRoot: options.outputRoot,
  });
  if (options.out) {
    await writeFile(path.resolve(options.out), `${JSON.stringify(result, null, 2)}\n`);
  }
  if (options.json || !options.out) {
    console.log(JSON.stringify(result, null, 2));
  }
  if (!result.passed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
