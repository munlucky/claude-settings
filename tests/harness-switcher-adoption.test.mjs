import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { buildLivePreflight, adoptLive, LIVE_APPROVAL_TOKEN } from '../scripts/switcher/adoption.mjs';
test('phase 06 preflight is non-mutating and excludes sensitive content', async () => {
  const result = await buildLivePreflight({ sourceRoot: process.cwd(), processProvider: async () => [] });
  assert.equal(result.approvalRequired, true); assert.equal(result.liveMutationCount, 0); assert.equal(result.sensitiveContentRead, false); assert.ok(result.targets.length >= 5);
});
test('phase 06 adoption refuses without explicit approval token', async () => {
  const result = await adoptLive({ sourceRoot: process.cwd(), approved: false, approvalToken: '', processProvider: async () => [] });
  assert.equal(result.status, 'operator_approval_missing'); assert.equal(result.liveMutationCount, 0);
  assert.equal(LIVE_APPROVAL_TOKEN, 'APPROVE_LIVE_HARNESS_SWITCHER');
});

test('phase 06 adoption refuses a symlinked custom Kernel home before any install', async () => {
  const root = await mkdir(path.join(os.tmpdir(), `switcher-adopt-symlink-${Date.now()}`), { recursive: true });
  const realHome = path.join(root, 'kernel-real');
  const aliasHome = path.join(root, 'kernel-alias');
  await mkdir(realHome, { recursive: true });
  try {
    await symlink(realHome, aliasHome, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    if (process.platform === 'win32' && error.code === 'EPERM') return;
    throw error;
  }
  try {
    const preflight = await buildLivePreflight({ sourceRoot: process.cwd(), kernelHome: aliasHome, processProvider: async () => [] });
    assert.equal(preflight.kernelHomeIdentity.safe, false);
    const result = await adoptLive({ sourceRoot: process.cwd(), kernelHome: aliasHome, approved: true, approvalToken: LIVE_APPROVAL_TOKEN, processProvider: async () => [] });
    assert.equal(result.status, 'unsafe_target');
    assert.equal(result.liveMutationCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
