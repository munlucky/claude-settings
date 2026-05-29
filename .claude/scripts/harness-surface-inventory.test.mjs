#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSurfaceInventory } from './harness-surface-inventory.mjs';

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function seed(root) {
  for (const skill of ['product-orchestrator', 'moonshot-phase-runner', 'moonshot-orchestrator', 'session-logger', 'commit-moonshot', 'completion-verifier']) {
    writeFile(path.join(root, '.claude/skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\n# ${skill}\n`);
    writeFile(path.join(root, '.codex/skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\n# ${skill}\n`);
  }
  writeFile(path.join(root, '.claude/agents/phase-attempt-agent.md'), '# Phase attempt agent\n');
  writeFile(path.join(root, '.claude/scripts/agent-loop.mjs'), '#!/usr/bin/env node\n');
  writeFile(path.join(root, '.claude/scripts/verify.mjs'), '#!/usr/bin/env node\n');
  writeFile(path.join(root, '.claude/docs/guidelines/skill-composition.md'), '# Skill Composition\n');
  writeFile(path.join(root, '.claude/workflow.registry.yaml'), 'schemaVersion: 1\n');
  writeFile(path.join(root, '.claude/verification.contract.yaml'), 'schemaVersion: 1\n');
}

test('classifies every required surface group', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-inventory-'));
  seed(root);

  const inventory = buildSurfaceInventory({ rootDir: root });

  assert.equal(inventory.ok, true);
  assert.ok(inventory.groups.public_workflow_entrypoints >= 3);
  assert.ok(inventory.groups.utility_entrypoints >= 2);
  assert.ok(inventory.groups.internal_stage_owner_skills >= 1);
  assert.ok(inventory.groups.codex_mirrors >= 1);
  assert.ok(inventory.groups.agent_definitions >= 1);
  assert.ok(inventory.groups.command_adapters >= 1);
  assert.ok(inventory.records.some((record) => record.owner === 'agent-loop.mjs' && record.role === 'fallback_adapter'));
});

test('overlay records take precedence for staged skills', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-inventory-'));
  seed(root);
  writeFile(path.join(root, 'overlay/.claude/skills/moonshot-phase-runner/SKILL.md'), '---\nname: moonshot-phase-runner\n---\n# staged\n');

  const inventory = buildSurfaceInventory({ rootDir: root, overlayRoot: 'overlay' });
  const phaseRunner = inventory.records.find((record) => record.path === '.claude/skills/moonshot-phase-runner/SKILL.md');

  assert.equal(phaseRunner.source, 'overlay');
});

test('merges live and overlay workflow guideline contracts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-inventory-'));
  seed(root);
  writeFile(path.join(root, '.claude/docs/guidelines/live-only.md'), '# Live Only\n');
  writeFile(path.join(root, 'overlay/.claude/docs/guidelines/skill-composition.md'), '# Staged Skill Composition\n');
  writeFile(path.join(root, 'overlay/.claude/docs/guidelines/overlay-only.md'), '# Overlay Only\n');

  const inventory = buildSurfaceInventory({ rootDir: root, overlayRoot: 'overlay' });
  const paths = inventory.records.filter((record) => record.group === 'workflow_docs_contracts').map((record) => record.path);
  const skillComposition = inventory.records.find((record) => record.path === '.claude/docs/guidelines/skill-composition.md');

  assert.ok(paths.includes('.claude/docs/guidelines/live-only.md'));
  assert.ok(paths.includes('.claude/docs/guidelines/overlay-only.md'));
  assert.equal(skillComposition.source, 'overlay');
});

test('classifies phase-attempt agent as forked phase attempt before verifier heuristics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-inventory-'));
  seed(root);
  writeFile(path.join(root, '.claude/agents/phase-attempt-agent.md'), '# Phase attempt agent\nPerforms verification inside a fresh phase attempt.\n');

  const inventory = buildSurfaceInventory({ rootDir: root });
  const agent = inventory.records.find((record) => record.path === '.claude/agents/phase-attempt-agent.md');

  assert.equal(agent.agentRole, 'forked_phase_attempt');
  assert.equal(agent.runtimeDependency, 'forked-agent');
});
