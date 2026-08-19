import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { prepareTransaction, advanceTransaction, recoverTransaction } from '../scripts/switcher/transaction.mjs';
import { readJournal } from '../scripts/switcher/state-store.mjs';
import { switchDoctor, launchSwitch, recoverSwitch } from '../scripts/switcher/operations.mjs';
import { installKernelProfile } from '../scripts/kernel/profile-install.mjs';
import { installKernel } from '../scripts/kernel/installer.mjs';
import { buildLaunchSpec, buildProcessEnvironment, spawnTrack } from '../scripts/switcher/launch-adapter.mjs';
import { resolveTrackRoots } from '../scripts/switcher/paths.mjs';

test('Relay root resolution ignores ambient Kernel runtime and provider bindings', () => {
  const original = {
    track: process.env.MOON_RELAY_TRACK,
    kernelHome: process.env.MOON_RELAY_KERNEL_HOME,
    relayHome: process.env.MOONSHOT_RELAY_HOME,
    codexHome: process.env.CODEX_HOME,
  };
  const kernelHome = path.join(os.tmpdir(), 'ambient-kernel-home');
  try {
    process.env.MOON_RELAY_TRACK = 'kernel';
    process.env.MOON_RELAY_KERNEL_HOME = kernelHome;
    process.env.MOONSHOT_RELAY_HOME = kernelHome;
    process.env.CODEX_HOME = path.join(kernelHome, 'providers', 'codex');
    const roots = resolveTrackRoots({ track: 'relay', surface: 'codex_cli', sourceRoot: process.cwd() });
    assert.equal(roots.runtimeHome, path.resolve(process.env.USERPROFILE || os.homedir(), '.moonshot-relay'));
    assert.equal(roots.providerHome, path.resolve(process.env.USERPROFILE || os.homedir(), '.codex'));
    assert.notEqual(roots.runtimeHome, path.resolve(kernelHome));
    assert.notEqual(roots.providerHome, path.join(path.resolve(kernelHome), 'providers', 'codex'));
  } finally {
    for (const [key, value] of Object.entries({
      MOON_RELAY_TRACK: original.track,
      MOON_RELAY_KERNEL_HOME: original.kernelHome,
      MOONSHOT_RELAY_HOME: original.relayHome,
      CODEX_HOME: original.codexHome,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Relay provider overrides that contain or parent the Kernel home are rejected', () => {
  const original = { MOON_RELAY_KERNEL_HOME: process.env.MOON_RELAY_KERNEL_HOME, CODEX_HOME: process.env.CODEX_HOME };
  const kernelHome = path.join(os.tmpdir(), 'provider-parent-kernel');
  try {
    process.env.MOON_RELAY_KERNEL_HOME = kernelHome;
    process.env.CODEX_HOME = path.dirname(kernelHome);
    const roots = resolveTrackRoots({ track: 'relay', surface: 'codex_cli', sourceRoot: process.cwd() });
    assert.notEqual(roots.providerHome, path.resolve(process.env.CODEX_HOME));
    assert.notEqual(roots.providerHome, path.resolve(kernelHome));
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Relay launch environment strips inherited Kernel bindings', () => {
  const env = buildProcessEnvironment({
    surface: 'codex_cli',
    track: 'relay',
    roots: { runtimeHome: '/relay-home', providerHome: '/relay-home/providers/codex' },
    workspaceRoot: '/workspace',
    baseEnv: {
      PATH: ['/usr/bin', path.join('/old-kernel-home', 'bin'), '/usr/local/bin'].join(path.delimiter),
      Path: path.join('/old-kernel-home', 'bin'),
      MOON_RELAY_TRACK: 'kernel',
      MOON_RELAY_KERNEL_HOME: '/old-kernel-home',
      MOON_RELAY_KERNEL_RUN_ID: 'old-run',
      MOON_RELAY_KERNEL_PROJECT_ID: 'old-project',
      MOON_RELAY_KERNEL_SESSION_ID: 'old-session',
      MOON_RELAY_KERNEL_LEGACY_SESSION_ID: 'old-legacy-session',
      MOON_RELAY_KERNEL_PROVIDER: 'codex-cli',
      MOON_RELAY_KERNEL_WORKSPACE_ID: 'old-workspace',
      MOON_RELAY_WORKSPACE_ROOT: '/old-workspace-root',
      CLAUDE_HOME: '/old-kernel-home/claude',
      CLAUDE_CONFIG_DIR: '/old-kernel-home/claude',
      CODEX_HOME: '/old-kernel-home/codex',
      QWEN_HOME: '/old-kernel-home/qwen',
    },
  });

  assert.equal(env.MOONSHOT_RELAY_HOME, '/relay-home');
  assert.equal(env.MOON_RELAY_TRACK, 'relay');
  assert.equal(env.MOON_RELAY_WORKSPACE_ROOT, '/workspace');
  assert.equal(env.PATH.includes(path.join('/old-kernel-home', 'bin')), false);
  assert.match(env.PATH, /\/usr\/bin/);
  assert.match(env.PATH, /\/usr\/local\/bin/);
  assert.equal(env.Path, undefined);
  for (const key of [
    'MOON_RELAY_KERNEL_HOME',
    'MOON_RELAY_KERNEL_RUN_ID',
    'MOON_RELAY_KERNEL_PROJECT_ID',
    'MOON_RELAY_KERNEL_SESSION_ID',
    'MOON_RELAY_KERNEL_LEGACY_SESSION_ID',
    'MOON_RELAY_KERNEL_PROVIDER',
    'MOON_RELAY_KERNEL_WORKSPACE_ID',
  ]) assert.equal(env[key], undefined, key);
  for (const key of ['CLAUDE_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'QWEN_HOME']) {
    assert.equal(env[key].startsWith('/old-kernel-home'), false, key);
  }
});

test('Relay launch environment scrubs inherited Antigravity Kernel roots', () => {
  const kernelHome = path.join(os.tmpdir(), 'antigravity-kernel-home');
  const env = buildProcessEnvironment({
    surface: 'codex_cli',
    track: 'relay',
    roots: { runtimeHome: path.join(os.tmpdir(), 'antigravity-relay-home'), providerHome: path.join(os.tmpdir(), 'antigravity-relay-home', 'providers', 'codex') },
    baseEnv: {
      MOON_RELAY_KERNEL_HOME: kernelHome,
      ANTIGRAVITY_HOME: path.join(kernelHome, 'providers', 'antigravity'),
      ANTIGRAVITY_SKILLS_HOME: path.join(kernelHome, 'providers', 'antigravity-skills'),
      GEMINI_HOME: path.join(kernelHome, 'providers', 'antigravity'),
    },
  });
  assert.equal(env.ANTIGRAVITY_HOME.startsWith(kernelHome), false);
  assert.equal(env.ANTIGRAVITY_SKILLS_HOME.startsWith(kernelHome), false);
  assert.equal(env.GEMINI_HOME.startsWith(kernelHome), false);
});

test('Kernel task binding is process-scoped in provider launch specs', () => {
  const spec = buildLaunchSpec({
    surface: 'codex_cli',
    track: 'kernel',
    sourceRoot: process.cwd(),
    workspaceRoot: process.cwd(),
    workspaceId: 'workspace-1',
    runId: 'run-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    roots: { runtimeHome: 'C:\\kernel', providerHome: 'C:\\kernel\\providers\\codex' },
  });
  assert.equal(spec.env.MOON_RELAY_KERNEL_RUN_ID, 'run-1');
  assert.equal(spec.env.MOON_RELAY_KERNEL_PROJECT_ID, 'project-1');
  assert.equal(spec.env.MOON_RELAY_KERNEL_SESSION_ID, 'codex-cli:session-1');
  assert.equal(spec.env.MOON_RELAY_KERNEL_PROVIDER, 'codex-cli');
  assert.equal(spec.env.MOON_RELAY_KERNEL_WORKSPACE_ID, 'workspace-1');
});

test('phase 03 transaction journal follows prepare, stop, launch, and recovery states', async () => {
  const home = path.join(os.tmpdir(), `switcher-state-${Date.now()}`); process.env.MOON_HARNESS_SWITCHER_HOME = home;
  const journal = await prepareTransaction({ surface: 'codex_cli', requestedTrack: 'kernel', roots: { runtimeHome: path.join(home, 'kernel') } });
  assert.equal(journal.state, 'prepared');
  const stopped = await advanceTransaction(journal, 'old_app_stopped');
  assert.equal(stopped.state, 'old_app_stopped');
  const recovery = await recoverTransaction();
  assert.equal(recovery.status, 'recovery_required');
  assert.equal((await readJournal()).state, 'recovery_required');
  await rm(home, { recursive: true, force: true });
});

test('phase 03 active GUI process refuses mutation without approval', async () => {
  const home = path.join(os.tmpdir(), `switcher-active-${Date.now()}`); process.env.MOON_HARNESS_SWITCHER_HOME = home;
  const receipt = await launchSwitch({ surface: 'codex_desktop', track: 'kernel', sourceRoot: process.cwd(), processProvider: async () => [{ pid: 99, name: 'ChatGPT' }], dryRun: true });
  assert.equal(receipt.status, 'close_incomplete');
  assert.equal(receipt.errorCode, 'operator_approval_missing');
  const doctor = await switchDoctor({ surface: 'codex_desktop', processProvider: async () => [{ pid: 99, name: 'ChatGPT' }] });
  assert.equal(doctor.reports.codex_desktop.status, 'process_active');
  const recovery = await recoverSwitch({ surface: 'codex_desktop' });
  assert.equal(recovery.status, 'idle');
  await rm(home, { recursive: true, force: true });
});

test('Kernel launch preflight returns identity remediation before launch mutation', async () => {
  const home = path.join(os.tmpdir(), `switcher-identity-preflight-${Date.now()}`);
  const runtimeHome = path.join(home, 'kernel');
  const providerHome = path.join(runtimeHome, 'providers', 'codex');
  const projectRoot = path.join(home, 'project');
  try {
    await mkdir(projectRoot, { recursive: true });
    await installKernel({ targetRoot: runtimeHome, sourceRoot: process.cwd() });
    await installKernelProfile({ sourceRoot: process.cwd(), runtime: 'codex', targetRoot: providerHome });
    const receipt = await launchSwitch({
      surface: 'codex_cli',
      track: 'kernel',
      sourceRoot: process.cwd(),
      projectRoot,
      processProvider: async () => [],
      dryRun: false,
      launchSpec: { command: 'codex', args: [], roots: { runtimeHome, providerHome, appDataRoot: path.join(home, 'app-data') }, env: {} },
    });
    assert.equal(receipt.status, 'kernel_project_identity_not_ready');
    assert.equal(receipt.errorCode, 'project_identity_preflight_required');
    assert.equal(receipt.effective.projectIdentity.status, 'bootstrap_required');
    assert.match(receipt.effective.remediation.command, /identity bootstrap/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('phase 03 CLI tracks use process-scoped roots and can coexist', async () => {
  const home = path.join(os.tmpdir(), `switcher-cli-${Date.now()}`); process.env.MOON_HARNESS_SWITCHER_HOME = home;
  const runtimeHome = path.join(home, 'kernel');
  const providerHome = path.join(home, 'kernel', 'codex');
  const projectRoot = path.join(home, 'project');
  await mkdir(runtimeHome, { recursive: true });
  await writeFile(path.join(runtimeHome, 'install-manifest.json'), JSON.stringify({ productId: 'moon-relay-kernel' }), 'utf8');
  await installKernelProfile({ sourceRoot: process.cwd(), runtime: 'codex', targetRoot: providerHome });
  await mkdir(projectRoot, { recursive: true });
  const treeBefore = await readdir(projectRoot);

  const relay = await launchSwitch({ surface: 'codex_cli', track: 'relay', sourceRoot: process.cwd(), dryRun: true });
  const kernel = await launchSwitch({
    surface: 'codex_cli',
    track: 'kernel',
    sourceRoot: process.cwd(),
    projectRoot,
    dryRun: true,
    launchSpec: { command: 'codex', args: [], roots: { runtimeHome, providerHome, appDataRoot: path.join(home, 'app-data') }, env: {} },
  });
  assert.equal(relay.status, 'committed');
  assert.equal(kernel.status, 'committed');
  assert.notEqual(relay.effective.providerHome, kernel.effective.providerHome);
  assert.deepEqual(await readdir(projectRoot), treeBefore);
  await rm(home, { recursive: true, force: true });
});

test('a Kernel-launched surface can launch another Kernel surface', async () => {
  const original = {
    track: process.env.MOON_RELAY_TRACK,
    relayHome: process.env.MOONSHOT_RELAY_HOME,
    kernelHome: process.env.MOON_RELAY_KERNEL_HOME,
    codexHome: process.env.CODEX_HOME,
    switcherHome: process.env.MOON_HARNESS_SWITCHER_HOME,
  };
  const home = path.join(os.tmpdir(), `switcher-kernel-nested-${Date.now()}`);
  const runtimeHome = path.join(home, 'kernel');
  const providerHome = path.join(runtimeHome, 'providers', 'claude');
  try {
    process.env.MOON_RELAY_TRACK = 'kernel';
    process.env.MOONSHOT_RELAY_HOME = runtimeHome;
    process.env.MOON_RELAY_KERNEL_HOME = runtimeHome;
    process.env.CODEX_HOME = path.join(runtimeHome, 'providers', 'codex');
    process.env.MOON_HARNESS_SWITCHER_HOME = path.join(home, 'switcher');
    await mkdir(runtimeHome, { recursive: true });
    await writeFile(path.join(runtimeHome, 'install-manifest.json'), JSON.stringify({ productId: 'moon-relay-kernel' }), 'utf8');
    await installKernelProfile({ sourceRoot: process.cwd(), runtime: 'claude', targetRoot: providerHome });

    const receipt = await launchSwitch({
      surface: 'claude_cli',
      track: 'kernel',
      sourceRoot: process.cwd(),
      processProvider: async () => [],
      dryRun: true,
      launchSpec: {
        command: 'claude',
        args: [],
        roots: { runtimeHome, providerHome },
        env: {},
      },
    });
    assert.equal(receipt.status, 'committed');
  } finally {
    for (const [key, value] of [
      ['MOON_RELAY_TRACK', original.track],
      ['MOONSHOT_RELAY_HOME', original.relayHome],
      ['MOON_RELAY_KERNEL_HOME', original.kernelHome],
      ['CODEX_HOME', original.codexHome],
      ['MOON_HARNESS_SWITCHER_HOME', original.switcherHome],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(home, { recursive: true, force: true });
  }
});

test('spawnTrack handles non-existent executable without unhandled error event crash', () => {
  const spec = buildLaunchSpec({
    surface: 'qwen_cli',
    track: 'relay',
    sourceRoot: process.cwd(),
    command: 'nonexistent-qwen-test-binary',
  });
  const res = spawnTrack(spec);
  assert.equal(res.status, 'launch_requested');
  assert.ok(['direct', 'cmd_start_cli'].includes(res.launcher));
});

test('Antigravity desktop launch detaches on Windows so the app outlives the switcher', () => {
  let launchOptions = null;
  const spec = buildLaunchSpec({
    surface: 'antigravity_desktop',
    track: 'kernel',
    sourceRoot: process.cwd(),
    command: 'Antigravity.exe',
    roots: {
      runtimeHome: 'C:\\Users\\moon\\.moon-relay-kernel',
      providerHome: 'C:\\Users\\moon\\.moon-relay-kernel\\providers\\antigravity',
      appDataRoot: 'C:\\Users\\moon\\AppData\\Roaming\\Antigravity-Kernel',
    },
  });
  const result = spawnTrack(spec, {
    spawnImpl: (_command, _args, options) => {
      launchOptions = options;
      return { pid: 1234, on() {}, unref() {} };
    },
  });
  assert.equal(result.launcher, 'direct');
  assert.equal(launchOptions.detached, process.platform === 'win32');
  assert.equal(launchOptions.windowsHide, process.platform !== 'win32');
});
