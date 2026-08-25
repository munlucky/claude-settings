#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { resolveKernelRuntimeHome, resolveProjectTrack, ensureAccountRootTrack } from '../scripts/kernel/runtime-home.mjs';
import { canonicalizeHostSessionId } from '../scripts/kernel/run/host-session.mjs';
import { runCodexIndependentReview, runCodexKernelWorker } from '../scripts/host/kernel/codex-review-host.mjs';

const args = process.argv.slice(2);
const command = args[0] || '';
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const values = (flag) => args.flatMap((item, index) => item === flag && args[index + 1] ? [args[index + 1]] : []);
const json = args.includes('--json');
const output = (payload) => console.log(json ? JSON.stringify(payload) : Object.entries(payload).map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n'));

try {
  if (!['review', 'dispatch'].includes(command)) throw new Error('Usage: moon-relay-kernel-host <review|dispatch> --run-id <id> --project-root <path> [--image <path>] [--json]');
  const runId = value('--run-id');
  const projectRoot = path.resolve(value('--project-root') || process.cwd());
  const runtimeHome = value('--runtime-home') || resolveKernelRuntimeHome();
  const nativeSessionId = value('--session-id') || process.env.MOON_RELAY_KERNEL_SESSION_ID || process.env.CODEX_THREAD_ID;
  if (!runId || !nativeSessionId) throw Object.assign(new Error('host_binding_missing'), { code: 'host_binding_missing' });
  const parentSessionId = canonicalizeHostSessionId({ provider: 'codex', sessionId: nativeSessionId });
  const trackEnv = { ...process.env, MOON_RELAY_KERNEL_HOME: runtimeHome };
  const trackResolution = await resolveProjectTrack(projectRoot, {
    env: trackEnv,
    allowAccountRootDefault: true,
  });
  if (trackResolution.track !== 'kernel') {
    throw Object.assign(
      new Error(`wrong_harness: Kernel host requires account-root track=kernel (found ${trackResolution.track || 'none'} from ${trackResolution.source} for ${projectRoot})`),
      {
        code: 'wrong_harness',
        details: {
          activeTrack: trackResolution.track || null,
          source: trackResolution.source,
          canonicalRoot: trackResolution.scope?.canonicalRoot || null,
          scopeKey: trackResolution.scope?.scopeKey || null,
          registryPath: trackResolution.registryPath || null,
        },
      },
    );
  }
  await ensureAccountRootTrack({
    startDir: projectRoot,
    track: 'kernel',
    env: trackEnv,
    projectId: trackEnv.MOON_RELAY_KERNEL_PROJECT_ID || null,
    workspaceId: trackEnv.MOON_RELAY_KERNEL_WORKSPACE_ID || null,
    source: 'kernel-host',
  });
  const env = {
    ...process.env,
    MOON_RELAY_KERNEL_SESSION_ID: parentSessionId,
    MOON_RELAY_KERNEL_PROVIDER: 'codex',
    MOON_RELAY_KERNEL_RUN_ID: runId,
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, env, requireHostBinding: true });
  try {
    if (command === 'review') {
      output(await runCodexIndependentReview({
        controlPlane,
        runId,
        projectRoot,
        runtimeHome,
        parentSessionId,
        obligationId: value('--obligation') || 'security-review',
        model: value('--model') || undefined,
        effort: value('--effort') || 'high',
        images: values('--image'),
        env,
      }));
    } else {
      output(await runCodexKernelWorker({
        controlPlane,
        runId,
        projectRoot,
        runtimeHome,
        parentSessionId,
        actionKind: value('--action') || 'implement',
        obligationId: value('--obligation') || null,
        complexity: value('--complexity') || null,
        env,
      }));
    }
  } finally {
    await controlPlane.close();
  }
} catch (error) {
  console.error(json ? JSON.stringify({ schemaVersion: 1, status: 'error', errorCode: error.code || error.message, message: error.message }) : error.message);
  process.exitCode = 1;
}
