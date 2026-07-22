#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveKernelRuntimeHome, readProjectTrack } from '../scripts/kernel/runtime-home.mjs';
import { resolveKernelNode } from '../scripts/kernel/runtime-resolver.mjs';
import { computeKernelSourceIdentity } from '../scripts/kernel/control-plane.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'doctor';
const json = args.includes('--json');

const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
};

const readContextJson = () => {
  const file = getArgValue('--context-json');
  if (!file) return {};
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
  } catch (error) {
    throw new Error(`context-json must be a readable JSON object: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('context-json must contain a JSON object');
  return parsed;
};

const installedPayloadRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const managedRuntimeHome = getArgValue('--managed-runtime-home') || installedPayloadRoot;

// Managed Node Bootstrap Re-Exec (R3.2)
if (!process.env.MOON_RELAY_KERNEL_REEXEC) {
  let runtimeInfo;
  try {
    runtimeInfo = await resolveKernelNode({ runtimeHome: managedRuntimeHome });
  } catch {
    runtimeInfo = null;
  }
  if (runtimeInfo?.source === 'managed' && runtimeInfo.nodePath && runtimeInfo.nodePath !== process.execPath) {
    const env = { ...process.env, MOON_RELAY_KERNEL_REEXEC: '1' };
    const child = spawnSync(runtimeInfo.nodePath, process.argv.slice(1), { env, stdio: 'inherit' });
    if (child.error) throw child.error;
    const signalExitCodes = { SIGINT: 130, SIGTERM: 143, SIGKILL: 137 };
    process.exit(child.signal ? (signalExitCodes[child.signal] || 1) : (child.status ?? 1));
  }
}

const runtimeHomeArg = getArgValue('--runtime-home');
const projectRoot = getArgValue('--project-root') || process.cwd();
const assertKernelTrack = async (root = projectRoot) => {
  const activeTrack = await readProjectTrack(root);
  if (activeTrack !== 'kernel') {
    throw new Error(`wrong_harness: Kernel command requires project track=kernel (found ${activeTrack || 'none'} at ${root})`);
  }
  return activeTrack;
};

const openControlPlane = async () => {
  await assertKernelTrack();
  const { createKernelControlPlane } = await import('../scripts/kernel/control-plane.mjs');
  return createKernelControlPlane({ runtimeHome: runtimeHomeArg || undefined, projectRoot });
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
    output(await resolveKernelNode({ runtimeHome: managedRuntimeHome }));
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
    output(await installKernel({ targetRoot, sourceRoot: getArgValue('--source-root') || process.cwd(), runtimeSource: getArgValue('--runtime-source') }));
  } else if (command === 'uninstall') {
    const targetRoot = getArgValue('--target-root') || process.cwd();
    await assertKernelTrack(targetRoot);
    const { uninstallKernel } = await import('../scripts/kernel/installer.mjs');
    output(await uninstallKernel({ targetRoot }));
  } else if (command === 'start-run') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id') || `run-${Date.now()}`;
    const objective = getArgValue('--objective') || 'Kernel execution task';
    const sourceIdentity = computeKernelSourceIdentity({ projectRoot, objective });
    const run = await cp.startRun({ runId, objective, sourceIdentity });
    await cp.close();
    output(run);
  } else if (command === 'status') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('status command requires --run-id');
    const res = await cp.status(runId);
    await cp.close();
    output(res || { status: 'not_found' });
  } else if (command === 'context') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('context command requires --run-id');
    const input = readContextJson();
    const res = await cp.buildStageContext(runId, { ...input, stage: getArgValue('--stage') || input.stage || 'EXECUTE' });
    await cp.close();
    output(res);
  } else if (command === 'transition') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    const nextState = getArgValue('--state');
    if (!runId || !nextState) throw new Error('transition requires --run-id and --state');
    const res = await cp.transition(runId, nextState);
    await cp.close();
    output(res);
  } else if (command === 'prove') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('prove command requires --run-id');
    const res = await cp.recordProof(runId, {
      obligationId: getArgValue('--obligation') || 'default',
      status: getArgValue('--status') || 'passed',
      evidenceRef: getArgValue('--evidence-ref'),
      command: getArgValue('--command'),
      evidenceDigest: getArgValue('--evidence-digest'),
      exitCode: Number(getArgValue('--exit-code') || 0),
    });
    await cp.close();
    output(res);
  } else if (command === 'close') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('close command requires --run-id');
    const res = await cp.closeRun(runId);
    await cp.close();
    output(res);
  } else if (command === 'resume') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('resume command requires --run-id');
    const res = await cp.getRun(runId);
    await cp.close();
    output(res || { status: 'not_found' });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(json ? JSON.stringify({ status: 'error', message: error.message }) : error.message);
  process.exitCode = 1;
}
