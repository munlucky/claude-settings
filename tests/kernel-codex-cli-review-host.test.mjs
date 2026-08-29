import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import {
  CODEX_WORKER_OUTPUT_SCHEMA,
  CODEX_WORKER_TIMEOUT_MS,
  CODEX_WORKSPACE_WRITE_PROBE_TIMEOUT_MS,
  createCodexCliReviewLauncher,
  createCodexCliWorkerLauncher,
  probeCodexWorkspaceWriteCapability,
  resolveObservedCodexModel,
  resolveObservedCodexSessionConfig,
  resolveObservedCodexSessionModel,
  runCodexReviewProcess,
} from '../scripts/host/kernel/codex-cli-launcher.mjs';
import { normalizeCodexWorkerReport, runCodexIndependentReview, runCodexKernelWorker } from '../scripts/host/kernel/codex-review-host.mjs';
import { CODEX_MAIN_SESSION_POLICY } from '../scripts/host/kernel/codex-session-observer.mjs';
import { createCodexAdapter } from '../scripts/host/kernel/adapters/codex.mjs';
import {
  buildCodexChildEnvironment,
  inspectCodexAuthentication,
  preflightCodexRuntime,
  resolveCodexCliExecutable,
} from '../scripts/host/kernel/codex-runtime.mjs';

const withOwnerRun = async (fn, suffix) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), `kernel-codex-review-project-${suffix}-`));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), `kernel-codex-review-home-${suffix}-`));
  await mkdir(path.join(projectRoot, '.moon-relay'), { recursive: true });
  await writeFile(path.join(projectRoot, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n');
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    scripts: { test: 'node --test', lint: 'node -e "process.exit(0)"' },
  }));
  const runId = `codex-review-${suffix}`;
  const owner = 'codex:owner-session';
  const env = {
    MOON_RELAY_KERNEL_SESSION_ID: owner,
    MOON_RELAY_KERNEL_PROVIDER: 'codex',
    MOON_RELAY_KERNEL_RUN_ID: runId,
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, env, requireHostBinding: true });
  try {
    await controlPlane.ensureRun({
      runId,
      objective: 'review a protected change',
      taskContract: { acceptance: ['secure'], securityBoundary: true, riskTier: 'T3' },
    });
    await controlPlane.transition(runId, 'EXECUTE');
    await controlPlane.transition(runId, 'PROVE');
    return await fn({ controlPlane, runId, projectRoot, runtimeHome, owner, env });
  } finally {
    await controlPlane.close();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
};

const stableParentObserver = async ({ parentSessionId }) => ({ sessionId: parentSessionId, model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort });

test('the production Codex worker Host dispatches an ordinary child and reports its lineage', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-worker-host-project-'));
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-worker-host-home-'));
  const runId = 'codex-worker-host-run';
  const parentSessionId = 'codex:worker-host-parent';
  const env = {
    MOON_RELAY_KERNEL_SESSION_ID: parentSessionId,
    MOON_RELAY_KERNEL_PROVIDER: 'codex',
    MOON_RELAY_KERNEL_RUN_ID: runId,
  };
  const controlPlane = await createKernelControlPlane({ runtimeHome, projectRoot, env, requireHostBinding: true });
  try {
    await controlPlane.ensureRun({ runId, objective: 'dispatch ordinary Codex work', taskContract: { acceptance: ['child work'] } });
    const result = await runCodexKernelWorker({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId,
      parentSessionObserver: stableParentObserver,
      cliLaunch: async ({ invocation }) => ({
        status: 'completed',
        resolvedModel: invocation.model,
        resolvedEffort: invocation.effort,
        observedModel: invocation.model,
        observedEffort: invocation.effort,
        observedSessionConfig: { model: invocation.model, effort: invocation.effort },
        sessionId: 'codex:ordinary-child',
        outcome: {
          status: 'completed',
          summary: 'child completed',
          changedPaths: [],
          risks: [],
          requestedVerifications: [],
          judgments: [],
          knowledgeObservations: [],
          blocker: null,
        },
      }),
    });
    assert.equal(result.dispatched.dispatch.dispatchMechanism, 'cli-worker');
    assert.equal(result.dispatched.dispatch.actorSessionId, 'codex:ordinary-child');
    assert.equal(result.report.status, 'in-progress', JSON.stringify(result.report));
  } finally {
    await controlPlane.close();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(runtimeHome, { recursive: true, force: true });
  }
});

test('an external Node Host returns typed unsupported capability when parent telemetry is unavailable', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    const result = await runCodexKernelWorker({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      env,
      actionKind: 'implement',
    });
    assert.equal(result.status, 'unsupported');
    assert.equal(result.errorCode, 'codex-host-capability-unsupported');
    assert.equal(result.worker.status, 'unsupported');
    assert.equal(result.worker.resultStatus, 'failed');
    assert.equal(result.worker.enforcementStatus, 'unsupported');
    assert.equal(result.worker.outcome, null);
    assert.equal(result.report, null);
    assert.equal(result.dispatched.receipt.enforcementStatus, 'unsupported');
    assert.equal(result.dispatched.receipt.resultStatus, 'failed');
  }, 'external-node-capability');
});

test('the Codex worker Host maps worker verification requests and blockers into Kernel report fields', () => {
  assert.deepEqual(normalizeCodexWorkerReport({
    status: 'completed',
    requestedVerifications: ['test:routing'],
    blocker: null,
  }).verifications, [{ commandRef: 'test:routing' }]);
  assert.deepEqual(normalizeCodexWorkerReport({
    status: 'completed',
    verifications: [],
    requestedVerifications: ['legacy-only'],
    blocker: null,
  }).verifications, []);
  assert.deepEqual(normalizeCodexWorkerReport({
    status: 'blocked',
    requestedVerifications: [],
    blocker: 'unsupported-verification',
  }).blocker, { reason: 'unsupported-verification', detail: 'unsupported-verification' });
  assert.equal(normalizeCodexWorkerReport({ status: 'failed', blocker: null }).blocker.reason, 'external-dependency');
});

