import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareImplementationPlanState } from './prepare-implementation-plan-state.mjs';

test('archives stale execution surfaces and rewrites phase-status for active plan', () => {
  withPlanFixture((root) => {
    const result = prepareImplementationPlanState({
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v8.md',
      statusFile: '.claude/docs/phase-status.yaml',
      executionRoot: 'docs/implementation/execution/claude-code-parity-v8',
      archiveLabel: '2026-05-06-before-v8-harness-state',
      dryRun: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.phases, 2);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/01-first-phase-v8.md')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state/execution/old-run/QA_REPORT.md')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state/close/old-close.md')), true);
    assert.equal(fs.readFileSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state/phase-status.yaml'), 'utf8'), 'masterPlan: docs/implementation/00-master-plan-v7.md\n');
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state/workflow-enforcement/current-run.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state/workflow-enforcement/latest-dispatch.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state/workflow-enforcement/dispatch-v7.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/execution/claude-code-parity-v8')), true);
    assert.equal(fs.readFileSync(path.join(root, '.claude/scripts/protected.mjs'), 'utf8'), 'protected\n');
    assert.equal(fs.readFileSync(path.join(root, '.claude/runtime-state.sqlite'), 'utf8'), 'runtime\n');
    assert.equal(fs.readFileSync(path.join(root, '.claude/memory.json'), 'utf8'), '{}\n');
    assert.equal(fs.readFileSync(path.join(root, '.claude/verification.contract.yaml'), 'utf8'), 'contract: true\n');

    const status = fs.readFileSync(path.join(root, '.claude/docs/phase-status.yaml'), 'utf8');
    assert.match(status, /masterPlan: "docs\/implementation\/00-master-plan-v8\.md"/);
    assert.match(status, /executionRoot: "docs\/implementation\/execution\/claude-code-parity-v8"/);
    assert.match(status, /activeExecutionStatus: prepared/);
    assert.match(status, /activePhaseNumber: 1/);
    assert.match(status, /activePlannedPhases: 2/);
    assert.match(status, /activePhaseDoc: "docs\/implementation\/01-first-phase-v8\.md"/);
    assert.match(status, /sprintContract: "docs\/implementation\/execution\/claude-code-parity-v8\/01-first-phase\/SPRINT_CONTRACT\.md"/);

    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      const pointer = JSON.parse(fs.readFileSync(path.join(root, '.claude/logs/workflow-enforcement', basename), 'utf8'));
      assert.equal(pointer.masterPlan, 'docs/implementation/00-master-plan-v8.md');
      assert.equal(pointer.executionRoot, 'docs/implementation/execution/claude-code-parity-v8');
      assert.equal(pointer.phaseRunLease.masterPlan, 'docs/implementation/00-master-plan-v8.md');
      assert.equal(pointer.phaseRunLease.executionRoot, 'docs/implementation/execution/claude-code-parity-v8');
    }
  });
});

test('dry-run reports actions without moving or rewriting files', () => {
  withPlanFixture((root) => {
    const result = prepareImplementationPlanState({
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v8.md',
      statusFile: '.claude/docs/phase-status.yaml',
      executionRoot: 'docs/implementation/execution/claude-code-parity-v8',
      archiveLabel: '2026-05-06-before-v8-harness-state',
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.actions.some((action) => action.type === 'move' && action.from === 'docs/implementation/execution'), true);
    assert.equal(result.pointerSelfCheck.some((entry) => entry.path.endsWith('current-run.json') && entry.stale === true), true);
    assert.equal(result.pointerSelfCheck.some((entry) => entry.path.endsWith('dispatch-v7.json') && entry.action === 'archive-stale-dispatch'), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/execution/old-run/QA_REPORT.md')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/archive/2026-05-06-before-v8-harness-state')), false);
    assert.equal(fs.readFileSync(path.join(root, '.claude/docs/phase-status.yaml'), 'utf8'), 'masterPlan: docs/implementation/00-master-plan-v7.md\n');
  });
});

test('default execution root uses the selected master plan slug', () => {
  withPlanFixture((root) => {
    const result = prepareImplementationPlanState({
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-claude-code-parity-v8.md',
      statusFile: '.claude/docs/phase-status.yaml',
      archiveLabel: '2026-05-06-before-v8-harness-state',
      dryRun: true,
    });

    assert.equal(result.executionRoot, 'docs/implementation/execution/claude-code-parity-v8');
    assert.equal(fs.existsSync(path.join(root, 'docs/implementation/execution/old-run/QA_REPORT.md')), true);
  });
});

test('prepare fails when no phase docs are present', () => {
  const previousCwd = process.cwd();
  const root = fs.mkdtempSync(tempPrefix('plan-state-empty-'));
  try {
    process.chdir(root);
    fs.mkdirSync(path.join(root, 'docs/implementation'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/implementation/00-master-plan-v1.md'), '# Master\n', 'utf8');

    assert.throws(() => {
      prepareImplementationPlanState({
        planDir: 'docs/implementation',
        masterPlan: 'docs/implementation/00-master-plan-v1.md',
      });
    }, /no phase docs found/);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function withPlanFixture(callback) {
  const previousCwd = process.cwd();
  const root = fs.mkdtempSync(tempPrefix('plan-state-'));
  try {
    process.chdir(root);
    fs.mkdirSync(path.join(root, 'docs/implementation/execution/old-run'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/implementation/close'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude/docs'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude/scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude/logs/workflow-enforcement'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/implementation/00-master-plan-v8.md'), '# Master v8\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/00-master-plan-claude-code-parity-v8.md'), '# Master parity v8\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/01-first-phase-v8.md'), '# First Phase\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/02-second-phase-v8.md'), '# Second Phase\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/execution/old-run/QA_REPORT.md'), '# old\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/close/old-close.md'), '# old close\n', 'utf8');
    fs.writeFileSync(path.join(root, '.claude/docs/phase-status.yaml'), 'masterPlan: docs/implementation/00-master-plan-v7.md\n', 'utf8');
    const stalePointer = {
      masterPlan: 'docs/implementation/00-master-plan-v7.md',
      executionRoot: 'docs/implementation/execution/claude-code-parity-v7',
      phaseRunLease: {
        masterPlan: 'docs/implementation/00-master-plan-v7.md',
        executionRoot: 'docs/implementation/execution/claude-code-parity-v7',
      },
    };
    fs.writeFileSync(path.join(root, '.claude/logs/workflow-enforcement/current-run.json'), JSON.stringify(stalePointer, null, 2), 'utf8');
    fs.writeFileSync(path.join(root, '.claude/logs/workflow-enforcement/active-phase-run.json'), JSON.stringify(stalePointer, null, 2), 'utf8');
    fs.writeFileSync(path.join(root, '.claude/logs/workflow-enforcement/latest-dispatch.json'), JSON.stringify(stalePointer, null, 2), 'utf8');
    fs.writeFileSync(path.join(root, '.claude/logs/workflow-enforcement/dispatch-v7.json'), JSON.stringify(stalePointer, null, 2), 'utf8');
    fs.writeFileSync(path.join(root, '.claude/scripts/protected.mjs'), 'protected\n', 'utf8');
    fs.writeFileSync(path.join(root, '.claude/runtime-state.sqlite'), 'runtime\n', 'utf8');
    fs.writeFileSync(path.join(root, '.claude/memory.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(root, '.claude/verification.contract.yaml'), 'contract: true\n', 'utf8');
    callback(root);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function tempPrefix(name) {
  const base = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, name);
}
