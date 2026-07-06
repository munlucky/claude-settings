import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

test('retrieval policy requires current volatile facts to use source-backed evidence', async () => {
  const guideline = await readRoot('docs', 'public', 'guidelines', 'retrieval-and-recency-policy.md');
  const schema = await readRoot('schemas', 'retrieval-evidence.schema.yaml');
  const masterPolicy = await readRoot('docs', 'public', 'guidelines', 'agent-operating-policy.md');

  assert.match(guideline, /current or volatile/i);
  assert.match(guideline, /official sources|official_web/);
  assert.match(guideline, /stale training knowledge/i);
  assert.match(schema, /currentOrVolatile/);
  assert.match(schema, /official_web/);
  assert.match(schema, /model availability/);
  assert.match(masterPolicy, /retrieval-and-recency-policy\.md/);
});

test('durable agent policy rejects provider-specific prompt residue', async () => {
  const masterPolicy = await readRoot('docs', 'public', 'guidelines', 'agent-operating-policy.md');
  const retrieval = await readRoot('docs', 'public', 'guidelines', 'retrieval-and-recency-policy.md');
  const combined = `${masterPolicy}\n${retrieval}`;

  assert.match(combined, /provider-neutral/i);
  assert.match(combined, /Do not place provider-specific model availability/);
  assert.doesNotMatch(combined, /Fable 5|Sonnet 5|Mythos|Claude\.ai artifact storage|places map/);
});
