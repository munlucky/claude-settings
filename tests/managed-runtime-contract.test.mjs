import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import os from 'node:os';

import { resolveRuntimeNode } from '../scripts/lib/moonshot-runtime-resolver.mjs';

test('managed runtime launcher execution contract', () => {
  const homeDir = path.join(os.tmpdir(), `dummy-home-exec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const currentDir = path.join(homeDir, 'runtime', 'current');
  const binDir = path.join(currentDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  
  const nodeBinary = process.platform === 'win32'
    ? path.join(currentDir, 'node.exe')
    : path.join(binDir, 'node');

  // Copy actual process.execPath to mimic the node binary
  fs.copyFileSync(process.execPath, nodeBinary);
  if (process.platform !== 'win32') {
    fs.chmodSync(nodeBinary, 0o755);
  }

  // Calculate hash of binary file
  const binaryContent = fs.readFileSync(nodeBinary);
  const checksum = createHash('sha256').update(binaryContent).digest('hex');

  // Create mock manifest
  const manifestPath = path.join(currentDir, 'runtime-manifest.json');
  const manifest = {
    schemaVersion: 1,
    platform: process.platform,
    arch: process.arch,
    version: process.version.replace(/^v/, ''),
    checksum: checksum
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = resolveRuntimeNode({ env: {}, homeDir, platform: process.platform, arch: process.arch });
  assert.equal(result.execPath, nodeBinary);
  
  // Test executing the resolved node binary
  const spawnResult = spawnSync(nodeBinary, ['-v'], { encoding: 'utf8' });
  assert.equal(spawnResult.stdout.trim(), process.version);

  // Cleanup
  fs.rmSync(homeDir, { recursive: true, force: true });
});
