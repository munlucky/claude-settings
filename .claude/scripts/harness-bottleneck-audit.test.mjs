#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeHarnessBottlenecks, renderTextReport } from './harness-bottleneck-audit.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bottleneck-audit-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function skillBody(name, lineCount) {
  return [
    '---',
    `name: ${name}`,
    '---',
    '',
    '# Skill',
    ...Array.from({ length: lineCount }, (_, index) => `line ${index + 1}`),
  ].join('\n');
}

test('detects oversized public skills and local Codex memory bottlenecks', () => {
  const root = tempDir();
  const memoryFile = path.join(root, 'MEMORY.md');
  writeFile(path.join(root, '.claude/skills/moonshot-phase-runner/SKILL.md'), skillBody('moonshot-phase-runner', 220));
  writeFile(path.join(root, '.claude/skills/completion-verifier/SKILL.md'), skillBody('completion-verifier', 130));
  writeFile(path.join(root, '.codex/skills/moonshot-phase-runner/SKILL.md'), skillBody('moonshot-phase-runner', 10));
  writeFile(memoryFile, [
    '# Task Group: claude-settings phase loop',
    'applies_to: cwd=' + root.replaceAll('/', '\\') + '; reuse_rule=test',
    '## Failures and how to do differently',
    '- phase harness가 멈춘다 -> delegated-terminal fallback을 먼저 확인한다 [Task 1]',
    '- workflowEvidence.detected=false는 verifier 버그가 아니라 evidence fixture 부재일 수 있다 [Task 2]',
    '- rg.exe access denied면 Select-String fallback을 쓴다 [Task 3]',
  ].join('\n'));

  const report = analyzeHarnessBottlenecks({ rootDir: root, memoryFile });

  assert.equal(report.skillSummary.count, 2);
  assert.equal(report.mirror.driftCount, 1);
  assert.equal(report.memoryEvidenceCount, 3);
  assert.ok(report.findings.some((finding) => finding.id === 'skill-entrypoint-bloat'));
  assert.ok(report.findings.some((finding) => finding.id === 'codex-skill-mirror-drift'));
  assert.ok(report.findings.some((finding) => finding.id === 'local-history-runtime_continuation'));
});

test('uses registry-derived budgets when an overlay registry is provided', () => {
  const root = tempDir();
  const overlayRoot = path.join(root, 'overlay');
  const memoryFile = path.join(root, 'MEMORY.md');
  writeFile(path.join(root, '.claude/skills/moonshot-phase-runner/SKILL.md'), skillBody('moonshot-phase-runner', 20));
  writeFile(memoryFile, '');
  writeFile(path.join(overlayRoot, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    profile: product_definition
    stages: [intake, plan, review, finish]
    defaultExecutionMode: current-session
    fallbackExecutionMode: bounded-direct
    stateAuthority: product-artifact-package
    verificationProfile: docs_only
    lineBudget: 40
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
    lineBudget: 40
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
    lineBudget: 40
    executionBoundary:
      controlPlaneOwner: moonshot-orchestrator
      phaseAttemptOwner: not_applicable
      diffAndEvidenceOwner: parent-session
      agentLoopRole: not_applicable
skillBudgets:
  public_entrypoint: 40
  public_utility: 30
  internal_or_optional: 25
scriptBoundaries:
  deterministicHelpers: [workflow-registry.mjs, harness-bottleneck-audit.mjs]
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs]
`);

  const report = analyzeHarnessBottlenecks({ rootDir: root, overlayRoot, memoryFile });

  assert.equal(report.registry.budgetSource, 'registry');
  assert.equal(report.registry.validation.ok, true);
  assert.equal(report.skillSummary.largest[0].budget, 40);
  assert.equal(report.skillSummary.largest[0].budgetSource, 'registry');
});

test('uses staged Codex mirror when overlay mirror exists', () => {
  const root = tempDir();
  const overlayRoot = path.join(root, 'overlay');
  const memoryFile = path.join(root, 'MEMORY.md');
  const skill = [
    '---',
    'name: moonshot-phase-runner',
    'deepReferences:',
    '  - references/control-plane.md',
    '---',
    '',
    '# Skill',
    'thin entrypoint',
  ].join('\n');
  writeFile(path.join(root, '.claude/skills/moonshot-phase-runner/SKILL.md'), skillBody('moonshot-phase-runner', 20));
  writeFile(path.join(root, '.codex/skills/moonshot-phase-runner/SKILL.md'), skillBody('moonshot-phase-runner', 10));
  writeFile(path.join(overlayRoot, '.claude/skills/moonshot-phase-runner/SKILL.md'), skill);
  writeFile(path.join(overlayRoot, '.claude/skills/moonshot-phase-runner/references/control-plane.md'), '# Control Plane\n');
  writeFile(path.join(overlayRoot, '.codex/skills/moonshot-phase-runner/SKILL.md'), skill);
  writeFile(path.join(overlayRoot, '.codex/skills/moonshot-phase-runner/references/control-plane.md'), '# Control Plane\n');
  writeFile(memoryFile, '');
  writeFile(path.join(overlayRoot, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    profile: product_definition
    stages: [intake, plan, review, finish]
    defaultExecutionMode: current-session
    fallbackExecutionMode: bounded-direct
    stateAuthority: product-artifact-package
    verificationProfile: docs_only
    lineBudget: 40
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
    lineBudget: 40
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
    lineBudget: 40
    executionBoundary:
      controlPlaneOwner: moonshot-orchestrator
      phaseAttemptOwner: not_applicable
      diffAndEvidenceOwner: parent-session
      agentLoopRole: not_applicable
skillBudgets:
  public_entrypoint: 40
  public_utility: 30
  internal_or_optional: 25
scriptBoundaries:
  deterministicHelpers: [workflow-registry.mjs, harness-bottleneck-audit.mjs]
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs]
`);

  const report = analyzeHarnessBottlenecks({ rootDir: root, overlayRoot, memoryFile });

  assert.equal(report.mirror.source, 'overlay');
  assert.equal(report.mirror.driftCount, 0);
});

