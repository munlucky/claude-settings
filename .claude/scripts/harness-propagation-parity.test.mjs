#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluatePropagationParity } from './harness-propagation-parity.mjs';

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function seed(root, phaseRunnerMode = 'forked-agent') {
  for (const skill of ['product-orchestrator', 'moonshot-phase-runner', 'moonshot-orchestrator', 'session-logger', 'commit-moonshot', 'completion-verifier']) {
    const body = `---\nname: ${skill}\n---\n# ${skill}\n`;
    writeFile(path.join(root, '.claude/skills', skill, 'SKILL.md'), body);
    writeFile(path.join(root, '.codex/skills', skill, 'SKILL.md'), body);
  }
  writeFile(path.join(root, '.claude/agents/phase-attempt-agent.md'), '# Phase attempt agent\n');
  writeFile(path.join(root, '.claude/scripts/agent-loop.mjs'), '#!/usr/bin/env node\n');
  writeFile(path.join(root, '.claude/scripts/verify.mjs'), '#!/usr/bin/env node\n');
  writeFile(path.join(root, '.claude/docs/guidelines/skill-composition.md'), '# Skill Composition\n');
  writeFile(path.join(root, '.claude/verification.contract.yaml'), 'schemaVersion: 1\n');
  writeFile(path.join(root, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    defaultExecutionMode: current-session
  moonshot-phase-runner:
    defaultExecutionMode: ${phaseRunnerMode}
  moonshot-orchestrator:
    defaultExecutionMode: current-session
scriptBoundaries:
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs, agent-loop-phase-runner.mjs, moonshot-phase-dispatch.mjs]
`);
}

test('passes when phase runner is forked-agent and mirrors are synced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'propagation-parity-'));
  seed(root);

  const result = evaluatePropagationParity({ rootDir: root });

  assert.equal(result.verdict, 'passed');
});

test('fails stale delegated-terminal primary mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'propagation-parity-'));
  seed(root, 'delegated-terminal');

  const result = evaluatePropagationParity({ rootDir: root });

  assert.equal(result.verdict, 'failed');
  assert.ok(result.violations.some((violation) => violation.code === 'stale_phase_runner_primary_mode'));
});

test('fails staged mirror drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'propagation-parity-'));
  seed(root);
  writeFile(path.join(root, '.codex/skills/moonshot-phase-runner/SKILL.md'), '# drift\n');

  const result = evaluatePropagationParity({ rootDir: root });

  assert.equal(result.verdict, 'failed');
  assert.ok(result.violations.some((violation) => violation.code === 'staged_mirror_drift'));
});

test('fails internal staged skill mirror drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'propagation-parity-'));
  seed(root);
  writeFile(path.join(root, '.codex/skills/completion-verifier/SKILL.md'), '# drift\n');

  const result = evaluatePropagationParity({ rootDir: root });

  assert.equal(result.verdict, 'failed');
  assert.ok(result.violations.some((violation) => violation.code === 'staged_mirror_drift' && violation.skill === 'completion-verifier'));
});

test('fails forbidden agent-loop primary owner fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'propagation-parity-'));
  seed(root);
  writeFile(path.join(root, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    defaultExecutionMode: current-session
  moonshot-phase-runner:
    defaultExecutionMode: forked-agent
    executionBoundary:
      controlPlaneOwner: agent-loop.mjs
  moonshot-orchestrator:
    defaultExecutionMode: current-session
scriptBoundaries:
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs, agent-loop-phase-runner.mjs, moonshot-phase-dispatch.mjs]
`);

  const result = evaluatePropagationParity({ rootDir: root });

  assert.equal(result.verdict, 'failed');
  assert.ok(result.violations.some((violation) => violation.code === 'forbidden_primary_owner' && violation.ownerField === 'controlPlaneOwner'));
});

test('fails generic forbidden owner fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'propagation-parity-'));
  seed(root);
  writeFile(path.join(root, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    defaultExecutionMode: current-session
  moonshot-phase-runner:
    defaultExecutionMode: forked-agent
    owner: agent-loop.mjs
  moonshot-orchestrator:
    defaultExecutionMode: current-session
scriptBoundaries:
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs, agent-loop-phase-runner.mjs, moonshot-phase-dispatch.mjs]
`);

  const result = evaluatePropagationParity({ rootDir: root });

  assert.equal(result.verdict, 'failed');
  assert.ok(result.violations.some((violation) => violation.code === 'forbidden_primary_owner' && violation.ownerField === 'owner'));
});
