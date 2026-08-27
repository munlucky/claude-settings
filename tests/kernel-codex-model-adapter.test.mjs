import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { CODEX_CAPABILITIES, buildCodexInvocation, createCodexAdapter, selectCodexMechanism } from '../scripts/host/kernel/adapters/codex.mjs';
import { resolveModelRoute } from '../scripts/kernel/run/model-routing.mjs';
import { buildUsageReceipt } from '../scripts/host/kernel/usage-receipt.mjs';
import { resolveCodexActorRoute } from '../scripts/host/kernel/codex-actor-router.mjs';
import { CODEX_MAIN_SESSION_POLICY, compareCodexMainSessionInvariance, buildCodexMainSessionPolicy } from '../scripts/host/kernel/codex-session-observer.mjs';

const decisionFor = (actionKind, riskTier = 'T1') => resolveModelRoute({ runId: 'r-codex', actionKind, riskTier, obligationId: 'default' });
const resolution = (model) => ({ model, effort: model ? 'high' : null, enforcementIntent: model ? 'enforced' : 'advisory' });
const stableParentObserver = async ({ parentSessionId }) => ({
  sessionId: parentSessionId,
  model: CODEX_MAIN_SESSION_POLICY.model,
  effort: CODEX_MAIN_SESSION_POLICY.effort,
});

test('the installed Codex profile still pins no global model', async () => {
  const config = await readFile(new URL('../package/profile-templates/codex/.codex/config.toml', import.meta.url), 'utf8');
  // A global frontier pin would make every cheap implementation turn expensive,
  // which is the exact outcome this routing work exists to avoid.
  assert.equal(/^model\s*=/m.test(config), false);
  assert.equal(/^model_provider\s*=/m.test(config), false);
});

test('model selection happens per worker invocation, in declared capability order', () => {
  const withWorker = { ...CODEX_CAPABILITIES, supportsSubagentModel: true };
  assert.equal(selectCodexMechanism({ capabilities: withWorker, resolution: resolution('m') }), 'worker-model-override');
  assert.equal(selectCodexMechanism({ capabilities: CODEX_CAPABILITIES, resolution: resolution('m') }), 'session-model-override');
  const profileOnly = { ...CODEX_CAPABILITIES, supportsSessionModelOverride: false, supportsLaunchProfile: true };
  assert.equal(selectCodexMechanism({ capabilities: profileOnly, resolution: resolution('m') }), 'launch-profile');
  const neither = { ...CODEX_CAPABILITIES, supportsSessionModelOverride: false };
  assert.equal(selectCodexMechanism({ capabilities: neither, resolution: resolution('m') }), 'advisory');
  assert.equal(selectCodexMechanism({ capabilities: CODEX_CAPABILITIES, resolution: resolution(null) }), 'host-default');
});

test('the invocation carries the sandbox and approval policy the permissions imply', () => {
  const implement = buildCodexInvocation({ decision: decisionFor('implement'), resolution: resolution('value-model'), capabilities: CODEX_CAPABILITIES });
  assert.equal(implement.sandbox, 'workspace-write');
  assert.equal(implement.approvalPolicy, 'on-failure');
  assert.equal(implement.freshSessionRequired, false);

  const review = buildCodexInvocation({ decision: decisionFor('review_engineering', 'T3'), resolution: resolution('frontier-model'), capabilities: CODEX_CAPABILITIES });
  assert.equal(review.sandbox, 'read-only');
  assert.equal(review.approvalPolicy, 'on-request');
  assert.equal(review.freshSessionRequired, true);
});

test('a launch profile is named by the materialized overlay, never by provider model id', () => {
  // Regression: this used to assert 'kernel-frontier'/'kernel-value', names
  // codex-profile-materializer.mjs never writes — a launch-profile dispatch
  // would have requested a profile that does not exist. The profile is now
  // named by the action shape a Kernel model class alone cannot distinguish
  // (a protected review and a routine implementation can share
  // frontier_reasoning), matching the four overlays that actually get written.
  const profileOnly = { ...CODEX_CAPABILITIES, supportsSessionModelOverride: false, supportsLaunchProfile: true };
  const plan = buildCodexInvocation({ decision: decisionFor('plan'), resolution: resolution('m'), capabilities: profileOnly });
  const review = buildCodexInvocation({ decision: decisionFor('review_engineering'), resolution: resolution('m'), capabilities: profileOnly });
  const implement = buildCodexInvocation({ decision: decisionFor('implement'), resolution: resolution('m'), capabilities: profileOnly });
  assert.equal(plan.profile, 'plan');
  assert.equal(review.profile, 'review');
  assert.equal(implement.profile, 'default');
  assert.ok(!/^kernel-/.test(plan.profile));
});

