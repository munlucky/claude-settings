#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  appendAwtlEvent,
  compareAwtlEvents,
  createTraceEvent,
  createTraceSink,
  DEFAULT_TRACE_ROOT,
  readAwtlEvents,
  rebuildJudgeResultIndex,
  sortAwtlEvents,
} from './lib/awtl-trace-sink.mjs';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'self-test';
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
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, options };
}

function makeEvent(eventType, payload, overrides = {}) {
  return createTraceEvent({
    ...overrides,
    event_type: eventType,
    payload,
  }, overrides);
}

async function runSelfTest(options = {}) {
  const traceRoot = options.traceRoot || DEFAULT_TRACE_ROOT;
  const traceId = options.traceId || `self-test-${Date.now()}`;
  const runId = options.runId || traceId;
  const taskId = options.taskId || 'phase-02-task';
  const sessionId = options.sessionId || 'phase-02-session';
  const sink = createTraceSink({ traceRoot, traceId, runId, taskId, sessionId });

  const first = makeEvent(
    'action',
    {
      action_name: 'append trace event',
      secret_text: 'sk_test_1234567890abcdef1234567890abcdef',
      artifact_refs: ['docs/implementation/harness-native-awtl-rsme-2026-05-06/02-schema-trace-sink-foundation-v1.md'],
    },
    {
      run_id: runId,
      task_id: taskId,
      session_id: sessionId,
      summary: 'capture secret_text for append test',
    },
  );

  const judge = makeEvent(
    'judge_result',
    {
      judge_name: 'phase-02-verifier',
      result: 'pass',
      artifact_refs: ['.claude/traces/self-test'],
    },
    {
      run_id: runId,
      task_id: taskId,
      session_id: sessionId,
      summary: 'judge result for materialized view',
    },
  );

  const observation = makeEvent(
    'observation',
    {
      observation_name: 'trace-sink-append',
      detail: 'follow-up event',
    },
    {
      run_id: runId,
      task_id: taskId,
      session_id: sessionId,
      summary: 'follow-up observation',
    },
  );

  const firstResult = await sink.appendEvent(first);
  await sink.appendEvent(judge);
  fs.appendFileSync(sink.paths.canonicalPath, '{"corrupt": true');
  await sink.appendEvent(observation);
  const rebuilt = await sink.rebuildJudgeResultIndex();
  const events = await readAwtlEvents({ traceRoot, traceId, runId, taskId, sessionId });
  const judgeIndex = fs.readFileSync(rebuilt.judgeResultPath, 'utf8');

  assert.equal(events.length, 3);
  assert.equal(events[0].ingest_seq, 1);
  assert.equal(events[1].ingest_seq, 2);
  assert.equal(events[2].ingest_seq, 3);
  assert.ok(!JSON.stringify(events[0]).includes('sk_test_1234567890abcdef1234567890abcdef'));
  assert.ok(JSON.stringify(events[0]).includes('[redacted]'));
  assert.ok(judgeIndex.includes('"event_type":"judge_result"'));
  assert.ok(!judgeIndex.includes('follow-up observation'));
  assert.ok(compareAwtlEvents(events[0], events[1]) <= 0);
  assert.deepEqual(sortAwtlEvents(events), events);
  assert.ok(firstResult.traceDir);

  return {
    traceDir: sink.paths.traceDir,
    canonicalPath: sink.paths.canonicalPath,
    judgeResultPath: sink.paths.judgeResultPath,
    quarantinePath: sink.paths.quarantinePath,
  };
}

async function runRebuild(options = {}) {
  const result = await rebuildJudgeResultIndex(options);
  process.stdout.write(`${result.judgeResultPath}\n`);
  return result;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'self-test') {
    const result = await runSelfTest(options);
    process.stdout.write([
      'awtl-trace self-test passed',
      `trace_dir=${result.traceDir}`,
      `canonical_path=${result.canonicalPath}`,
      `judge_result_path=${result.judgeResultPath}`,
      `quarantine_path=${result.quarantinePath}`,
    ].join('\n'));
    process.stdout.write('\n');
    return;
  }

  if (command === 'rebuild-index') {
    await runRebuild(options);
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
  main,
  runSelfTest,
  runRebuild,
};
