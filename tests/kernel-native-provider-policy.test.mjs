import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { buildLaunchSpec } from '../scripts/switcher/launch-adapter.mjs';
import { nativeProviderDescriptor, resolveNativeProvider } from '../scripts/switcher/native-provider.mjs';

test('Kernel launch delegates to the native provider and keeps managed runtime Node-only', async () => {
  const runtimeHome = path.join(os.tmpdir(), 'kernel-native-provider');
  const spec = buildLaunchSpec({
    surface: 'codex_cli',
    sourceRoot: process.cwd(),
    roots: { runtimeHome, providerHome: path.join(os.homedir(), '.codex') },
  });
  assert.equal(spec.command, 'codex');
  assert.equal(spec.providerRuntime.mode, 'native-provider');
  assert.equal(spec.providerRuntime.managedRuntime, 'kernel-node-only');
  assert.equal(spec.providerRuntime.executionLayer, 'native-surface');
  assert.equal(spec.providerRuntime.runtimeIsolation, 'kernel-state-only');
  assert.equal(spec.providerRuntime.completionAuthority, 'kernel');
  const resolved = await resolveNativeProvider({ surface: 'codex_cli', commandResolver: async (name) => `C:/native/${name}.exe` });
  assert.equal(resolved.status, 'resolved');
  assert.match(resolved.resolvedCommand, /native/);
});

test('Kernel refuses a provider binary copied under its managed runtime', () => {
  assert.throws(
    () => nativeProviderDescriptor({ surface: 'claude_cli', command: path.join(os.tmpdir(), 'kernel-native-provider', 'bin', 'claude.exe'), runtimeHome: path.join(os.tmpdir(), 'kernel-native-provider') }),
    /managed_provider_runtime_forbidden/,
  );
});

test('account-root setup routes installation through Kernel-only integration', async () => {
  const launcher = await readFile(path.join(process.cwd(), 'bin', 'moonshot-relay.mjs'), 'utf8');
  assert.match(launcher, /const runKernelInstall = \(\) => runKernelCommand/);
  assert.match(launcher, /const runKernelProfileInstall = \(runtime\) => runKernelCommand/);
  assert.doesNotMatch(launcher, /install-account-root-harness|install-project-runtime-bridge|relaySetupEnvironment|MOONSHOT_RELAY_HOME/);
});

test('retired Relay options are rejected in both separated and equals forms', () => {
  const wrapper = path.join(process.cwd(), 'bin', 'moonshot-relay.mjs');
  const optionArgs = [
    ['--moonshot-home', 'C:/tmp/legacy'],
    ['--moonshot-home=C:/tmp/legacy'],
    ['--no-backup'],
    ['--no-backup=true'],
    ['--clean-overlay'],
    ['--clean-overlay=true'],
  ];
  for (const args of optionArgs) {
    const result = spawnSync(process.execPath, [wrapper, 'install', ...args, '--dry-run', '--json'], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, `${args.join(' ')} must be rejected`);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.errorCode, 'relay_track_retired');
    assert.equal(receipt.sensitiveContentRead, false);
  }
});
