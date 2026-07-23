import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCandidateToCanonicalRecord } from '../scripts/kernel/knowledge/canonical-record-mapper.mjs';

test('mapCandidateToCanonicalRecord maps all supported typed candidates cleanly', () => {
  const candidate = {
    proposedType: 'tacit_practice',
    statement: 'Run tests before commit.',
    scope: ['scripts/**'],
  };

  const record = mapCandidateToCanonicalRecord(candidate, { runId: 'run-1', projectId: 'test-proj', revision: 2 });
  assert.equal(record.type, 'tacit_practice');
  assert.equal(record.status, 'committed');
  assert.equal(record.trustTier, 'verified');
  assert.equal(record.revision, 2);
  assert.equal(record.practiceJson.statement, 'Run tests before commit.');
});