test('Codex reports no usage tokens, so they stay unavailable rather than zero', async () => {
  const adapter = createCodexAdapter({ parentSessionObserver: stableParentObserver, launch: async ({ invocation }) => ({ resolvedModel: invocation.model, resolvedEffort: invocation.effort, effortObserved: true, sessionId: 'codex-session', wallClockMs: 4200 }) });
  assert.equal(adapter.capabilities.supportsUsageTokens, false);
  const decision = decisionFor('implement');
  const dispatch = await adapter.dispatch({ decision, resolution: resolution('value-model'), strategy: 'session', parentSessionId: 'codex-parent-session', executionContract: {} });
  const receipt = buildUsageReceipt({ decision, capabilities: adapter.capabilities, strategy: 'session', resolution: resolution('value-model'), dispatch, actorSessionId: dispatch.actorSessionId });
  assert.equal(receipt.enforcementStatus, 'enforced');
  assert.equal(receipt.inputTokens, null);
  assert.equal(receipt.outputTokens, null);
  assert.equal(receipt.wallClockMs, 4200);
});

test('an unresolvable model is advisory and never reported as enforced', async () => {
  const adapter = createCodexAdapter({ parentSessionObserver: stableParentObserver, launch: async () => ({ resolvedModel: 'whatever-the-cli-defaults-to', sessionId: 'codex-session' }) });
  const decision = decisionFor('implement');
  const dispatch = await adapter.dispatch({ decision, resolution: resolution(null), strategy: 'session', parentSessionId: 'codex-parent-session', executionContract: {} });
  assert.equal(dispatch.invocation.mechanism, 'host-default');
  const receipt = buildUsageReceipt({ decision, capabilities: adapter.capabilities, strategy: 'session', resolution: resolution(null), dispatch, actorSessionId: 'codex-session' });
  assert.equal(receipt.enforcementStatus, 'advisory');
});

test('the Codex actor route keeps the parent as an orchestrator and escalates repeated failure to a fresh actor', () => {
  const route = resolveCodexActorRoute({
    decision: { role: 'implementer', actionKind: 'debug', workProfile: { repeatedFailure: true } },
    invocation: { model: 'gpt-5.6-sol', effort: 'xhigh', freshSessionRequired: true, mechanism: 'session-model-override' },
    capabilities: CODEX_CAPABILITIES,
    hasCliLauncher: true,
  });
  assert.equal(route.role, 'debugger');
  assert.equal(route.dispatchMechanism, 'cli-worker');
  assert.equal(route.sessionPolicy, 'fresh');
  assert.equal(route.parentMayImplement, false);
  assert.equal(route.nestedDelegationAllowed, false);
});

test('the main Codex session invariance guard requires Luna/Max before and after the run', () => {
  const stable = compareCodexMainSessionInvariance({
    expectedSessionId: 'main-session',
    before: { sessionId: 'main-session', model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort },
    after: { sessionId: 'main-session', model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort },
  });
  assert.equal(stable.exact, true);
  const changed = compareCodexMainSessionInvariance({
    expectedSessionId: 'main-session',
    before: { sessionId: 'main-session', model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort },
    after: { sessionId: 'main-session', model: 'gpt-5.6-sol', effort: 'high' },
  });
  assert.equal(changed.exact, false);
  assert.equal(changed.reason, 'after-model-mismatch');
});

test('a parent session observation mismatch blocks Codex work before the launcher runs', async () => {
  let launched = false;
  const adapter = createCodexAdapter({
    launch: async () => { launched = true; return {}; },
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('implement'),
    resolution: resolution('gpt-5.6-luna'),
    parentSessionId: 'main-session',
    parentSessionConfig: {
      before: { sessionId: 'main-session', model: 'gpt-5.6-sol', effort: 'high' },
      after: { sessionId: 'main-session', model: 'gpt-5.6-sol', effort: 'high' },
    },
    executionContract: {},
  });
  assert.equal(launched, false);
  assert.equal(dispatch.status, 'failed');
  assert.equal(dispatch.errorCode, 'parent-session-invariant-failed');
  assert.match(dispatch.enforcementReason, /model-mismatch/);
});

