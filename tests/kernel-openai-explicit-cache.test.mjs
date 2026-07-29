import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptEnvelope } from '../scripts/host/kernel/prompt-envelope.mjs';
import { buildToolManifest } from '../scripts/host/kernel/tool-manifest.mjs';
import { buildKernelContextSegments } from '../scripts/kernel/context-segments.mjs';
import { resolveProviderPromptPolicy } from '../scripts/host/kernel/provider-prompt-policy.mjs';

// Explicit breakpoints and prompt_cache_key belong to the OpenAI Responses API.
// They apply only to a Host that has actually detected them, never to the Codex
// CLI surface by inheritance.
const responsesApiHost = {
  supportsPromptCache: true,
  supportsExplicitCacheBreakpoints: true,
  supportsCacheReadTokens: true,
  supportsCacheWriteTokens: true,
  supportsPersistedReasoning: true,
};

const envelope = (capabilities) => buildPromptEnvelope({
  provider: 'codex',
  toolManifest: buildToolManifest([{ name: 'read_file', description: 'Read a file' }]),
  contextSegments: buildKernelContextSegments({
    projectStable: { policyAnchors: [{ id: 'pa1', type: 'policy_anchor', revision: 'r1', statement: 'Provider-neutral core.' }] },
    runStable: { objective: 'Stabilize the prefix.' },
    volatile: { step: { stepId: 'step-1' } },
  }).segments,
  capabilities,
});

test('a detected Responses API Host gets explicit cache mode', () => {
  assert.equal(envelope(responsesApiHost).cachePolicy.providerMode, 'explicit');
});

test('the same provider without detection gets none', () => {
  assert.equal(envelope({}).cachePolicy.providerMode, 'none');
});

test('breakpoints are placed at the end of exactly the four cacheable prefixes', () => {
  const built = envelope(responsesApiHost);
  const cacheable = built.segments.filter((segment) => segment.cacheable).map((segment) => segment.kind);
  assert.deepEqual(cacheable, ['tool-stable', 'common-host-stable', 'provider-stable', 'project-stable', 'run-stable']);
  assert.equal(built.segments.at(-1).kind, 'volatile');
  assert.equal(built.segments.at(-1).cacheable, false);
});

test('the prefix digest is what makes a hit attributable to a prompt shape', () => {
  const built = envelope(responsesApiHost);
  assert.match(built.cacheIdentity.prefixDigest, /^sha256:[a-f0-9]{64}$/);
});

test('a low-hit prefix is not forced into an explicit write by policy alone', () => {
  // The policy exposes the mode; it does not mandate writing. Write cost is
  // real on this model family, so the decision stays with the launcher.
  const policy = resolveProviderPromptPolicy({ provider: 'codex', capabilities: responsesApiHost });
  assert.equal(policy.cachePolicy.providerMode, 'explicit');
  assert.equal(policy.cachePolicy.ttlClass, 'default');
  assert.ok(!Object.hasOwn(policy.cachePolicy, 'forceWrite'));
});
