#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPhasePrompt } from '../agent-loop-phase-plan-lib.mjs';
import { appendReplayScorecardRecord, buildReplayScorecardRecord } from './awtl-replay-scorecard.mjs';
import {
  buildFailurePreventionBrief,
  buildFailurePreventionBriefSection,
  formatFailurePreventionBrief,
  loadFailedTurnCases,
  selectFailurePreventionCases,
} from './awtl-failure-prevention-brief.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-failure-prevention-brief-'));
}

function makeCase(overrides = {}) {
  return {
    schema_version: 1,
    case_id: overrides.case_id ?? 'case-01',
    created_at: overrides.created_at ?? '2026-05-06T12:00:00.000Z',
    turn_id: overrides.turn_id ?? 'turn-01',
    failure_turn_id: overrides.failure_turn_id ?? 'turn-01',
    failure_event_id: overrides.failure_event_id ?? 'evt-01',
    artifact_refs: overrides.artifact_refs ?? ['docs/example.md'],
    memory_read_node_ids: overrides.memory_read_node_ids ?? [],
    prevention_hint: overrides.prevention_hint ?? 'For next-run recall, rerun the failing verifier against the same artifact set before promotion.',
    applicability: overrides.applicability ?? {
      scope: 'next-run recall',
      run_id: 'run-01',
      trace_id: 'trace-01',
      failure_type: 'verification_failure',
      failure_class: 'verification',
      confidence: 0.9,
    },
    evidence_refs: overrides.evidence_refs ?? ['trace:event:evt-01'],
  };
}

