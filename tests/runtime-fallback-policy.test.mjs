import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { resolveRuntimeNode } from '../scripts/lib/moonshot-runtime-resolver.mjs';

test('resolver blocks system fallback by default when managed runtime is missing', () => {
  const env = { MOONSHOT_RELAY_SYSTEM_NODE_FALLBACK: '0' };
  const homeDir = 'nonexistent-home';
  
  assert.throws(() => {
    resolveRuntimeNode({ env, homeDir, platform: 'win32', arch: 'x64' });
  }, (err) => {
    return err.code === 'missing_runtime';
  });
});

test('resolver allows system fallback when MOONSHOT_RELAY_SYSTEM_NODE_FALLBACK=1 is set', () => {
  const env = { MOONSHOT_RELAY_SYSTEM_NODE_FALLBACK: '1' };
  const homeDir = 'nonexistent-home';
  
  const result = resolveRuntimeNode({ env, homeDir, platform: process.platform, arch: process.arch });
  assert.equal(result.execPath, process.execPath);
  assert.equal(result.source, 'system_fallback');
});
