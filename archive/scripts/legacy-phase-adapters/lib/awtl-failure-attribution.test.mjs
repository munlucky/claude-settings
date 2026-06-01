#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFailureAttribution, buildSummarizerInput, findFailedJudgeEvents } from './awtl-failure-attribution.mjs';
import { assertMemoryCandidate, buildMemoryCandidate, validateMemoryCandidate, writeMemoryCandidatesJsonl } from './awtl-memory-candidate.mjs';

function tempTraceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-failure-attribution-'));
}

function cleanup(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test('deterministic attribution prefers the last modifying action before verifier adjacency and captures memory-read node ids', async () => {
  const phaseDoc = 'docs/implementation/harness-native-awtl-rsme-2026-05-06/04-failure-attribution-memory-candidate-v1.md';
  const editActionId = 'action-edit-phase-doc';
  const verifierActionId = 'action-phase-04-verifier';
  const events = [
    {
      event_id: 'evt-edit-start',
      event_type: 'action',
      task_id: 'phase-04',
      session_id: 'session-04',
      run_id: 'run-04',
      turn_id: 'turn-04-1',
      stage: 'execute',
      actor: 'codex',
      summary: 'edit start',
      timestamp: '2026-05-06T12:00:00.000Z',
      ingest_seq: 1,
      writer_seq: 1,
      action_id: editActionId,
      source: 'codex',
      payload: {
        action_name: 'edit-phase-doc',
        artifact_refs: [phaseDoc],
      },
      schema_version: 1,
    },
    {
      event_id: 'evt-edit-complete',
      event_type: 'action',
      task_id: 'phase-04',
      session_id: 'session-04',
      run_id: 'run-04',
      stage: 'execute',
      actor: 'codex',
      summary: 'edit complete',
      timestamp: '2026-05-06T12:00:01.000Z',
      ingest_seq: 2,
      writer_seq: 2,
      action_id: editActionId,
      source: 'codex',
      payload: {
        action_name: 'edit-phase-doc',
        artifact_refs: [phaseDoc],
      },
      schema_version: 1,
    },
    {
      event_id: 'evt-memory-read',
      event_type: 'observation',
      task_id: 'phase-04',
      session_id: 'session-04',
      run_id: 'run-04',
      stage: 'execute',
      actor: 'codex',
      summary: 'memory_read',
      timestamp: '2026-05-06T12:00:02.000Z',
      ingest_seq: 3,
      writer_seq: 3,
      source: 'codex',
      payload: {
        observation_name: 'memory_read',
        node_ids: ['node-17', 'node-42'],
        scope: 'execute',
      },
      schema_version: 1,
    },
    {
      event_id: 'evt-judge-fail',
      event_type: 'judge_result',
      task_id: 'phase-04',
      session_id: 'session-04',
      run_id: 'run-04',
      turn_id: 'turn-04-5',
      stage: 'verify',
      actor: 'codex',
      summary: 'judge fail',
      timestamp: '2026-05-06T12:00:03.000Z',
      ingest_seq: 4,
      writer_seq: 4,
      action_id: verifierActionId,
      source: 'codex',
      payload: {
        judge_name: 'phase-04-verifier',
        result: 'fail',
        artifact_refs: [phaseDoc],
        source_action_id: verifierActionId,
        detail: 'spawnSync bash EPERM',
      },
      schema_version: 1,
    },
  ];
  const failures = findFailedJudgeEvents(events);
    const attribution = buildFailureAttribution(events, failures[0], { repoRoot: process.cwd() });

    assert.deepEqual(attribution.failedArtifactRefs, [phaseDoc]);
    assert.equal(attribution.failureTurnId, 'turn-04-5');
    assert.deepEqual(attribution.sourceActionIds, [editActionId, verifierActionId]);
    assert.deepEqual(attribution.memoryReadNodeIds, ['node-17', 'node-42']);
    assert.ok(attribution.evidenceRefs.includes('trace:turn:turn-04-5'));
    assert.ok(attribution.attributionHeuristics.includes('failed-check-artifact-lookup'));
    assert.ok(attribution.attributionHeuristics.includes('command-verifier-adjacency-lookup'));
    assert.ok(!attribution.attributionHeuristics.includes('touched-file-lookup') || attribution.attributionHeuristics.includes('last-modifying-action-lookup'));
  });

test('memory candidate validation rejects missing scope, evidence refs, source action ids, or probe candidate', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-04',
    session_id: 'session-04',
    run_id: 'run-04',
    turn_id: 'turn-04-2',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-04-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'spawnSync bash EPERM',
    },
    schema_version: 1,
  };

  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const candidate = buildMemoryCandidate(attribution, { runId: 'run-04', traceId: 'trace-04' });

  assert.equal(validateMemoryCandidate(candidate).ok, true);
  assert.equal(validateMemoryCandidate({ ...candidate, scope: null }).ok, false);
  assert.ok(validateMemoryCandidate({ ...candidate, scope: null }).errors.some((error) => error.includes('scope must be an object')));
  assert.ok(validateMemoryCandidate({ ...candidate, evidence_refs: [] }).errors.some((error) => error.includes('evidence_refs must be a non-empty array')));
  assert.ok(validateMemoryCandidate({ ...candidate, source_action_ids: [] }).errors.some((error) => error.includes('source_action_ids must be a non-empty array')));
  assert.ok(validateMemoryCandidate({ ...candidate, verification_probe_candidate: null }).errors.some((error) => error.includes('verification_probe_candidate must be an object')));
});

