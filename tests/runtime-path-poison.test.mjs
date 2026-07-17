import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import os from 'node:os';
import { createHash } from 'node:crypto';

test('launcher bypasses poisoned PATH to run bundled Node', () => {
  const homeDir = path.join(os.tmpdir(), `dummy-home-poison-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const currentDir = path.join(homeDir, 'runtime', 'current');
  const binDir = path.join(currentDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  // Copy actual process.execPath to mimic the node binary
  const nodeBinary = process.platform === 'win32'
    ? path.join(currentDir, 'node.exe')
    : path.join(binDir, 'node');
  fs.copyFileSync(process.execPath, nodeBinary);
  if (process.platform !== 'win32') {
    fs.chmodSync(nodeBinary, 0o755);
  }

  // Calculate hash
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

  // Set up poisoned PATH
  const tempDir = path.join(os.tmpdir(), `poison-path-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  const poisonFile = process.platform === 'win32' ? 'node.cmd' : 'node';
  const poisonPath = path.join(tempDir, poisonFile);
  const poisonContent = process.platform === 'win32'
    ? `@echo off\necho poisoned_node\nexit 1\n`
    : `#!/bin/sh\necho poisoned_node\nexit 1\n`;
  fs.writeFileSync(poisonPath, poisonContent);
  if (process.platform !== 'win32') {
    fs.chmodSync(poisonPath, 0o755);
  }
  
  const newPath = tempDir + path.delimiter + process.env.PATH;
  const env = {
    ...process.env,
    PATH: newPath,
    MOONSHOT_RELAY_HOME: homeDir,
    MOONSHOT_RELAY_SYSTEM_NODE_FALLBACK: '1'
  };
  
  const launcher = process.platform === 'win32'
    ? path.resolve('bin/moonshot-node.cmd')
    : path.resolve('bin/moonshot-node');
    
  const result = spawnSync(launcher, ['-v'], {
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(!result.stdout.includes('poisoned_node'));
  assert.equal(result.stdout.trim(), process.version);
  
  // Cleanup
  fs.rmSync(homeDir, { recursive: true, force: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
});
