import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';
import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';

test('phase closeout fails when a completed phase is unchecked in the master checklist', () => {
  withFixture({ checklistChecked: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'master-checklist-not-checked');
  });
});

test('phase closeout fails when archivedPhaseDoc is missing', () => {
  withFixture({ archived: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'artifact_path_missing'));
  });
});

test('phase closeout fails when critical scenario evidence is missing', () => {
  withFixture({ scenarioEvidence: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'artifact_path_missing'));
  });
});

test('phase closeout fails when requirements traceability artifacts are missing', () => {
  withFixture({ traceability: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'artifact_path_missing'));
  });
});

test('plan conformance fails on unapproved alternative implementation language', () => {
  withFixture({ qaExtra: '- Note: alternative implementation used for the renderer.' }, (root) => {
    const result = evaluatePlanConformance({
      phaseDocPath: path.join(root, 'docs/implementation/close/01-feature.md'),
      sprintContractPath: path.join(root, 'docs/implementation/execution/01-feature/SPRINT_CONTRACT.md'),
      qaReportPath: path.join(root, 'docs/implementation/execution/01-feature/QA_REPORT.md'),
      scorecardPath: path.join(root, 'docs/implementation/execution/01-feature/SCORECARD.md'),
      handoffPath: path.join(root, 'docs/implementation/execution/01-feature/HANDOFF.md'),
    });

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'unapproved-deferred-scope'));
  });
});

test('phase closeout passes when artifacts, verdict, score, archive, and scenarios agree', () => {
  withFixture({}, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout fails when a structured verdict contradicts itself', () => {
  withFixture({ inconsistentVerdict: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'verification-verdict-inconsistent'));
  });
});

function config(root) {
  return {
    statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
    planDir: path.join(root, 'docs/implementation'),
    masterPlan: path.join(root, 'docs/implementation/00-master-plan-v1.md'),
  };
}

function withFixture(options, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-'));
  const previousCwd = process.cwd();

  try {
    writeFixture(root, options);
    process.chdir(root);
    callback(root);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root, options = {}) {
  const settings = {
    checklistChecked: true,
    archived: true,
    scenarioEvidence: true,
    traceability: true,
    qaExtra: '',
    inconsistentVerdict: false,
    ...options,
  };
  const docsDir = path.join(root, 'docs/implementation');
  const closeDir = path.join(docsDir, 'close');
  const executionDir = path.join(docsDir, 'execution/01-feature');
  const claudeDir = path.join(root, '.claude');

  fs.mkdirSync(closeDir, { recursive: true });
  fs.mkdirSync(executionDir, { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'docs'), { recursive: true });

  fs.writeFileSync(
    path.join(docsDir, '00-master-plan-v1.md'),
    [
      '# Master Plan',
      '',
      '## Phase Completion Checklist',
      `- [${settings.checklistChecked ? 'x' : ' '}] Phase 01 - Feature (\`docs/implementation/01-feature.md\`)`,
      '',
    ].join('\n')
  );

  const archivedPhaseDoc = 'docs/implementation/close/01-feature.md';
  if (settings.archived) {
    fs.writeFileSync(
      path.join(root, archivedPhaseDoc),
      [
        '# Phase 01: Feature',
        '',
        '## Critical Product Scenarios',
        '| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |',
        '|----|--------------------------|----------------------|-----------------|---------------|',
        '| SCN-01-1 | Rendered feature is visible | `npm test` | feature visible pass | `QA_REPORT.md` |',
        '',
        '## Exact Execution Targets',
        '| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |',
        '|----|-----------------|-----------------|---------------|----------|----------------------------|',
        '| P01-1 | `src/feature.ts` | none | `tests/feature.test.ts` | `npm test` | pass |',
        '',
      ].join('\n')
    );
  }

  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/feature.ts'), 'export const ok = true;\n');

  fs.writeFileSync(
    path.join(claudeDir, 'docs/phase-status.yaml'),
    [
      'schemaVersion: "1.0"',
      'masterPlan: "docs/implementation/00-master-plan-v1.md"',
      'planDir: "docs/implementation"',
      'phases:',
      '  - number: 1',
      '    title: "Phase 01: Feature"',
      '    status: completed',
      '    attempts:',
      '      total: 1',
      '      lastOutcome: completed',
      '    timing:',
      '      lastStage: finish',
      '    sprintContract: "docs/implementation/execution/01-feature/SPRINT_CONTRACT.md"',
      '    qaReport: "docs/implementation/execution/01-feature/QA_REPORT.md"',
      '    handoff: "docs/implementation/execution/01-feature/HANDOFF.md"',
      '    scorecard: "docs/implementation/execution/01-feature/SCORECARD.md"',
      `    archivedPhaseDoc: "${settings.archived ? archivedPhaseDoc : 'docs/implementation/close/missing.md'}"`,
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'SPRINT_CONTRACT.md'),
    [
      '# Sprint Contract',
      '',
      '## Slice',
      '- Source phase doc: docs/implementation/close/01-feature.md',
      '',
      '## Source Plan Requirements Snapshot',
      '| P01-1 | `src/feature.ts` | none | `tests/feature.test.ts` | `npm test` | pass |',
      '',
      '## Spec Deviation Ledger',
      '- none',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'QA_REPORT.md'),
    [
      '# QA Report',
      '',
      '## Verdict',
      '- Next path: clean_finish',
      '- Scope status: complete',
      '',
      '## Plan Conformance Review',
      '- Source plan conformance command: pass',
      settings.scenarioEvidence ? '- SCN-01-1: pass - rendered feature is visible.' : '- SCN-01-1: missing evidence.',
      settings.qaExtra,
      '',
      '## Finish Readiness',
      '- Remaining blockers before closeout: none',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'SCORECARD.md'),
    [
      '# Scorecard',
      '',
      '## Objective Checklist',
      '| OBJ-CONFORM | pass |',
      '',
      '## Score Summary',
      '- Verdict: done',
      '',
      '## Task-Level Status Adapter',
      '- Current task status: FULL',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'HANDOFF.md'),
    [
      '# Handoff',
      '',
      '## Status',
      '- Required: no',
      '',
      '## Resume Trigger',
      '- Stop reason: clean_finish',
      '',
    ].join('\n')
  );

  if (settings.traceability) {
    fs.writeFileSync(
      path.join(docsDir, 'execution/REQUIREMENTS_TRACEABILITY.md'),
      [
        '# Requirements Traceability',
        '',
        '| ID | Requirement | Evidence | Status |',
        '|----|-------------|----------|--------|',
        '| REQ-01-1 | Render feature | `QA_REPORT.md` | verified |',
        '',
      ].join('\n')
    );

    fs.writeFileSync(
      path.join(docsDir, 'execution/SCENARIO_MATRIX.md'),
      [
        '# Scenario Matrix',
        '',
        '| ID | Requirement | Scenario | Evidence | Status |',
        '|----|-------------|----------|----------|--------|',
        '| SCN-01-1 | REQ-01-1 | Rendered feature is visible | `QA_REPORT.md` | verified |',
        '',
      ].join('\n')
    );
  }

  fs.writeFileSync(
    path.join(claudeDir, 'verification-verdict-phase01-final.json'),
    JSON.stringify({
      verdict: 'passed',
      evidenceFresh: true,
      blocking: settings.inconsistentVerdict,
      score: { verdict: settings.inconsistentVerdict ? 'blocked' : 'done' },
    }, null, 2)
  );
}
