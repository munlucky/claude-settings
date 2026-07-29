import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageReceipt } from '../scripts/host/kernel/usage-receipt.mjs';
import { buildPromptEnvelope } from '../scripts/host/kernel/prompt-envelope.mjs';
import { buildToolManifest } from '../scripts/host/kernel/tool-manifest.mjs';
import { resolveSessionLineage } from '../scripts/host/kernel/session-affinity.mjs';
import { CLAUDE_CAPABILITIES } from '../scripts/host/kernel/adapters/claude.mjs';

const envelope = buildPromptEnvelope({
  provider: 'claude',
  role: 'implementer',
  toolManifest: buildToolManifest([{ name: 'read_file', description: 'Read a file' }]),
  contextSegments: {},
  modelPolicy: { modelClass: 'value_coding', resolvedModel: 'model-a', resolvedEffort: 'high', speedMode: 'standard' },
  capabilities: CLAUDE_CAPABILITIES,
  env: { MOON_RELAY_KERNEL_CLAUDE_OPTIMIZATION: 'on' },
});

const lineage = resolveSessionLineage({ previous: null, current: envelope.cacheIdentity });

const receipt = buildUsageReceipt({
  decision: { decisionId: 'route-abcdef12', runId: 'run-1', modelClass: 'value_coding' },
  capabilities: CLAUDE_CAPABILITIES,
  strategy: 'subagent',
  resolution: { model: 'model-a', effort: 'high', enforcementIntent: 'enforced' },
  dispatch: { resolvedModel: 'model-a', resolvedEffort: 'high', speedMode: 'standard', inputTokens: 1000, cacheReadInputTokens: 800, cacheWriteInputTokens: 50, outputTokens: 120, reasoningTokens: 40 },
  actorSessionId: 'session-1',
  startedAt: '2026-07-29T00:00:00.000Z',
  finishedAt: '2026-07-29T00:00:03.000Z',
  envelope,
  sessionLineage: lineage,
  cacheContext: { eligiblePrefixTokens: 900, modelEscalationReason: 'complexity' },
});

test('the receipt records which prompt shape produced the cache result', () => {
  assert.equal(receipt.promptPrefixDigest, envelope.cacheIdentity.prefixDigest);
  assert.equal(receipt.cacheMode, 'on');
  assert.equal(receipt.cacheTtl, 'default');
  assert.equal(receipt.eligiblePrefixTokens, 900);
});

test('model, effort, speed, reasoning context, and delegation mode are all recorded', () => {
  assert.equal(receipt.resolvedModel, 'model-a');
  assert.equal(receipt.resolvedEffort, 'high');
  assert.equal(receipt.speedMode, 'standard');
  assert.equal(receipt.reasoningContext, envelope.modelPolicy.reasoningContext);
  assert.equal(receipt.delegationMode, 'none');
});

test('the session lineage is carried so continuation can be measured', () => {
  assert.equal(receipt.sessionLineageId, lineage.sessionLineageId);
});

test('an escalation reason is attributable', () => {
  assert.equal(receipt.modelEscalationReason, 'complexity');
});

test('cache read and write are recorded separately from total input', () => {
  assert.equal(receipt.inputTokens, 1000);
  assert.equal(receipt.cacheReadInputTokens, 800);
  assert.equal(receipt.cacheWriteInputTokens, 50);
  assert.equal(receipt.reasoningTokens, 40);
  assert.equal(receipt.cacheMissReason, null);
});

test('no provider prompt or reasoning text crosses into the receipt', () => {
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes('kernel_execution'));
  assert.ok(!serialized.includes('claude_runtime'));
});
