#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const usage = () => 'Usage: node tools/awtl/trace-to-testcase.mjs candidate [--trace-path <path>|--trace-json <json>] [--out <path>] [--json]';

const parseArgs = (argv) => {
  const [command = 'candidate'] = argv;
  const options = {
    command,
    json: false,
    tracePath: '',
    traceJson: '',
    out: '',
    threshold: '1',
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

const nowIso = () => new Date().toISOString();

const digest = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex')
  .slice(0, 16);

async function readTrace(options) {
  if (options.traceJson) {
    return JSON.parse(options.traceJson);
  }
  if (options.tracePath) {
    return JSON.parse(await readFile(path.resolve(options.tracePath), 'utf8'));
  }
  throw new Error('trace input is required');
}

export function buildTraceToTestcaseCandidate(trace = {}, options = {}) {
  const score = Number(trace.score ?? trace.replayScore ?? 0);
  const threshold = Number(options.threshold ?? 1);
  const failed = trace.status === 'failed' || trace.status === 'blocked' || trace.regressionWorsened === true || score < threshold;
  const sourceTraceId = String(trace.traceId ?? trace.trace_id ?? `trace-${digest(trace)}`);
  const sourceCase = trace.failedCase || trace.case || {};
  const category = String(sourceCase.category || trace.category || 'harness-control-plane');
  const testcaseId = String(sourceCase.id || trace.failedCaseId || `candidate-${digest({ sourceTraceId, category })}`);
  const candidateId = `awtl-testcase-candidate-${digest({ sourceTraceId, testcaseId, score })}`;

  return {
    schemaVersion: 1,
    candidateId,
    createdAt: nowIso(),
    sourceTraceId,
    fixtureNamespace: 'tests/fixtures/harness-control-plane',
    reviewStatus: 'pending_review',
    lowScore: failed,
    score,
    scoreThreshold: threshold,
    promotion: {
      requiresReview: true,
      requiredEvidence: [
        'replay-scorecard',
        'owner-review',
        'rollback-metadata',
      ],
      status: failed ? 'ready_for_review' : 'not_required',
    },
    rollback: {
      strategy: 'remove generated fixture and rerun golden eval',
      removes: [
        `tests/fixtures/harness-control-plane/${testcaseId}.json`,
        `eval-case:${testcaseId}`,
      ],
    },
    testcase: {
      id: testcaseId,
      category,
      input: sourceCase.input || trace.input || {},
      expected: sourceCase.expected || trace.expected || { releaseBlocked: true },
      sourceFailure: trace.failure || trace.reason || '',
    },
    improvementCandidate: {
      schemaVersion: 1,
      candidateId: `improvement-candidate-${digest({ sourceTraceId, testcaseId, score })}`,
      sourceCandidateId: candidateId,
      state: failed ? 'ready_for_review' : 'pending_review',
      verdict: failed ? 'FAIL' : 'PASS',
      sourceMutation: {
        allowed: false,
        requiresAcceptedParentEdit: true,
        forbiddenTargets: [
          'schemas',
          'ontology',
          'public_skills',
          'agents',
          'tool_permissions',
          'verification_contracts',
        ],
      },
      requiredEvidence: [
        'accepted-parent-edit',
        'fresh-regression-evidence',
        'owner-review',
        'rollback-metadata',
      ],
      rollback: {
        required: true,
        strategy: 'discard candidate sidecar and rerun golden eval before any parent edit',
      },
    },
  };
}

async function maybeWriteOutput(filePath, value) {
  if (!filePath) {
    return null;
  }
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== 'candidate' && options.command !== '--help' && options.command !== '-h') {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  }

  const trace = await readTrace(options);
  const candidate = buildTraceToTestcaseCandidate(trace, { threshold: options.threshold });
  const outputPath = await maybeWriteOutput(options.out, candidate);
  const result = { status: 'candidate_created', candidate, outputPath };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
