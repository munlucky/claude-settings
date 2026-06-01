#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFailureAttribution } from './awtl-failure-attribution.mjs';
import { assertFailedTurnCase, buildFailedTurnCase, validateFailedTurnCase, writeFailedTurnCasesJsonl } from './awtl-failed-turn-case.mjs';
import { createPhaseHarnessCaptureSession } from './awtl-harness-capture.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-failed-turn-case-'));
}

test('failed turn cases capture turn provenance and stay raw-free', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-03',
    session_id: 'session-03',
    run_id: 'run-03',
    turn_id: 'turn-03-1',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-03-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'stdout: do not leak',
      stdout: 'hidden stdout',
      stderr: 'hidden stderr',
      prompt: 'hidden prompt',
    },
    schema_version: 1,
  };

  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const failedTurnCase = buildFailedTurnCase(attribution, {
    runId: 'run-03',
    traceId: 'trace-03',
    scope: 'next-run recall',
  });

  assert.equal(failedTurnCase.turn_id, 'turn-03-1');
  assert.equal(failedTurnCase.failure_turn_id, 'turn-03-1');
  assert.deepEqual(failedTurnCase.artifact_refs, ['docs/example.md']);
  assert.deepEqual(failedTurnCase.memory_read_node_ids, []);
  assert.ok(failedTurnCase.evidence_refs.includes('trace:turn:turn-03-1'));
  assert.ok(failedTurnCase.prevention_hint.includes('same artifact set'));
  assert.ok(failedTurnCase.prevention_hint.includes('rerun the failing verifier'));
  assert.equal(JSON.stringify(failedTurnCase).includes('hidden stdout'), false);
  assert.equal(JSON.stringify(failedTurnCase).includes('hidden stderr'), false);
  assert.equal(JSON.stringify(failedTurnCase).includes('hidden prompt'), false);
  assert.equal(validateFailedTurnCase(failedTurnCase).ok, true);
});

test('failed turn case validation rejects unknown fields and mismatched turn provenance', () => {
  const baseCase = {
    schema_version: 1,
    case_id: 'case-01',
    created_at: '2026-05-06T12:00:00.000Z',
    turn_id: 'turn-01',
    failure_turn_id: 'turn-01',
    failure_event_id: 'evt-01',
    artifact_refs: ['docs/example.md'],
    memory_read_node_ids: [],
    prevention_hint: 'rerun the failing verifier',
    applicability: {
      scope: 'next-run recall',
      run_id: 'run-01',
      trace_id: 'trace-01',
      failure_type: 'verification_failure',
      failure_class: 'verification',
      confidence: 0.6,
    },
    evidence_refs: ['trace:event:evt-01'],
  };

  assert.equal(validateFailedTurnCase(baseCase).ok, true);
  assert.equal(validateFailedTurnCase({ ...baseCase, turn_id: 'turn-02' }).ok, false);
  assert.ok(validateFailedTurnCase({ ...baseCase, turn_id: 'turn-02' }).errors.some((error) => error.includes('turn_id and failure_turn_id must match')));
  assert.ok(validateFailedTurnCase({ ...baseCase, extra_field: true }).errors.some((error) => error.includes('extra_field is not allowed')));
});

test('failed turn case JSONL writer appends validated cases', () => {
  const temp = tempDir();
  const outputPath = path.join(temp, 'failed_turn_cases.jsonl');

  try {
    const caseValue = assertFailedTurnCase({
      schema_version: 1,
      case_id: 'case-02',
      created_at: '2026-05-06T12:00:00.000Z',
      turn_id: 'turn-02',
      failure_turn_id: 'turn-02',
      failure_event_id: 'evt-02',
      artifact_refs: ['docs/example.md'],
      memory_read_node_ids: ['node-17'],
      prevention_hint: 'rerun the failing verifier',
      applicability: {
        scope: 'next-run recall',
        run_id: 'run-02',
        trace_id: 'trace-02',
        failure_type: 'verification_failure',
        failure_class: 'verification',
        confidence: 0.5,
      },
      evidence_refs: ['trace:event:evt-02'],
    });

    const result = writeFailedTurnCasesJsonl(outputPath, [caseValue], { append: false });
    const lines = fs.readFileSync(result.outputPath, 'utf8').trim().split(/\r?\n/);

    assert.equal(result.count, 1);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).case_id, 'case-02');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('failure analyzer CLI writes candidates and failed-turn cases', async () => {
  const traceId = `phase03-cli-smoke-${randomUUID()}`;
  const runId = 'run-phase03-cli-smoke';
  const sessionId = 'session-phase03-cli-smoke';
  const temp = tempDir();
  const candidateOutput = path.join(temp, 'memory_candidates.jsonl');
  const caseOutput = path.join(temp, 'failed_turn_cases.jsonl');
  const session = createPhaseHarnessCaptureSession({
    traceId,
    runId,
    taskId: 'phase-03',
    sessionId,
    stage: 'execute',
    source: 'phase03-cli-test',
  });

  try {
    session.beginTurn({ phaseNum: 3, attemptIndex: 1, turnId: 'turn-03-cli-1' });
    await session.recordActionCompleted({
      spanId: 'span-worker',
      actionId: 'action-edit',
      actionName: 'edit',
      actionResult: 'changed files',
      exitCode: 0,
    });
    await session.recordMemoryRead({
      spanId: 'span-worker',
      actionId: 'action-memory',
      nodeIds: ['node-17'],
      scope: 'execute',
      resultCount: 1,
    });
    await session.recordJudgeResult({
      spanId: 'span-verify',
      actionId: 'action-edit',
      judgeName: 'phase-03-verifier',
      result: 'fail',
      artifactRefs: ['docs/example.md'],
      detail: 'failure without raw trace leak',
    });

    const summary = execFileSync(process.execPath, [
      '.claude/scripts/awtl-failure-analyzer.mjs',
      'analyze',
      '--trace-id',
      traceId,
      '--run-id',
      runId,
      '--task-id',
      'phase-03',
      '--session-id',
      sessionId,
      '--output',
      candidateOutput,
      '--failed-turn-cases-output',
      caseOutput,
      '--summary',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    const parsedSummary = JSON.parse(summary);
    const candidate = JSON.parse(fs.readFileSync(candidateOutput, 'utf8').trim());
    const failedTurnCase = JSON.parse(fs.readFileSync(caseOutput, 'utf8').trim());

    assert.equal(parsedSummary.candidateCount, 1);
    assert.equal(parsedSummary.failedTurnCaseCount, 1);
    assert.equal(candidate.failure_turn_id, 'turn-03-cli-1');
    assert.equal(failedTurnCase.turn_id, 'turn-03-cli-1');
    assert.equal(JSON.stringify(failedTurnCase).includes('raw trace'), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(path.resolve('.claude/traces', traceId), { recursive: true, force: true });
  }
});
