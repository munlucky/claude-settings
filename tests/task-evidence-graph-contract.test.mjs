import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { validateTaskEvidenceGraph } from '../scripts/lib/memory-control-plane-contracts.mjs';

const validGraph = () => ({
  schemaVersion: 1,
  nodes: [
    { id: 'task:1', type: 'Task' },
    { id: 'req:1', type: 'Requirement' },
    { id: 'ac:1', type: 'AcceptanceCriterion' },
    { id: 'cmd:1', type: 'CommandRun' },
    { id: 'test:1', type: 'TestResult' },
    { id: 'memory:1', type: 'MemoryFact', status: 'verified' },
  ],
  edges: [
    { from: 'task:1', to: 'req:1', type: 'HAS_REQUIREMENT' },
    { from: 'req:1', to: 'ac:1', type: 'VERIFIED_BY' },
    { from: 'cmd:1', to: 'test:1', type: 'DERIVED_FROM' },
    { from: 'cmd:1', to: 'memory:1', type: 'DERIVED_FROM' },
  ],
});

test('task evidence graph accepts requirement acceptance and command test provenance', () => {
  const validation = validateTaskEvidenceGraph(validGraph());
  assert.equal(validation.ok, true, validation.violations.join('\n'));
});

test('task evidence graph rejects vague requirements and fake test evidence', () => {
  const graph = validGraph();
  graph.edges = graph.edges.filter((edge) => edge.type !== 'VERIFIED_BY' && edge.to !== 'test:1');
  const validation = validateTaskEvidenceGraph(graph);

  assert.equal(validation.ok, false);
  assert.ok(validation.violations.includes('Requirement req:1 requires AcceptanceCriterion edge or blocker'));
  assert.ok(validation.violations.includes('TestResult test:1 requires CommandRun provenance'));
});

test('task evidence graph rejects edges that use the right relation with the wrong node type', () => {
  const graph = validGraph();
  graph.edges = [
    { from: 'req:1', to: 'task:1', type: 'VERIFIED_BY' },
    { from: 'test:1', to: 'req:1', type: 'DERIVED_FROM' },
    { from: 'memory:1', to: 'req:1', type: 'DERIVED_FROM' },
  ];
  const validation = validateTaskEvidenceGraph(graph);

  assert.equal(validation.ok, false);
  assert.ok(validation.violations.includes('Requirement req:1 requires AcceptanceCriterion edge or blocker'));
  assert.ok(validation.violations.includes('TestResult test:1 requires CommandRun provenance'));
  assert.ok(validation.violations.includes('MemoryFact memory:1 requires evidence provenance'));
});

test('task evidence graph rejects invalid extra edges even when required edges exist', () => {
  const graph = validGraph();
  graph.edges.push(
    { from: 'req:1', to: 'task:1', type: 'VERIFIED_BY' },
    { from: 'test:1', to: 'req:1', type: 'DERIVED_FROM' },
  );
  const validation = validateTaskEvidenceGraph(graph);

  assert.equal(validation.ok, false);
  assert.ok(validation.violations.includes('edge VERIFIED_BY from Requirement to Task is not allowed'));
  assert.ok(validation.violations.includes('edge DERIVED_FROM from TestResult to Requirement is not allowed'));
});

test('task evidence graph schema is parseable', async () => {
  const schema = JSON.parse(await readFile(path.join(process.cwd(), 'schemas', 'task-evidence-graph.schema.json'), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.title, 'Task Evidence Graph');
});
