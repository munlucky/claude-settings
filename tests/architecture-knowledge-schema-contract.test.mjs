import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const schemaFiles = [
  'applicable-knowledge-slice.schema.json',
  'architecture-contract-slice.schema.json',
  'architecture-handoff.schema.json',
  'architecture-feedback.schema.json',
  'kg-relation-vocabulary.schema.json',
];

const forbiddenRawFields = [
  'rawGraph',
  'rawOntology',
  'rawMemoryGraph',
  'transcriptBody',
  'runtimeLogBody',
  'browserScrapeBody',
  'secret',
];

const requiredStatuses = ['ready', 'degraded', 'blocked', 'failed'];
const requiredSeverities = ['info', 'warning', 'blocking', 'critical'];
const requiredRelations = [
  'requires',
  'has_scenario',
  'derives_asr',
  'constrained_by',
  'decides',
  'supersedes',
  'conflicts_with',
  'applies_to',
  'implemented_by',
  'owns_path',
  'read_only_path',
  'staged_path',
  'enforced_by',
  'verified_by',
  'produces_evidence',
  'consults_anchor',
  'handoff_requires',
];

const requiredEntityKinds = [
  'Requirement',
  'Scenario',
  'BehaviorScenario',
  'ASR',
  'QualityScenario',
  'ArchitectureDecision',
  'Constraint',
  'EnforcementRule',
  'Component',
  'Container',
  'CodePath',
  'VerificationSignal',
  'Evidence',
  'KnowledgeAnchor',
  'HandoffContract',
];

const readSchema = async (file) => JSON.parse(
  await readFile(fromRoot('schemas', 'architecture', file), 'utf8'),
);

const collectEnums = (node, enums = []) => {
  if (!node || typeof node !== 'object') return enums;
  if (Array.isArray(node.enum)) enums.push(node.enum);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectEnums(item, enums);
    } else {
      collectEnums(value, enums);
    }
  }
  return enums;
};

const collectRequiredSets = (node, requiredSets = []) => {
  if (!node || typeof node !== 'object') return requiredSets;
  if (Array.isArray(node.required)) requiredSets.push(node.required);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectRequiredSets(item, requiredSets);
    } else {
      collectRequiredSets(value, requiredSets);
    }
  }
  return requiredSets;
};

const hasEnumContaining = (schema, values) => (
  collectEnums(schema).some((candidate) => values.every((value) => candidate.includes(value)))
);

test('architecture knowledge binding schemas are present and parseable', async () => {
  for (const file of schemaFiles) {
    const schema = await readSchema(file);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.match(schema.$id, /schemas\/architecture\//);
    assert.equal(schema.type, 'object');
    assert.ok(Array.isArray(schema.required), `${file} must declare required fields`);
  }
});

test('knowledge binding artifact schemas freeze status and severity vocabulary', async () => {
  for (const file of schemaFiles.filter((name) => name !== 'kg-relation-vocabulary.schema.json')) {
    const schema = await readSchema(file);
    assert.equal(hasEnumContaining(schema, requiredStatuses), true, `${file} must expose status vocabulary`);
    assert.equal(hasEnumContaining(schema, requiredSeverities), true, `${file} must expose severity vocabulary`);
  }
});

test('knowledge binding schemas explicitly forbid unsafe raw payload field names', async () => {
  for (const file of schemaFiles.filter((name) => name !== 'kg-relation-vocabulary.schema.json')) {
    const schema = await readSchema(file);
    const requiredSets = collectRequiredSets(schema);

    for (const field of forbiddenRawFields) {
      assert.equal(
        requiredSets.some((candidate) => candidate.includes(field)),
        true,
        `${file} should explicitly reject ${field}`,
      );
      assert.equal(
        JSON.stringify(schema.properties ?? {}).includes(`"${field}"`),
        false,
        `${file} must not define ${field} as an allowed property`,
      );
    }
  }
});

test('kg relation vocabulary covers architecture contract binding relations and entity kinds', async () => {
  const schema = await readSchema('kg-relation-vocabulary.schema.json');
  const relationEnum = schema.$defs.relation.enum;
  const entityKindEnum = schema.$defs.entityKind.enum;

  for (const relation of requiredRelations) {
    assert.ok(relationEnum.includes(relation), `missing relation: ${relation}`);
  }
  for (const entityKind of requiredEntityKinds) {
    assert.ok(entityKindEnum.includes(entityKind), `missing entity kind: ${entityKind}`);
  }
});

test('applicable knowledge slice groups selected knowledge without raw records', async () => {
  const schema = await readSchema('applicable-knowledge-slice.schema.json');
  const selected = schema.properties.selected;

  assert.deepEqual(Object.keys(selected.properties).sort(), [
    'kgRelations',
    'knowledgeAnchors',
    'ontologyConstraints',
    'policyAnchors',
    'semanticFacts',
  ].sort());
  assert.equal(JSON.stringify(schema).includes('rawMemoryGraph'), true);
});