test('the Codex worker output schema closes structured verification bindings while retaining legacy refs', () => {
  const structured = CODEX_WORKER_OUTPUT_SCHEMA.properties.verifications;
  assert.equal(structured.type, 'array');
  assert.deepEqual(structured.items.required, ['obligationId', 'commandRef', 'acceptanceCoverage']);
  assert.equal(structured.items.additionalProperties, false);
  assert.deepEqual(structured.items.properties, {
    obligationId: { type: 'string' },
    commandRef: { type: 'string' },
    acceptanceCoverage: { type: 'array', items: { type: 'string' } },
  });
  assert.deepEqual(CODEX_WORKER_OUTPUT_SCHEMA.properties.requestedVerifications, { type: 'array', items: { type: 'string' } });
  assert.ok(CODEX_WORKER_OUTPUT_SCHEMA.required.includes('verifications'));
  assert.ok(CODEX_WORKER_OUTPUT_SCHEMA.required.includes('requestedVerifications'));
  assert.deepEqual(
    [...CODEX_WORKER_OUTPUT_SCHEMA.required].sort(),
    Object.keys(CODEX_WORKER_OUTPUT_SCHEMA.properties).sort(),
  );
});

test('the Codex worker Host preserves structured obligation and acceptance bindings and rejects incomplete entries', () => {
  const verifications = [
    {
      obligationId: 'unit-test',
      commandRef: 'test:kernel:codex-review',
      acceptanceCoverage: ['AC-1', 'AC-2', 'AC-3', 'AC-4'],
    },
    {
      obligationId: 'static-analysis',
      commandRef: 'lint:kernel',
      acceptanceCoverage: ['AC-5'],
    },
  ];
  assert.deepEqual(normalizeCodexWorkerReport({
    status: 'completed',
    verifications,
    requestedVerifications: ['legacy-command-must-not-win'],
    blocker: null,
  }).verifications, verifications);
  assert.throws(() => normalizeCodexWorkerReport({
    status: 'completed',
    verifications: [{ commandRef: 'lint:kernel', acceptanceCoverage: ['AC-5'] }],
  }), /obligationId/);
  assert.throws(() => normalizeCodexWorkerReport({
    status: 'completed',
    verifications: [{ obligationId: 'static-analysis', commandRef: 'lint:kernel' }],
  }), /acceptanceCoverage/);
});

test('the Codex worker Host forwards structured verification bindings unchanged to the Kernel report boundary', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    const forwarded = [];
    controlPlane.report = async (_runId, payload) => {
      forwarded.push(payload);
      return { status: 'in-progress', runId: _runId };
    };
    const verifications = [
      {
        obligationId: 'unit-test',
        commandRef: 'test:kernel:codex-review',
        acceptanceCoverage: ['AC-1', 'AC-2', 'AC-3', 'AC-4'],
      },
      {
        obligationId: 'static-analysis',
        commandRef: 'lint:kernel',
        acceptanceCoverage: ['AC-5'],
      },
    ];
    const result = await runCodexKernelWorker({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      parentSessionObserver: stableParentObserver,
      env,
      cliLaunch: async ({ invocation }) => ({
        status: 'completed',
        resolvedModel: invocation.model,
        resolvedEffort: invocation.effort,
        observedModel: invocation.model,
        observedEffort: invocation.effort,
        observedSessionConfig: { model: invocation.model, effort: invocation.effort },
        sessionId: 'codex:structured-child',
        outcome: {
          status: 'completed',
          summary: 'structured child completed',
          changedPaths: [],
          risks: [],
          verifications,
          requestedVerifications: [],
          judgments: [],
          knowledgeObservations: [],
          blocker: null,
        },
      }),
    });
    assert.equal(result.report.status, 'in-progress');
    assert.equal(forwarded.length, 1);
    assert.deepEqual(forwarded[0].verifications, verifications);
    assert.deepEqual(forwarded[0].requestedVerifications, []);
  }, 'structured-forwarding');
});