test('missing parent model/session telemetry is an actionable unsupported capability, not a missing worker', async () => {
  let launched = false;
  const adapter = createCodexAdapter({
    parentSessionObserver: async () => null,
    launch: async () => {
      launched = true;
      return {};
    },
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('implement'),
    resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
    parentSessionId: 'external-node-parent',
    executionContract: {},
  });
  assert.equal(launched, false);
  assert.equal(dispatch.status, 'unsupported');
  assert.equal(dispatch.resultStatus, 'failed');
  assert.equal(dispatch.enforcementStatus, 'unsupported');
  assert.equal(dispatch.errorCode, 'codex-host-capability-unsupported');
  assert.equal(dispatch.outcome, null);
  assert.equal(dispatch.actorSessionId, null);
  assert.equal(dispatch.capability.capability, 'parent-session-telemetry');
  assert.match(dispatch.capability.remediation, /native Codex Host bridge|before\/after parent session observations/);
});

test('a parent policy with incomplete telemetry is unsupported while a complete mismatch remains a failure', () => {
  const missing = buildCodexMainSessionPolicy({
    parentSessionId: 'main-session',
    observed: { sessionId: 'main-session', model: CODEX_MAIN_SESSION_POLICY.model },
  });
  assert.equal(missing.observationStatus, 'unsupported');
  assert.equal(missing.capability.reason, 'parent-session-effort-telemetry-missing');

  const mismatch = buildCodexMainSessionPolicy({
    parentSessionId: 'main-session',
    observed: { sessionId: 'other-session', model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort },
  });
  assert.equal(mismatch.observationStatus, 'failed');
  assert.equal(mismatch.capability, null);
});

test('the production native launcher sends explicit model and effort and observes parent invariance around the child', async () => {
  const parentPhases = [];
  let request = null;
  const nativeAgentHost = {
    spawn_agent: async (payload) => {
      request = payload;
      return {
        session_id: 'native-child-session',
        status: 'completed',
        terminalEvents: [
          { type: 'turn.completed', model: 'gpt-5.6-luna', reasoning_effort: 'max' },
        ],
        outcome: {
          status: 'completed',
          summary: 'native worker completed',
          changedPaths: ['src/worker.mjs'],
          risks: [],
          requestedVerifications: [],
          judgments: [],
          knowledgeObservations: [],
          blocker: null,
        },
      };
    },
  };
  const adapter = createCodexAdapter({
    nativeAgentHost,
    parentSessionObserver: async ({ parentSessionId, phase }) => {
      parentPhases.push(phase);
      return { sessionId: parentSessionId, model: CODEX_MAIN_SESSION_POLICY.model, effort: CODEX_MAIN_SESSION_POLICY.effort };
    },
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('implement'),
    resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
    parentSessionId: 'main-session',
    executionContract: { permissions: 'workspace_write' },
    workingDirectory: '/workspace/worker',
    concurrencyGroup: 'run-1',
    childSession: { canDelegate: false, canCommit: false },
  });
  assert.deepEqual(parentPhases, ['before', 'after']);
  assert.equal(request.task_name, 'kernel_implementer');
  assert.equal(request.model, 'gpt-5.6-luna');
  assert.equal(request.reasoning_effort, 'max');
  assert.equal(request.working_directory, '/workspace/worker');
  assert.equal(request.concurrency_group, 'run-1');
  assert.deepEqual(request.child_session, { canDelegate: false, canCommit: false });
  assert.equal(dispatch.dispatchMechanism, 'native-subagent');
  assert.equal(dispatch.status, 'completed');
  assert.equal(dispatch.enforcementStatus, 'enforced');
  assert.equal(dispatch.parentSessionPolicy.observationStatus, 'enforced');
  assert.equal(dispatch.parentSessionPolicy.observedModel, CODEX_MAIN_SESSION_POLICY.model);
  assert.equal(dispatch.actorSessionId, 'native-child-session');
});

