import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { prepareTransaction, advanceTransaction, recoverTransaction } from '../scripts/switcher/transaction.mjs';
import { readJournal } from '../scripts/switcher/state-store.mjs';
import { switchDoctor, launchSwitch, recoverSwitch } from '../scripts/switcher/operations.mjs';
import { installKernelProfile } from '../scripts/kernel/profile-install.mjs';
import { hydrateKernelProject } from '../scripts/kernel/project-hydrate.mjs';

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

test('phase 03 CLI tracks use process-scoped roots and can coexist', async () => {
  const home = path.join(os.tmpdir(), `switcher-cli-${Date.now()}`); process.env.MOON_HARNESS_SWITCHER_HOME = home;
  const runtimeHome = path.join(home, 'kernel');
  const providerHome = path.join(home, 'kernel', 'codex');
  const projectRoot = path.join(home, 'project');
  await mkdir(runtimeHome, { recursive: true });
  await writeFile(path.join(runtimeHome, 'install-manifest.json'), JSON.stringify({ productId: 'moon-relay-kernel' }), 'utf8');
  await installKernelProfile({ sourceRoot: process.cwd(), runtime: 'codex', targetRoot: providerHome });
  await hydrateKernelProject({ projectRoot, sourceRoot: process.cwd() });

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
