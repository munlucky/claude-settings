#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendReplayScorecardRecord,
  buildReplayScorecardRecord,
  isReplayScorecardExcluded,
  loadReplayScorecardRecords,
  readLatestReplayScorecardRecord,
} from './awtl-replay-scorecard.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-replay-scorecard-'));
}

test('append and read latest replay scorecard decisions by key', () => {
  const temp = tempDir();
  const scorecardPath = path.join(temp, 'replay_scorecard.jsonl');

  try {
    appendReplayScorecardRecord(scorecardPath, buildReplayScorecardRecord({
      case_id: 'case-01',
      candidate_id: 'candidate-01',
      run_id: 'run-01',
      failure_turn_id: 'turn-01',
      status: 'promoted',
      decision: 'promote',
      denial_codes: [],
      applies_to: ['docs/example.md'],
      validated_by: 'replay',
    }));
    appendReplayScorecardRecord(scorecardPath, buildReplayScorecardRecord({
      case_id: 'case-01',
      candidate_id: 'candidate-01',
      run_id: 'run-01',
      failure_turn_id: 'turn-01',
      status: 'stale',
      decision: 'skip',
      denial_codes: ['memorygraph_unavailable'],
      applies_to: ['docs/example.md'],
      validated_by: 'replay',
    }));

    const loaded = loadReplayScorecardRecords(scorecardPath);
    const latest = readLatestReplayScorecardRecord(loaded.records, { case_id: 'case-01' });

    assert.equal(loaded.loaded, true);
    assert.equal(loaded.records.length, 2);
    assert.equal(latest.status, 'stale');
    assert.equal(latest.denial_codes.includes('memorygraph_unavailable'), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('stale and risky scorecard entries are excluded from recall', () => {
  assert.equal(isReplayScorecardExcluded({
    status: 'stale',
    risk_level: 'risky',
  }), true);
  assert.equal(isReplayScorecardExcluded({
    status: 'promoted',
    risk_level: 'low',
  }), false);
});