test('loader and matcher keep unrelated cases out of recall briefs', () => {
  const temp = tempDir();
  const cacheDir = path.join(temp, '.claude', 'cache', 'awtl');
  const cachePath = path.join(cacheDir, 'failed_turn_cases.jsonl');
  const matchingPhaseDoc = path.join(temp, 'docs', 'implementation', 'turn-failure-prevention-harness-2026-05-06', '04-next-run-recall-brief-v1.md');
  const otherPhaseDoc = path.join(temp, 'docs', 'implementation', 'turn-failure-prevention-harness-2026-05-06', '99-unrelated.md');

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, [
      JSON.stringify(makeCase({
        case_id: 'case-match',
        turn_id: 'turn-match',
        failure_turn_id: 'turn-match',
        failure_event_id: 'evt-match',
        artifact_refs: [matchingPhaseDoc, 'docs/example.md'],
        applicability: {
          scope: 'next-run recall',
          run_id: 'run-match',
          trace_id: 'trace-match',
          failure_type: 'verification_failure',
          failure_class: 'verification',
          confidence: 0.9,
        },
        prevention_hint: 'For next-run recall, rerun the failing verifier against the same artifact set before promotion.',
      })),
      JSON.stringify(makeCase({
        case_id: 'case-unrelated',
        turn_id: 'turn-other',
        failure_turn_id: 'turn-other',
        failure_event_id: 'evt-other',
        artifact_refs: [otherPhaseDoc],
        applicability: {
          scope: 'different scope',
          run_id: 'run-other',
          trace_id: 'trace-other',
          failure_type: 'memory_promotion',
          failure_class: 'memory',
          confidence: 0.8,
        },
        prevention_hint: 'This should not appear in the prompt.',
      })),
      '',
    ].join('\n'), 'utf8');

    const loaded = loadFailedTurnCases(cachePath);
    const selected = selectFailurePreventionCases(loaded.cases, {
      scope: 'next-run recall',
      phaseTitle: 'Next Run Recall Brief',
      phaseDocPath: matchingPhaseDoc,
      artifactRefs: [matchingPhaseDoc],
      failureType: 'verification_failure',
      failureClass: 'verification',
    });

    assert.equal(loaded.loaded, true);
    assert.equal(loaded.cases.length, 2);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].case.case_id, 'case-match');
    assert.equal(buildFailurePreventionBriefSection({
      scope: 'next-run recall',
      phaseTitle: 'Next Run Recall Brief',
      phaseDocPath: matchingPhaseDoc,
      artifactRefs: [matchingPhaseDoc],
      failureType: 'verification_failure',
      failureClass: 'verification',
    }, { cachePath }).includes('Failure Prevention Brief'), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('formatter caps the brief at five one-sentence bullets and avoids raw JSON', () => {
  const selected = Array.from({ length: 6 }, (_, index) => ({
    case: makeCase({
      case_id: `case-${index + 1}`,
      turn_id: `turn-${index + 1}`,
      failure_turn_id: `turn-${index + 1}`,
      failure_event_id: `evt-${index + 1}`,
      created_at: `2026-05-06T12:0${index}:00.000Z`,
      artifact_refs: [`docs/example-${index + 1}.md`],
      prevention_hint: `For next-run recall, rerun the failing verifier against docs/example-${index + 1}.md before promotion.`,
    }),
    confidenceLabel: index % 2 === 0 ? 'high-confidence' : 'medium-confidence',
  }));

  const brief = formatFailurePreventionBrief(selected, { scope: 'next-run recall' });
  const bulletLines = brief.split('\n').filter((line) => line.startsWith('- ['));

  assert.equal(brief.startsWith('Failure Prevention Brief'), true);
  assert.equal(bulletLines.length, 5);
  assert.equal(brief.includes('{"'), false);
  assert.ok(bulletLines.every((line) => line.endsWith('.')));
  assert.ok(bulletLines.every((line) => line.split('.').length <= 3));
});

test('buildFailurePreventionBrief is a no-op when the cache is missing', () => {
  const temp = tempDir();
  try {
    const result = buildFailurePreventionBrief({
      scope: 'next-run recall',
      phaseTitle: 'Next Run Recall Brief',
      phaseDocPath: path.join(temp, 'missing.md'),
      artifactRefs: [path.join(temp, 'missing.md')],
    }, {
      cachePath: path.join(temp, '.claude', 'cache', 'awtl', 'failed_turn_cases.jsonl'),
    });

    assert.equal(result.status, 'no-op');
    assert.equal(result.section, '');
    assert.equal(result.selectedCases.length, 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('phase prompt includes matched failure prevention brief without raw JSON', () => {
  const temp = tempDir();
  const cacheDir = path.join(temp, '.claude', 'cache', 'awtl');
  const cachePath = path.join(cacheDir, 'failed_turn_cases.jsonl');
  const phaseDoc = path.join(temp, 'docs', 'implementation', '04-next-run-recall-brief-v1.md');
  const sprintContract = path.join(temp, 'execution', 'SPRINT_CONTRACT.md');
  const qaReport = path.join(temp, 'execution', 'QA_REPORT.md');
  const handoff = path.join(temp, 'execution', 'HANDOFF.md');
  const scorecard = path.join(temp, 'execution', 'SCORECARD.md');
  const worksets = path.join(temp, 'execution', 'WORKSETS.yaml');

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(path.dirname(phaseDoc), { recursive: true });
    fs.writeFileSync(phaseDoc, '# Phase 04\n', 'utf8');
    fs.writeFileSync(cachePath, `${JSON.stringify(makeCase({
      case_id: 'case-match',
      turn_id: 'turn-match',
      failure_turn_id: 'turn-match',
      failure_event_id: 'evt-match',
      artifact_refs: [phaseDoc],
      prevention_hint: 'For next-run recall, rerun the failing verifier against the same artifact set before promotion.',
    }))}\n`, 'utf8');

    const prompt = buildPhasePrompt({
      nextPhase: 4,
      phaseTitle: 'Phase 04: Next Run Recall Brief (v1)',
      planDir: path.join(temp, 'docs', 'implementation'),
      phaseDoc,
      statusFile: path.join(temp, '.claude', 'docs', 'phase-status.yaml'),
      executionRoot: path.join(temp, 'execution'),
      paths: {
        phaseSprintContract: sprintContract,
        phaseQaReport: qaReport,
        phaseHandoff: handoff,
        phaseScorecard: scorecard,
        phaseWorksets: worksets,
      },
      runtime: 'codex',
      targetCompletionScore: '100',
      extraInstructions: '',
      autonomousInstructions: '',
      workspaceRoot: temp,
      verificationRuntimes: 'auto',
    });

    assert.ok(prompt.includes('Failure Prevention Brief'));
    assert.ok(prompt.includes('rerun the failing verifier'));
    assert.equal(prompt.includes('{"'), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('recall selection skips cases marked stale or risky in the replay scorecard', () => {
  const temp = tempDir();
  const cacheDir = path.join(temp, '.claude', 'cache', 'awtl');
  const cachePath = path.join(cacheDir, 'failed_turn_cases.jsonl');
  const scorecardPath = path.join(cacheDir, 'replay_scorecard.jsonl');
  const caseDoc = path.join(temp, 'docs', 'implementation', 'turn-failure-prevention-harness-2026-05-06', '05-verified-memory-promotion-replay-scorecard-v1.md');

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(makeCase({
      case_id: 'case-scorecard',
      turn_id: 'turn-scorecard',
      failure_turn_id: 'turn-scorecard',
      failure_event_id: 'evt-scorecard',
      artifact_refs: [caseDoc],
      applicability: {
        scope: 'next-run recall',
        run_id: 'run-scorecard',
        trace_id: 'trace-scorecard',
        failure_type: 'verification_failure',
        failure_class: 'verification',
        confidence: 0.9,
      },
      prevention_hint: 'For next-run recall, rerun the failing verifier against the same artifact set before promotion.',
    }))}\n`, 'utf8');
    appendReplayScorecardRecord(scorecardPath, buildReplayScorecardRecord({
      case_id: 'case-scorecard',
      candidate_id: 'candidate-scorecard',
      run_id: 'run-scorecard',
      trace_id: 'trace-scorecard',
      failure_turn_id: 'turn-scorecard',
      status: 'risky',
      decision: 'skip',
      denial_codes: ['memorygraph_unavailable'],
      validated_by: 'replay',
    }));

    const selected = selectFailurePreventionCases(loadFailedTurnCases(cachePath).cases, {
      scope: 'next-run recall',
      phaseTitle: 'Memory Promotion Replay Scorecard',
      phaseDocPath: caseDoc,
      artifactRefs: [caseDoc],
      failureType: 'verification_failure',
      failureClass: 'verification',
    }, {
      scorecardPath,
    });

    assert.equal(selected.length, 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
