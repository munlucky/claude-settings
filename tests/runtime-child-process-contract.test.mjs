import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

test('child process tree propagates process.execPath via @moonshot-node', () => {
  const result = spawnSync(process.execPath, [
    'scripts/codex-mcp-singleton.mjs',
    'test-child',
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
