import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareImplementationPlanState } from './prepare-implementation-plan-state.mjs';

test('prepareImplementationPlanState seeds execution artifacts for every prepared phase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-plan-state-'));
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    fs.mkdirSync('docs/implementation', { recursive: true });
    fs.writeFileSync('docs/implementation/00-master-plan-v2.md', [
      '# Master Plan v2',
      '',
      '| Phase | Plan File |',
      '|---|---|',
      '| 09 | `docs/implementation/09-gap.md` |',
      '| 10 | `docs/implementation/10-lifecycle.md` |',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync('docs/implementation/09-gap.md', '# Phase 09: Gap\n', 'utf8');
    fs.writeFileSync('docs/implementation/10-lifecycle.md', '# Phase 10: Lifecycle\n', 'utf8');
    fs.mkdirSync('docs/implementation/execution/old-run/10-lifecycle', { recursive: true });
    fs.writeFileSync('docs/implementation/execution/old-run/10-lifecycle/SPRINT_CONTRACT.md', '# stale\n', 'utf8');

    const summary = prepareImplementationPlanState({
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v2.md',
      statusFile: '.claude/docs/phase-status.yaml',
      executionRoot: 'docs/implementation/execution/replay-lens-prd-spec-realignment-v2',
      dryRun: false,
    });

    assert.equal(summary.ok, true);
    assert.equal(summary.seededExecutionArtifacts.length, 2);
    for (const phase of summary.seededExecutionArtifacts) {
      for (const basename of ['SPRINT_CONTRACT.md', 'QA_REPORT.md', 'HANDOFF.md', 'SCORECARD.md', 'WORKSETS.yaml']) {
        assert.equal(fs.existsSync(path.join(phase.phaseExecutionDir, basename)), true, `${basename} missing for phase ${phase.phaseNum}`);
      }
    }
    assert.equal(
      fs.existsSync('docs/implementation/execution/replay-lens-prd-spec-realignment-v2/10-phase-10-lifecycle/SPRINT_CONTRACT.md'),
      true,
    );

    const verify = spawnSync(process.execPath, [
      path.join(previousCwd, '.claude/scripts/workflow-enforcement.mjs'),
      'verify',
      'docs/implementation/execution/replay-lens-prd-spec-realignment-v2/10-phase-10-lifecycle/SPRINT_CONTRACT.md',
      'docs/implementation/execution/replay-lens-prd-spec-realignment-v2/10-phase-10-lifecycle/QA_REPORT.md',
      'docs/implementation/execution/replay-lens-prd-spec-realignment-v2/10-phase-10-lifecycle/HANDOFF.md',
    ], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(verify.status, 0, `${verify.stdout}\n${verify.stderr}`);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepareImplementationPlanState preserves checked master-plan phases as completed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-plan-status-'));
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    fs.mkdirSync('docs/implementation', { recursive: true });
    fs.writeFileSync('docs/implementation/00-master-plan-v2.md', [
      '# Master Plan v2',
      '',
      '| Phase | Plan File |',
      '|---|---|',
      '| 09 | `docs/implementation/09-gap.md` |',
      '| 10 | `docs/implementation/10-lifecycle.md` |',
      '',
      '## Phase Completion Checklist',
      '- [x] Phase 09 - Gap (`docs/implementation/09-gap.md`)',
      '- [ ] Phase 10 - Lifecycle (`docs/implementation/10-lifecycle.md`)',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync('docs/implementation/09-gap.md', '# Phase 09: Gap\n', 'utf8');
    fs.writeFileSync('docs/implementation/10-lifecycle.md', '# Phase 10: Lifecycle\n', 'utf8');

    prepareImplementationPlanState({
      planDir: 'docs/implementation',
      masterPlan: 'docs/implementation/00-master-plan-v2.md',
      statusFile: '.claude/docs/phase-status.yaml',
      executionRoot: 'docs/implementation/execution/replay-lens-prd-spec-realignment-v2',
      dryRun: false,
    });

    const status = fs.readFileSync('.claude/docs/phase-status.yaml', 'utf8');
    assert.match(status, /activePhaseNumber: 10/);
    assert.match(status, /activeCompletedPhases: 1/);
    assert.match(status, /activePendingPhases: 1/);
    assert.match(status, /number: 9\n    title: "Phase 09: Gap"\n    status: completed/);
    assert.match(status, /number: 9[\s\S]*?attempts:\n      total: 1\n      lastOutcome: completed/);
    assert.match(status, /number: 10\n    title: "Phase 10: Lifecycle"\n    status: pending/);

    const reconcile = spawnSync(process.execPath, [
      path.join(previousCwd, '.claude/scripts/agent-loop-phase-state.mjs'),
      'reconcile-completed-phases',
      '.claude/docs/phase-status.yaml',
    ], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(reconcile.status, 0, `${reconcile.stdout}\n${reconcile.stderr}`);
    assert.equal(reconcile.stdout.trim(), '');
    assert.match(fs.readFileSync('.claude/docs/phase-status.yaml', 'utf8'), /number: 9\n    title: "Phase 09: Gap"\n    status: completed/);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
