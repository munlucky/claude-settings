#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_TRACE_ROOT, readAwtlEvents } from './lib/awtl-trace-sink.mjs';
import { buildFailureAttribution, findFailedJudgeEvents } from './lib/awtl-failure-attribution.mjs';
import { DEFAULT_MEMORY_CANDIDATE_OUTPUT, buildMemoryCandidate, writeMemoryCandidatesJsonl } from './lib/awtl-memory-candidate.mjs';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.length > 0 && !args[0].startsWith('--') ? args.shift() : 'analyze';
  const options = {};

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--trace-root':
        options.traceRoot = args.shift() || '';
        break;
      case '--trace-id':
        options.traceId = args.shift() || '';
        break;
      case '--run-id':
        options.runId = args.shift() || '';
        break;
      case '--task-id':
        options.taskId = args.shift() || '';
        break;
      case '--session-id':
        options.sessionId = args.shift() || '';
        break;
      case '--repo-root':
        options.repoRoot = args.shift() || '';
        break;
      case '--output':
        options.output = args.shift() || '';
        break;
      case '--summary':
        options.summary = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, options };
}

async function analyzeTrace(options = {}) {
  const traceRoot = options.traceRoot || DEFAULT_TRACE_ROOT;
  const events = await readAwtlEvents({
    traceRoot,
    traceId: options.traceId,
    runId: options.runId,
    taskId: options.taskId,
    sessionId: options.sessionId,
  });
  const failures = findFailedJudgeEvents(events);
  const candidates = failures.map((failureEvent) => {
    const attribution = buildFailureAttribution(events, failureEvent, {
      repoRoot: options.repoRoot || process.cwd(),
      traceId: options.traceId || '',
      runId: options.runId || '',
    });
    return buildMemoryCandidate(attribution, {
      traceId: options.traceId || failureEvent.run_id,
      runId: options.runId || failureEvent.run_id,
    });
  });

  const outputPath = path.resolve(options.output || DEFAULT_MEMORY_CANDIDATE_OUTPUT);
  writeMemoryCandidatesJsonl(outputPath, candidates, { append: false });

  if (options.summary) {
    process.stdout.write(`${JSON.stringify({ outputPath, count: candidates.length, failures: candidates.map((candidate) => candidate.candidate_id) }, null, 2)}\n`);
  } else {
    process.stdout.write(`${outputPath}\n`);
  }

  return {
    outputPath,
    count: candidates.length,
    candidates,
  };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'analyze') {
    await analyzeTrace(options);
    return;
  }

  if (command === 'write-empty') {
    const outputPath = path.resolve(options.output || DEFAULT_MEMORY_CANDIDATE_OUTPUT);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, '', 'utf8');
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  analyzeTrace,
  main,
  parseArgs,
};
