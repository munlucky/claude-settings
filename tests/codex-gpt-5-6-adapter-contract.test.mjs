import test from 'node:test';
import assert from 'node:assert/strict';
import { adviseCodexGpt56 } from '../scripts/lib/providers/codex-gpt-5-6-adapter.mjs';

test('Codex normal route recommends Luna high in advisory profile mode', () => {
  const result = adviseCodexGpt56({ routeClass: 'normal', effortProfile: 'standard', reason: 'normal implementation' }, { projectedInputTokens: 100000, tokenEstimateSource: 'approximation' });
  assert.equal(result.provider, 'codex');
  assert.equal(result.applicationMode, 'advisory');
  assert.equal(result.selectedModel, 'gpt-5.6-luna');
  assert.equal(result.selectedEffort, 'high');
  assert.equal(result.enforcementEligible, false);
});

test('Terra requires an explicit long-context/state capability reason', () => {
  const rejected = adviseCodexGpt56({ routeClass: 'long_context', effortProfile: 'standard', reason: 'large prompt' }, { projectedInputTokens: 100000, tokenEstimateSource: 'approximation' });
  assert.equal(rejected.decisionStatus, 'rejected');
  const accepted = adviseCodexGpt56({ routeClass: 'long_context', effortProfile: 'standard', requiredCapabilities: ['declared_context_or_state_capability'], reason: 'stateful retrieval' }, { projectedInputTokens: 100000, tokenEstimateSource: 'approximation' });
  assert.equal(accepted.decisionStatus, 'accepted');
  assert.equal(accepted.selectedModel, 'gpt-5.6-terra');
});

test('Sol max requires bounded policy approval', () => {
  const rejected = adviseCodexGpt56({ routeClass: 'critical_review', effortProfile: 'max', reason: 'critical review' });
  assert.equal(rejected.decisionStatus, 'rejected');
  assert.equal(rejected.operatorApprovalRequired, true);
  const accepted = adviseCodexGpt56({ routeClass: 'critical_review', effortProfile: 'max', reason: 'approved critical review', operatorApprovalRequired: true });
  assert.equal(accepted.decisionStatus, 'accepted');
  assert.equal(accepted.selectedModel, 'gpt-5.6-sol');
});

test('272001 is warning-only when authoritative interception is unavailable', () => {
  const result = adviseCodexGpt56({ routeClass: 'normal', effortProfile: 'standard' }, { projectedInputTokens: 272001, tokenEstimateSource: 'runtime_authoritative', interceptionSupported: false });
  assert.equal(result.contextAction, 'billing_guard_warning');
  assert.equal(result.enforcementEligible, false);
});

test('272001 is enforced only when authoritative interception is supported', () => {
  const result = adviseCodexGpt56({ routeClass: 'normal' }, { projectedInputTokens: 272001, tokenEstimateSource: 'runtime_authoritative', interceptionSupported: true });
  assert.equal(result.applicationMode, 'enforced');
  assert.equal(result.applicationSurface, 'per_turn');
  assert.equal(result.enforcementEligible, true);
  assert.equal(result.contextAction, 'explicit_exception_required');
});

test('Sol ultra requires per-request approval and preserves the explicit effort', () => {
  const rejected = adviseCodexGpt56({ routeClass: 'critical_review', requestedEffort: 'ultra', reason: 'critical review' });
  assert.equal(rejected.decisionStatus, 'rejected');
  assert.equal(rejected.operatorApprovalRequired, true);
  const accepted = adviseCodexGpt56({ routeClass: 'critical_review', requestedEffort: 'ultra', operatorApprovalRequired: true, reason: 'approved red-team review' });
  assert.equal(accepted.decisionStatus, 'accepted');
  assert.equal(accepted.selectedModel, 'gpt-5.6-sol');
  assert.equal(accepted.selectedEffort, 'ultra');
});
