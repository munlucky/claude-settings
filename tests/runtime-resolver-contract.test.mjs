import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';

import os from 'node:os';

// We import the resolver. Since we're in red phase, we'll design its expected contract here.
import { resolveRuntimeNode } from '../scripts/lib/moonshot-runtime-resolver.mjs';

test('resolver validates manifest against schema', async () => {
  // Verify that resolver can check a manifest structure
  // It should reject invalid fields
  // In the resolver, we can export a helper validateManifest(manifestJson)
  const { validateManifest } = await import('../scripts/lib/moonshot-runtime-resolver.mjs');
  
  const validManifest = {
    schemaVersion: 1,
    platform: 'win32',
    arch: 'x64',
    version: '20.11.1',
    checksum: 'a'.repeat(64)
  };
  
  assert.equal(validateManifest(validManifest), true);
  
  assert.throws(() => {
    validateManifest({
      schemaVersion: 2, // invalid schemaVersion
      platform: 'win32'
    });
  });
});

test('resolver respects MOONSHOT_RELAY_RUNTIME_NODE env override', () => {
  const env = { MOONSHOT_RELAY_RUNTIME_NODE: 'custom/node/path' };
  const result = resolveRuntimeNode({ env, homeDir: 'some/home', platform: 'win32', arch: 'x64' });
  assert.equal(result.execPath, 'custom/node/path');
  assert.equal(result.source, 'env_override');
});

test('resolver resolves path using MOONSHOT_RELAY_HOME runtime current', () => {
  const env = {};
  const homeDir = path.join(os.tmpdir(), `dummy-home-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  
  // Create dummy structure
  const runtimeCurrentDir = path.join(homeDir, 'runtime', 'current');
  const binDir = path.join(runtimeCurrentDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  
  const dummyWinNode = path.join(runtimeCurrentDir, 'node.exe');
  const dummyUnixNode = path.join(binDir, 'node');
  fs.writeFileSync(dummyWinNode, 'dummy');
  fs.writeFileSync(dummyUnixNode, 'dummy');
  
  const winResult = resolveRuntimeNode({ env, homeDir, platform: 'win32', arch: 'x64' });
  assert.equal(winResult.execPath, dummyWinNode);
  assert.equal(winResult.source, 'managed_runtime');
  
  const unixResult = resolveRuntimeNode({ env, homeDir, platform: 'linux', arch: 'x64' });
  assert.equal(unixResult.execPath, dummyUnixNode);
  assert.equal(unixResult.source, 'managed_runtime');
  
  // Cleanup
  fs.rmSync(homeDir, { recursive: true, force: true });
});

test('resolver throws missing_runtime when current does not exist and fallback disallowed', () => {
  const env = {};
  const homeDir = 'nonexistent-home';
  
  assert.throws(() => {
    resolveRuntimeNode({ env, homeDir, platform: 'win32', arch: 'x64' });
  }, (err) => {
    return err.code === 'missing_runtime';
  });
});
