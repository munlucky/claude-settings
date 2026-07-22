import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { prepareTransaction, advanceTransaction, recoverTransaction } from '../scripts/switcher/transaction.mjs';
import { readJournal } from '../scripts/switcher/state-store.mjs';
import { switchDoctor, launchSwitch, recoverSwitch } from '../scripts/switcher/operations.mjs';

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
  const relay = await launchSwitch({ surface: 'codex_cli', track: 'relay', sourceRoot: process.cwd(), dryRun: true });
  const kernel = await launchSwitch({ surface: 'codex_cli', track: 'kernel', sourceRoot: process.cwd(), dryRun: true, launchSpec: { command: 'codex', args: [], roots: { runtimeHome: path.join(home, 'kernel'), providerHome: path.join(home, 'kernel', 'codex') }, env: {} } });
  assert.equal(relay.status, 'committed'); assert.equal(kernel.status, 'committed');
  assert.notEqual(relay.effective.providerHome, kernel.effective.providerHome);
  await rm(home, { recursive: true, force: true });
});
