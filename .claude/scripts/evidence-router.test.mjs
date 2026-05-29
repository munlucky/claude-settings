#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EVIDENCE_CLASSES,
  commandMetadata,
  evaluateFixturePrecondition,
  evaluateProductCloseout,
  runAdapterSmoke,
  validateEvidenceClass,
} from './evidence-router.mjs';

test('known evidence classes validate and unknown classes fail with typed error', () => {
  for (const evidenceClass of Object.keys(EVIDENCE_CLASSES)) {
    assert.equal(validateEvidenceClass(evidenceClass).ok, true);
  }
  const invalid = validateEvidenceClass('scorecard_everything');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorCode, 'unknown_evidence_class');
});

test('verifier command metadata must declare explicit evidence class', () => {
  const metadata = commandMetadata({
    name: 'verify-phase-runtime-parity',
    command: 'bash .claude/scripts/verify-phase-runtime-parity.sh',
    evidenceClass: 'adapter_smoke',
  });

  assert.equal(metadata.ok, true);
  assert.equal(metadata.evidenceClass, 'adapter_smoke');
  assert.equal(metadata.evidenceMetadata.canSatisfyProductCloseout, false);
});

test('adapter smoke passes without scorecard and is not product closeout proof', () => {
  const result = runAdapterSmoke({ scorecard: 'disabled' });

  assert.equal(result.ok, true);
  assert.equal(result.evidenceClass, 'adapter_smoke');
  assert.equal(result.scorecardRequired, false);
  assert.equal(result.closeoutEligible, false);
});

test('product closeout fails when AC or SCN evidence is missing', () => {
  const result = evaluateProductCloseout({ acEvidence: 1, scnEvidence: 0, scorecard: 'passed' });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'product_acceptance_missing');
  assert.deepEqual(result.missingEvidence, ['SCN']);
});

test('product closeout requires scorecard even when AC and SCN evidence exist', () => {
  const result = evaluateProductCloseout({ acEvidence: 1, scnEvidence: 1, scorecard: 'missing' });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'product_acceptance_missing');
  assert.equal(result.scorecardRequired, true);
  assert.deepEqual(result.missingEvidence, ['scorecard']);
});

test('product closeout passes only with AC, SCN, and scorecard evidence', () => {
  const result = evaluateProductCloseout({ acEvidence: 1, scnEvidence: 1, scorecard: 'passed' });

  assert.equal(result.ok, true);
  assert.equal(result.closeoutEligible, true);
});

test('missing fixture seed is a precondition failure, not product failure', () => {
  const missing = evaluateFixturePrecondition({ seedPath: path.join(os.tmpdir(), 'missing-fixture-seed.json') });

  assert.equal(missing.ok, false);
  assert.equal(missing.errorCode, 'fixture_precondition_missing');
  assert.equal(missing.evidenceClass, 'fixture_precondition');
});

test('fixture precondition passes when seed exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-router-seed-'));
  const seedPath = path.join(dir, 'seed.json');
  fs.writeFileSync(seedPath, '{}\n', 'utf8');

  const result = evaluateFixturePrecondition({ seedPath });

  assert.equal(result.ok, true);
  assert.equal(result.evidenceClass, 'fixture_precondition');
});
