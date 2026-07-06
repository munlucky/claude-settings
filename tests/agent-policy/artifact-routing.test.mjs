import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

test('artifact routing separates source-owned and runtime-owned outputs', async () => {
  const guideline = await readRoot('docs', 'public', 'guidelines', 'artifact-routing-policy.md');
  const schema = await readRoot('schemas', 'artifact-routing.schema.yaml');
  const repositoryLayout = await readRoot('docs', 'public', 'repository-layout.md');

  assert.match(guideline, /source artifacts/);
  assert.match(guideline, /runtime artifacts/);
  assert.match(guideline, /\.claude\/\*\* durable source/);
  assert.match(schema, /responseMode/);
  assert.match(schema, /runtime_artifact/);
  assert.match(repositoryLayout, /artifact-routing-policy\.md/);
});
