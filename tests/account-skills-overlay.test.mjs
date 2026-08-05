import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { applyAccountSkillsOverlay, inspectAccountSkillsOverlay, requiresAccountSkillsOverlay, restoreAccountSkillsOverlay } from '../scripts/switcher/account-skills-overlay.mjs';
import { launchSwitch } from '../scripts/switcher/operations.mjs';
import { installKernelProfile } from '../scripts/kernel/profile-install.mjs';

const fixture = async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'skills-overlay-'));
  const accountSkills = path.join(home, '.codex', 'skills');
  const providerHome = path.join(home, 'kernel', 'providers', 'codex');
  await mkdir(path.join(accountSkills, 'relay-skill'), { recursive: true }); await writeFile(path.join(accountSkills, 'relay-skill', 'SKILL.md'), '# relay\n');
  await mkdir(path.join(providerHome, 'skills', 'moon-relay-kernel'), { recursive: true }); await writeFile(path.join(providerHome, 'skills', 'moon-relay-kernel', 'SKILL.md'), '# kernel\n');
  await mkdir(path.join(providerHome, '.codex'), { recursive: true }); await writeFile(path.join(providerHome, 'AGENTS.override.md'), '# kernel agents\n');
  await writeFile(path.join(providerHome, '.codex', 'config.toml'), 'developer_instructions = "kernel"\n');
  await writeFile(path.join(providerHome, '.codex', 'hooks.json'), '{}\n');
  return { home, accountSkills, providerHome };
};
const overlayArgs = (value, platform = 'win32') => ({ surface: 'codex_desktop', providerHome: value.providerHome, platform, accountHome: value.home });

test('Windows and macOS desktop activation atomically swaps, verifies, and restores account skills', async () => {
  for (const platform of ['win32', 'darwin']) {
    const value = await fixture();
    try {
      assert.equal((await applyAccountSkillsOverlay(overlayArgs(value, platform))).status, 'applied'); assert.deepEqual(await readdir(value.accountSkills), ['moon-relay-kernel']);
      assert.equal(await readFile(path.join(value.home, '.codex', 'AGENTS.md'), 'utf8'), '# kernel agents\n');
      assert.equal(await readFile(path.join(value.home, '.codex', 'config.toml'), 'utf8'), 'developer_instructions = "kernel"\n');
      assert.equal((await applyAccountSkillsOverlay(overlayArgs(value, platform))).status, 'already_applied'); assert.equal((await restoreAccountSkillsOverlay(overlayArgs(value, platform))).status, 'restored');
      assert.deepEqual(await readdir(value.accountSkills), ['relay-skill']); assert.equal(await readFile(path.join(value.accountSkills, 'relay-skill', 'SKILL.md'), 'utf8'), '# relay\n');
    } finally { await rm(value.home, { recursive: true, force: true }); }
  }
});

test('interrupted apply and restore states recover the original account profile', async () => {
  const value = await fixture();
  try {
    await applyAccountSkillsOverlay(overlayArgs(value)); const root = path.join(value.home, '.codex');
    const manifestPath = path.join(root, '.moon-harness-profile-overlay.json'); const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, state: 'originals_moved' }));
    assert.equal((await applyAccountSkillsOverlay(overlayArgs(value))).status, 'applied');
    await rm(path.join(root, '.moon-harness-profile-retired'), { recursive: true, force: true }); await mkdir(path.join(root, '.moon-harness-profile-retired'), { recursive: true });
    await rename(path.join(root, 'skills'), path.join(root, '.moon-harness-profile-retired', 'skills'));
    await rename(path.join(root, '.moon-harness-profile-backup', 'skills'), path.join(root, 'skills'));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, state: 'restoring' }));
    assert.equal((await restoreAccountSkillsOverlay(overlayArgs(value))).status, 'restored');
    assert.deepEqual(await readdir(value.accountSkills), ['relay-skill']);
  } finally { await rm(value.home, { recursive: true, force: true }); }
});

test('overlay drift fails closed while retaining both changed live data and the original backup', async () => {
  const value = await fixture();
  try {
    await applyAccountSkillsOverlay(overlayArgs(value)); await writeFile(path.join(value.accountSkills, 'moon-relay-kernel', 'SKILL.md'), '# changed\n');
    await assert.rejects(() => restoreAccountSkillsOverlay(overlayArgs(value)), (error) => error.code === 'overlay_drift');
    assert.equal(await readFile(path.join(value.accountSkills, 'moon-relay-kernel', 'SKILL.md'), 'utf8'), '# changed\n');
    assert.equal(await readFile(path.join(value.home, '.codex', '.moon-harness-profile-backup', 'skills', 'relay-skill', 'SKILL.md'), 'utf8'), '# relay\n');
  } finally { await rm(value.home, { recursive: true, force: true }); }
});

test('overlay drift can be force restored when force option is passed', async () => {
  const value = await fixture();
  try {
    await applyAccountSkillsOverlay(overlayArgs(value)); await writeFile(path.join(value.accountSkills, 'moon-relay-kernel', 'SKILL.md'), '# changed\n');
    const restored = await restoreAccountSkillsOverlay({ ...overlayArgs(value), force: true });
    assert.equal(restored.status, 'restored');
    assert.deepEqual(await readdir(value.accountSkills), ['relay-skill']);
  } finally { await rm(value.home, { recursive: true, force: true }); }
});

