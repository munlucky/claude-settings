import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveKernelNode, buildRuntimeManifest, sha256File } from '../scripts/kernel/runtime-resolver.mjs';

test('managed Node wins over host fallback and produces checksum when valid', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-runtime-'));
  const p = path.join(h, 'runtime', 'current', process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node'));
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, 'node-mock-content');

  const r = await resolveKernelNode({ runtimeHome: h, fallback: '/host/node', skipExecuteCheck: true });
  assert.equal(r.source, 'managed');
  assert.equal(r.nodePath, p);

  const m = await buildRuntimeManifest({ runtimeHome: h, nodePath: p, platform: process.platform, arch: process.arch });
  assert.match(m.checksum, /^[a-f0-9]{64}$/);
});

test('corrupted checksum or manifest platform mismatch falls back to host', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-runtime-corrupt-'));
  const p = path.join(h, 'runtime', 'current', process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node'));
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, 'node-corrupt-content');

  const manifestPath = path.join(h, 'runtime', 'current', 'runtime-manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      platform: 'invalid-platform',
      arch: 'x64',
      checksum: 'bad-checksum-1234567890123456789012345678901234567890123456789012345678901234',
    })
  );

  const r = await resolveKernelNode({ runtimeHome: h, fallback: '/host/node', skipExecuteCheck: true });
  assert.equal(r.source, 'host-fallback');
  assert.match(r.reason, /platform-mismatch/);
});

test('checksum mismatch in manifest triggers host fallback', async () => {
  const h = await mkdtemp(path.join(os.tmpdir(), 'krn-runtime-chk-'));
  const p = path.join(h, 'runtime', 'current', process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node'));
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, 'node-binary-content');

  const manifestPath = path.join(h, 'runtime', 'current', 'runtime-manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      platform: process.platform,
      arch: process.arch,
      checksum: 'wrong000000000000000000000000000000000000000000000000000000000000000',
    })
  );

  const r = await resolveKernelNode({ runtimeHome: h, fallback: '/host/node', skipExecuteCheck: true });
  assert.equal(r.source, 'host-fallback');
  assert.equal(r.reason, 'checksum-mismatch');
});
