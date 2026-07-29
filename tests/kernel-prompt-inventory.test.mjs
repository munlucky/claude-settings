import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const AUDIT = 'artifacts/kernel-prompt-audit';

test('the prompt audit enumerates every Kernel prompt surface it inspected', async () => {
  const inventory = JSON.parse(await readFile(`${AUDIT}/prompt-inventory.json`, 'utf8'));
  assert.equal(inventory.schemaVersion, 1);
  assert.ok(inventory.surfaces.length >= 8, 'the audit must cover the skill, the Claude agents, the Codex contract, and the provider prompts');
  for (const surface of inventory.surfaces) {
    assert.ok(existsSync(surface.path), `inventoried surface must exist: ${surface.path}`);
    assert.ok(surface.bytes > 0);
  }
  const paths = inventory.surfaces.map((s) => s.path);
  for (const required of [
    'skills/moon-relay-kernel/SKILL.md',
    'scripts/host/kernel/prompts/common-execution.mjs',
    'scripts/host/kernel/prompts/claude-opus-5.mjs',
    'scripts/host/kernel/prompts/codex-gpt-5p6.mjs',
  ]) assert.ok(paths.includes(required), `audit must inventory ${required}`);
});

test('classification keeps Kernel authority and records where common rules now live', async () => {
  const classification = JSON.parse(await readFile(`${AUDIT}/instruction-classification.json`, 'utf8'));
  const reasons = classification.classes.A_kernel_authority_kept.map((entry) => entry.reason);
  for (const authority of ['Capsule scope enforcement', 'Evidence authority', 'Review receipt independence', 'Completion authority']) {
    assert.ok(reasons.includes(authority), `Kernel authority must be classified as kept: ${authority}`);
  }
  for (const entry of classification.classes.B_common_stable_behavior_consolidated) {
    assert.match(entry.movedTo, /common-execution\.mjs$/, 'common behavior consolidates into exactly one file');
  }
});

test('the audit records that nothing was removed on suspicion', async () => {
  const classification = JSON.parse(await readFile(`${AUDIT}/instruction-classification.json`, 'utf8'));
  const report = await readFile(`${AUDIT}/removed-instructions.md`, 'utf8');
  // The investigation found no legacy instruction on a Kernel-loaded surface.
  // A future removal must be listed here with its replacement authority.
  assert.equal(classification.classes.C_duplicate_legacy_removed.length, 0);
  assert.match(report, /nothing was removed/i);
});
