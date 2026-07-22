import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolveCodexDesktop } from '../scripts/switcher/app-resolver/codex.mjs';
import { resolveAntigravity } from '../scripts/switcher/app-resolver/antigravity.mjs';
import { buildCodexDesktopLaunch, verifyCodexChild } from '../scripts/switcher/providers/codex.mjs';
import { buildAntigravityLaunch, verifyAntigravityChild } from '../scripts/switcher/providers/antigravity.mjs';
import { providerParityMatrix } from '../scripts/switcher/providers/matrix.mjs';
test('phase 04 Codex launch carries process-specific home and disposable app data', () => {
  const roots = { runtimeHome: path.join(os.tmpdir(), 'kernel'), providerHome: path.join(os.tmpdir(), 'kernel', 'codex'), appDataRoot: path.join(os.tmpdir(), 'codex-app') };
  const spec = buildCodexDesktopLaunch({ track: 'kernel', roots, executable: 'ChatGPT.exe' });
  assert.equal(spec.env.CODEX_HOME, roots.providerHome); assert.ok(spec.args.includes(roots.appDataRoot));
  assert.equal(verifyCodexChild({ expectedProviderHome: roots.providerHome, childEnvironment: spec.env, childExecutable: 'ChatGPT.exe', expectedExecutable: 'ChatGPT.exe' }).status, 'verified');
});
test('phase 05 Antigravity launch carries Gemini home and user data dir', () => {
  const roots = { runtimeHome: path.join(os.tmpdir(), 'kernel'), providerHome: path.join(os.tmpdir(), 'kernel', 'antigravity'), appDataRoot: path.join(os.tmpdir(), 'ag-app') };
  const spec = buildAntigravityLaunch({ track: 'kernel', roots, executable: 'Antigravity.exe' });
  assert.equal(spec.env.GEMINI_HOME, roots.providerHome); assert.equal(verifyAntigravityChild({ expectedProviderHome: roots.providerHome, childEnvironment: spec.env, childArgs: spec.args, expectedAppDataRoot: roots.appDataRoot }).status, 'verified');
});
test('phase 05 provider parity matrix keeps all surfaces disjoint', () => {
  const result = providerParityMatrix({ relayHome: path.join(os.tmpdir(), 'relay'), kernelHome: path.join(os.tmpdir(), 'kernel') });
  assert.equal(result.status, 'passed'); assert.equal(result.rows.length, 5); assert.ok(result.rows.every((row) => row.sensitiveContentRead === false));
});
test('phase 04/05 application resolvers do not hard-code a versioned WindowsApps path', async () => {
  const codex = await resolveCodexDesktop({ candidates: [], commandResolver: async () => null });
  const anti = await resolveAntigravity({ candidates: [], commandResolver: async () => null });
  assert.doesNotMatch(JSON.stringify(codex), /OpenAI\.Codex_\d/); assert.doesNotMatch(JSON.stringify(anti), /Antigravity_\d/);
});
test('phase 04 Codex resolver derives packaged shell activation metadata from the installed path', async () => {
  const root = await fsTempRoot();
  const executable = path.join(root, 'WindowsApps', 'OpenAI.Codex_26.715.9757.0_x64__2p2nqsd0c76g0', 'app', 'ChatGPT.exe');
  await mkdir(path.dirname(executable), { recursive: true }); await writeFile(executable, 'fixture');
  const result = await resolveCodexDesktop({ candidates: [executable], commandResolver: async () => null });
  assert.equal(result.launchKind, 'packaged_shell_activation');
  assert.equal(result.aumid, 'OpenAI.Codex_2p2nqsd0c76g0!App');
  assert.equal(result.packageFamily, 'OpenAI.Codex_2p2nqsd0c76g0');
});
async function fsTempRoot() { return await mkdtemp(path.join(os.tmpdir(), 'codex-resolver-')); }
