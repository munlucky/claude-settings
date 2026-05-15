#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  compareAwtlEvents,
  createTraceEvent,
  createTraceSink,
  sortAwtlEvents,
} from './awtl-trace-sink.mjs';
import { validateAwtlEvent } from './awtl-event-schema.mjs';

function cleanup(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function cleanupRepoTrace(traceId) {
  fs.rmSync(path.resolve('.claude/traces', traceId), { recursive: true, force: true });
}

function makeEvent(overrides = {}) {
  return createTraceEvent({
    event_id: overrides.event_id || `evt-${Math.random().toString(16).slice(2)}`,
    event_type: overrides.event_type || 'action',
    task_id: overrides.task_id || 'task-phase-02',
    session_id: overrides.session_id || 'session-phase-02',
    run_id: overrides.run_id || 'run-phase-02',
    stage: overrides.stage || 'execute',
    actor: overrides.actor || 'codex',
    summary: overrides.summary || 'trace event',
    payload: overrides.payload || { action_name: 'append', detail: 'safe detail' },
    timestamp: overrides.timestamp || '2026-05-06T12:00:00.000Z',
    turn_id: overrides.turn_id || null,
    span_id: overrides.span_id || null,
    action_id: overrides.action_id || null,
    source: overrides.source || 'codex',
    ingest_seq: overrides.ingest_seq || 1,
    writer_seq: overrides.writer_seq || 1,
    schema_version: 1,
  }, overrides);
}

function makeTraceSink(traceId) {
  return createTraceSink({ traceId, runId: traceId, taskId: 'task-phase-02', sessionId: 'session-phase-02' });
}

test('schema validation rejects missing required envelope fields', () => {
  const result = validateAwtlEvent({
    schema_version: 1,
    event_id: 'evt-missing',
    task_id: 'task-phase-02',
    session_id: 'session-phase-02',
    run_id: 'run-phase-02',
    stage: 'execute',
    actor: 'codex',
    summary: 'missing event type',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('event_type is required')));
});

test('parallel append remains parseable and monotonic', async () => {
  const traceId = `parallel-append-${randomUUID()}`;
  const sink = makeTraceSink(traceId);

  try {
    const events = Array.from({ length: 8 }, (_, index) => makeEvent({
      event_id: `evt-${index + 1}`,
      summary: `parallel event ${index + 1}`,
      payload: {
        action_name: `append-${index + 1}`,
        artifact_refs: [`artifact-${index + 1}`],
      },
    }));

    await Promise.all(events.map((event) => sink.appendEvent(event)));
    const written = fs.readFileSync(sink.paths.canonicalPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));

    assert.equal(written.length, 8);
    assert.deepEqual(written.map((event) => event.ingest_seq), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(sortAwtlEvents(written), written);
  } finally {
    cleanupRepoTrace(traceId);
  }
});

test('corrupt partial lines are quarantined instead of poisoning the canonical log', async () => {
  const traceId = `quarantine-test-${randomUUID()}`;
  const sink = makeTraceSink(traceId);

  try {
    fs.mkdirSync(path.dirname(sink.paths.canonicalPath), { recursive: true });
    fs.writeFileSync(
      sink.paths.canonicalPath,
      [
        JSON.stringify(makeEvent({ event_id: 'evt-valid-1', summary: 'valid before corruption' })),
        '{"broken": true',
      ].join('\n'),
      'utf8',
    );

    const appended = await sink.appendEvent(makeEvent({
      event_id: 'evt-valid-2',
      summary: 'valid after quarantine',
      payload: { action_name: 'append-after-quarantine' },
    }));

    const canonical = fs.readFileSync(sink.paths.canonicalPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const quarantine = fs.readFileSync(sink.paths.quarantinePath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));

    assert.equal(canonical.length, 2);
    assert.equal(canonical[0].event_id, 'evt-valid-1');
    assert.equal(canonical[1].event_id, 'evt-valid-2');
    assert.equal(appended.event.ingest_seq, 2);
    assert.equal(quarantine.length, 1);
    assert.equal(typeof quarantine[0].reason, 'string');
    assert.ok(quarantine[0].reason.length > 0);
    assert.ok(quarantine[0].raw_line_redacted.includes('broken'));
  } finally {
    cleanupRepoTrace(traceId);
  }
});

test('quarantining a corrupted judge result rebuilds the materialized index from canonical events', async () => {
  const traceId = `judge-quarantine-${randomUUID()}`;
  const sink = makeTraceSink(traceId);

  try {
    const staleJudge = JSON.stringify(makeEvent({
      event_id: 'evt-stale-judge',
      event_type: 'judge_result',
      summary: 'stale judge',
      payload: {
        judge_name: 'phase-02-verifier',
        result: 'pass',
        artifact_refs: ['artifact-a'],
      },
    }));

    fs.mkdirSync(path.dirname(sink.paths.canonicalPath), { recursive: true });
    fs.writeFileSync(
      sink.paths.canonicalPath,
      `{"event_id":"evt-broken","event_type":"judge_result","task_id":"task-04","session_id":"session-04","run_id":"run-04","stage":"verify","actor":"codex","summary":"broken judge","timestamp":"2026-05-06T12:00:01.000Z","ingest_seq":1,"writer_seq":1,"payload":{"judge_name":"phase-02-verifier"},"schema_version":1}`,
      'utf8',
    );
    fs.writeFileSync(
      sink.paths.judgeResultPath,
      `${staleJudge}\n`,
      'utf8',
    );

    await sink.appendEvent(makeEvent({
      event_id: 'evt-action-after-quarantine',
      summary: 'follow-up after quarantine',
      payload: { action_name: 'append-after-quarantine' },
    }));

    const judgeIndex = fs.readFileSync(sink.paths.judgeResultPath, 'utf8').trim();

    assert.equal(judgeIndex, '');
  } finally {
    cleanupRepoTrace(traceId);
  }
});

test('redaction is applied before persistence and judge results materialize from canonical log', async () => {
  const traceId = `judge-index-${randomUUID()}`;
  const sink = makeTraceSink(traceId);

  try {
    await sink.appendEvent(makeEvent({
      event_id: 'evt-action',
      event_type: 'action',
      summary: 'contains secret-like data',
      payload: {
        action_name: 'append',
        secret_text: 'sk_test_1234567890abcdef1234567890abcdef',
        artifact_refs: ['artifact-a'],
      },
    }));

    await sink.appendEvent(makeEvent({
      event_id: 'evt-judge',
      event_type: 'judge_result',
      summary: 'judge pass',
      payload: {
        judge_name: 'phase-02-verifier',
        result: 'pass',
        artifact_refs: ['artifact-b'],
      },
    }));

    const rebuilt = await sink.rebuildJudgeResultIndex();
    const canonical = fs.readFileSync(sink.paths.canonicalPath, 'utf8');
    const judgeIndex = fs.readFileSync(rebuilt.judgeResultPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));

    assert.ok(!canonical.includes('sk_test_1234567890abcdef1234567890abcdef'));
    assert.ok(canonical.includes('[redacted]') || canonical.includes('[redacted:sha256:'));
    assert.equal(judgeIndex.length, 1);
    assert.equal(judgeIndex[0].event_type, 'judge_result');
    assert.equal(judgeIndex[0].payload.judge_name, 'phase-02-verifier');
    assert.ok(!judgeIndex.some((entry) => entry.event_type !== 'judge_result'));
  } finally {
    cleanupRepoTrace(traceId);
  }
});

