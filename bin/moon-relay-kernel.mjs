#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveKernelRuntimeHome, resolveProjectTrack, ensureAccountRootTrack } from '../scripts/kernel/runtime-home.mjs';
import { resolveKernelNode } from '../scripts/kernel/runtime-resolver.mjs';
import { computeKernelSourceIdentity } from '../scripts/kernel/control-plane.mjs';
import { resolveCanonicalHostSession } from '../scripts/kernel/run/host-session.mjs';
import { recoveryForKernelError } from '../scripts/kernel/run/binding-preflight.mjs';

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
const trackEnv = () => ({
  ...kernelEnv,
  ...(runtimeHomeArg ? { MOON_RELAY_KERNEL_HOME: runtimeHomeArg } : {}),
});
const wrongHarnessError = (resolution, root) => Object.assign(
  new Error(`wrong_harness: Kernel command requires account-root track=kernel (found ${resolution.track || 'none'} from ${resolution.source} for ${root})`),
  {
    code: 'wrong_harness',
    errorCode: 'wrong_harness',
    nextAction: 'relaunch-through-kernel-host',
    details: {
      activeTrack: resolution.track || null,
      source: resolution.source,
      canonicalRoot: resolution.scope?.canonicalRoot || null,
      scopeKey: resolution.scope?.scopeKey || null,
      registryPath: resolution.registryPath || null,
    },
  },
);
const assertKernelTrack = async (root = projectRoot) => {
  const resolution = await resolveProjectTrack(root, { env: trackEnv(), allowAccountRootDefault: true });
  if (resolution.track !== 'kernel') throw wrongHarnessError(resolution, root);
  await ensureAccountRootTrack({
    startDir: root,
    track: 'kernel',
    env: trackEnv(),
    projectId: trackEnv().MOON_RELAY_KERNEL_PROJECT_ID || null,
    workspaceId: trackEnv().MOON_RELAY_KERNEL_WORKSPACE_ID || null,
  });
  return resolution.track;
};

// The lease holder must be stable across the separate processes of one model
// session; `--session-id` lets a host pin it explicitly (P0-6).
// Codex Desktop already exports a stable UUID for the current task. Treat it
// as a host-provided binding only when the explicit Kernel variables are
// absent, so direct skill invocations can bootstrap without weakening the
// cross-session/project preflight.
const codexThreadId = process.env.CODEX_THREAD_ID || null;
const explicitSessionId = getArgValue('--session-id') || null;
const envSessionId = process.env.MOON_RELAY_KERNEL_SESSION_ID || null;
const preferredSessionId = explicitSessionId || envSessionId || codexThreadId || null;
const scopedSessionProvider = preferredSessionId?.match(/^([a-z][a-z0-9-]{0,31}):/)?.[1] || null;
const hostProvider = getArgValue('--provider')
  || process.env.MOON_RELAY_KERNEL_PROVIDER
  || scopedSessionProvider
  || (codexThreadId ? 'codex' : 'unknown-host');
let resolvedHostSession = { sessionId: null, nativeSessionId: null, source: null };
let hostSessionResolutionError = null;
try {
  resolvedHostSession = resolveCanonicalHostSession({
    provider: hostProvider,
    explicitSessionId,
    envSessionId,
    codexThreadId,
  });
} catch (error) {
  hostSessionResolutionError = error;
}
const nativeSessionId = resolvedHostSession.nativeSessionId;
const sessionId = resolvedHostSession.sessionId;
const legacySessionId = nativeSessionId && sessionId !== nativeSessionId && !nativeSessionId.includes(':')
  ? nativeSessionId
  : null;
const positionalRunId = ['next', 'report', 'resume'].includes(command)
  && args[1]
  && !args[1].startsWith('--')
  ? args[1]
  : null;
