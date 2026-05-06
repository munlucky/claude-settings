import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareImplementationPlanState } from './prepare-implementation-plan-state.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'prepare-implementation-plan-state.mjs');

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

test('cli exits non-zero when no phase docs are present', () => {
  const previousCwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-state-empty-'));
  try {
    process.chdir(root);
    fs.mkdirSync(path.join(root, 'docs/implementation'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/implementation/00-master-plan-v1.md'), '# Master\n', 'utf8');

    const result = spawnSync(process.execPath, [SCRIPT_PATH, '--plan-dir', 'docs/implementation'], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no phase docs found/);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function withPlanFixture(callback) {
  const previousCwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-state-'));
  try {
    process.chdir(root);
    fs.mkdirSync(path.join(root, 'docs/implementation/execution/old-run'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/implementation/close'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude/docs'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude/scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/implementation/00-master-plan-v8.md'), '# Master v8\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/00-master-plan-claude-code-parity-v8.md'), '# Master parity v8\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/01-first-phase-v8.md'), '# First Phase\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/02-second-phase-v8.md'), '# Second Phase\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/execution/old-run/QA_REPORT.md'), '# old\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs/implementation/close/old-close.md'), '# old close\n', 'utf8');
    fs.writeFileSync(path.join(root, '.claude/docs/phase-status.yaml'), 'masterPlan: docs/implementation/00-master-plan-v7.md\n', 'utf8');
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