test('nested trace roots are rejected before any files are created', () => {
  const nestedRoot = path.resolve('.claude/.claude/traces');
  assert.throws(
    () => createTraceSink({ traceRoot: nestedRoot, traceId: 'nested-root' }),
    /Invalid trace root/i,
  );
});

test('repo-external trace roots are rejected before any files are created', () => {
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-external-root-'));
  try {
    assert.throws(
      () => createTraceSink({ traceRoot: externalRoot, traceId: 'external-root' }),
      /Invalid trace root/i,
    );
  } finally {
    cleanup(externalRoot);
  }
});

test('event ordering helper sorts by run id, ingest sequence, timestamp, then event id', () => {
  const unordered = [
    makeEvent({ event_id: 'evt-c', run_id: 'run-b', ingest_seq: 2, timestamp: '2026-05-06T12:00:02.000Z' }),
    makeEvent({ event_id: 'evt-a', run_id: 'run-a', ingest_seq: 2, timestamp: '2026-05-06T12:00:03.000Z' }),
    makeEvent({ event_id: 'evt-b', run_id: 'run-a', ingest_seq: 1, timestamp: '2026-05-06T12:00:01.000Z' }),
  ];

  assert.equal(compareAwtlEvents(unordered[0], unordered[1]) > 0, true);
  assert.deepEqual(sortAwtlEvents(unordered).map((entry) => entry.event_id), ['evt-b', 'evt-a', 'evt-c']);
});
