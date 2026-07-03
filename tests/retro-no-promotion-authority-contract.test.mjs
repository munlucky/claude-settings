import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

async function listJsonSchemas(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('retro.') && entry.name.endsWith('.schema.json'))
    .map((entry) => path.join(dir, entry.name));
}

test('retro schemas and templates preserve advisory-only promotion authority', async () => {
  const schemas = await listJsonSchemas(path.join(root, 'schemas'));
  assert.ok(schemas.length >= 5);
  for (const schemaPath of schemas) {
    const content = await readFile(schemaPath, 'utf8');
    assert.match(content, /"promotionAuthority"/);
    assert.match(content, /"const": false/);
  }

  for (const template of [
    'templates/retro/DAILY_RETRO.md',
    'templates/retro/IMPROVEMENT_PROPOSAL.md',
    'templates/retro/GITHUB_ISSUE_DRAFT.md',
  ]) {
    assert.match(await readFile(path.join(root, template), 'utf8'), /promotionAuthority=false|Promotion authority: false/);
  }
});
