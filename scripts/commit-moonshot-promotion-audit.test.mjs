#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditPromotionCandidates } from './commit-moonshot-promotion-audit.mjs';
import { appendReplayScorecardRecord } from './lib/awtl-replay-scorecard.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'commit-promotion-audit-'));
}

function paths(root) {
  return {
    candidatePath: path.join(root, '.claude/cache/memorygraph/memory_update_candidates.jsonl'),
    failedTurnCasePath: path.join(root, '.claude/cache/awtl/failed_turn_cases.jsonl'),
    scorecardPath: path.join(root, '.claude/cache/awtl/replay_scorecard.jsonl'),
  };
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => `${typeof record === 'string' ? record : JSON.stringify(record)}\n`).join(''), 'utf8');
}

function candidate(overrides = {}) {
  const id = overrides.candidate_id ?? overrides.candidateId ?? 'candidate-01';
  return {
    schema_version: 1,
    candidate_id: id,
    created_at: '2026-05-06T12:00:00.000Z',
    run_id: overrides.run_id ?? 'run-01',
    trace_id: overrides.trace_id ?? 'trace-01',
    failure_event_id: overrides.failure_event_id ?? 'evt-01',
    failure_turn_id: overrides.failure_turn_id ?? 'turn-01',
    source_action_ids: ['action-verify'],
    failure_type: overrides.failure_type ?? 'verification_failure',
    failure_class: overrides.failure_class ?? 'verification',
    root_cause_summary: overrides.root_cause_summary ?? 'Verifier failed because the expected contract was stale.',
    proposed_memory: overrides.proposed_memory ?? {
      summary: 'Verifier contract needs fresh evidence before closeout.',
      facts: ['Run the verifier against the active artifact before closeout.'],
      tags: ['source:moonshot', 'project:claude-settings', 'origin:awtl'],
    },
    scope: {
      run_id: overrides.run_id ?? 'run-01',
      trace_id: overrides.trace_id ?? 'trace-01',
      failure_event_id: overrides.failure_event_id ?? 'evt-01',
      failure_turn_id: overrides.failure_turn_id ?? 'turn-01',
      artifact_refs: ['docs/example.md'],
    },
    evidence_refs: ['trace:event:evt-01'],
    verification_probe_candidate: {
      command: 'node --test .claude/scripts/example.test.mjs',
      artifact_refs: ['docs/example.md'],
      source_action_ids: ['action-verify'],
    },
    promotion_status: overrides.promotion_status ?? 'ready_for_review',
    promotion_tags: ['source:moonshot', 'project:claude-settings', 'origin:awtl'],
    confidence: overrides.confidence ?? 0.8,
    requires_human_review: overrides.requires_human_review ?? false,
    ...overrides,
  };
}

test('audit is non-blocking when candidate cache is missing', () => {
  const root = tempDir();
  const p = paths(root);

  const summary = auditPromotionCandidates(p);

  assert.equal(summary.candidateCount, 0);
  assert.equal(summary.closeoutStatus, 'non_blocking');
  assert.equal(summary.counts.blocked, 0);
  assert.ok(summary.warnings.includes('candidate-cache-missing'));
});

test('invalid and raw-trace candidates are blocked without writes', () => {
  const root = tempDir();
  const p = paths(root);
  const rawTraceCandidate = candidate({
    candidate_id: 'candidate-raw',
    proposed_memory: {
      summary: 'raw trace candidate',
      facts: ['raw trace payload should not be promoted'],
      tags: ['source:moonshot', 'project:claude-settings', 'origin:awtl', 'raw-trace'],
    },
  });
  writeJsonl(p.candidatePath, ['{not-json', rawTraceCandidate]);

  let writeCalls = 0;
  const summary = auditPromotionCandidates({
    ...p,
    approval: 'approved',
    replayManifest: {
      candidate_id: 'candidate-raw',
      run_id: 'run-01',
      trace_id: 'trace-01',
      easy: { status: 'passed' },
      hard: { status: 'passed' },
      regression: { status: 'passed' },
    },
    writeVerified: true,
    promotionExecutor: () => {
      writeCalls += 1;
      throw new Error('should not write blocked candidates');
    },
  });

  assert.equal(writeCalls, 0);
  assert.equal(summary.invalidCandidateCount, 1);
  assert.equal(summary.counts.blocked, 2);
  assert.equal(summary.results[0].denialCodes.includes('invalid_candidate'), true);
  assert.equal(summary.results[1].denialCodes.includes('blocked_promotion_tag'), true);
});

