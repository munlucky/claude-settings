import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutingDiagnosticEvent, contextActionFor, normalizeRoutingIntent } from '../scripts/lib/provider-model-routing.mjs';

test('normalizes provider-neutral routing intent without model names', () => {
  const intent = normalizeRoutingIntent({ routeClass: 'normal', effortProfile: 'standard', reason: 'bounded implementation' });
  assert.deepEqual(intent, {
    schemaVersion: 1,
    routeClass: 'normal',
    effortProfile: 'standard',
    requiredCapabilities: [],
    contextAction: 'none',
    reason: 'bounded implementation',
    fallback: null,
    operatorApprovalRequired: false,
  });
  assert.equal(JSON.stringify(intent).includes('gpt-'), false);
});

test('approximate or unknown token counts never become enforcement eligible', () => {
  for (const source of ['approximation', 'caller_supplied', 'unknown']) {
    const result = contextActionFor({ projectedInputTokens: 272001, tokenEstimateSource: source, interceptionSupported: true });
    assert.equal(result.enforcementEligible, false);
    assert.equal(result.contextAction, 'billing_guard_warning');
  }
});

test('authoritative count requires an interception surface for hard enforcement', () => {
  assert.equal(contextActionFor({ projectedInputTokens: 272001, tokenEstimateSource: 'runtime_authoritative', interceptionSupported: false }).enforcementEligible, false);
  assert.equal(contextActionFor({ projectedInputTokens: 272001, tokenEstimateSource: 'runtime_authoritative', interceptionSupported: true }).enforcementEligible, true);
});

test('generic fallback rejects provider model names', () => {
  assert.equal(normalizeRoutingIntent({ fallback: 'gpt-5.6-sol:high' }).fallback, null);
  assert.equal(normalizeRoutingIntent({ fallback: 'manual_review' }).fallback, 'manual_review');
});

test('routing evidence is a diagnostic event without completion or promotion authority', () => {
  const event = buildRoutingDiagnosticEvent({ schemaVersion: 1, provider: 'codex' }, { runId: 'run-1' });
  assert.equal(event.eventType, 'model.routing.advised');
  assert.deepEqual(event.authority, { completion: false, promotion: false });
  assert.equal('complete' in event, false);
  assert.equal('promote' in event, false);
});