test('native reviewer dispatch uses the read-only review contract and schema', async () => {
  let request = null;
  const adapter = createCodexAdapter({
    nativeAgentHost: {
      spawn_agent: async (payload) => {
        request = payload;
        return {
          session_id: 'native-reviewer-session',
          terminalEvents: [{ type: 'turn.completed', model: 'gpt-5.6-sol', reasoning_effort: 'high' }],
          outcome: { verdict: 'pass', findings: [], risks: [], evidenceRefs: ['review://native'] },
        };
      },
    },
    parentSessionObserver: stableParentObserver,
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('review_engineering', 'T3'),
    resolution: { model: 'gpt-5.6-sol', effort: 'high', enforcementIntent: 'enforced' },
    parentSessionId: 'main-session',
    executionContract: { permissions: 'read_only' },
  });
  assert.equal(dispatch.status, 'completed');
  assert.equal(dispatch.outcome.verdict, 'pass');
  assert.match(request.message, /independent Kernel review/i);
  assert.doesNotMatch(request.message, /bounded Kernel worker action/i);
});

test('a parent model change observed after child execution fails the whole dispatch closed', async () => {
  let phase = null;
  let launched = false;
  const adapter = createCodexAdapter({
    parentSessionObserver: async ({ parentSessionId, phase: currentPhase }) => {
      phase = currentPhase;
      return {
        sessionId: parentSessionId,
        model: currentPhase === 'before' ? CODEX_MAIN_SESSION_POLICY.model : 'gpt-5.6-sol',
        effort: currentPhase === 'before' ? CODEX_MAIN_SESSION_POLICY.effort : 'high',
      };
    },
    launch: async ({ invocation }) => {
      launched = true;
      return { resolvedModel: invocation.model, resolvedEffort: invocation.effort, sessionId: 'worker-session' };
    },
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('implement'),
    resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
    parentSessionId: 'main-session',
    executionContract: {},
  });
  assert.equal(launched, true);
  assert.equal(phase, 'after');
  assert.equal(dispatch.status, 'failed');
  assert.equal(dispatch.errorCode, 'parent-session-invariant-failed');
  assert.match(dispatch.enforcementReason, /after-model-mismatch/);
});

