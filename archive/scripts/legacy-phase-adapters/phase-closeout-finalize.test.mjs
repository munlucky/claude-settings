import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { finalizePhaseCloseout } from './phase-closeout-finalize.mjs';
import { dedupePaths, resolveGlobFiles, safeRemove } from './lib/windows-safe-files.mjs';

test('finalize dry-run reports planned writes without mutating closeout files', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      dryRun: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    assert.ok(result.plannedWrites.some((entry) => entry.kind === 'canonical-verdict'));
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).status, 'failed');
  });
});

test('finalize writes canonical verdict and reconciles delegated failure as historical warning', async () => {
  await withFixture(async (fixture) => {
    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
    });

    assert.equal(result.finalVerdict, 'complete');
    assert.deepEqual(result.historicalWarnings, ['delegated-terminal-exit-1']);
    const verdict = readJson(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json'));
    assert.equal(verdict.verdict, 'passed');
    assert.equal(verdict.identity.statusFile, fixture.statusFile);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).completionStatus, 'completed');
    assert.equal(readJson(path.join(fixture.workflowDir, 'latest-dispatch.json')).status, 'superseded');
    assert.equal(result.worksetsEvidenceUpdated, true);
    const worksets = fs.readFileSync(path.join(fixture.executionRoot, 'WORKSETS.yaml'), 'utf8');
    assert.match(worksets, /\.claude\/verification-verdict-phase01-final\.json/);
    assert.doesNotMatch(worksets, /runtime_unavailable/);
  });
});

test('windows-safe file utilities resolve globs, dedupe paths, and refuse outside deletes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-safe-files-'));
  try {
    const alpha = path.join(root, 'a', 'alpha.txt');
    const beta = path.join(root, 'a', 'nested', 'beta.txt');
    fs.mkdirSync(path.dirname(beta), { recursive: true });
    fs.writeFileSync(alpha, 'alpha\n', 'utf8');
    fs.writeFileSync(beta, 'beta\n', 'utf8');

    const matches = resolveGlobFiles(['a/**/*.txt'], { cwd: root });
    assert.deepEqual(matches.sort(), [alpha, beta].sort());
    assert.deepEqual(dedupePaths([alpha, alpha]), [path.resolve(alpha)]);
    assert.throws(() => safeRemove([path.join(root, '..', 'outside.txt')], { mustBeInside: root }), /Refusing to remove/);
    assert.deepEqual(safeRemove([alpha], { mustBeInside: root }), [alpha]);
    assert.equal(fs.existsSync(alpha), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-finalize-'));
  try {
    const fixture = writeFixture(root);
    await callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root) {
  const now = '2026-05-10T12:00:00.000Z';
  const planDir = path.join(root, 'docs/implementation/finalize-smoke');
  const executionRoot = path.join(planDir, 'execution/01-smoke');
  const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
  const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
  const masterPlan = path.join(planDir, '00-master-plan-v1.md');
  const phaseDoc = path.join(planDir, 'close/01-smoke-v1.md');
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.mkdirSync(path.dirname(phaseDoc), { recursive: true });
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(executionRoot, { recursive: true });

  fs.writeFileSync(statusFile, [
    'schemaVersion: "1.0"',
    `planDir: "${planDir}"`,
    `masterPlan: "${masterPlan}"`,
    'activeRunLeaseId: "delegated-run-1"',
    'phases:',
    '  - number: 1',
    '    title: "Smoke"',
    '    status: in_progress',
    `    archivedPhaseDoc: "${phaseDoc}"`,
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(masterPlan, [
    '# Master Plan',
    '',
    '## Phase Completion Checklist',
    '- [ ] Phase 01 - Smoke',
    '',
    'REQ-1',
    'SCN-1',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(phaseDoc, [
    '# Phase 01',
    '',
    'REQ-1',
    'SCN-1',
    '',
  ].join('\n'), 'utf8');

  for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
    fs.writeFileSync(path.join(workflowDir, basename), JSON.stringify({
      runLeaseId: 'delegated-run-1',
      status: 'failed',
      completionStatus: 'failed',
      executionMode: 'delegated-terminal',
      stopReasonCode: 'delegated-terminal-exit-1',
      exitCode: 1,
      phaseRunLease: {
        status: 'failed',
        completionStatus: 'failed',
        stopReasonCode: 'delegated-terminal-exit-1',
        exitCode: 1,
      },
    }, null, 2), 'utf8');
  }

  fs.writeFileSync(path.join(executionRoot, 'WORKSETS.yaml'), [
    'atomicTasks:',
    '  - id: smoke-task',
    '    status: completed',
    '    ownedPaths:',
    '      - .claude/scripts/phase-closeout-finalize.mjs',
    '    verificationCommands:',
    '      - node .claude/scripts/phase-closeout-finalize.test.mjs',
    '    evidence:',
    '      - runtime_unavailable from previous attempt',
    '',
  ].join('\n'), 'utf8');

  return { root, now, planDir, executionRoot, workflowDir, statusFile, masterPlan, phaseDoc };
}
