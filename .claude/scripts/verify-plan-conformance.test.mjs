import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve('.claude/scripts/verify-plan-conformance.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

test('help prints artifact-level usage and exits zero', () => {
  const result = runCli(['--help']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--phase-doc <path>/);
  assert.match(result.stdout, /--sprint-contract <path>/);
  assert.match(result.stdout, /--qa-report <path>/);
  assert.match(result.stdout, /--scorecard <path>/);
  assert.match(result.stdout, /--handoff <path>/);
});

test('unknown option prints valid usage', () => {
  const result = runCli(['--does-not-exist']);

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Unknown option: --does-not-exist/);
  assert.match(result.stderr, /Usage:/);
  assert.match(result.stderr, /verify-plan-conformance\.mjs --phase-doc <path>/);
});

test('plan-level options print recommended alternatives', () => {
  const result = runCli(['--status-file', '.claude/docs/phase-status.yaml']);

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Unsupported plan-level option/);
  assert.match(result.stderr, /verify-phase-closeout\.mjs --plan-dir <path> --master-plan <path> --status-file <path> --json/);
  assert.match(result.stderr, /verify-plan-conformance\.mjs --phase-doc <path>/);
});

test('structured scenario metadata and no-unapproved-defer wording pass clean finish', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-conformance-'));
  const phaseDoc = path.join(tempDir, '01-phase.md');
  const sprint = path.join(tempDir, 'SPRINT_CONTRACT.md');
  const qa = path.join(tempDir, 'QA_REPORT.md');
  const scorecard = path.join(tempDir, 'SCORECARD.md');
  const handoff = path.join(tempDir, 'HANDOFF.md');

  fs.writeFileSync(phaseDoc, `# Phase

## Exact Execution Targets
- .claude/scripts/verify-plan-conformance.mjs creates pass signal

## Critical Product Scenarios
- SCN-01-2
`, 'utf8');
  fs.writeFileSync(sprint, `# Sprint

## Source Plan Requirements Snapshot
- .claude/scripts/verify-plan-conformance.mjs creates pass signal

## Spec Deviation Ledger
| Decision | Approval |
|---|---|
| none | none |
`, 'utf8');
  fs.writeFileSync(qa, `# QA

## Verdict
- Next path: clean_finish
- Scope status: complete

## Plan Conformance Review
| Plan Item | Required | Actual | Result | Required Action |
|---|---|---|---|---|
| Spec deviation ledger clean | No unapproved delete/substitute/defer decisions | none | pass | none |

## Structured Evidence Metadata
\`\`\`json
{
  "scenarios": [
    { "id": "SCN-01-2", "status": "passed", "evidencePath": ".claude/scripts/example.test.mjs" }
  ]
}
\`\`\`
`, 'utf8');
  fs.writeFileSync(scorecard, `# Scorecard

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|---|---|---:|---|---|---|
| OBJ-CONFORM | Conformance | 100 | pass | .claude/scripts/example.test.mjs | pass |

## Score Summary
- Verdict: done

## Task-Level Status Adapter
- Current task status: FULL
`, 'utf8');
  fs.writeFileSync(handoff, `# Handoff

## Status
- Required: no
`, 'utf8');

  const result = runCli([
    '--phase-doc', phaseDoc,
    '--sprint-contract', sprint,
    '--qa-report', qa,
    '--scorecard', scorecard,
    '--handoff', handoff,
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.allowed, true);
});
