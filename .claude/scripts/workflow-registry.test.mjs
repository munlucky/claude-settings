#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadWorkflowRegistry,
  parseSimpleYaml,
  resolveWorkflowRegistryPath,
  validateWorkflowRegistry,
} from './workflow-registry.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-registry-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function validRegistry() {
  return `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    profile: product_definition
    stages: [intake, plan, review, finish]
    defaultExecutionMode: current-session
    fallbackExecutionMode: bounded-direct
    stateAuthority: product-artifact-package
    verificationProfile: docs_only
    lineBudget: 180
    executionBoundary:
      controlPlaneOwner: product-orchestrator
      phaseAttemptOwner: not_applicable
      diffAndEvidenceOwner: parent-session
      agentLoopRole: not_applicable
  moonshot-phase-runner:
    profile: phase
    stages: [intake, plan, ready-isolate, execute, review, verify, finish]
    defaultExecutionMode: forked-agent
    fallbackExecutionMode: delegated-terminal
    stateAuthority: phase-runtime-read-model
    verificationProfile: workflow_core
    lineBudget: 180
    executionBoundary:
      controlPlaneOwner: current-session-phase-runner
      phaseAttemptOwner: forked-agent
      diffAndEvidenceOwner: parent-session
      agentLoopRole: legacy-headless-cron-fallback
  moonshot-orchestrator:
    profile: bounded_implementation
    stages: [intake, ready-isolate, execute, review, verify, finish]
    defaultExecutionMode: current-session
    fallbackExecutionMode: bounded-direct
    stateAuthority: moonshot-analysis-context
    verificationProfile: script_change
    lineBudget: 180
    executionBoundary:
      controlPlaneOwner: moonshot-orchestrator
      phaseAttemptOwner: not_applicable
      diffAndEvidenceOwner: parent-session
      agentLoopRole: not_applicable
skillBudgets:
  public_entrypoint: 180
  public_utility: 120
  internal_or_optional: 120
scriptBoundaries:
  deterministicHelpers: [workflow-registry.mjs, harness-bottleneck-audit.mjs]
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs]
`;
}

test('loads entrypoint metadata from the overlay registry first', () => {
  const root = tempDir();
  const overlay = path.join(root, 'overlay');
  const registryPath = path.join(overlay, '.claude', 'workflow.registry.yaml');
  writeFile(registryPath, validRegistry());

  const resolved = resolveWorkflowRegistryPath({ rootDir: root, overlayRoot: overlay });
  const loaded = loadWorkflowRegistry({ rootDir: root, overlayRoot: overlay });

  assert.equal(resolved, registryPath);
  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.registry.entrypoints['moonshot-phase-runner'].defaultExecutionMode, 'forked-agent');
  assert.equal(loaded.registry.entrypoints['moonshot-phase-runner'].fallbackExecutionMode, 'delegated-terminal');
  assert.equal(
    loaded.registry.entrypoints['moonshot-phase-runner'].executionBoundary.agentLoopRole,
    'legacy-headless-cron-fallback',
  );
});

test('rejects a phase runner registry that gives agent-loop primary ownership', () => {
  const registry = parseSimpleYaml(validRegistry().replace('defaultExecutionMode: forked-agent', 'defaultExecutionMode: delegated-terminal'));
  const validation = validateWorkflowRegistry(registry);

  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((violation) => violation.includes('defaultExecutionMode')));
});

test('rejects forbidden primary owners in entrypoint execution boundaries', () => {
  const registry = parseSimpleYaml(validRegistry().replace(
    'controlPlaneOwner: current-session-phase-runner',
    'controlPlaneOwner: agent-loop.mjs',
  ));
  const validation = validateWorkflowRegistry(registry);

  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((violation) => violation.includes('forbidden primary owner')));
});

test('rejects missing deterministic helper and fallback adapter boundaries', () => {
  const registry = parseSimpleYaml(validRegistry()
    .replace('deterministicHelpers: [workflow-registry.mjs, harness-bottleneck-audit.mjs]', 'deterministicHelpers: []')
    .replace('fallbackAdapters: [agent-loop.mjs]', 'fallbackAdapters: []'));
  const validation = validateWorkflowRegistry(registry);

  assert.equal(validation.ok, false);
  assert.ok(validation.violations.some((violation) => violation.includes('deterministicHelpers')));
  assert.ok(validation.violations.some((violation) => violation.includes('fallbackAdapters')));
});