test('staged Codex mirror reports missing deep references', () => {
  const root = tempDir();
  const overlayRoot = path.join(root, 'overlay');
  const memoryFile = path.join(root, 'MEMORY.md');
  const skill = [
    '---',
    'name: moonshot-phase-runner',
    'deepReferences:',
    '  - references/control-plane.md',
    '---',
    '',
    '# Skill',
    'thin entrypoint',
  ].join('\n');
  writeFile(path.join(overlayRoot, '.claude/skills/moonshot-phase-runner/SKILL.md'), skill);
  writeFile(path.join(overlayRoot, '.claude/skills/moonshot-phase-runner/references/control-plane.md'), '# Control Plane\n');
  writeFile(path.join(overlayRoot, '.codex/skills/moonshot-phase-runner/SKILL.md'), skill);
  writeFile(memoryFile, '');
  writeFile(path.join(overlayRoot, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    profile: product_definition
    stages: [intake, plan, review, finish]
    defaultExecutionMode: current-session
    fallbackExecutionMode: bounded-direct
    stateAuthority: product-artifact-package
    verificationProfile: docs_only
    lineBudget: 40
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
    lineBudget: 40
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
    lineBudget: 40
    executionBoundary:
      controlPlaneOwner: moonshot-orchestrator
      phaseAttemptOwner: not_applicable
      diffAndEvidenceOwner: parent-session
      agentLoopRole: not_applicable
skillBudgets:
  public_entrypoint: 40
  public_utility: 30
  internal_or_optional: 25
scriptBoundaries:
  deterministicHelpers: [workflow-registry.mjs, harness-bottleneck-audit.mjs]
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs]
`);

  const report = analyzeHarnessBottlenecks({ rootDir: root, overlayRoot, memoryFile });

  assert.equal(report.mirror.source, 'overlay');
  assert.equal(report.mirror.missingCount, 1);
  assert.equal(report.mirror.records[0].artifact, 'references/control-plane.md');
});

test('staged Codex mirror reports source-side broken deep references', () => {
  const root = tempDir();
  const overlayRoot = path.join(root, 'overlay');
  const memoryFile = path.join(root, 'MEMORY.md');
  const skill = [
    '---',
    'name: moonshot-phase-runner',
    'deepReferences:',
    '  - references/missing-source.md',
    '---',
    '',
    '# Skill',
    'thin entrypoint',
  ].join('\n');
  writeFile(path.join(overlayRoot, '.claude/skills/moonshot-phase-runner/SKILL.md'), skill);
  writeFile(path.join(overlayRoot, '.codex/skills/moonshot-phase-runner/SKILL.md'), skill);
  writeFile(memoryFile, '');
  writeFile(path.join(overlayRoot, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  product-orchestrator:
    profile: product_definition
    stages: [intake, plan, review, finish]
    defaultExecutionMode: current-session
    fallbackExecutionMode: bounded-direct
    stateAuthority: product-artifact-package
    verificationProfile: docs_only
    lineBudget: 40
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
    lineBudget: 40
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
    lineBudget: 40
    executionBoundary:
      controlPlaneOwner: moonshot-orchestrator
      phaseAttemptOwner: not_applicable
      diffAndEvidenceOwner: parent-session
      agentLoopRole: not_applicable
skillBudgets:
  public_entrypoint: 40
  public_utility: 30
  internal_or_optional: 25
scriptBoundaries:
  deterministicHelpers: [workflow-registry.mjs, harness-bottleneck-audit.mjs]
  fallbackAdapters: [agent-loop.mjs]
  forbiddenPrimaryOwners: [agent-loop.mjs]
`);

  const report = analyzeHarnessBottlenecks({ rootDir: root, overlayRoot, memoryFile });

  assert.equal(report.mirror.missingCount, 1);
  assert.equal(report.mirror.records[0].status, 'source-reference-missing');
});

test('fails closed when a live registry exists but is invalid', () => {
  const root = tempDir();
  const memoryFile = path.join(root, 'MEMORY.md');
  writeFile(path.join(root, '.claude/skills/moonshot-phase-runner/SKILL.md'), skillBody('moonshot-phase-runner', 20));
  writeFile(memoryFile, '');
  writeFile(path.join(root, '.claude/workflow.registry.yaml'), `
schemaVersion: 1
entrypoints:
  moonshot-phase-runner:
    defaultExecutionMode: delegated-terminal
`);

  assert.throws(
    () => analyzeHarnessBottlenecks({ rootDir: root, memoryFile }),
    /invalid workflow registry/,
  );
});

test('renders a compact text report for operator use', () => {
  const root = tempDir();
  const memoryFile = path.join(root, 'MEMORY.md');
  writeFile(path.join(root, '.claude/skills/moonshot-orchestrator/SKILL.md'), skillBody('moonshot-orchestrator', 200));
  writeFile(memoryFile, [
    '# Task Group: claude-settings closeout',
    'applies_to: cwd=' + root.replaceAll('/', '\\') + '; reuse_rule=test',
    '- commit closeout에서 MemoryGraph Transport closed를 blocker로 취급하지 않는다 [Task 1]',
  ].join('\n'));

  const report = analyzeHarnessBottlenecks({ rootDir: root, memoryFile });
  const text = renderTextReport(report);

  assert.match(text, /Harness Bottleneck Audit/);
  assert.match(text, /skill-entrypoint-bloat/);
  assert.match(text, /memory evidence: 1 local Codex hits/);
});
