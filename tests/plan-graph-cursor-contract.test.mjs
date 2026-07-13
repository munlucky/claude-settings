import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePlanGraph } from '../scripts/lib/plan-graph.mjs';

test('optional vertical slices validate inside the phase write set', () => {
  const graph = {
    schemaVersion: 1,
    planId: 'cursor-plan',
    phases: [{
      id: 'P03', doc: '03-execution-cursor.md', ownedPaths: ['scripts/**'],
      slices: [{ id: 'S1', objective: 'implement cursor', requiredReads: [], ownedPaths: ['scripts/lib/execution-cursor.mjs'], procedure: 'tdd', evidence: { command: 'node --test', passSignal: { exitCode: 0 }, path: 'evidence.json' } }],
    }],
  };
  assert.equal(validatePlanGraph(graph).status, 'pass');
  graph.phases[0].slices.push({ ...graph.phases[0].slices[0] });
  assert.equal(validatePlanGraph(graph).status, 'blocked');
});

test('slice write sets cannot broaden a narrow phase write set', () => {
  const graph = {
    schemaVersion: 1, planId: 'inverse-broadening',
    phases: [{
      id: 'P03', doc: '03.md', ownedPaths: ['scripts/lib/execution-cursor.mjs'],
      slices: [{ id: 'S1', objective: 'bad broadening', ownedPaths: ['scripts/**'], procedure: 'run', evidence: { command: 'x', passSignal: { exitCode: 0 }, path: 'x.json' } }],
    }],
  };
  const result = validatePlanGraph(graph);
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((finding) => finding.type === 'slice_write_set_outside_phase'));
});
