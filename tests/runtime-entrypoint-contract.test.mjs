import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { readFile } from 'node:fs/promises';

test('codex-mcp-singleton resolves @moonshot-node token to process.execPath', () => {
  const result = spawnSync(process.execPath, [
    'scripts/codex-mcp-singleton.mjs',
    'test-mcp',
    '--',
    '@moonshot-node',
    '-e',
    'console.log(process.execPath)'
  ], {
    encoding: 'utf8'
  });
  
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), process.execPath);
});

test('Codex profile template uses @moonshot-node instead of direct node for wrappers', async () => {
  const text = await readFile('package/profile-templates/codex/.codex/config.toml', 'utf8');
  assert.ok(!text.includes('"--", "node", "<MOONSHOT_RELAY_HOME>'));
  assert.ok(text.includes('"--", "@moonshot-node", "<MOONSHOT_RELAY_HOME>'));
});
