import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptEnvelope, buildPrefixDigest, PREFIX_EXCLUDED_FIELDS } from '../scripts/host/kernel/prompt-envelope.mjs';
import { buildToolManifest } from '../scripts/host/kernel/tool-manifest.mjs';
import { buildKernelContextSegments } from '../scripts/kernel/context-segments.mjs';

const segments = (overrides = {}) => buildKernelContextSegments({
  projectStable: { policyAnchors: [{ id: 'pa1', type: 'policy_anchor', revision: 'r1', statement: 'Core stays provider-neutral.' }] },
  runStable: { objective: 'Stabilize the prefix.' },
  volatile: { step: { stepId: 'step-1', objective: 'Add segments.' } },
  ...overrides,
}).segments;

const build = (overrides = {}) => buildPromptEnvelope({
  provider: 'claude',
  role: 'implementer',
  toolManifest: buildToolManifest([{ name: 'read_file', description: 'Read a file' }]),
  contextSegments: segments(),
  modelPolicy: { resolvedModel: 'model-a', resolvedEffort: 'high' },
  control: { runId: 'run-1', stepId: 'step-1', capsuleId: 'capsule-1' },
  ...overrides,
});

const prefix = (envelope) => envelope.cacheIdentity.prefixDigest;

test('the prefix digest ignores run, step, capsule, and mutation identity', () => {
  const first = build({ control: { runId: 'run-1', stepId: 'step-1', capsuleId: 'capsule-1', mutationRevision: 1 } });
  const second = build({ control: { runId: 'run-9', stepId: 'step-9', capsuleId: 'capsule-9', mutationRevision: 42 } });
  assert.equal(prefix(first), prefix(second));
});

test('a changed volatile tail does not change the prefix digest', () => {
  const before = build();
  const after = build({ contextSegments: segments({ volatile: { step: { stepId: 'step-2', objective: 'Wire the envelope.' } } }) });
  assert.equal(prefix(before), prefix(after));
});

test('each cacheable input actually participates in the prefix digest', () => {
  const before = build();
  assert.notEqual(prefix(before), prefix(build({ modelPolicy: { resolvedModel: 'model-b', resolvedEffort: 'high' } })));
  assert.notEqual(prefix(before), prefix(build({ modelPolicy: { resolvedModel: 'model-a', resolvedEffort: 'xhigh' } })));
  assert.notEqual(prefix(before), prefix(build({ role: 'reviewer' })));
  assert.notEqual(prefix(before), prefix(build({ toolManifest: buildToolManifest([{ name: 'read_file', description: 'Read a file differently' }]) })));
  assert.notEqual(prefix(before), prefix(build({ contextSegments: segments({ runStable: { objective: 'Different objective.' } }) })));
  assert.notEqual(prefix(before), prefix(build({ contextSegments: segments({ projectStable: { policyAnchors: [{ id: 'pa2', type: 'policy_anchor', revision: 'r1', statement: 'Different anchor.' }] } }) })));
});

test('the excluded-field list is honored by the digest function itself', () => {
  const identity = { provider: 'claude', role: 'implementer', runStableDigest: 'sha256:x' };
  const polluted = { ...identity };
  for (const field of PREFIX_EXCLUDED_FIELDS) polluted[field] = 'noise';
  assert.equal(buildPrefixDigest(identity), buildPrefixDigest(polluted));
});

test('a Claude policy change does not disturb the Codex provider prefix', () => {
  const codexBefore = build({ provider: 'codex' });
  const codexAfter = buildPromptEnvelope({
    provider: 'codex',
    role: 'implementer',
    toolManifest: buildToolManifest([{ name: 'read_file', description: 'Read a file' }]),
    contextSegments: segments(),
    modelPolicy: { resolvedModel: 'model-a', resolvedEffort: 'high' },
    control: {},
  });
  assert.equal(codexBefore.cacheIdentity.providerStableDigest, codexAfter.cacheIdentity.providerStableDigest);
  // And the two providers never share a provider-stable digest.
  assert.notEqual(build({ provider: 'claude' }).cacheIdentity.providerStableDigest, codexBefore.cacheIdentity.providerStableDigest);
});
