#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFailureAttribution, buildSummarizerInput } from './awtl-failure-attribution.mjs';
import { buildMemoryCandidate } from './awtl-memory-candidate.mjs';
import { assessReplayProbeManifest, buildReplayProbeManifest } from './awtl-replay-probes.mjs';
import { buildCompactFact, buildPromotionOutput, evaluatePromotionGate, promoteMemoryCandidate, readCandidateFromJsonText } from './awtl-memory-promotion.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-memory-promotion-'));
}

test('replay probe manifests block promotion when the regression probe worsens', () => {
  const manifest = buildReplayProbeManifest({
    candidate_id: 'candidate-01',
    run_id: 'run-01',
    trace_id: 'trace-01',
    easy: { status: 'passed', detail: 'easy replay passes' },
    hard: { status: 'passed', detail: 'hard replay passes' },
    regression: { status: 'worsened', detail: 'regression got worse after the change', regression_delta: 0.2 },
  });

  const assessment = assessReplayProbeManifest(manifest);

  assert.equal(assessment.ok, false);
  assert.equal(assessment.status, 'blocked');
  assert.equal(assessment.regression_worsened, true);
  assert.ok(assessment.blocking_reasons.some((reason) => reason.includes('regression')));
});

test('promotion gate blocks incomplete candidates unless replay evidence or approval is present', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-05',
    session_id: 'session-05',
    run_id: 'run-05',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-05-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'verification mismatch',
    },
    schema_version: 1,
  };
  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const candidate = buildMemoryCandidate(attribution, { runId: 'run-05', traceId: 'trace-05' });

  const gate = evaluatePromotionGate({ ...candidate, promotion_status: 'needs_more_evidence', requires_human_review: true }, {
    memoryGraphStatus: 'available',
  });

  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((reason) => reason.includes('replay or human approval is required')));
});

test('compact promotion facts carry provenance tags and omit raw trace payloads', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-05',
    session_id: 'session-05',
    run_id: 'run-05',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-05-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'verification mismatch',
    },
    schema_version: 1,
  };
  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const candidate = buildMemoryCandidate(attribution, { runId: 'run-05', traceId: 'trace-05' });
  const fact = buildCompactFact(candidate, {
    projectId: 'claude-settings',
    runId: 'run-05',
    candidateId: candidate.candidate_id,
    validatedBy: 'replay',
  });

  assert.deepEqual(fact.tags, [
    'project:claude-settings',
    'source:moonshot',
    'origin:awtl',
    `origin_run:${candidate.run_id}`,
    `origin_candidate:${candidate.candidate_id}`,
    'validated_by:replay',
  ]);
  assert.equal(JSON.stringify(fact).includes('raw trace'), false);
});

test('imported-only, flaky, and environment candidates remain blocked', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-05',
    session_id: 'session-05',
    run_id: 'run-05',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-05-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'spawnSync bash EPERM',
    },
    schema_version: 1,
  };
  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const blockedCandidate = buildMemoryCandidate(attribution, { runId: 'run-05', traceId: 'trace-05' });
  const importedOnlyCandidate = {
    ...blockedCandidate,
    promotion_status: 'needs_more_evidence',
    proposed_memory: {
      ...blockedCandidate.proposed_memory,
      tags: [...blockedCandidate.proposed_memory.tags, 'imported-only'],
    },
  };

  const importedGate = evaluatePromotionGate(importedOnlyCandidate, {
    approval: 'approved',
    replayManifest: buildReplayProbeManifest({
      candidate_id: importedOnlyCandidate.candidate_id,
      run_id: importedOnlyCandidate.run_id,
      trace_id: importedOnlyCandidate.trace_id,
      easy: { status: 'passed' },
      hard: { status: 'passed' },
      regression: { status: 'passed' },
    }),
  });

  assert.equal(importedGate.ok, false);
  assert.ok(importedGate.reasons.some((reason) => reason.includes('imported-only')));
  assert.equal(blockedCandidate.promotion_status, 'blocked');
  assert.equal(blockedCandidate.requires_human_review, true);
});

