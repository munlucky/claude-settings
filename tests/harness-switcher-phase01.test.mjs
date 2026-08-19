import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { mkdir, rm, symlink, writeFile, readFile } from 'node:fs/promises';
import { physicalTargetIdentity, resolveTrackRoots } from '../scripts/switcher/paths.mjs';
import { listProviderProcesses, waitForQuiescence } from '../scripts/switcher/process-guard.mjs';
import { resolveCodexDesktop } from '../scripts/switcher/app-resolver/codex.mjs';
import { resolveAntigravity } from '../scripts/switcher/app-resolver/antigravity.mjs';

test('phase 01 roots keep Relay and Kernel physically distinct', async () => {
  const root = await mkdir(path.join(os.tmpdir(), `switcher-p01-${Date.now()}`), { recursive: true });
  const relay = path.join(root, 'relay'); const kernel = path.join(root, 'kernel');
  const relayRoots = resolveTrackRoots({ track: 'relay', surface: 'codex_cli', relayHome: relay, kernelHome: kernel });
  const kernelRoots = resolveTrackRoots({ track: 'kernel', surface: 'codex_cli', relayHome: relay, kernelHome: kernel });
  assert.notEqual(relayRoots.runtimeHome, kernelRoots.runtimeHome);
  assert.notEqual(relayRoots.providerHome, kernelRoots.providerHome);
  const identity = await physicalTargetIdentity(kernelRoots.providerHome, { protectedRoots: [relayRoots.runtimeHome, relayRoots.providerHome] });
  assert.equal(identity.safe, true);
  assert.equal(identity.sensitiveContentRead, undefined);
});

test('phase 01 physical target identity follows a symlinked parent and refuses it', async (t) => {
  const root = path.join(os.tmpdir(), `switcher-p01-symlink-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  await mkdir(real, { recursive: true });
  try {
    await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    if (process.platform === 'win32' && error.code === 'EPERM') {
      t.skip('Windows symlink/junction creation is unavailable in this account');
      return;
    }
    throw error;
  }
  try {
    const identity = await physicalTargetIdentity(path.join(alias, 'provider'), { protectedRoots: [] });
    assert.equal(identity.safe, false);
    assert.equal(identity.finalResolvedPath, path.join(realpathSync(real), 'provider'));
    assert.deepEqual(identity.parentChainReparse, [alias]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('phase 01 process characterization is metadata-only and injectable', async () => {
  const rows = await listProviderProcesses({ surface: 'codex_desktop', processProvider: async () => [{ pid: 42, name: 'ChatGPT', executable: 'C:\\Codex\\ChatGPT.exe' }] });
  assert.deepEqual(rows, [{ pid: 42, name: 'ChatGPT', executable: 'C:\\Codex\\ChatGPT.exe', sessionId: null, userSid: null }]);
  const quiet = await waitForQuiescence({ surface: 'codex_desktop', processProvider: async () => [], quiescenceMs: 0, timeoutMs: 100, pollMs: 1 });
  assert.equal(quiet.status, 'quiescent');
});

test('macOS process guard detects Codex and Claude app binaries including truncated comm output', async () => {
  const execProvider = async () => ({ stdout: [
    ' 101 /Applications/Codex.app/Contents/MacOS/Codex /Applications/Codex.app/Contents/MacOS/Codex',
    ' 202 /Applications/Claude.app/Contents/MacOS/Claude /Applications/Claude.app/Contents/MacOS/Claude',
    ' 303 /usr/local/bin/codex /usr/local/bin/codex --version',
    ' 404 /Applications/Ch /Applications/ChatGPT.app/Contents/MacOS/ChatGPT --user-data-dir=...',
  ].join('\n') });
  assert.deepEqual((await listProviderProcesses({ surface: 'codex_desktop', platform: 'darwin', execProvider })).map((row) => row.pid), [101, 404]);
  assert.deepEqual((await listProviderProcesses({ surface: 'claude_cli', platform: 'darwin', execProvider })).map((row) => row.pid), [202]);
  await assert.rejects(() => listProviderProcesses({ surface: 'codex_desktop', platform: 'darwin', execProvider: async () => { throw new Error('ps failed'); } }), (error) => error.code === 'process_probe_failed');
});

test('phase 01 app discovery is unpinned and records typed probe gaps', async () => {
  const missingCodex = await resolveCodexDesktop({ candidates: [path.join(os.tmpdir(), 'missing-codex.exe')], commandResolver: async () => null });
  const missingAntigravity = await resolveAntigravity({ candidates: [path.join(os.tmpdir(), 'missing-antigravity.exe')], commandResolver: async () => null });
  assert.ok(['not_found', 'resolved'].includes(missingCodex.status));
  assert.ok(['not_found', 'resolved'].includes(missingAntigravity.status));
  assert.equal(missingCodex.appServerEffectiveHomeProbe, 'not_run');
  if (missingAntigravity.status === 'not_found') assert.match(missingAntigravity.warnings[0], /not resolved/i);
});

test('phase 01 characterization artifacts never serialize raw environment or sensitive contents', async () => {
  const receipt = { schemaVersion: 1, sensitiveContentRead: false, observed: ['path', 'process_identity', 'file_id'], forbidden: ['environment_map', 'auth', 'session', 'cookie', 'token', 'sqlite_content'] };
  const file = path.join(os.tmpdir(), `switcher-receipt-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(receipt));
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /Authorization|access_token|cookie_value|session_body/i);
});
