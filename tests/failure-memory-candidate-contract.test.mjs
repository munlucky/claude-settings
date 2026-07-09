import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { validateFailureMemoryCandidate } from '../scripts/lib/memory-control-plane-contracts.mjs';

const candidate = () => ({
  schemaVersion: 1,
  candidateId: 'failure:setup-gap',
  status: 'candidate',
  failureClass: 'baseline_setup_fail',
  sourceCommand: 'npm test',
  evidenceRefs: ['artifacts/test.log'],
  attemptedFix: 'refresh fixture setup',
  replanDelta: 'rerun with explicit fixture path',
  appliesTo: ['moonshot-relay'],
  doesNotApplyTo: ['external backend selection'],
});

test('failure memory candidate requires command and evidence before review', () => {
  assert.equal(validateFailureMemoryCandidate(candidate()).ok, true);
  const invalid = validateFailureMemoryCandidate({ ...candidate(), evidenceRefs: [] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.violations.includes('evidenceRefs are required'));
});

test('promoted procedural memory requires full promotion gate', () => {
  const invalid = validateFailureMemoryCandidate({ ...candidate(), status: 'promoted' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.violations.includes('promoted failure memory requires full promotion gate'));

  const valid = validateFailureMemoryCandidate({
    ...candidate(),
    status: 'promoted',
    promotionGate: {
      requiresEvidence: true,
      requiresReview: true,
      requiresReplay: true,
      requiresRollbackPlan: true,
      requiresScopeOwner: true,
    },
  });
  assert.equal(valid.ok, true);
});

test('failure memory candidate schema is parseable', async () => {
  const schema = JSON.parse(await readFile(path.join(process.cwd(), 'schemas', 'failure-memory-candidate.schema.json'), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.title, 'Failure Memory Candidate');
});