test('Codex CLI launcher enforces an explicit model, fresh session, read-only sandbox, and structured output', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-launcher-'));
  let observed = null;
  const spawnImpl = (command, args) => {
    observed = { command, args };
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(async () => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      await writeFile(outputPath, JSON.stringify({ verdict: 'pass', findings: [], risks: [], evidenceRefs: ['src/a.mjs:1'] }));
      child.stdout.end([
        JSON.stringify({ type: 'thread.started', thread_id: 'reviewer-thread' }),
        JSON.stringify({ type: 'turn.completed', model: 'gpt-5.6-sol', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 } }),
      ].join('\n'));
      child.stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  try {
    const launch = createCodexCliReviewLauncher({ projectRoot, spawnImpl, env: { ...process.env, CODEX_HOME: undefined } });
    const result = await launch({
      invocation: { model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only', freshSessionRequired: true, profile: 'review' },
      executionCapsule: { role: 'reviewer' },
      executionContract: { permissions: 'read_only' },
    });
    assert.equal(result.sessionId, 'reviewer-thread');
    assert.equal(result.resolvedModel, 'gpt-5.6-sol');
    assert.equal(result.inputTokens, 10);
    assert.ok(observed.args.includes('read-only'));
    assert.ok(observed.args.includes('gpt-5.6-sol'));
    assert.ok(observed.args.includes('--output-schema'));
    assert.ok(observed.args.includes('--output-last-message'));
    assert.ok(!observed.args.includes('--ignore-user-config'));
    assert.equal(observed.args[observed.args.indexOf('--profile') + 1], 'review');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('Codex CLI launcher completes from turn.completed without waiting for child close and cleans the child', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-launcher-no-close-'));
  let child = null;
  const killSignals = [];
  const spawnImpl = (command, args) => {
    child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal) => {
      killSignals.push(signal);
      child.killed = true;
      return true;
    };
    queueMicrotask(async () => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      await writeFile(outputPath, JSON.stringify({ verdict: 'pass', findings: [], risks: [], evidenceRefs: ['src/a.mjs:1'] }));
      child.stdout.end([
        JSON.stringify({ type: 'thread.started', thread_id: 'no-close-reviewer' }),
        JSON.stringify({ type: 'turn.completed', model: 'gpt-5.6-sol' }),
      ].join('\n'));
      child.stderr.end();
      // The Codex CLI can emit the terminal event while its close event is
      // withheld. The Host must terminate this child and finish from the
      // terminal event plus the structured artifact.
    });
    return child;
  };
  try {
    const launch = createCodexCliReviewLauncher({
      projectRoot,
      spawnImpl,
      timeoutMs: 250,
      env: { ...process.env, CODEX_HOME: undefined },
    });
    const startedAt = Date.now();
    const result = await launch({
      invocation: { model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only', freshSessionRequired: true },
      executionCapsule: { role: 'reviewer' },
      executionContract: { permissions: 'read_only' },
    });
    assert.ok(Date.now() - startedAt < 250);
    assert.deepEqual(killSignals, ['SIGTERM']);
    assert.equal(child.killed, true);
    assert.equal(result.sessionId, 'no-close-reviewer');
    assert.equal(result.outcome.verdict, 'pass');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('Codex CLI timeout remains fail-closed when no terminal event arrives', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const killSignals = [];
  child.kill = (signal) => {
    killSignals.push(signal);
    return true;
  };
  await assert.rejects(() => runCodexReviewProcess({
    command: 'codex',
    args: ['exec'],
    input: 'review',
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 10,
    spawnImpl: () => child,
    platform: 'linux',
  }), /codex_review_timeout after 10ms/);
  assert.deepEqual(killSignals, ['SIGTERM']);
});

test('Codex CLI worker passes model and effort to the child process and records observed values', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-worker-launcher-'));
  const workerRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-worker-worktree-'));
  let observed = null;
  const spawnImpl = (command, args, options) => {
    observed = { command, args, options };
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(async () => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      await writeFile(outputPath, JSON.stringify({
        status: 'completed',
        summary: 'worker completed',
        changedPaths: ['src/a.mjs'],
        risks: [],
        requestedVerifications: ['test:routing'],
        judgments: [],
        knowledgeObservations: [],
        blocker: null,
      }));
      child.stdout.end([
        JSON.stringify({ type: 'thread.started', thread_id: 'worker-thread' }),
        JSON.stringify({ type: 'turn.completed', model: 'gpt-5.6-luna', reasoning_effort: 'max', usage: { input_tokens: 4, output_tokens: 2 } }),
      ].join('\n'));
      child.stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  try {
    const launch = createCodexCliWorkerLauncher({
      projectRoot,
      spawnImpl,
      executable: '/native/codex',
      env: {
        ...process.env,
        CODEX_HOME: workerRoot,
        CODEX_APP_TOOLS_PIPE_PATH: '/tmp/app-tools.pipe',
        CODEX_MCP_NODE_PATH: '/tmp/app-mcp-node',
        CODEX_THREAD_ID: 'parent-thread',
        CODEX_SESSION_ID: 'parent-session',
        MOON_RELAY_TRACK: 'kernel',
        MOON_RELAY_KERNEL_HOME: '/tmp/kernel-home',
        MOON_RELAY_KERNEL_RUN_ID: 'run-id',
      },
      runtimePreflight: async () => ({ status: 'verified', authentication: { status: 'available', source: 'fixture' } }),
      workspaceWritePreflight: async () => ({ status: 'verified', effectiveSandbox: 'workspace-write' }),
    });
    const result = await launch({
      invocation: { model: 'gpt-5.6-luna', effort: 'max', sandbox: 'workspace-write', profile: 'batch' },
      executionCapsule: { role: 'implementer' },
      executionContract: { permissions: 'workspace_write' },
      workingDirectory: workerRoot,
    });
    assert.equal(result.resolvedModel, 'gpt-5.6-luna');
    assert.equal(result.resolvedEffort, 'max');
    assert.equal(result.effortObserved, true);
    assert.equal(result.report.summary, 'worker completed');
    assert.ok(observed.args.includes('--model'));
    assert.ok(observed.args.includes('gpt-5.6-luna'));
    assert.ok(observed.args.includes('-c'));
    assert.ok(observed.args.includes('model_reasoning_effort=max'));
    assert.ok(observed.args.includes('workspace-write'));
    assert.equal(observed.args[observed.args.indexOf('--profile') + 1], 'batch');
    assert.equal(observed.args[observed.args.indexOf('--cd') + 1], workerRoot);
    assert.equal(observed.options.cwd, workerRoot);
    assert.equal(observed.command, '/native/codex');
    assert.equal(observed.options.env.CODEX_HOME, path.resolve(workerRoot));
    assert.equal(observed.options.env.CODEX_EXECUTABLE, '/native/codex');
    assert.equal(observed.options.env.CODEX_APP_TOOLS_PIPE_PATH, undefined);
    assert.equal(observed.options.env.CODEX_MCP_NODE_PATH, undefined);
    assert.equal(observed.options.env.CODEX_THREAD_ID, undefined);
    assert.equal(observed.options.env.MOON_RELAY_KERNEL_HOME, undefined);
    assert.equal(observed.options.env.MOON_RELAY_KERNEL_RUN_ID, undefined);
    assert.equal(observed.options.env.MOON_RELAY_TRACK, undefined);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(workerRoot, { recursive: true, force: true });
  }
});

test('Kernel Codex runtime selects the bundled CLI and rejects cache/executable release mismatches', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-runtime-'));
  const appExecutable = path.join(fixtureRoot, 'ChatGPT.app', 'Contents', 'Resources', 'codex');
  const providerHome = path.join(fixtureRoot, 'providers', 'codex');
  try {
    await mkdir(path.dirname(appExecutable), { recursive: true });
    await mkdir(providerHome, { recursive: true });
    await writeFile(appExecutable, 'bundled codex fixture');
    await writeFile(path.join(providerHome, 'auth.json'), '{}');
    await writeFile(path.join(providerHome, 'models_cache.json'), JSON.stringify({ client_version: '0.150.0', models: [] }));

    const resolved = await resolveCodexCliExecutable({
      platform: 'darwin',
      env: {},
      appRoots: [fixtureRoot],
      commandResolver: async () => { throw new Error('PATH fallback must not win over bundled Codex'); },
    });
    assert.equal(resolved.executable, appExecutable);
    assert.equal(resolved.source, 'bundled-app-cli');

    const verified = await preflightCodexRuntime({
      executable: appExecutable,
      codexHome: providerHome,
      versionProbe: async () => 'codex-cli 0.150.0-alpha.8',
      authProbe: async () => ({ status: 'authenticated' }),
    });
    assert.equal(verified.status, 'verified');
    assert.equal(verified.cacheClientVersion, '0.150.0');
    assert.equal(verified.executableVersion, '0.150.0-alpha.8');
    assert.equal(verified.modelCount, 0);

    await assert.rejects(
      () => preflightCodexRuntime({
        executable: '/opt/homebrew/bin/codex',
        codexHome: providerHome,
        versionProbe: async () => 'codex-cli 0.147.0',
      }),
      (error) => {
        assert.equal(error.code, 'codex_runtime_version_mismatch');
        assert.equal(error.details.cacheClientVersion, '0.150.0');
        assert.equal(error.details.executableVersion, '0.147.0');
        return true;
      },
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex runtime fails before spawn when isolated auth is missing and never reads or copies user credentials', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-auth-preflight-'));
  const projectRoot = path.join(fixtureRoot, 'project');
  const providerHome = path.join(fixtureRoot, 'providers', 'codex');
  const userHome = path.join(fixtureRoot, 'user-codex');
  const accessed = [];
  let spawned = false;
  try {
    await mkdir(projectRoot, { recursive: true });
    await mkdir(providerHome, { recursive: true });
    await mkdir(userHome, { recursive: true });
    await writeFile(path.join(providerHome, 'models_cache.json'), JSON.stringify({ client_version: '0.150.0', models: [] }));
    await writeFile(path.join(userHome, 'auth.json'), '{"access_token":"must-never-be-read"}');
    const accessImpl = async (candidate) => {
      accessed.push(candidate);
      if (path.resolve(candidate) === path.resolve(path.join(userHome, 'auth.json'))) return;
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    };
    const auth = await inspectCodexAuthentication({ codexHome: providerHome, userCodexHome: userHome, accessImpl });
    assert.equal(auth.status, 'unavailable');
    assert.equal(auth.userHomeAuthAvailable, true);
    const launch = createCodexCliWorkerLauncher({
      projectRoot,
      executable: '/native/codex',
      env: { CODEX_HOME: providerHome },
      spawnImpl: () => { spawned = true; throw new Error('must not spawn'); },
      runtimePreflight: (options) => preflightCodexRuntime({
        ...options,
        userCodexHome: userHome,
        accessImpl,
        versionProbe: async () => 'codex-cli 0.150.0',
      }),
    });
    await assert.rejects(() => launch({
      invocation: { model: 'gpt-5.6-luna', effort: 'max', sandbox: 'workspace-write' },
      executionCapsule: {},
      executionContract: {},
    }), (error) => {
      assert.equal(error.code, 'codex_isolated_auth_missing');
      assert.equal(error.failureCategory, 'provider/infrastructure');
      assert.equal(error.failureStage, 'pre-spawn');
      assert.equal(error.details.userHomeAuthAvailable, true);
      assert.equal(error.details.credentialContentsInspected, false);
      assert.match(error.details.remediation, /CODEX_HOME=/);
      assert.doesNotMatch(JSON.stringify(error), /must-never-be-read/);
      return true;
    });
    assert.equal(spawned, false);
    assert.deepEqual(accessed.map((candidate) => path.basename(candidate)), ['auth.json', 'auth.json', 'auth.json', 'auth.json']);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex runtime accepts an environment credential without exposing its value and still checks executable/cache compatibility', async () => {
  const providerHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-env-auth-'));
  try {
    await writeFile(path.join(providerHome, 'models_cache.json'), JSON.stringify({ client_version: '0.150.0', models: [] }));
    const result = await preflightCodexRuntime({
      executable: '/native/codex',
      codexHome: providerHome,
      env: { OPENAI_API_KEY: 'secret-value-must-not-leak' },
      versionProbe: async () => 'codex-cli 0.150.0',
      authProbe: async () => ({ status: 'authenticated' }),
    });
    assert.equal(result.status, 'verified');
    assert.equal(result.authentication.source, 'environment');
    assert.equal(result.compatibility, 'release-line');
    assert.doesNotMatch(JSON.stringify(result), /secret-value-must-not-leak/);
  } finally {
    await rm(providerHome, { recursive: true, force: true });
  }
});

test('Codex runtime treats an unusable auth artifact as a redacted pre-spawn failure', async () => {
  const providerHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-invalid-auth-'));
  try {
    await writeFile(path.join(providerHome, 'auth.json'), '{}');
    await writeFile(path.join(providerHome, 'models_cache.json'), JSON.stringify({ client_version: '0.150.0', models: [] }));
    await assert.rejects(() => preflightCodexRuntime({
      executable: '/native/codex',
      codexHome: providerHome,
      versionProbe: async () => 'codex-cli 0.150.0',
      authProbe: async () => { throw new Error('refresh_token=must-not-leak'); },
    }), (error) => {
      assert.equal(error.code, 'codex_auth_status_probe_failed');
      assert.equal(error.failureCategory, 'provider/infrastructure');
      assert.equal(error.details.credentialContentsInspected, false);
      assert.doesNotMatch(JSON.stringify(error), /must-not-leak/);
      return true;
    });
  } finally {
    await rm(providerHome, { recursive: true, force: true });
  }
});

test('Codex Host classifies pre-spawn authentication refusal as provider infrastructure with redacted remediation', async () => {
  const providerHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-host-classification-'));
  try {
    await writeFile(path.join(providerHome, 'models_cache.json'), JSON.stringify({ client_version: '0.150.0', models: [] }));
    const adapter = createCodexAdapter({
      nativeLaunch: false,
      parentSessionObserver: stableParentObserver,
      cliLaunch: async () => preflightCodexRuntime({
        executable: '/native/codex',
        codexHome: providerHome,
        userCodexHome: path.join(providerHome, 'different-user-home'),
        versionProbe: async () => 'codex-cli 0.150.0',
      }),
    });
    const result = await adapter.dispatch({
      decision: { role: 'implementer', actionKind: 'implement', permissions: 'workspace_write', workProfile: {} },
      resolution: { model: 'gpt-5.6-luna', effort: 'max' },
      strategy: 'enforced',
      executionContract: {},
      parentSessionId: 'codex:parent',
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.errorCode, 'codex_isolated_auth_missing');
    assert.equal(result.failureCategory, 'provider/infrastructure');
    assert.equal(result.failureStage, 'pre-spawn');
    assert.equal(result.runtimePreflight.status, 'failed');
    assert.match(result.remediation, /Authenticate the isolated Codex provider home/);
  } finally {
    await rm(providerHome, { recursive: true, force: true });
  }
});

test('implementation workers preserve the bounded 10 minute production timeout and use a short permission probe', () => {
  assert.equal(CODEX_WORKER_TIMEOUT_MS, 10 * 60 * 1000);
  assert.equal(CODEX_WORKSPACE_WRITE_PROBE_TIMEOUT_MS, 15 * 1000);
});

test('workspace-write capability probe fails closed on a managed read-only turn_context before worker dispatch', async () => {
  let observedInvocation = null;
  await assert.rejects(() => probeCodexWorkspaceWriteCapability({
    executable: '/native/codex',
    invocation: { model: 'gpt-5.6-luna', effort: 'low', profile: 'batch' },
    workingDirectory: '/workspace/project',
    env: { CODEX_HOME: '/isolated/provider-home', SAFE_MARKER: 'preserved' },
    timeoutMs: 37,
    runProcess: async (options) => {
      observedInvocation = options;
      return {
        code: 0,
        stdout: [
          JSON.stringify({ type: 'thread.started', thread_id: '019fe611-87bd-7d83-b920-87d03a4e5a78' }),
          JSON.stringify({ type: 'turn.completed' }),
        ].join('\n'),
        stderr: '',
      };
    },
    resolveSessionConfig: async () => ({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'read-only' },
      permissionProfile: {
        type: 'managed',
        file_system: { type: 'restricted', entries: [{ path: { type: 'special', value: { kind: 'root' } }, access: 'read' }] },
      },
    }),
  }), (error) => {
    assert.equal(error.code, 'codex_worker_effective_permission_mismatch');
    assert.equal(error.failureStage, 'pre-spawn');
    assert.equal(error.failureCategory, 'provider/infrastructure');
    assert.equal(error.details.effectiveSandbox, 'read-only');
    assert.equal(error.details.effectiveApprovalPolicy, 'never');
    assert.deepEqual(error.details.effectivePermissionProfile, {
      type: 'managed', fileSystemType: 'restricted', accesses: ['read'],
    });
    assert.equal(error.details.probeTimeoutMs, 37);
    assert.match(error.details.remediation, /native spawn_agent/);
    assert.match(error.details.remediation, /standalone Codex CLI/);
    assert.doesNotMatch(JSON.stringify(error), /access_token|refresh_token/);
    return true;
  });
  assert.equal(observedInvocation.command, '/native/codex');
  assert.equal(observedInvocation.cwd, '/workspace/project');
  assert.equal(observedInvocation.env.SAFE_MARKER, 'preserved');
  assert.equal(observedInvocation.timeoutMs, 37);
  assert.deepEqual(observedInvocation.args.slice(0, 2), ['exec', '--json']);
  assert.equal(observedInvocation.args[observedInvocation.args.indexOf('--sandbox') + 1], 'workspace-write');
  assert.equal(observedInvocation.args[observedInvocation.args.indexOf('--profile') + 1], 'batch');
  assert.match(observedInvocation.input, /Do not call tools/);
});

test('CLI worker does not spawn the real implementation after permission preflight mismatch', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-permission-preflight-'));
  let workerSpawned = false;
  try {
    const launch = createCodexCliWorkerLauncher({
      projectRoot,
      executable: '/native/codex',
      env: { CODEX_HOME: projectRoot },
      runtimePreflight: async () => ({ status: 'verified' }),
      workspaceWritePreflight: async () => {
        throw Object.assign(new Error('effective permission mismatch'), {
          code: 'codex_worker_effective_permission_mismatch',
          failureStage: 'pre-spawn',
          failureCategory: 'provider/infrastructure',
        });
      },
      spawnImpl: () => {
        workerSpawned = true;
        throw new Error('real worker must not spawn');
      },
    });
    await assert.rejects(() => launch({
      invocation: { model: 'gpt-5.6-luna', effort: 'low', sandbox: 'workspace-write' },
      executionCapsule: {},
      executionContract: {},
    }), (error) => error.code === 'codex_worker_effective_permission_mismatch');
    assert.equal(workerSpawned, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('workspace-write capability probe wraps its short timeout as typed pre-spawn infrastructure failure', async () => {
  const started = Date.now();
  await assert.rejects(() => probeCodexWorkspaceWriteCapability({
    executable: '/native/codex',
    invocation: { model: 'gpt-5.6-luna', effort: 'low' },
    workingDirectory: '/workspace/project',
    env: {},
    timeoutMs: 5,
    runProcess: async ({ timeoutMs }) => {
      assert.equal(timeoutMs, 5);
      throw Object.assign(new Error('bounded probe timeout'), {
        code: 'codex_cli_timeout',
        details: { cleanupStatus: 'completed', cleanupClassification: 'terminated', lineageSource: 'launch-snapshot' },
      });
    },
  }), (error) => {
    assert.equal(error.code, 'codex_worker_permission_probe_timeout');
    assert.equal(error.failureStage, 'pre-spawn');
    assert.equal(error.details.probeTimeoutMs, 5);
    assert.equal(error.details.cleanupStatus, 'completed');
    return true;
  });
  assert.ok(Date.now() - started < 1_000, 'injected timeout regression must finish in under one second');
});

test('workspace-write capability probe preserves the worker path when effective permission is verified', async () => {
  const result = await probeCodexWorkspaceWriteCapability({
    executable: '/native/codex',
    invocation: { model: 'gpt-5.6-luna', effort: 'low' },
    workingDirectory: '/workspace/project',
    env: {},
    runProcess: async () => ({
      code: 0,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: '019fe611-87bd-7d83-b920-87d03a4e5a78' }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n'),
      stderr: '',
    }),
    resolveSessionConfig: async () => ({
      approvalPolicy: 'on-request',
      sandboxPolicy: { type: 'workspace-write' },
      permissionProfile: { type: 'managed', file_system: { type: 'restricted', entries: [{ access: 'write' }] } },
    }),
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.effectiveSandbox, 'workspace-write');
  assert.deepEqual(result.effectivePermissionProfile.accesses, ['write']);
});

test('Codex Host safely exposes effective permission mismatch diagnostics from CLI preflight', async () => {
  const mismatch = Object.assign(new Error('managed provider forced read-only'), {
    code: 'codex_worker_effective_permission_mismatch',
    failureCategory: 'provider/infrastructure',
    failureStage: 'pre-spawn',
    details: {
      failureCategory: 'provider/infrastructure',
      failureStage: 'pre-spawn',
      remediation: 'Use native spawn_agent or a verified standalone Codex CLI.',
      probeTimeoutMs: 15_000,
      effectiveSandbox: 'read-only',
      effectiveApprovalPolicy: 'never',
      effectivePermissionProfile: { type: 'managed', fileSystemType: 'restricted', accesses: ['read'] },
    },
  });
  const adapter = createCodexAdapter({
    nativeLaunch: false,
    parentSessionObserver: stableParentObserver,
    cliLaunch: async () => { throw mismatch; },
  });
  const result = await adapter.dispatch({
    decision: { role: 'implementer', actionKind: 'implement', permissions: 'workspace_write', workProfile: {} },
    resolution: { model: 'gpt-5.6-luna', effort: 'low' },
    strategy: 'enforced',
    executionContract: {},
    parentSessionId: 'codex:parent',
  });
  assert.equal(result.errorCode, 'codex_worker_effective_permission_mismatch');
  assert.equal(result.failureStage, 'pre-spawn');
  assert.equal(result.runtimePreflight.probeTimeoutMs, 15_000);
  assert.equal(result.runtimePreflight.effectiveSandbox, 'read-only');
  assert.deepEqual(result.runtimePreflight.effectivePermissionProfile.accesses, ['read']);
});

test('Codex child environment strips app-host and Kernel binding capabilities while preserving provider scope', () => {
  const childEnv = buildCodexChildEnvironment({
    env: {
      CODEX_HOME: '/tmp/global-codex',
      CODEX_APP_TOOLS_PIPE_PATH: '/tmp/app-tools.pipe',
      CODEX_MCP_NODE_PATH: '/tmp/app-mcp-node',
      CODEX_THREAD_ID: 'parent-thread',
      CODEX_SESSION_ID: 'parent-session',
      CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'Codex Desktop',
      CODEX_PERMISSION_PROFILE: ':danger-full-access',
      CODEX_SHELL: '1',
      MOON_RELAY_TRACK: 'kernel',
      MOON_RELAY_KERNEL_HOME: '/tmp/kernel-home',
      MOON_RELAY_KERNEL_SESSION_ID: 'codex:parent',
      PRESERVE_ME: 'yes',
    },
    executable: '/native/codex',
    codexHome: '/tmp/kernel-home/providers/codex',
  });
  assert.equal(childEnv.CODEX_HOME, path.resolve('/tmp/kernel-home/providers/codex'));
  assert.equal(childEnv.CODEX_EXECUTABLE, '/native/codex');
  assert.equal(childEnv.PRESERVE_ME, 'yes');
  for (const key of [
    'CODEX_APP_TOOLS_PIPE_PATH', 'CODEX_MCP_NODE_PATH', 'CODEX_THREAD_ID',
    'CODEX_SESSION_ID', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'CODEX_PERMISSION_PROFILE',
    'CODEX_SHELL', 'MOON_RELAY_TRACK', 'MOON_RELAY_KERNEL_HOME', 'MOON_RELAY_KERNEL_SESSION_ID',
  ]) assert.equal(childEnv[key], undefined, `${key} must not reach a standalone CLI child`);
});

test('Codex CLI worker leaves effort null when the provider omits effort telemetry', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-worker-no-effort-'));
  const spawnImpl = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(async () => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      await writeFile(outputPath, JSON.stringify({
        status: 'completed', summary: 'done', changedPaths: [], risks: [], requestedVerifications: [], judgments: [], knowledgeObservations: [], blocker: null,
      }));
      child.stdout.end([
        JSON.stringify({ type: 'thread.started', thread_id: 'worker-no-effort' }),
        JSON.stringify({ type: 'turn.completed', model: 'gpt-5.6-luna' }),
      ].join('\n'));
      child.stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  try {
    const result = await createCodexCliWorkerLauncher({
      projectRoot,
      spawnImpl,
      env: { ...process.env, CODEX_HOME: undefined },
      workspaceWritePreflight: async () => ({ status: 'verified', effectiveSandbox: 'workspace-write' }),
    })({
      invocation: { model: 'gpt-5.6-luna', effort: 'max', sandbox: 'workspace-write' },
      executionContract: {},
      executionCapsule: {},
    });
    assert.equal(result.resolvedModel, 'gpt-5.6-luna');
    assert.equal(result.resolvedEffort, null);
    assert.equal(result.effortObserved, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('Codex launcher never echoes a requested model when provider events omit model identity', () => {
  assert.equal(resolveObservedCodexModel([
    { type: 'thread.started', thread_id: 'reviewer-thread', model: 'requested-model-is-not-proof' },
    { type: 'turn.completed', usage: { input_tokens: 10 } },
  ]), null);
  assert.equal(resolveObservedCodexModel([
    { type: 'turn.completed', model: 'gpt-5.6-sol' },
  ]), 'gpt-5.6-sol');
});

test('Codex launcher resolves missing stdout model identity from the matching CLI session rollout', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-observed-session-'));
  const threadId = '019fe611-87bd-7d83-b920-87d03a4e5a78';
  const startedAt = new Date('2026-08-09T10:28:56.000Z');
  const dateRoot = path.join(codexHome, 'sessions', '2026', '08', '09');
  await mkdir(dateRoot, { recursive: true });
  try {
    await writeFile(path.join(dateRoot, `rollout-2026-08-09T19-28-56-${threadId}.jsonl`), [
      JSON.stringify({ type: 'session_meta', payload: { id: threadId, session_id: threadId, source: 'exec' } }),
      JSON.stringify({
        type: 'turn_context',
        payload: {
          model: 'gpt-5.6-sol',
          approval_policy: 'never',
          sandbox_policy: { type: 'read-only' },
          permission_profile: { type: 'managed', file_system: { type: 'restricted', entries: [{ access: 'read' }] } },
        },
      }),
    ].join('\n'));
    assert.equal(await resolveObservedCodexSessionModel({
      threadId,
      env: { CODEX_HOME: codexHome },
      startedAt,
    }), 'gpt-5.6-sol');
    const observed = await resolveObservedCodexSessionConfig({
      threadId,
      env: { CODEX_HOME: codexHome },
      startedAt,
    });
    assert.equal(observed.approvalPolicy, 'never');
    assert.equal(observed.sandboxPolicy.type, 'read-only');
    assert.equal(observed.permissionProfile.type, 'managed');
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('Codex CLI launcher uses the matching session rollout when terminal events omit model identity', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-launcher-session-fallback-'));
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-launcher-session-home-'));
  const threadId = '019fe611-87bd-7d83-b920-87d03a4e5a78';
  const spawnImpl = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(async () => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      const now = new Date();
      const dateRoot = path.join(codexHome, 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
      await mkdir(dateRoot, { recursive: true });
      await writeFile(path.join(dateRoot, `rollout-live-${threadId}.jsonl`), [
        JSON.stringify({ type: 'session_meta', payload: { id: threadId } }),
        JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.6-sol' } }),
      ].join('\n'));
      await writeFile(outputPath, JSON.stringify({ verdict: 'pass', findings: [], risks: [], evidenceRefs: ['src/a.mjs:1'] }));
      child.stdout.end([
        JSON.stringify({ type: 'thread.started', thread_id: threadId }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10 } }),
      ].join('\n'));
      child.stderr.end();
      child.emit('close', 0);
    });
    return child;
  };
  try {
    const launch = createCodexCliReviewLauncher({
      projectRoot,
      spawnImpl,
      env: { ...process.env, CODEX_HOME: codexHome },
      runtimePreflight: async () => ({ status: 'verified', authentication: { status: 'available', source: 'fixture' } }),
    });
    const result = await launch({
      invocation: { model: 'gpt-5.6-sol', effort: 'high', sandbox: 'read-only', freshSessionRequired: true },
      executionCapsule: { role: 'reviewer' },
      executionContract: { permissions: 'read_only' },
    });
    assert.equal(result.resolvedModel, 'gpt-5.6-sol');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('Codex session model resolver rejects a rollout whose internal identity does not match', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-mismatched-session-'));
  const threadId = '019fe611-87bd-7d83-b920-87d03a4e5a78';
  const startedAt = new Date('2026-08-09T10:28:56.000Z');
  const dateRoot = path.join(codexHome, 'sessions', '2026', '08', '09');
  await mkdir(dateRoot, { recursive: true });
  try {
    await writeFile(path.join(dateRoot, `rollout-2026-08-09T19-28-56-${threadId}.jsonl`), [
      JSON.stringify({ type: 'session_meta', payload: { id: 'different-session' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'requested-model-is-not-proof' } }),
    ].join('\n'));
    assert.equal(await resolveObservedCodexSessionModel({
      threadId,
      env: { CODEX_HOME: codexHome },
      startedAt,
    }), null);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('Windows review timeout waits for verified process-tree cleanup and fails closed when cleanup cannot be proven', async () => {
  const child = new EventEmitter();
  child.pid = 4321;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  const observed = [];
  const base = {
    command: 'codex.ps1',
    args: ['exec'],
    input: 'review',
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 5,
    platform: 'win32',
    spawnImpl: () => child,
    resolveWindowsScript: () => 'C:\\tools\\codex.ps1',
  };
  await assert.rejects(() => runCodexReviewProcess({
    ...base,
    cleanupWindowsProcessTree: (request) => {
      observed.push(request);
      return { status: 'completed', survivors: [], lineageSource: 'launch-snapshot' };
    },
  }), (error) => {
    assert.equal(error.code, 'codex_cli_timeout');
    assert.equal(error.failureCategory, 'provider/infrastructure');
    assert.equal(error.failureStage, 'worker-timeout');
    assert.equal(error.details.cleanupStatus, 'completed');
    assert.equal(error.details.lineageSource, 'launch-snapshot');
    assert.equal(error.details.survivors, 0);
    return true;
  });
  assert.equal(observed.length, 1);
  assert.equal(observed[0].launcherPid, 4321);
  assert.deepEqual(observed[0].expectedArgs, ['C:\\tools\\codex.ps1']);

  const blockedChild = new EventEmitter();
  blockedChild.pid = 4322;
  blockedChild.stdin = new PassThrough();
  blockedChild.stdout = new PassThrough();
  blockedChild.stderr = new PassThrough();
  blockedChild.kill = () => {};
  await assert.rejects(() => runCodexReviewProcess({
    ...base,
    spawnImpl: () => blockedChild,
    cleanupWindowsProcessTree: () => ({ status: 'blocked', reason: 'post-cleanup-process-table-unavailable' }),
  }), /codex_review_timeout_cleanup_failed: post-cleanup-process-table-unavailable/);
});

test('Codex review Host records a complete routed receipt from a distinct read-only session', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    const result = await runCodexIndependentReview({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      parentSessionConfig: {
        before: { sessionId: owner, model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort },
        after: { sessionId: owner, model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort },
      },
      env,
      launch: async ({ invocation }) => {
        assert.equal(invocation.sandbox, 'read-only');
        assert.equal(invocation.freshSessionRequired, true);
        return {
          status: 'completed',
          resolvedModel: invocation.model,
          resolvedEffort: invocation.effort,
          effortObserved: true,
          sessionId: 'codex:independent-reviewer',
          outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['package.json:1'] },
        };
      },
    });
    assert.match(result.reviewReceiptId, /^review-receipt-/);
    assert.equal(result.verdict, 'pass');
    const receipt = controlPlane.listReviewReceipts(runId).find((item) => item.receiptId === result.reviewReceiptId);
    assert.equal(receipt.reviewer.enforcementStatus, 'enforced');
    assert.equal(receipt.reviewer.modelClass, 'frontier_reasoning');
    assert.notEqual(receipt.reviewer.actorSessionId, receipt.implementer.actorSessionId);
    assert.deepEqual(receipt.acceptanceCoverage, []);
  }, 'pass');
});

test('Codex review Host uses a bounded native sub-agent and keeps the Kernel receipt chain', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    let request = null;
    const result = await runCodexIndependentReview({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      parentSessionObserver: stableParentObserver,
      env,
      nativeAgentHost: {
        spawn_agent: async (payload) => {
          request = payload;
          return {
            session_id: 'codex:local-reviewer',
            terminalEvents: [{ type: 'turn.completed', model: CODEX_MAIN_SESSION_POLICY.model.replace('luna', 'sol'), reasoning_effort: 'xhigh' }],
            outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['package.json:1'] },
          };
        },
      },
      // If the native local path regresses to the external launcher, this
      // test must fail rather than silently exercising the wrong boundary.
      cliLaunch: async () => {
        throw new Error('external-review-launcher-should-not-run');
      },
    });
    assert.equal(result.verdict, 'pass');
    assert.match(result.reviewReceiptId, /^review-receipt-/);
    assert.equal(request.task_name, 'kernel_reviewer');
    assert.equal(request.model, 'gpt-5.6-sol');
    assert.equal(request.reasoning_effort, 'xhigh');
    assert.deepEqual(request.child_session, {
      role: 'reviewer',
      canDelegate: false,
      canCommit: false,
      freshSessionRequired: true,
    });
    assert.match(request.message, /read-only reviewer/i);
    assert.match(request.message, /Do not edit files/i);
    const receipt = controlPlane.listReviewReceipts(runId).find((item) => item.receiptId === result.reviewReceiptId);
    assert.equal(receipt.reviewer.modelClass, 'frontier_reasoning');
    assert.equal(receipt.reviewer.enforcementStatus, 'enforced');
    assert.notEqual(receipt.reviewer.actorSessionId, receipt.implementer.actorSessionId);
  }, 'native-local');
});

test('Codex review Host rejects a reviewer session equal to the owner session', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    await assert.rejects(() => runCodexIndependentReview({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      parentSessionObserver: stableParentObserver,
      env,
      launch: async ({ invocation }) => ({
        status: 'completed',
        resolvedModel: invocation.model,
        sessionId: owner,
        outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: [] },
      }),
    }), /incomplete_review_chain|reviewing session is the implementing session/);
    assert.equal(controlPlane.listReviewReceipts(runId).length, 0);
  }, 'same-session');
});

test('Codex review Host rejects a protected review without observed model identity', async () => {
  await withOwnerRun(async ({ controlPlane, runId, projectRoot, runtimeHome, owner, env }) => {
    await assert.rejects(() => runCodexIndependentReview({
      controlPlane,
      runId,
      projectRoot,
      runtimeHome,
      parentSessionId: owner,
      parentSessionObserver: stableParentObserver,
      env,
      launch: async () => ({
        status: 'completed',
        sessionId: 'codex:reviewer-without-model-telemetry',
        outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['package.json:1'] },
      }),
    }), /incomplete_review_chain/);
    assert.equal(controlPlane.listReviewReceipts(runId).length, 0);
  }, 'missing-model-identity');
});
