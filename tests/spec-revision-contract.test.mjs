import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

test('task done and revision schemas are parseable closed contracts', async () => {
  for (const name of ['task-contract.schema.json', 'done-contract.schema.json', 'spec-revision.schema.json']) {
    const schema = JSON.parse(await readFile(path.join(root, 'schemas', name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});

test('spec and done templates name revision and evidence boundaries', async () => {
  const spec = await readFile(path.join(root, 'templates', 'SPEC.template.yaml'), 'utf8');
  const done = await readFile(path.join(root, 'templates', 'DONE.template.yaml'), 'utf8');

  assert.match(spec, /revision:/);
  assert.match(spec, /revisionReason:/);
  assert.match(spec, /acceptanceCriteria:/);
  assert.match(done, /requiredEvidence:/);
  assert.match(done, /kind: "test"/);
  assert.match(done, /kind: "handoff"/);
});