test('tampered manifest targets are rejected before filesystem recovery', async () => {
  const value = await fixture();
  try {
    await applyAccountSkillsOverlay(overlayArgs(value)); const file = path.join(value.home, '.codex', '.moon-harness-profile-overlay.json');
    const manifest = JSON.parse(await readFile(file, 'utf8')); manifest.targets[0].live = '../auth.json';
    await writeFile(file, JSON.stringify(manifest)); await assert.rejects(() => restoreAccountSkillsOverlay(overlayArgs(value)), (error) => error.code === 'target_collision');
  } finally { await rm(value.home, { recursive: true, force: true }); }
});

test('Claude desktop overlays and restores account settings with its Kernel profile', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'claude-overlay-'));
  try {
    const account = path.join(home, '.claude'), provider = path.join(home, 'provider');
    await mkdir(path.join(account, 'skills', 'relay'), { recursive: true }); await mkdir(path.join(provider, 'skills', 'moon-relay-kernel'), { recursive: true });
    await writeFile(path.join(account, 'settings.json'), '{"hooks":{"Relay":[]}}'); await writeFile(path.join(provider, 'settings.json'), '{}');
    await writeFile(path.join(provider, 'CLAUDE.md'), '# kernel\n');
    await writeFile(path.join(provider, 'skills', 'moon-relay-kernel', 'SKILL.md'), '# kernel\n');
    const args = { surface: 'claude_cli', providerHome: provider, platform: 'darwin', accountHome: home };
    await applyAccountSkillsOverlay(args); assert.equal(await readFile(path.join(account, 'settings.json'), 'utf8'), '{}');
    await restoreAccountSkillsOverlay(args);
    assert.equal(await readFile(path.join(account, 'settings.json'), 'utf8'), '{"hooks":{"Relay":[]}}');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('executed desktop switches apply/restore the overlay and a failed spawn rolls it back', async () => {
  assert.equal(requiresAccountSkillsOverlay('claude_cli', 'linux'), false); assert.equal(requiresAccountSkillsOverlay('claude_cli', 'win32'), true);
  assert.equal(requiresAccountSkillsOverlay('claude_cli', 'darwin'), true);
  const value = await fixture();
  const oldHome = process.env.MOON_HARNESS_SWITCHER_HOME;
  try {
    process.env.MOON_HARNESS_SWITCHER_HOME = path.join(value.home, 'switcher');
    const runtimeHome = path.join(value.home, 'kernel'); await writeFile(path.join(runtimeHome, 'install-manifest.json'), '{"productId":"moon-relay-kernel"}');
    await installKernelProfile({ sourceRoot: process.cwd(), runtime: 'codex', targetRoot: value.providerHome });
    const base = {
      surface: 'codex_desktop', sourceRoot: process.cwd(), platform: 'win32', accountHome: value.home,
      processProvider: async () => [], dryRun: false,
    };
    const spec = (track) => ({
      command: 'ChatGPT.exe', args: [], env: {}, workspaceRoot: value.home,
      roots: track === 'kernel'
        ? { runtimeHome, providerHome: value.providerHome, appDataRoot: path.join(value.home, 'kernel-app') }
        : { runtimeHome: path.join(value.home, 'relay'), providerHome: path.join(value.home, '.codex'), appDataRoot: path.join(value.home, 'relay-app') },
    });
    const child = { pid: 4321, on() {}, unref() {} };
    const kernel = await launchSwitch({ ...base, track: 'kernel', spawnImpl: () => child, launchSpec: spec('kernel') }); assert.equal(kernel.effective.accountSkillsOverlay.status, 'applied');
    const relay = await launchSwitch({ ...base, track: 'relay', spawnImpl: () => child, launchSpec: spec('relay') }); assert.equal(relay.effective.accountSkillsOverlay.status, 'restored');
    const unresolved = await launchSwitch({
      ...base, track: 'kernel', applicationResolver: async () => ({ executable: null, warnings: ['fixture'] }),
    });
    assert.equal(unresolved.errorCode, 'application_not_resolved');
    assert.equal((await inspectAccountSkillsOverlay(overlayArgs(value))).status, 'inactive');
    const failed = await launchSwitch({
      ...base, track: 'kernel', launchSpec: spec('kernel'),
      spawnImpl: () => { throw Object.assign(new Error('fixture'), { code: 'fixture_launch_failed' }); },
    });
    assert.equal(failed.errorCode, 'fixture_launch_failed');
    assert.deepEqual(await readdir(value.accountSkills), ['relay-skill']);
    assert.equal((await inspectAccountSkillsOverlay(overlayArgs(value))).status, 'inactive');
  } finally {
    if (oldHome === undefined) delete process.env.MOON_HARNESS_SWITCHER_HOME;
    else process.env.MOON_HARNESS_SWITCHER_HOME = oldHome;
    await rm(value.home, { recursive: true, force: true });
  }
});
