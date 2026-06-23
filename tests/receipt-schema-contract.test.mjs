import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const schemaNames = [
  'candidate-identity.schema.json',
  'run-receipt.schema.json',
  'review-receipt.schema.json',
  'verification-receipt.schema.json',
  'score-receipt.schema.json',
  'submission-receipt.schema.json',
];

const readSchema = async (name) => JSON.parse(await readFile(path.join(root, 'schemas', name), 'utf8'));

test('candidate identity and receipt schemas are present parseable and closed', async () => {
  for (const name of schemaNames) {
    const schema = await readSchema(name);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});

test('candidate receipts require snake and camel candidate id aliases', async () => {
  for (const name of schemaNames) {
    const schema = await readSchema(name);
    assert.ok(schema.required.includes('candidate_id'), `${name} should require candidate_id`);
    assert.ok(schema.required.includes('candidateId'), `${name} should require candidateId`);
  }
});

test('evidence receipts bind source and environment digests', async () => {
  for (const name of schemaNames.filter((item) => item !== 'candidate-identity.schema.json')) {
    const schema = await readSchema(name);
    assert.ok(schema.required.includes('sourceDigest'), `${name} should require sourceDigest`);
    assert.ok(schema.required.includes('environmentDigest'), `${name} should require environmentDigest`);
  }
});

test('score and submission receipts require policy digest and status gates', async () => {
  const score = await readSchema('score-receipt.schema.json');
  const submission = await readSchema('submission-receipt.schema.json');

  assert.ok(score.required.includes('policyDigest'));
  assert.ok(score.required.includes('hardGates'));
  assert.deepEqual(score.properties.status.enum, ['FULL', 'PARTIAL', 'BLOCKED']);
  assert.ok(submission.required.includes('policyDigest'));
  assert.deepEqual(submission.properties.scoreStatus.enum, ['FULL', 'PARTIAL', 'BLOCKED']);
});

test('verification receipt requires command evidence', async () => {
  const schema = await readSchema('verification-receipt.schema.json');

  assert.ok(schema.required.includes('commands'));
  assert.equal(schema.properties.commands.minItems, 1);
  assert.deepEqual(schema.$defs.commandEvidence.required, ['argv', 'cwd', 'exitCode', 'startedAt', 'endedAt']);
});
