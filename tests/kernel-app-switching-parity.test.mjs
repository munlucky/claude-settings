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
import { buildProcessEnvironment } from '../scripts/switcher/launch-adapter.mjs';
import { resolveTrackRoots } from '../scripts/switcher/paths.mjs';
test('Kernel launch exports the Kernel home without poisoning the Relay home', () => {
  const runtimeHome = path.join(os.tmpdir(), 'kernel-env');
  const env = buildProcessEnvironment({
    surface: 'claude_cli',
    track: 'kernel',
    roots: { runtimeHome },
    baseEnv: { MOONSHOT_RELAY_HOME: runtimeHome },
  });
  assert.equal(env.MOON_RELAY_KERNEL_HOME, runtimeHome);
  assert.equal(env.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(env.MOON_RELAY_TRACK, 'kernel');
  assert.equal(env.MOONSHOT_RELAY_HOME, undefined);
});
test('Kernel launch preserves a distinct custom Relay home', () => {
  const runtimeHome = path.join(os.tmpdir(), 'kernel-env-custom');
  const relayHome = path.join(os.tmpdir(), 'relay-env-custom');
  const env = buildProcessEnvironment({
    surface: 'claude_cli',
    track: 'kernel',
    roots: { runtimeHome },
    baseEnv: { MOONSHOT_RELAY_HOME: relayHome },
  });
  assert.equal(env.MOONSHOT_RELAY_HOME, relayHome);
});
test('phase 04 Codex launch carries process-specific home and disposable app data', () => {
  const roots = { runtimeHome: path.join(os.tmpdir(), 'kernel'), providerHome: path.join(os.tmpdir(), 'kernel', 'codex'), appDataRoot: path.join(os.tmpdir(), 'codex-app') };
  const spec = buildCodexDesktopLaunch({ track: 'relay', roots, executable: 'ChatGPT.exe' });
  assert.equal(spec.env.CODEX_HOME, roots.providerHome); assert.ok(spec.args.includes(roots.appDataRoot));
  assert.equal(verifyCodexChild({ expectedProviderHome: roots.providerHome, childEnvironment: spec.env, childExecutable: 'ChatGPT.exe', expectedExecutable: 'ChatGPT.exe' }).status, 'verified');
  const kernelSpec = buildCodexDesktopLaunch({ track: 'kernel', roots, executable: 'ChatGPT.exe' });
  assert.equal(kernelSpec.env.CODEX_HOME, undefined);
  assert.equal(kernelSpec.env.MOON_RELAY_KERNEL_HOME, roots.runtimeHome);
});
test('phase 05 Antigravity launch carries Gemini home and user data dir', () => {
  const roots = { runtimeHome: path.join(os.tmpdir(), 'kernel'), providerHome: path.join(os.tmpdir(), 'kernel', 'antigravity'), appDataRoot: path.join(os.tmpdir(), 'ag-app') };
  const spec = buildAntigravityLaunch({ track: 'relay', roots, executable: 'Antigravity.exe' });
  assert.equal(spec.env.GEMINI_HOME, roots.providerHome); assert.equal(verifyAntigravityChild({ expectedProviderHome: roots.providerHome, childEnvironment: spec.env, childArgs: spec.args, expectedAppDataRoot: roots.appDataRoot }).status, 'verified');
  const kernelSpec = buildAntigravityLaunch({ track: 'kernel', roots, executable: 'Antigravity.exe' });
  assert.equal(kernelSpec.env.GEMINI_HOME, undefined);
  assert.equal(kernelSpec.env.MOON_RELAY_KERNEL_HOME, roots.runtimeHome);
});
test('phase 05 provider parity matrix keeps all surfaces disjoint', () => {
  const result = providerParityMatrix({ relayHome: path.join(os.tmpdir(), 'relay'), kernelHome: path.join(os.tmpdir(), 'kernel') });
  assert.equal(result.status, 'passed'); assert.equal(result.rows.length, 6); assert.ok(result.rows.every((row) => row.sensitiveContentRead === false));
});
test('Codex Desktop uses macOS Application Support roots for Relay and Kernel', () => {
  const relayHome = path.join(os.tmpdir(), 'relay-macos');
  const kernelHome = path.join(os.tmpdir(), 'kernel-macos');
  const relay = resolveTrackRoots({ track: 'relay', surface: 'codex_desktop', relayHome, kernelHome, platform: 'darwin' });
  const kernel = resolveTrackRoots({ track: 'kernel', surface: 'codex_desktop', relayHome, kernelHome, platform: 'darwin' });
  assert.match(relay.appDataRoot, /Library[\\/]Application Support[\\/]OpenAI[\\/]Codex-Relay$/);
  assert.match(kernel.appDataRoot, /Library[\\/]Application Support[\\/]OpenAI[\\/]Codex-Kernel$/);
  assert.notEqual(relay.appDataRoot, kernel.appDataRoot);
});
test('phase 04/05 application resolvers do not hard-code a versioned WindowsApps path', async () => {
  const codex = await resolveCodexDesktop({ candidates: [], commandResolver: async () => null, windowsAppsResolver: async () => null });
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
test('Codex resolver discovers the newest versioned WindowsApps install after an app update', async () => {
  const root = await fsTempRoot();
  const windowsAppsRoot = path.join(root, 'WindowsApps');
  const oldExecutable = path.join(windowsAppsRoot, 'OpenAI.Codex_26.700.1.0_x64__publisher', 'app', 'ChatGPT.exe');
  const newExecutable = path.join(windowsAppsRoot, 'OpenAI.Codex_26.715.9757.0_x64__publisher', 'app', 'ChatGPT.exe');
  await mkdir(path.dirname(oldExecutable), { recursive: true }); await mkdir(path.dirname(newExecutable), { recursive: true });
  await writeFile(oldExecutable, 'old'); await writeFile(newExecutable, 'new');
  const result = await resolveCodexDesktop({ candidates: [], platform: 'win32', windowsAppsRoot, commandResolver: async () => null });
  assert.equal(result.executable, newExecutable);
  assert.equal(result.launchKind, 'packaged_shell_activation');
});
test('Codex resolver discovers a macOS app bundle without a version-pinned path', async () => {
  const root = await fsTempRoot();
  const executable = path.join(root, 'Codex.app', 'Contents', 'MacOS', 'Codex');
  await mkdir(path.dirname(executable), { recursive: true }); await writeFile(executable, 'fixture');
  const result = await resolveCodexDesktop({ candidates: [], platform: 'darwin', macOsAppRoots: [root], windowsAppsResolver: async () => null, commandResolver: async () => null });
  assert.equal(result.executable, executable);
  assert.equal(result.launchKind, 'macos_app_bundle');
  assert.equal(result.appDataRootMode, 'process_argument');
});
async function fsTempRoot() { return await mkdtemp(path.join(os.tmpdir(), 'codex-resolver-')); }
