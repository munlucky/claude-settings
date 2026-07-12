import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Codex profile template has exactly one context guard pair and no selected model', async () => {
  const text = await readFile('package/profile-templates/codex/.codex/config.toml', 'utf8');
  assert.equal((text.match(/^model_context_window\s*=\s*272000\s*$/gm) || []).length, 1);
  assert.equal((text.match(/^model_auto_compact_token_limit\s*=\s*240000\s*$/gm) || []).length, 1);
  assert.equal(/^model\s*=|^model_provider\s*=/m.test(text), false);
});