test('MemoryGraph unavailable reports a blocked promotion without blocking unrelated workflow', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-05',
    session_id: 'session-05',
    run_id: 'run-05',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-05-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'verification mismatch',
    },
    schema_version: 1,
  };
  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const candidate = buildMemoryCandidate(attribution, { runId: 'run-05', traceId: 'trace-05' });
  const promotion = promoteMemoryCandidate(candidate, {
    approval: 'approved',
    memoryGraphStatus: 'unavailable',
    replayManifest: buildReplayProbeManifest({
      candidate_id: candidate.candidate_id,
      run_id: candidate.run_id,
      trace_id: candidate.trace_id,
      easy: { status: 'passed' },
      hard: { status: 'passed' },
      regression: { status: 'passed' },
    }),
  });

  assert.equal(promotion.status, 'blocked');
  assert.equal(promotion.memory_graph.status, 'unavailable');
  assert.equal(promotion.memory_graph.unrelated_workflow_blocked, false);
  assert.equal(promotion.raw_trace_included, false);
});

test('candidate JSONL lines are parsed from the final line when promotion input is streamed', () => {
  const candidate = {
    schema_version: 1,
    candidate_id: 'candidate-jsonl',
    created_at: '2026-05-06T12:00:00.000Z',
    run_id: 'run-05',
    trace_id: 'trace-05',
    failure_event_id: 'evt-05',
    source_action_ids: ['action-verify'],
    failure_type: 'verification_failure',
    failure_class: 'verification',
    root_cause_summary: 'summary',
    proposed_memory: { summary: 'summary', facts: ['fact'], tags: ['tag'] },
    scope: { run_id: 'run-05', trace_id: 'trace-05', failure_event_id: 'evt-05', artifact_refs: ['docs/example.md'] },
    evidence_refs: ['trace:event:evt-05'],
    verification_probe_candidate: { command: 'node --test', artifact_refs: ['docs/example.md'], source_action_ids: ['action-verify'] },
    promotion_status: 'needs_more_evidence',
    promotion_tags: ['tag'],
    confidence: 0.6,
    requires_human_review: true,
  };
  const streamed = `${JSON.stringify({ ignored: true })}\n${JSON.stringify(candidate)}\n`;
  const parsed = readCandidateFromJsonText(streamed);

  assert.equal(parsed.candidate_id, candidate.candidate_id);
});

test('buildPromotionOutput preserves compact provenance data and omits raw trace details', () => {
  const failureEvent = {
    event_id: 'evt-judge-fail',
    event_type: 'judge_result',
    task_id: 'phase-05',
    session_id: 'session-05',
    run_id: 'run-05',
    stage: 'verify',
    actor: 'codex',
    summary: 'judge fail',
    timestamp: '2026-05-06T12:00:00.000Z',
    ingest_seq: 1,
    writer_seq: 1,
    action_id: 'action-verify',
    source: 'codex',
    payload: {
      judge_name: 'phase-05-verifier',
      result: 'fail',
      artifact_refs: ['docs/example.md'],
      source_action_id: 'action-verify',
      detail: 'verification mismatch',
    },
    schema_version: 1,
  };
  const attribution = buildFailureAttribution([failureEvent], failureEvent, { repoRoot: process.cwd() });
  const candidate = buildMemoryCandidate(attribution, { runId: 'run-05', traceId: 'trace-05' });
  const output = buildPromotionOutput(candidate, {
    approval: 'approved',
    validatedBy: 'replay',
    projectId: 'claude-settings',
    runId: candidate.run_id,
    candidateId: candidate.candidate_id,
    replayManifest: buildReplayProbeManifest({
      candidate_id: candidate.candidate_id,
      run_id: candidate.run_id,
      trace_id: candidate.trace_id,
      easy: { status: 'passed' },
      hard: { status: 'passed' },
      regression: { status: 'passed' },
    }),
  });

  assert.equal(output.raw_trace_included, false);
  assert.equal(output.compact_fact.tags.includes('validated_by:replay'), true);
  assert.equal(JSON.stringify(output).includes('raw trace'), false);
});