test('replay-missing candidate stays in needs_replay and does not write', () => {
  const root = tempDir();
  const p = paths(root);
  writeJsonl(p.candidatePath, [candidate({ candidate_id: 'candidate-needs-replay' })]);

  let writeCalls = 0;
  const summary = auditPromotionCandidates({
    ...p,
    writeVerified: true,
    promotionExecutor: () => {
      writeCalls += 1;
    },
  });

  assert.equal(writeCalls, 0);
  assert.equal(summary.counts.needs_replay, 1);
  assert.equal(summary.results[0].category, 'needs_replay');
});

test('verified replay scorecard candidate writes when write-verified is enabled', () => {
  const root = tempDir();
  const p = paths(root);
  const verified = candidate({ candidate_id: 'candidate-verified' });
  writeJsonl(p.candidatePath, [verified]);
  appendReplayScorecardRecord(p.scorecardPath, {
    candidate_id: verified.candidate_id,
    run_id: verified.run_id,
    trace_id: verified.trace_id,
    failure_turn_id: verified.failure_turn_id,
    status: 'not_requested',
    decision: 'promote',
    validated_by: 'replay',
    replay_status: 'passed',
  });

  let writeCalls = 0;
  const summary = auditPromotionCandidates({
    ...p,
    writeVerified: true,
    promotionExecutor: (inputCandidate) => {
      writeCalls += 1;
      return {
        candidate_id: inputCandidate.candidate_id,
        run_id: inputCandidate.run_id,
        trace_id: inputCandidate.trace_id,
        status: 'promotable',
        provenance: { origin_turn: inputCandidate.failure_turn_id, validated_by: 'replay', last_validated_at: '2026-05-06T12:00:00.000Z' },
        replay: { status: 'passed' },
        compact_fact: { applies_to: ['docs/example.md'], does_not_apply_to: [], facts: ['verified fact'] },
        denial_codes: [],
        memory_graph: { status: 'available', write_status: 'written' },
      };
    },
  });

  assert.equal(writeCalls, 1);
  assert.equal(summary.counts.promotable, 1);
  assert.equal(summary.counts.written, 1);
  assert.equal(summary.results[0].writeStatus, 'written');
});

test('MemoryGraph unavailable remains non-blocking and does not write', () => {
  const root = tempDir();
  const p = paths(root);
  writeJsonl(p.candidatePath, [candidate({ candidate_id: 'candidate-unavailable' })]);

  const summary = auditPromotionCandidates({
    ...p,
    approval: 'approved',
    memoryGraphStatus: 'unavailable',
    writeVerified: true,
    promotionExecutor: () => {
      throw new Error('should not write when MemoryGraph is unavailable');
    },
  });

  assert.equal(summary.closeoutStatus, 'non_blocking');
  assert.equal(summary.counts.memorygraph_unavailable, 1);
  assert.equal(summary.results[0].writeStatus, 'skipped');
});

test('approval-only candidate requires approval before write', () => {
  const root = tempDir();
  const p = paths(root);
  const approvalOnly = candidate({
    candidate_id: 'candidate-approval',
    promotion_status: 'needs_more_evidence',
    requires_human_review: true,
    confidence: 0.55,
  });
  writeJsonl(p.candidatePath, [approvalOnly]);

  let writeCalls = 0;
  const withoutApproval = auditPromotionCandidates({
    ...p,
    writeVerified: true,
    promotionExecutor: () => {
      writeCalls += 1;
    },
  });
  assert.equal(writeCalls, 0);
  assert.equal(withoutApproval.counts.needs_human_approval, 1);

  const withApproval = auditPromotionCandidates({
    ...p,
    approval: 'approved',
    writeVerified: true,
    promotionExecutor: (inputCandidate) => {
      writeCalls += 1;
      return {
        candidate_id: inputCandidate.candidate_id,
        run_id: inputCandidate.run_id,
        trace_id: inputCandidate.trace_id,
        status: 'promotable',
        provenance: { origin_turn: inputCandidate.failure_turn_id, validated_by: 'human_approval', last_validated_at: '2026-05-06T12:00:00.000Z' },
        replay: { status: 'needs_more_evidence' },
        compact_fact: { applies_to: ['docs/example.md'], does_not_apply_to: [], facts: ['approved fact'] },
        denial_codes: [],
        memory_graph: { status: 'available', write_status: 'written' },
      };
    },
  });

  assert.equal(writeCalls, 1);
  assert.equal(withApproval.counts.promotable, 1);
  assert.equal(withApproval.counts.written, 1);
});