test('the default Host observer proves the canonical parent rollout before and after a child dispatch', async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-parent-rollout-'));
  const threadId = '01234567-89ab-cdef-0123-456789abcdef';
  const now = new Date();
  const sessionsDir = path.join(codexHome, 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(path.join(sessionsDir, `rollout-${threadId}.jsonl`), [
    JSON.stringify({ type: 'session_meta', payload: { session_id: threadId } }),
    JSON.stringify({ type: 'turn_context', model: CODEX_MAIN_SESSION_POLICY.model, reasoning_effort: CODEX_MAIN_SESSION_POLICY.effort }),
  ].join('\n'));
  try {
    const adapter = createCodexAdapter({
      env: { CODEX_HOME: codexHome },
      launch: async ({ invocation }) => ({ resolvedModel: invocation.model, resolvedEffort: invocation.effort, sessionId: 'codex:worker-child' }),
    });
    const dispatch = await adapter.dispatch({
      decision: decisionFor('implement'),
      resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
      parentSessionId: `codex:${threadId}`,
      executionContract: {},
    });
    assert.equal(dispatch.status, 'completed');
    assert.equal(dispatch.parentSessionPolicy.observationStatus, 'enforced');
    assert.equal(dispatch.parentSessionPolicy.observedSessionId, `codex:${threadId}`);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});

test('a legacy Codex launcher cannot silently execute in the parent session', async () => {
  const adapter = createCodexAdapter({
    parentSessionObserver: stableParentObserver,
    launch: async ({ invocation }) => ({
      resolvedModel: invocation.model,
      resolvedEffort: invocation.effort,
      effortObserved: true,
      sessionId: 'main-session',
    }),
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('implement'),
    resolution: resolution('gpt-5.6-luna'),
    parentSessionId: 'main-session',
    executionContract: {},
  });
  assert.equal(dispatch.dispatchMechanism, 'legacy-launch');
  assert.equal(dispatch.status, 'failed');
  assert.equal(dispatch.enforcementReason, 'worker-session-not-distinct');
});

test('a Codex launcher failure stays a dispatch failure instead of becoming telemetry unsupported', async () => {
  const adapter = createCodexAdapter({
    parentSessionObserver: stableParentObserver,
    launch: async () => {
      throw new Error("invalid_json_schema: Missing 'verifications'");
    },
  });
  const dispatch = await adapter.dispatch({
    decision: decisionFor('implement'),
    resolution: resolution('gpt-5.6-luna'),
    parentSessionId: 'main-session',
    executionContract: {},
  });
  assert.equal(dispatch.dispatchMechanism, 'legacy-launch');
  assert.equal(dispatch.status, 'failed');
  assert.equal(dispatch.resultStatus, 'failed');
  assert.equal(dispatch.enforcementStatus, 'failed');
  assert.equal(dispatch.enforcementReason, 'codex-launch-failed');
  assert.equal(dispatch.errorCode, 'codex-launch-failed');
  assert.match(dispatch.errorSummary, /invalid_json_schema/);
});

test('a native model mismatch fails a mutating dispatch before CLI can inherit its workspace', async () => {
  const calls = [];
  const workerRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-native-mismatch-'));
  const marker = path.join(workerRoot, 'native-marker');
  try {
    const adapter = createCodexAdapter({
      parentSessionObserver: stableParentObserver,
      capabilities: { supportsSubagentModel: true },
      nativeLaunch: async ({ workingDirectory }) => {
        calls.push('native');
        await writeFile(path.join(workingDirectory, 'native-marker'), 'native touched the workspace');
        return { resolvedModel: 'gpt-5.6-sol', resolvedEffort: 'high', observedSessionConfig: { model: 'gpt-5.6-sol', effort: 'high' }, effortObserved: true, sessionId: 'native-session' };
      },
      cliLaunch: async ({ invocation }) => {
        calls.push(invocation.dispatchMechanism);
        const inheritedMarker = await readFile(marker, 'utf8');
        return { resolvedModel: invocation.model, resolvedEffort: invocation.effort, observedSessionConfig: { model: invocation.model, effort: invocation.effort }, effortObserved: true, sessionId: 'cli-session', inheritedMarker };
      },
    });
    const dispatch = await adapter.dispatch({
      decision: resolveModelRoute({ runId: 'r-codex-fallback', actionKind: 'implement', complexity: 'standard' }),
      resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
      parentSessionId: 'parent-session',
      workingDirectory: workerRoot,
      executionContract: {},
    });
    assert.deepEqual(calls, ['native']);
    assert.equal(dispatch.status, 'failed');
    assert.equal(dispatch.dispatchMechanism, 'native-subagent');
    assert.equal(dispatch.errorCode, 'model-enforcement-failed');
    assert.match(dispatch.fallbackReason, /native-model-mismatch-mutating-fallback-disabled/);
    assert.equal(await readFile(marker, 'utf8'), 'native touched the workspace');
  } finally {
    await rm(workerRoot, { recursive: true, force: true });
  }
});

test('when native and CLI observations both mismatch the dispatch fails closed', async () => {
  const adapter = createCodexAdapter({
    parentSessionObserver: stableParentObserver,
    capabilities: { supportsSubagentModel: true },
    nativeLaunch: async () => ({ resolvedModel: 'wrong-model', resolvedEffort: 'low', observedSessionConfig: { model: 'wrong-model', effort: 'low' }, effortObserved: true, sessionId: 'native-session' }),
    cliLaunch: async () => ({ resolvedModel: 'wrong-model', resolvedEffort: 'low', observedSessionConfig: { model: 'wrong-model', effort: 'low' }, effortObserved: true, sessionId: 'cli-session' }),
  });
  const dispatch = await adapter.dispatch({
    decision: resolveModelRoute({ runId: 'r-codex-failed', actionKind: 'implement' }),
    resolution: { model: 'gpt-5.6-luna', effort: 'max', enforcementIntent: 'enforced' },
    parentSessionId: 'parent-session',
    executionContract: {},
  });
  assert.equal(dispatch.status, 'failed');
  assert.equal(dispatch.errorCode, 'model-enforcement-failed');
  assert.equal(dispatch.enforcementReason, 'model-mismatch');
});