const explicitRunId = getArgValue('--run-id') || positionalRunId || null;
const envRunId = process.env.MOON_RELAY_KERNEL_RUN_ID || null;
const hostRunResolutionError = explicitRunId && envRunId && String(explicitRunId) !== String(envRunId)
  ? Object.assign(new Error('run_binding_conflict'), {
      code: 'run_binding_conflict',
      errorCode: 'run_binding_conflict',
      nextAction: 'relaunch-through-kernel-host',
      details: { bindings: [{ source: 'cli', runId: explicitRunId }, { source: 'environment', runId: envRunId }] },
    })
  : null;
const inferredRunId = explicitRunId || envRunId || null;
const kernelEnv = sessionId || inferredRunId
  ? {
      ...process.env,
      ...(sessionId ? { MOON_RELAY_KERNEL_SESSION_ID: sessionId } : {}),
      ...(sessionId ? { MOON_RELAY_KERNEL_PROVIDER: hostProvider } : {}),
      ...(legacySessionId ? { MOON_RELAY_KERNEL_LEGACY_SESSION_ID: legacySessionId } : {}),
      ...(inferredRunId ? { MOON_RELAY_KERNEL_RUN_ID: inferredRunId } : {}),
    }
  : process.env;

const openControlPlane = async () => {
  await assertKernelTrack();
  const { createKernelControlPlane } = await import('../scripts/kernel/control-plane.mjs');
  return createKernelControlPlane({
    runtimeHome: runtimeHomeArg || undefined,
    projectRoot,
    env: kernelEnv,
    requireHostBinding: true,
  });
};

const output = (value) =>
  console.log(
    json ? JSON.stringify(value) : typeof value === 'object' ? Object.entries(value).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n') : String(value)
  );

