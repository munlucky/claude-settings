#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error([
    'Usage:',
    '  meta-harness-benchmark.mjs compare --baseline <manifest.json> --candidate <manifest.json> --output <path>',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || '';
  const options = {};

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--baseline':
        options.baseline = args.shift() ?? '';
        break;
      case '--candidate':
        options.candidate = args.shift() ?? '';
        break;
      case '--output':
        options.output = args.shift() ?? '';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, options };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function diagnosisExists(manifestPath) {
  const dir = path.dirname(manifestPath);
  return fs.existsSync(path.join(dir, 'diagnosis.json')) && fs.existsSync(path.join(dir, 'diagnosis.md'));
}

function scoreManifest(manifest, manifestPath) {
  let score = 0;
  const dimensions = [];

  const completionClean = manifest.workflow?.closeoutStatus === 'clean_finish';
  score += completionClean ? 30 : 0;
  dimensions.push({ name: 'clean_finish', passed: completionClean, weight: 30 });

  const evidenceFresh = manifest.verifier?.evidenceFresh === true;
  score += evidenceFresh ? 20 : 0;
  dimensions.push({ name: 'fresh_evidence', passed: evidenceFresh, weight: 20 });

  const scoreDone = manifest.verifier?.score?.verdict === 'done';
  score += scoreDone ? 20 : 0;
  dimensions.push({ name: 'score_done', passed: scoreDone, weight: 20 });

  const blockerFree = Array.isArray(manifest.workflow?.blockers) && manifest.workflow.blockers.length === 0;
  score += blockerFree ? 15 : 0;
  dimensions.push({ name: 'no_blockers', passed: blockerFree, weight: 15 });

  const diagnosisReady = diagnosisExists(manifestPath);
  score += diagnosisReady ? 15 : 0;
  dimensions.push({ name: 'diagnosis_ready', passed: diagnosisReady, weight: 15 });

  return {
    totalScore: score,
    dimensions,
  };
}

function compare(options) {
  if (!options.baseline || !options.candidate || !options.output) {
    throw new Error('compare requires --baseline, --candidate, and --output');
  }

  const baselineManifest = readJson(options.baseline);
  const candidateManifest = readJson(options.candidate);
  const baseline = scoreManifest(baselineManifest, options.baseline);
  const candidate = scoreManifest(candidateManifest, options.candidate);

  let winner = 'tie';
  if (candidate.totalScore > baseline.totalScore) winner = 'candidate';
  if (candidate.totalScore < baseline.totalScore) winner = 'baseline';

  const payload = {
    benchmarkVersion: '1.0',
    generatedAt: new Date().toISOString(),
    baseline: {
      manifest: options.baseline,
      traceId: baselineManifest.traceId,
      totalScore: baseline.totalScore,
      dimensions: baseline.dimensions,
    },
    candidate: {
      manifest: options.candidate,
      traceId: candidateManifest.traceId,
      totalScore: candidate.totalScore,
      dimensions: candidate.dimensions,
    },
    winner,
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`BENCHMARK_PATH=${options.output}`);
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  switch (command) {
    case 'compare':
      compare(options);
      break;
    default:
      usage();
      process.exit(64);
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
