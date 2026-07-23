import test from 'node:test';
import assert from 'node:assert/strict';
import { applySupersessions } from '../scripts/kernel/knowledge/supersession.mjs';

test('applySupersessions updates target fact status to superseded and appends log', () => {
  const currentFacts = [
    { id: 'f1', projectId: 'p1', type: 'semantic_fact', statement: 'Old fact', status: 'committed', trustTier: 'verified' },
    { id: 'f2', projectId: 'p1', type: 'semantic_fact', statement: 'New fact', status: 'committed', trustTier: 'verified' },
  ];

  const { updatedFacts, supersessionLogEntries } = applySupersessions({
    currentFacts,
    supersessionProposals: [{ targetId: 'f1', supersedingId: 'f2', reason: 'update' }],
    projectId: 'p1',
  });

  assert.equal(updatedFacts.find((f) => f.id === 'f1').status, 'superseded');
  assert.equal(supersessionLogEntries.length, 1);
  assert.equal(supersessionLogEntries[0].targetId, 'f1');
});