test('raw trace details stay out of the optional summarizer input boundary', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-04',
    session_id: 'session-04',
    run_id: 'run-04',
    turn_id: 'turn-04-3',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-04-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'stdout: do not leak',
    },
    schema_version: 1,
  };
  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const candidate = buildMemoryCandidate(attribution, { runId: 'run-04', traceId: 'trace-04' });
  const summarizerInput = buildSummarizerInput({
    ...candidate,
    raw_stdout: 'this should not be copied',
    prompt: 'this should not be copied',
    trace_text: 'this should not be copied',
  });

  assert.equal(JSON.stringify(summarizerInput).includes('this should not be copied'), false);
  assert.equal(Object.hasOwn(summarizerInput, 'raw_stdout'), false);
  assert.equal(Object.hasOwn(summarizerInput, 'prompt'), false);
});

test('environment, flaky, and harness failures are blocked by default', () => {
  const blockedDetails = [
    'spawnSync bash EPERM',
    'intermittent flaky timeout',
    'harness runner contract failure',
  ];

  for (const detail of blockedDetails) {
    const failureEvent = {
      event_id: `evt-${detail.slice(0, 8)}`,
      event_type: 'judge_result',
      task_id: 'phase-04',
      session_id: 'session-04',
      run_id: 'run-04',
      turn_id: 'turn-04-4',
      stage: 'verify',
      actor: 'codex',
      summary: 'judge fail',
      timestamp: '2026-05-06T12:00:00.000Z',
      ingest_seq: 1,
      writer_seq: 1,
      action_id: 'action-verify',
      source: 'codex',
      payload: {
        judge_name: 'phase-04-verifier',
        result: 'fail',
        artifact_refs: ['docs/example.md'],
        source_action_id: 'action-verify',
        detail,
      },
      schema_version: 1,
    };
    const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
    const candidate = buildMemoryCandidate(attribution, { runId: 'run-04', traceId: 'trace-04' });

    assert.equal(candidate.promotion_status, 'blocked');
    assert.equal(candidate.requires_human_review, true);
    assert.match(candidate.promotion_blocker_reason, /(environment|flaky|harness)/);
  }
});

test('JSONL writer appends validated memory candidates', () => {
  const tempDir = tempTraceRoot();
  const outputPath = path.join(tempDir, 'memory_update_candidates.jsonl');

  try {
    const failureEvent = {
      event_id: 'evt-judge-fail',
      event_type: 'judge_result',
      task_id: 'phase-04',
      session_id: 'session-04',
      run_id: 'run-04',
      turn_id: 'turn-04-6',
      stage: 'verify',
      actor: 'codex',
      summary: 'judge fail',
      timestamp: '2026-05-06T12:00:00.000Z',
      ingest_seq: 1,
      writer_seq: 1,
      action_id: 'action-verify',
      source: 'codex',
      payload: {
        judge_name: 'phase-04-verifier',
        result: 'fail',
        artifact_refs: ['docs/example.md'],
        source_action_id: 'action-verify',
        detail: 'spawnSync bash EPERM',
      },
      schema_version: 1,
    };
    const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
    const candidate = buildMemoryCandidate(attribution, { runId: 'run-04', traceId: 'trace-04' });

    const result = writeMemoryCandidatesJsonl(outputPath, [candidate], { append: false });
    const lines = fs.readFileSync(result.outputPath, 'utf8').trim().split(/\r?\n/);
    assert.equal(result.count, 1);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).candidate_id, candidate.candidate_id);
  } finally {
    cleanup(tempDir);
  }
});
