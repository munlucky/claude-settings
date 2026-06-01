import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluatePointerInvariant,
  terminalPhaseNumber,
  workflowStateClass,
} from './harness-state-invariants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '..', 'tests', 'fixtures', 'scripts', 'harness-state-invariants');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, `${name}.json`), 'utf8'));
}

test('classifies prepared/running evidence as active and terminal closeout evidence as terminal', () => {
  assert.equal(workflowStateClass(readFixture('active_prepared_valid').workflowState), 'active');
  assert.equal(workflowStateClass(readFixture('active_running_valid').workflowState), 'active');
  assert.equal(workflowStateClass(readFixture('terminal_completed_next_active_valid').workflowState), 'terminal');
  assert.equal(workflowStateClass(readFixture('terminal_superseded_valid').workflowState), 'terminal');
  assert.equal(workflowStateClass(readFixture('terminal_failed_valid').workflowState), 'terminal');
});

test('terminal attempt outcome overrides active status vocabulary', () => {
  const result = evaluatePointerInvariant({
    phaseStatus: { activePhaseNumber: 3 },
    workflowState: {
      status: 'active',
      activeExecutionStatus: 'active',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      phase: { number: 2 },
      completedPhaseNumber: 2,
    },
  });

  assert.equal(workflowStateClass({
    status: 'active',
    completionStatus: 'blocked',
    attemptOutcome: 'blocked',
  }), 'terminal');
  assert.equal(result.ok, true);
  assert.equal(result.stateClass, 'terminal');
  assert.equal(result.workflowPhaseNumber, 2);
  assert.equal(result.terminalPhaseNumber, 2);
});

test('active prepared/running workflow phase must match phase-status active pointer', () => {
  assert.equal(evaluatePointerInvariant(readFixture('active_prepared_valid')).ok, true);
  assert.equal(evaluatePointerInvariant(readFixture('active_running_valid')).ok, true);

  const mismatch = evaluatePointerInvariant(readFixture('active_running_stale_invalid'));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'active_pointer_mismatch');
});

test('terminal completed closeout remains valid after active pointer advances', () => {
  const result = evaluatePointerInvariant(readFixture('terminal_completed_next_active_valid'));
  assert.equal(result.ok, true);
  assert.equal(result.workflowPhaseNumber, 2);
  assert.equal(result.terminalPhaseNumber, 2);
  assert.equal(result.activePhaseNumber, 3);
});

test('terminal evidence requires structured phase identity', () => {
  const missing = evaluatePointerInvariant(readFixture('terminal_completed_missing_identity_invalid'));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'terminal_phase_identity_missing_or_mismatch');

  const markdownOnlyBlocker = evaluatePointerInvariant(readFixture('terminal_blocker_markdown_only_invalid'));
  assert.equal(markdownOnlyBlocker.ok, false);
  assert.equal(markdownOnlyBlocker.code, 'terminal_phase_identity_missing_or_mismatch');
});

test('terminal superseded, failed, and blocker states validate against structured terminal phase identity', () => {
  assert.equal(evaluatePointerInvariant(readFixture('terminal_superseded_valid')).ok, true);
  assert.equal(evaluatePointerInvariant(readFixture('terminal_failed_valid')).ok, true);
  assert.equal(evaluatePointerInvariant(readFixture('terminal_blocker_valid')).ok, true);

  const unrelated = evaluatePointerInvariant(readFixture('terminal_superseded_unrelated_phase_invalid'));
  assert.equal(unrelated.ok, false);
  assert.equal(unrelated.code, 'terminal_phase_identity_missing_or_mismatch');
});

test('completedPhaseNumber and terminal lifecycle event phaseNumber are accepted sources', () => {
  assert.equal(terminalPhaseNumber(readFixture('terminal_completed_next_active_valid').workflowState), 2);
  assert.equal(terminalPhaseNumber(readFixture('terminal_failed_valid').workflowState), 2);
});
