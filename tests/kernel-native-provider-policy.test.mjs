import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildLaunchSpec } from '../scripts/switcher/launch-adapter.mjs';
import { nativeProviderDescriptor, resolveNativeProvider } from '../scripts/switcher/native-provider.mjs';

test('Kernel launch delegates to the native provider and keeps managed runtime Node-only', async () => {
  const runtimeHome = path.join(os.tmpdir(), 'kernel-native-provider');
  const spec = buildLaunchSpec({
    surface: 'codex_cli',
    track: 'kernel',
    sourceRoot: process.cwd(),
    roots: { runtimeHome, providerHome: path.join(os.homedir(), '.codex') },
  });
  assert.equal(spec.command, 'codex');
  assert.equal(spec.providerRuntime.mode, 'native-provider');
  assert.equal(spec.providerRuntime.managedRuntime, 'kernel-node-only');
  assert.equal(spec.providerRuntime.relayRuntimeDependency, 'forbidden');
  assert.equal(spec.providerRuntime.executionLayer, 'native-surface');
  assert.equal(spec.providerRuntime.trackIsolation, 'kernel-state-only');
  assert.equal(spec.providerRuntime.completionAuthority, 'kernel');
  const relaySpec = buildLaunchSpec({
    surface: 'codex_cli',
    track: 'relay',
    sourceRoot: process.cwd(),
    roots: { runtimeHome: path.join(os.tmpdir(), 'relay-native-provider'), providerHome: path.join(os.tmpdir(), '.codex') },
  });
  assert.equal(relaySpec.providerRuntime.executionLayer, 'native-surface');
  assert.equal(relaySpec.providerRuntime.completionAuthority, 'relay');
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

test('account-root setup makes Kernel ownership the first install authority', async () => {
  const launcher = await readFile(path.join(process.cwd(), 'bin', 'moonshot-relay.mjs'), 'utf8');
  const kernelFirst = launcher.indexOf("if (command === 'install' && !args.includes('--dry-run')) runKernelInstall();");
  const primaryInstaller = launcher.indexOf('const result = spawnSync(process.execPath, installerArgs');
  assert.ok(kernelFirst >= 0, 'default install must invoke the Kernel install stage');
  assert.ok(primaryInstaller > kernelFirst, 'Relay compatibility installation must follow Kernel installation');
  assert.match(launcher, /if \(command === 'kernel'\) \{\s*runKernelInstall\(\);/);
});
