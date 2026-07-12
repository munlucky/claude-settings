import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRoutingDiagnosticEvent } from '../scripts/lib/provider-model-routing.mjs';
import { runShadowAdvisor, writeDiagnosticEvidence } from '../scripts/provider-model-route-advisor.mjs';

test('shadow advisor emits the selected diagnostic event and no authority mutation', () => {
  const before = { completion: 'in_progress', promotion: 'not_promoted' };
  const result = runShadowAdvisor({ tasks: [{ id: 'one', provider: 'codex', intent: { routeClass: 'normal', reason: 'test' } }] });
  assert.equal(result.promotionDecision, 'shadow_only');
  assert.equal(result.hostMutation.performed, false);
  assert.equal(result.items[0].diagnosticEvent.eventType, 'model.routing.advised');
  assert.deepEqual(before, { completion: 'in_progress', promotion: 'not_promoted' });
  assert.deepEqual(buildRoutingDiagnosticEvent(result.items[0].decision).authority, { completion: false, promotion: false });
});

test('shadow advisor keeps unsupported Claude capability advisory without GPT policy data', () => {
  const result = runShadowAdvisor({ tasks: [{ id: 'claude', provider: 'claude', intent: { routeClass: 'normal', fallback: 'gpt-5.6-luna:high', reason: 'capability probe' } }] });
  assert.equal(result.items[0].decision.applicationMode, 'unsupported');
  assert.equal(result.items[0].intent.fallback, null);
  assert.equal(JSON.stringify(result.items[0].decision).includes('gpt-5.6'), false);
});

test('mixed-provider corpus scopes Codex candidates and keeps the shared manifest provider-neutral', () => {
  const result = runShadowAdvisor({ tasks: [
    { id: 'codex', provider: 'codex', intent: { routeClass: 'normal', reason: 'codex route' } },
    { id: 'claude', provider: 'claude', intent: { routeClass: 'normal', reason: 'capability observation' } },
  ] });
  assert.deepEqual(result.calibration.evaluationManifest.candidateProfiles, ['mechanical', 'normal', 'hard_reasoning', 'long_context']);
  assert.deepEqual(result.calibration.evaluationManifest.candidateProfilesByProvider.codex, [
    'gpt-5.6-luna:high', 'gpt-5.6-luna:xhigh', 'gpt-5.6-terra:high', 'gpt-5.6-sol:high',
  ]);
  assert.equal(JSON.stringify(result.items.find((item) => item.provider === 'claude')).includes('gpt-5.6'), false);
});

test('shadow advisor demotes an otherwise enforceable candidate and can persist its diagnostic stream', async () => {
  const result = runShadowAdvisor({ tasks: [{
    id: 'over-limit',
    provider: 'codex',
    projectedInputTokens: 300000,
    tokenEstimateSource: 'runtime_authoritative',
    interceptionSupported: true,
    intent: { routeClass: 'hard_reasoning', reason: 'shadow enforcement candidate' },
  }] });
  assert.equal(result.items[0].decision.applicationMode, 'advisory');
  assert.equal(result.items[0].decision.enforcementEligible, false);
  assert.equal(result.items[0].decision.providerMetadata.shadowCandidateApplicationMode, 'enforced');

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-routing-evidence-'));
  const evidencePath = path.join(tempRoot, 'diagnostic.json');
  try {
    await writeDiagnosticEvidence(result, evidencePath);
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    assert.equal(evidence.stream, 'model.routing.advised');
    assert.equal(evidence.events.length, 1);
    assert.equal(evidence.events[0].authority.promotion, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
