import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canonicalSkillPath = 'skills/moon-relay-kernel/SKILL.md';
const shippedSkillPath = 'package/kernel/profiles/codex/skills/moon-relay-kernel/SKILL.md';

test('Kernel entrypoint metadata is explicit-invocation only', async () => {
  const skill = await readFile(canonicalSkillPath, 'utf8');

  assert.match(skill, /description: Explicit-only entrypoint/);
  assert.match(skill, /Use only when the user explicitly names `moon-relay-kernel`/);
  assert.match(skill, /Do not infer activation from installed availability/);
  assert.match(skill, /Otherwise do not call `kernel next` or `kernel report`/);
  assert.match(skill, /kernel next --contract-json <file>/);
  assert.match(skill, /do not bootstrap a fresh session with bare `kernel next`/);
  assert.match(skill, /bare `kernel next` only after a Host binding exists/);
});

test('Codex account guidance cannot activate Kernel by itself', async () => {
  const agents = await readFile('package/kernel/profiles/codex/AGENTS.override.md', 'utf8');

  assert.match(agents, /Kernel is available but is not active by default/);
  assert.match(agents, /only when the current user request explicitly names `moon-relay-kernel`/);
  assert.match(agents, /Do not infer activation from this file/);
  assert.match(agents, /Without an explicit current-user invocation, do not call `kernel next` or `kernel report`/);
  assert.doesNotMatch(agents, /^- Active harness:/m);
  assert.doesNotMatch(agents, /^- Active track:/m);
});

test('the profile-shipped Kernel entrypoint matches the canonical explicit-only contract', async () => {
  const canonical = await readFile(canonicalSkillPath, 'utf8');
  assert.equal(await readFile(shippedSkillPath, 'utf8'), canonical);
});
