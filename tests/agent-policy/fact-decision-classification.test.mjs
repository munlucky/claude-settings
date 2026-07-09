import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

const classify = (record) => {
  if (record.class === 'fact' && !record.evidence) {
    return ['fact requires evidence'];
  }
  if (record.class === 'decision' && !record.decisionAuthority) {
    return ['decision requires authority'];
  }
  if (record.class === 'assumption' && record.acceptedIntoDecision === true && !record.decisionAuthority) {
    return ['assumption cannot become decision without authority'];
  }
  if (record.class === 'blocker' && !record.unblockPath) {
    return ['blocker requires unblock path'];
  }
  return [];
};

test('agent operating policy defines fact decision assumption blocker classes', async () => {
  const policy = await readRoot('docs', 'public', 'guidelines', 'agent-operating-policy.md');
  const ledger = await readRoot('skills', 'assumption-ledger', 'SKILL.md');

  for (const term of ['`fact`', '`decision`', '`assumption`', '`blocker`']) {
    assert.match(policy, new RegExp(term.replaceAll('`', '\\`')));
    assert.match(ledger, new RegExp(term.replaceAll('`', '\\`')));
  }
  assert.match(policy, /Agents may resolve facts from evidence/);
  assert.match(policy, /must not resolve human decisions/);
  assert.match(ledger, /Do not record a human decision as a fact/);
});

test('classification rules reject facts without evidence and decisions without authority', () => {
  assert.deepEqual(classify({ class: 'fact' }), ['fact requires evidence']);
  assert.deepEqual(classify({ class: 'decision' }), ['decision requires authority']);
  assert.deepEqual(classify({ class: 'assumption', acceptedIntoDecision: true }), ['assumption cannot become decision without authority']);
  assert.deepEqual(classify({ class: 'blocker' }), ['blocker requires unblock path']);
  assert.deepEqual(classify({ class: 'fact', evidence: 'repo path' }), []);
  assert.deepEqual(classify({ class: 'decision', decisionAuthority: 'ADR-0001' }), []);
});

test('product orchestrator does not self-resolve behavior-affecting decisions', async () => {
  const skill = await readRoot('skills', 'product-orchestrator', 'SKILL.md');

  assert.match(skill, /classify unresolved input as fact, decision, assumption, or blocker/);
  assert.match(skill, /do not self-resolve decisions/);
  assert.match(skill, /scope, security, data, package\/runtime surface, or user-visible behavior/);
});
