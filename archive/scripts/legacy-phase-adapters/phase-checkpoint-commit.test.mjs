import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./phase-checkpoint-commit.mjs', import.meta.url));

test('phase checkpoint commit self-test covers NUL pathspec staging for many artifacts', () => {
  const result = spawnSync(process.execPath, [script, 'self-test'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /phase-checkpoint-commit self-test passed/);
});