try {
  if (hostSessionResolutionError) throw hostSessionResolutionError;
  if (hostRunResolutionError) throw hostRunResolutionError;
  if (command === '--version' || command === 'version') {
    output({ productId: 'moon-relay-kernel', version: '0.1.0' });
  } else if (command === 'doctor') {
    const runtimeHome = runtimeHomeArg || resolveKernelRuntimeHome({ env: trackEnv() });
    const trackResolution = await resolveProjectTrack(projectRoot, { env: trackEnv(), allowAccountRootDefault: true });
    const activeTrack = trackResolution.track;
    if (activeTrack !== 'kernel') {
      output({ productId: 'moon-relay-kernel', runtimeHome, activeTrack, trackSource: trackResolution.source, scope: trackResolution.scope, status: 'wrong_harness' });
    } else {
      let store;
      let diagnostics;
      let projectIdentity;
      try {
        const { openKernelStateStore } = await import('../scripts/kernel/state-store.mjs');
        const { inspectKernelProjectIdentity } = await import('../scripts/kernel/project-identity-preflight.mjs');
        projectIdentity = await inspectKernelProjectIdentity({ projectRoot, runtimeHome, env: kernelEnv });
        store = await openKernelStateStore({ runtimeHome });
        diagnostics = store.diagnoseLifecycleState({
          projectId: projectIdentity.projectId,
        });
        if (projectIdentity.status === 'repair_required') {
          diagnostics.findings.push({
            code: 'project_identity_preflight_required',
            severity: projectIdentity.status === 'repair_required' ? 'error' : 'warning',
            status: projectIdentity.status,
            projectId: projectIdentity.projectId,
            canonicalRoot: projectIdentity.canonicalRoot,
            unresolvedLegacyCandidates: projectIdentity.unresolvedLegacyCandidates,
            remediation: projectIdentity.remediation,
          });
          diagnostics.counts.project_identity_preflight_required = (diagnostics.counts.project_identity_preflight_required || 0) + 1;
          if (projectIdentity.status === 'repair_required') diagnostics.status = 'degraded';
        }
      } catch (error) {
        const ambiguous = String(error?.message || '').includes('UNIQUE constraint failed');
        diagnostics = {
          schemaVersion: 1,
          status: 'degraded',
          findings: [{
            code: ambiguous ? 'ambiguous_session_binding' : 'kernel_state_unavailable',
            severity: 'error',
            message: error.message,
          }],
          counts: { [ambiguous ? 'ambiguous_session_binding' : 'kernel_state_unavailable']: 1 },
        };
      } finally {
        store?.close();
      }
      output({
        productId: 'moon-relay-kernel',
        runtimeHome,
        activeTrack,
        trackSource: trackResolution.source,
        trackScope: trackResolution.scope,
        accountRootTrack: {
          status: trackResolution.registered ? 'registered' : 'registration_required',
          path: trackResolution.registryPath || null,
        },
        status: diagnostics.status,
        diagnostics,
        projectIdentity,
      });
    }
  } else if (command === 'identity') {
    await assertKernelTrack(projectRoot);
    const runtimeHome = resolveKernelRuntimeHome({ env: trackEnv() });
    const subcommand = args[1] && !args[1].startsWith('--') ? args[1] : 'status';
    const identityArgs = { projectRoot, runtimeHome, env: kernelEnv };
    if (subcommand === 'status') {
      const { inspectKernelProjectIdentity } = await import('../scripts/kernel/project-identity-preflight.mjs');
      output(await inspectKernelProjectIdentity(identityArgs));
    } else if (subcommand === 'bootstrap') {
      const { bootstrapKernelProjectIdentity } = await import('../scripts/kernel/project-identity-preflight.mjs');
      output(await bootstrapKernelProjectIdentity({ ...identityArgs, policy: getArgValue('--policy') || 'isolate' }));
    } else if (subcommand === 'approve') {
      const { approveKernelProjectIdentityRepair } = await import('../scripts/kernel/project-identity-preflight.mjs');
      output(await approveKernelProjectIdentityRepair({
        ...identityArgs,
        legacyProjectId: getArgValue('--legacy-project-id'),
        approvalRef: getArgValue('--approval-ref'),
        approvedBy: getArgValue('--approved-by'),
      }));
    } else if (subcommand === 'repair') {
      const { repairKernelProjectIdentity } = await import('../scripts/kernel/project-identity-preflight.mjs');
      output(await repairKernelProjectIdentity({
        ...identityArgs,
        legacyProjectId: getArgValue('--legacy-project-id'),
        approvalRef: getArgValue('--approval-ref'),
      }));
    } else {
      throw new Error(`Unknown identity subcommand: ${subcommand}`);
    }
  } else if (command === 'assert-track') {
    const runtimeHome = resolveKernelRuntimeHome({ env: trackEnv() });
    const trackResolution = await resolveProjectTrack(projectRoot, { env: trackEnv(), allowAccountRootDefault: true });
    const activeTrack = trackResolution.track;
    const isReady = activeTrack === 'kernel';
    output({ productId: 'moon-relay-kernel', runtimeHome, activeTrack, trackSource: trackResolution.source, trackScope: trackResolution.scope, status: isReady ? 'ready' : 'wrong_harness' });
    if (!isReady) {
      process.exitCode = 1;
    }
  } else if (command === 'resolve-runtime') {
    output(await resolveKernelNode({ runtimeHome: managedRuntimeHome }));
  } else if (command === 'package') {
    const trackResolution = await resolveProjectTrack(process.cwd(), { env: trackEnv(), allowAccountRootDefault: true });
    const activeTrack = trackResolution.track;
    if (activeTrack !== 'kernel') {
      output({ productId: 'moon-relay-kernel', activeTrack, trackSource: trackResolution.source, status: 'wrong_harness', message: 'package command requires account-root track to be kernel' });
      process.exitCode = 1;
    } else {
      await ensureAccountRootTrack({ startDir: process.cwd(), track: 'kernel', env: trackEnv() });
      const { materializeKernelPackage } = await import('../scripts/kernel/package-build.mjs');
      const outArg = args.indexOf('--output');
      const outputRoot = outArg >= 0 ? args[outArg + 1] : `${process.cwd()}/dist/moon-relay-kernel`;
      output(await materializeKernelPackage({ sourceRoot: process.cwd(), outputRoot, dryRun: args.includes('--dry-run') }));
    }
  } else if (command === 'install') {
    const { installKernel } = await import('../scripts/kernel/installer.mjs');
    const targetRoot = getArgValue('--target-root') || process.cwd();
    const resolvedRuntimeHome = resolveKernelRuntimeHome();
    output(await installKernel({
      targetRoot,
      sourceRoot: getArgValue('--source-root') || process.cwd(),
      runtimeSource: getArgValue('--runtime-source'),
      trackHome: getArgValue('--track-home') || (path.resolve(targetRoot) === path.resolve(resolvedRuntimeHome) ? resolvedRuntimeHome : null),
    }));
  } else if (command === 'profile-install') {
    const { installKernelProfile } = await import('../scripts/kernel/profile-install.mjs');
    output(await installKernelProfile({ runtime: getArgValue('--runtime-name') || getArgValue('--runtime'), targetRoot: getArgValue('--target-root') || process.cwd(), sourceRoot: getArgValue('--source-root') || process.cwd(), skillsRoot: getArgValue('--skills-root') }));
  } else if (command === 'profile-doctor') {
    const { doctorKernelProfile } = await import('../scripts/kernel/profile-doctor.mjs');
    output(await doctorKernelProfile({
      targetRoot: getArgValue('--target-root') || process.cwd(),
      runtime: getArgValue('--runtime-name') || getArgValue('--runtime'),
      runtimeHome: getArgValue('--runtime-home') || resolveKernelRuntimeHome(),
    }));
  } else if (command === 'profile-uninstall') {
    const { uninstallKernelProfile } = await import('../scripts/kernel/profile-install.mjs');
    output(await uninstallKernelProfile({ targetRoot: getArgValue('--target-root') || process.cwd() }));
  } else if (command === 'profile-rollback') {
    const { rollbackKernelProfile } = await import('../scripts/kernel/profile-install.mjs');
    output(await rollbackKernelProfile({ targetRoot: getArgValue('--target-root') || process.cwd(), backupPath: getArgValue('--backup') }));
  } else if (command === 'uninstall') {
    const targetRoot = getArgValue('--target-root') || process.cwd();
    await assertKernelTrack(targetRoot);
    const { uninstallKernel } = await import('../scripts/kernel/installer.mjs');
    output(await uninstallKernel({ targetRoot }));
  } else if (command === 'next') {
    // Model-visible runtime command 1 of 2. When the host supplies a task
    // contract, `next` bootstraps the run idempotently so the model never
    // needs a separate `start` command (P0-1).
    const cp = await openControlPlane();
    const positionalRunId = args[1] && !args[1].startsWith('--') ? args[1] : null;
    const contractFile = getArgValue('--contract-json') || getArgValue('--objective-json');
    const explicitRunId = getArgValue('--run-id') || positionalRunId;
    const taskContract = contractFile
      ? JSON.parse(readFileSync(path.resolve(contractFile), 'utf8'))
      : null;
    let invocation;
    if (contractFile) {
      invocation = cp.resolveBoundInvocation({
        explicitRunId,
        envRunId: kernelEnv.MOON_RELAY_KERNEL_RUN_ID || null,
        taskContract,
      });
    } else {
      const runId = await cp.resolveRunId({
        explicitRunId,
        envRunId: kernelEnv.MOON_RELAY_KERNEL_RUN_ID || null,
      });
      invocation = { mode: 'resume', runId };
    }
    let res;
    if (contractFile) {
      if (invocation.mode === 'successor') {
        const successor = await cp.startSuccessor({
          invocation,
          objective: taskContract.objective,
          taskContract,
        });
        res = successor.next;
      } else if (invocation.mode === 'finalization-retry') {
        throw Object.assign(new Error('finalization_incomplete'), {
          code: 'finalization_incomplete',
          errorCode: 'finalization_incomplete',
          nextAction: 'retry-finalization',
          runId: invocation.runId,
        });
      } else if (invocation.mode === 'done') {
        res = await cp.next(invocation.runId);
      } else {
        const ensured = await cp.ensureRun({
          runId: invocation.runId,
          objective: taskContract.objective,
          taskContract,
        });
        res = ensured.next;
      }
    } else {
      res = await cp.next(invocation.runId);
    }
    await cp.close();
    output(res);
  } else if (command === 'report') {
    // Model-visible runtime command 2 of 2.
    const cp = await openControlPlane();
    const positionalRunId = args[1] && !args[1].startsWith('--') ? args[1] : null;
    const runId = await cp.resolveRunId({
      explicitRunId: getArgValue('--run-id') || positionalRunId,
      envRunId: kernelEnv.MOON_RELAY_KERNEL_RUN_ID || null,
    });
    const reportFile = getArgValue('--report-json') || getArgValue('--context-json');
    let payload = {};
    if (reportFile) {
      payload = JSON.parse(readFileSync(path.resolve(reportFile), 'utf8'));
    }
    const res = await cp.report(runId, payload);
    await cp.close();
    output(res);
  } else if (command === 'start-run') {
    // Commands below this point are internal/debug surface; models use only
    // `next` and `report`.
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
    throw new Error('DEPRECATED_COMMAND: close cannot finalize a Kernel run. Use finalize.');
  } else if (command === 'resume') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id') || args[1];
    if (!runId || runId.startsWith('--')) throw new Error('resume command requires a run id: kernel resume <run-id>');
    const res = await cp.resume(runId);
    await cp.close();
    output(res || { status: 'not_found' });
  } else if (command === 'finalize') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('finalize command requires --run-id');
    const input = readContextJson();
    const res = await cp.finalizeRun(runId, {
      gitCloseoutRequest: input.gitCloseoutRequest || null,
      changedPaths: input.changedPaths || [],
      changedFileCount: input.changedFileCount || null,
      knowledgeObservations: input.knowledgeObservations || [],
      approvals: input.approvals || [],
    });
    await cp.close();
    output(res);
  } else if (command === 'finalization-status') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('finalization-status command requires --run-id');
    const store = await (await import('../scripts/kernel/state-store.mjs')).openKernelStateStore({ runtimeHome: runtimeHomeArg || undefined });
    const res = store.getFinalizationReceipt(runId);
    await cp.close();
    output(res || { status: 'not_found' });
  } else if (command === 'git-closeout') {
    const cp = await openControlPlane();
    const runId = getArgValue('--run-id');
    if (!runId) throw new Error('git-closeout command requires --run-id');
    const res = await cp.retryGitCloseout(runId);
    await cp.close();
    output(res);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  const errorCode = error.errorCode || error.code || error.message;
  const remediation = error.details?.remediation || recoveryForKernelError({
    code: errorCode,
    projectRoot,
    provider: hostProvider,
  });
  const diagnosticKeys = [
    'legacyProjectId', 'source', 'canonicalRoot', 'legacyCanonicalRoot', 'gitCommonDir',
    'aliases', 'projectIds', 'projectId', 'nextAction', 'remediation',
  ];
  const diagnostics = {
    ...(error.details && typeof error.details === 'object' ? error.details : {}),
    ...(remediation ? { remediation } : {}),
    ...Object.fromEntries(diagnosticKeys.filter((key) => error[key] !== undefined).map((key) => [key, error[key]])),
  };
  console.error(json ? JSON.stringify({
    schemaVersion: 1,
    status: 'error',
    errorCode,
    message: error.message,
    ...(error.nextAction ? { nextAction: error.nextAction } : {}),
    ...(error.runId ? { runId: error.runId } : {}),
    ...(Object.keys(diagnostics).length ? { diagnostics } : {}),
  }) : error.message);
  process.exitCode = 1;
}
