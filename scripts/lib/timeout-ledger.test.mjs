import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendTimeoutLedgerRecord,
  buildTimeoutLedgerRecord,
  recordTimeoutDecision,
  stableCommandFingerprint,
  timeoutPolicyFor,
} from './timeout-ledger.mjs';

function tempLedger() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timeout-ledger-')), 'logs', 'timeout-ledger.jsonl');
}

test('timeout ledger validates and appends Windows-safe JSONL records', () => {
  const ledgerPath = tempLedger();
  const record = buildTimeoutLedgerRecord({
    runId: 'run-1',
    phase: 4,
    command: 'node .claude/scripts/check-mcp.sh',
    timeoutMs: 10000,
    class: 'broad_search_timeout',
  });

  appendTimeoutLedgerRecord(ledgerPath, record);

  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).sameRunDecisionResult, 'do_not_retry');
});

test('timeout ledger rejects malformed records', () => {
  assert.throws(() => buildTimeoutLedgerRecord({
    runId: 'run-1',
    phase: 4,
    command: 'verify',
    timeoutMs: 120000,
    class: 'phaseRuntimeParity_timeout',
  }), /blockedVerdictPath/);
});

test('parity timeout route records blocked verdict path and long budget decision', () => {
  const ledgerPath = tempLedger();
  const result = recordTimeoutDecision({
    ledgerPath,
    runId: 'run-1',
    phase: 4,
    command: 'bash .claude/scripts/verify-phase-runtime-parity.sh',
    timeoutMs: 124010,
    class: 'phaseRuntimeParity_timeout',
    blockedVerdictPath: '.claude/verification-verdict-phase04-blocked.json',
    verifierId: 'phaseRuntimeParity',
    runtimeTarget: 'codex',
    referencePlanHash: 'plan-1',
  });

  assert.equal(result.sameRunDecisionResult, 'route_to_long_budget');
  assert.equal(result.record.blockedVerdictPath, '.claude/verification-verdict-phase04-blocked.json');
});

test('same run repeated raw diff timeout stops after bounded retry', () => {
  const ledgerPath = tempLedger();
  const base = {
    ledgerPath,
    runId: 'run-1',
    phase: 4,
    command: 'phase-worker:codex',
    commandFingerprint: stableCommandFingerprint({
      command: 'phase-worker:codex',
      class: 'raw_diff_output_timeout',
      runtimeTarget: 'codex',
    }),
    timeoutMs: 7200000,
    class: 'raw_diff_output_timeout',
    runtimeTarget: 'codex',
  };

  assert.equal(recordTimeoutDecision(base).sameRunDecisionResult, 'bounded_retry');
  assert.equal(recordTimeoutDecision(base).sameRunDecisionResult, 'stop_and_handoff');
});

test('timeout policy maps observed classes to deterministic decisions', () => {
  assert.equal(timeoutPolicyFor('broad_search_timeout').sameRunDecisionResult, 'do_not_retry');
  assert.equal(timeoutPolicyFor('raw_diff_output_timeout').sameRunDecisionResult, 'bounded_retry');
  assert.equal(timeoutPolicyFor('phaseRuntimeParity_timeout').sameRunDecisionResult, 'route_to_long_budget');
  assert.equal(timeoutPolicyFor('codex_upstream_stream_stalled').class, 'upstream_runtime_stall');
});
