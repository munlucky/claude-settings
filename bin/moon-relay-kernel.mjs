#!/usr/bin/env node
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { resolveKernelRuntimeHome, readProjectTrack } from '../scripts/kernel/runtime-home.mjs';
import { resolveKernelNode } from '../scripts/kernel/runtime-resolver.mjs';

// Managed Node Bootstrap Re-Exec (R3.2)
if (!process.env.MOON_RELAY_KERNEL_REEXEC) {
  try {
    const runtimeInfo = await resolveKernelNode({});
    if (runtimeInfo.source === 'managed' && runtimeInfo.nodePath && runtimeInfo.nodePath !== process.execPath) {
      const env = { ...process.env, MOON_RELAY_KERNEL_REEXEC: '1' };
      const status = execFileSync(runtimeInfo.nodePath, process.argv.slice(1), { env, stdio: 'inherit' });
      process.exit(0);
    }
  } catch {
    // Fall back to host execution if re-exec fails
  }
}

const args = process.argv.slice(2);
const command = args[0] || 'doctor';
const json = args.includes('--json');

const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
};

const output = (value) =>
  console.log(
    json ? JSON.stringify(value) : typeof value === 'object' ? Object.entries(value).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n') : String(value)
  );

try {
  if (command === 'doctor') {
    const runtimeHome = resolveKernelRuntimeHome();
    const activeTrack = await readProjectTrack(process.cwd());
    output({ productId: 'moon-relay-kernel', runtimeHome, activeTrack, status: activeTrack === 'kernel' ? 'ready' : 'wrong_harness' });
  } else if (command === 'assert-track') {
    const runtimeHome = resolveKernelRuntimeHome();
    const activeTrack = await readProjectTrack(process.cwd());
    const isReady = activeTrack === 'kernel';
    output({ productId: 'moon-relay-kernel', runtimeHome, activeTrack, status: isReady ? 'ready' : 'wrong_harness' });
    if (!isReady) {
      process.exitCode = 1;
    }
  } else if (command === 'resolve-runtime') {
    output(await resolveKernelNode({}));
  } else if (command === 'package') {
    const activeTrack = await readProjectTrack(process.cwd());
    if (activeTrack !== 'kernel') {
      output({ productId: 'moon-relay-kernel', activeTrack, status: 'wrong_harness', message: 'package command requires active track to be kernel' });
      process.exitCode = 1;
    } else {
      const { materializeKernelPackage } = await import('../scripts/kernel/package-build.mjs');
      const outArg = args.indexOf('--output');
      const outputRoot = outArg >= 0 ? args[outArg + 1] : `${process.cwd()}/dist/moon-relay-kernel`;
      output(await materializeKernelPackage({ sourceRoot: process.cwd(), outputRoot, dryRun: args.includes('--dry-run') }));
    }
  } else if (command === 'install') {
    const { installKernel } = await import('../scripts/kernel/installer.mjs');
    const targetRoot = getArgValue('--target-root') || process.cwd();
    output(await installKernel({ targetRoot }));
  } else if (command === 'uninstall') {
    const { uninstallKernel } = await import('../scripts/kernel/installer.mjs');
    const targetRoot = getArgValue('--target-root') || process.cwd();
    output(await uninstallKernel({ targetRoot }));
  } else if (command === 'start-run') {
    const { createKernelControlPlane } = await import('../scripts/kernel/control-plane.mjs');
    const cp = await createKernelControlPlane();
    const runId = getArgValue('--run-id') || `run-${Date.now()}`;
    const objective = getArgValue('--objective') || 'Kernel execution task';
    const sourceIdentity = getArgValue('--source-identity') || 'src-default-1';
    const run = await cp.startRun({ runId, objective, sourceIdentity });
    await cp.close();
    output(run);
  } else if (command === 'status') {
    const { createKernelControlPlane } = await import('../scripts/kernel/control-plane.mjs');
    const cp = await createKernelControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('status command requires --run-id');
    const res = await cp.status(runId);
    await cp.close();
    output(res || { status: 'not_found' });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(json ? JSON.stringify({ status: 'error', message: error.message }) : error.message);
  process.exitCode = 1;
}
