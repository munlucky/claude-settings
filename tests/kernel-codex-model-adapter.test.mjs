import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { CODEX_CAPABILITIES, buildCodexInvocation, createCodexAdapter, selectCodexMechanism } from '../scripts/host/kernel/adapters/codex.mjs';
import { resolveModelRoute } from '../scripts/kernel/run/model-routing.mjs';
import { buildUsageReceipt } from '../scripts/host/kernel/usage-receipt.mjs';

const decisionFor = (actionKind, riskTier = 'T1') => resolveModelRoute({ runId: 'r-codex', actionKind, riskTier, obligationId: 'default' });
const resolution = (model) => ({ model, effort: model ? 'high' : null, enforcementIntent: model ? 'enforced' : 'advisory' });

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
  const adapter = createCodexAdapter({ launch: async ({ invocation }) => ({ resolvedModel: invocation.model, sessionId: 'codex-session', wallClockMs: 4200 }) });
  assert.equal(adapter.capabilities.supportsUsageTokens, false);
  const decision = decisionFor('implement');
  const dispatch = await adapter.dispatch({ decision, resolution: resolution('value-model'), strategy: 'session', executionContract: {} });
  const receipt = buildUsageReceipt({ decision, capabilities: adapter.capabilities, strategy: 'session', resolution: resolution('value-model'), dispatch, actorSessionId: dispatch.actorSessionId });
  assert.equal(receipt.enforcementStatus, 'enforced');
  assert.equal(receipt.inputTokens, null);
  assert.equal(receipt.outputTokens, null);
  assert.equal(receipt.wallClockMs, 4200);
});

test('an unresolvable model is advisory and never reported as enforced', async () => {
  const adapter = createCodexAdapter({ launch: async () => ({ resolvedModel: 'whatever-the-cli-defaults-to', sessionId: 'codex-session' }) });
  const decision = decisionFor('implement');
  const dispatch = await adapter.dispatch({ decision, resolution: resolution(null), strategy: 'session', executionContract: {} });
  assert.equal(dispatch.invocation.mechanism, 'host-default');
  const receipt = buildUsageReceipt({ decision, capabilities: adapter.capabilities, strategy: 'session', resolution: resolution(null), dispatch, actorSessionId: 'codex-session' });
  assert.equal(receipt.enforcementStatus, 'advisory');
});
