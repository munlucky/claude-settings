#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { recordEvalResult } from '../../scripts/lib/runtime-state-store.mjs';

export const REQUIRED_HARNESS_CONTROL_PLANE_CASES = [
  'completion-false-positive',
  'stale-verdict',
  'phase-status-only-completion',
  'missing-identity',
  'wrong-tool',
  'invalid-schema',
  'out-of-scope-write',
  'stale-lease',
  'degraded-runtime',
  'eval-worsening',
  'architecture-missing-traceability',
  'architecture-raw-kg-leakage',
  'architecture-missing-verification-signal',
  'architecture-phase-status-only-closeout',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FIXTURE_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'harness-control-plane',
  'golden-regression.json',
);
const PACKAGED_FIXTURE_PATH = path.join(MODULE_DIR, 'fixtures', 'harness-control-plane', 'golden-regression.json');
const DEFAULT_FIXTURE_PATH = existsSync(SOURCE_FIXTURE_PATH) ? SOURCE_FIXTURE_PATH : PACKAGED_FIXTURE_PATH;

const usage = () => 'Usage: node tools/evals/harness-control-plane.mjs run [--fixture <path>] [--run-id <id>] [--goal-id <id>] [--json]';

const parseArgs = (argv) => {
  const [command = 'run'] = argv;
  const options = {
    command,
    fixture: DEFAULT_FIXTURE_PATH,
    json: false,
    runId: '',
    goalId: '',
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return options;
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function evaluateCase(testcase = {}) {
  const expected = isObject(testcase.expected) ? testcase.expected : {};
  const actual = isObject(testcase.actual) ? testcase.actual : expected;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    id: testcase.id || '',
    category: testcase.category || '',
    status: pass ? 'passed' : 'failed',
    expected,
    actual,
    reason: pass ? '' : `expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    releaseBlocked: actual.releaseBlocked === true,
  };
}

export function runHarnessControlPlaneEval(fixture = {}) {
  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  const presentIds = new Set(cases.map((entry) => entry.id));
  const missingCases = REQUIRED_HARNESS_CONTROL_PLANE_CASES.filter((id) => !presentIds.has(id));
  const results = cases.map(evaluateCase);
  const failedCases = results.filter((result) => result.status !== 'passed');
  const passedCount = results.length - failedCases.length;
  const score = results.length > 0 ? passedCount / results.length : 0;
  const scoreThreshold = Number(fixture.scoreThreshold ?? 1);
  const regressionWorsened = missingCases.length > 0 || failedCases.length > 0 || score < scoreThreshold;

  return {
    schemaVersion: 1,
    suite: fixture.suite || 'harness-control-plane-golden',
    status: regressionWorsened ? 'failed' : 'passed',
    score,
    scoreThreshold,
    passedCount,
    failedCount: failedCases.length,
    totalCount: results.length,
    missingCases,
    failedCases,
    regressionWorsened,
    requiredCases: REQUIRED_HARNESS_CONTROL_PLANE_CASES,
    results,
  };
}

async function readFixture(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== 'run' && options.command !== '--help' && options.command !== '-h') {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  }

  const fixture = await readFixture(options.fixture);
  const output = runHarnessControlPlaneEval(fixture);
  let evalResult = null;
  if (options.runId && options.goalId) {
    evalResult = await recordEvalResult({
      runId: options.runId,
      goalId: options.goalId,
      suite: output.suite,
      status: output.status,
      score: {
        score: output.score,
        scoreThreshold: output.scoreThreshold,
        passedCount: output.passedCount,
        failedCount: output.failedCount,
        totalCount: output.totalCount,
        missingCases: output.missingCases,
      },
      regressionWorsened: output.regressionWorsened,
      evidence: output,
    });
  }
  const result = { ...output, evalResult };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.suite}: ${result.status} score=${result.score}`);
  }

  if (result.status !== 'passed') {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
