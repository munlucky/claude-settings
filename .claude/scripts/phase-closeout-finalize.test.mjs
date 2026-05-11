import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { currentIndexVerdictArtifacts, finalizePhaseCloseout } from './phase-closeout-finalize.mjs';
import { readCurrentArtifacts, sha256RawBytes } from './lib/current-artifacts-state.mjs';
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
      commitToken: 'phase01-test-token',
    });

    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    assert.equal(result.dryRun, true);
    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    assert.equal(result.closeoutPrepRoot, '.claude/logs/workflow-enforcement/closeout-prep/phase01-test-token');
    assert.ok(result.plannedWrites.some((entry) => entry.kind === 'canonical-verdict'));
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.workflowDir, 'current-artifacts.json')), false);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).status, 'failed');
  });
});

test('finalize keep-prep writes staged candidates without publishing current artifacts', async () => {
  await withFixture(async (fixture) => {
    await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      dryRun: true,
      keepPrep: true,
      commitToken: 'phase01-prep-only',
    });

    const prepRoot = path.join(fixture.workflowDir, 'closeout-prep/phase01-prep-only');
    assert.equal(fs.existsSync(path.join(prepRoot, '.claude/verification-verdict-phase01-final.json')), true);
    assert.equal(fs.existsSync(path.join(prepRoot, 'closeout-sync-manifest.json')), true);
    assert.equal(fs.existsSync(path.join(prepRoot, 'current-artifacts.json')), true);
    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.workflowDir, 'current-artifacts.json')), false);
  });
});

test('current index verdict artifacts include prior completed phase verdicts', async () => {
  await withFixture(async (fixture) => {
    const phase02Verdict = path.join(fixture.root, '.claude/verification-verdict-phase02-final.json');
    const phase03Verdict = path.join(fixture.root, '.claude/verification-verdict-phase03-final.json');
    fs.writeFileSync(phase02Verdict, '{"verdict":"passed","phase":2}\n', 'utf8');
    fs.writeFileSync(phase03Verdict, '{"verdict":"passed","phase":3}\n', 'utf8');

    const artifacts = currentIndexVerdictArtifacts({
      root: fixture.root,
      phases: [
        { number: 1, status: 'pending' },
        { number: 2, status: 'completed' },
        { number: 4, status: 'pending' },
      ],
      phaseNumber: 3,
      canonicalVerdictPath: phase03Verdict,
      commitToken: 'phase03-current',
    });

    assert.deepEqual(
      artifacts.map((entry) => entry.path).sort(),
      [
        '.claude/verification-verdict-phase02-final.json',
        '.claude/verification-verdict-phase03-final.json',
      ],
    );
    assert.deepEqual(
      artifacts.map((entry) => entry.kind).sort(),
      ['canonical-verdict-phase02', 'canonical-verdict-phase03'],
    );
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
    const planExecutionRoot = path.dirname(fixture.executionRoot);
    assert.match(fs.readFileSync(path.join(planExecutionRoot, 'REQUIREMENTS_TRACEABILITY.md'), 'utf8'), /REQ-1 \| verified/);
    assert.match(fs.readFileSync(path.join(planExecutionRoot, 'SCENARIO_MATRIX.md'), 'utf8'), /SCN-1 \| verified/);
    const current = readCurrentArtifacts({ root: fixture.root });
    assert.equal(current.ok, true);
    assert.equal(current.commitToken, result.closeoutCommitToken);
    assert.equal(current.manifestHash, sha256RawBytes(current.manifestPath));
    assert.equal(current.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase01-final.json'), true);
  });
});

test('finalize ignores stale blocked root verdict when publishing completed canonical verdict', async () => {
  await withFixture(async (fixture) => {
    const originalStatus = fs.readFileSync(fixture.statusFile, 'utf8');
    fs.writeFileSync(fixture.statusFile, originalStatus.replace(
      'activeRunLeaseId: "delegated-run-1"',
      [
        'activeRunLeaseId: "delegated-run-1"',
        'normalizedRunVerdict: blocked',
        'stopReasonClass: runtime_unavailable',
      ].join('\n'),
    ), 'utf8');

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-stale-root-blocked',
    });

    assert.equal(result.canonicalVerdictPath, '.claude/verification-verdict-phase01-final.json');
    const verdict = readJson(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json'));
    assert.equal(verdict.workflowEvidence.closeoutInvariant.ok, true);
    assert.equal(verdict.workflowEvidence.closeoutInvariant.normalizedRunVerdict, 'success_with_warning');
  });
});

test('finalize publishes current before goal runtime close and writes post-publish status sidecar', async () => {
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
      commitToken: 'phase01-post-publish',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(current.commitToken, 'phase01-post-publish');
    assert.equal(current.postPublishStatusPath, '.claude/logs/workflow-enforcement/post-publish-status-phase01-post-publish.json');
    const sidecar = readJson(path.join(fixture.root, current.postPublishStatusPath));
    assert.equal(sidecar.commitToken, 'phase01-post-publish');
    assert.equal(sidecar.goalRuntimeClose.status, result.goalRuntime.status);
    assert.equal(sidecar.goalRuntimeClose.retriable, result.goalRuntime.status === 'failed');
    assert.equal(sidecar.recordedAt, fixture.now);
    assert.equal(result.postPublishStatus.relativePath, current.postPublishStatusPath);
  });
});

test('post-publish status write failure is diagnostic-only after current publish', async () => {
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
      commitToken: 'phase01-sidecar-fail',
      postPublishFailurePoint: 'post_publish_status_write',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(current.commitToken, 'phase01-sidecar-fail');
    assert.equal(current.postPublishStatusPath, '.claude/logs/workflow-enforcement/post-publish-status-phase01-sidecar-fail.json');
    assert.equal(fs.existsSync(path.join(fixture.root, current.postPublishStatusPath)), false);
    assert.equal(result.postPublishStatus.ok, false);
    assert.equal(result.postPublishStatus.reason, 'post_publish_status_write_failed');
    const diagnostics = fs.readFileSync(path.join(fixture.executionRoot, 'closeout-diagnostics.jsonl'), 'utf8');
    assert.match(diagnostics, /post_publish_status_write_failed/);
  });
});

test('finalize snapshots previous current artifacts and writes supersede metadata', async () => {
  await withFixture(async (fixture) => {
    seedOldCurrentArtifacts(fixture.root, fixture.workflowDir);

    const result = await finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-new-current',
    });

    const current = readJson(path.join(fixture.workflowDir, 'current-artifacts.json'));
    assert.equal(result.supersededArchive.archiveRoot, '.claude/logs/workflow-enforcement/closeout-archive/old-current');
    assert.equal(current.supersededArtifacts.length, 1);
    assert.equal(current.supersededArtifacts[0].canonicalPath, '.claude/verification-verdict-old.json');
    assert.equal(current.supersededArtifacts[0].snapshotPath, '.claude/logs/workflow-enforcement/closeout-archive/old-current/.claude/verification-verdict-old.json');
    assert.equal(current.supersededArtifacts[0].commitToken, 'old-current');
    assert.equal(current.supersededArtifacts[0].supersededByCommitToken, 'phase01-new-current');
    assert.equal(current.supersededArtifacts[0].artifactHash, sha256RawBytes(path.join(fixture.root, current.supersededArtifacts[0].snapshotPath)));
    assert.equal(current.logSnapshots.length, 1);
    assert.equal(current.logSnapshots[0].canonicalPath, '.claude/logs/workflow-enforcement/active-phase-run.log');
    assert.equal(current.logSnapshots[0].hashAtSnapshotTime, sha256RawBytes(path.join(fixture.workflowDir, 'active-phase-run.log')));
    assert.equal(current.logSnapshots[0].sizeBytesAtSnapshotTime, fs.statSync(path.join(fixture.workflowDir, 'active-phase-run.log')).size);
    assert.match(current.logSnapshots[0].tailExcerpt, /old log tail/);
  });
});

test('publish failures keep the old current pointer after canonical and manifest publish', async () => {
  for (const publishFailurePoint of ['after_canonical_publish', 'after_manifest_publish']) {
    await withFixture(async (fixture) => {
      seedOldCurrentArtifacts(fixture.root, fixture.workflowDir);

      await assert.rejects(() => finalizePhaseCloseout({
        root: fixture.root,
        phase: 1,
        statusFile: fixture.statusFile,
        planDir: fixture.planDir,
        masterPlan: fixture.masterPlan,
        executionRoot: fixture.executionRoot,
        workflowDir: fixture.workflowDir,
        now: fixture.now,
        commitToken: `phase01-${publishFailurePoint}`,
        publishFailurePoint,
      }), /Injected publish failure/);

      const current = readCurrentArtifacts({ root: fixture.root });
      assert.equal(current.ok, true);
      assert.equal(current.commitToken, 'old-current');
      assert.equal(current.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-old.json'), true);
      assert.equal(current.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase01-final.json'), false);
      const diagnosticPath = path.join(fixture.workflowDir, 'closeout-archive/old-current/_orphaned_prepare_archive.json');
      const diagnostic = readJson(diagnosticPath);
      assert.equal(diagnostic.diagnostic, 'orphaned_prepare_archive');
      assert.equal(diagnostic.reason, `publish_failed_${publishFailurePoint}`);
    });
  }
});

test('snapshot failure stops before canonical verdict publish', async () => {
  await withFixture(async (fixture) => {
    seedOldCurrentArtifacts(fixture.root, fixture.workflowDir);

    const oldVerdictPath = path.join(fixture.root, '.claude/verification-verdict-old.json');
    fs.writeFileSync(oldVerdictPath, '{"verdict":"passed","old":false}\n', 'utf8');

    await assert.rejects(() => finalizePhaseCloseout({
      root: fixture.root,
      phase: 1,
      statusFile: fixture.statusFile,
      planDir: fixture.planDir,
      masterPlan: fixture.masterPlan,
      executionRoot: fixture.executionRoot,
      workflowDir: fixture.workflowDir,
      now: fixture.now,
      commitToken: 'phase01-stale-old-current',
    }), /stale hash/);

    assert.equal(fs.existsSync(path.join(fixture.root, '.claude/verification-verdict-phase01-final.json')), false);
  });
});

test('finalize does not close goal runtime while later phases remain actionable', async () => {
  await withFixture(async (fixture) => {
    fs.writeFileSync(fixture.statusFile, [
      fs.readFileSync(fixture.statusFile, 'utf8').trimEnd(),
      '  - number: 2',
      '    title: "Next"',
      '    status: pending',
      '',
    ].join('\n'), 'utf8');

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

    assert.equal(result.goalRuntime.attempted, false);
    assert.equal(result.goalRuntime.status, 'skipped_until_plan_complete');
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

async function withFixture(callback, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-finalize-'));
  try {
    const fixture = writeFixture(root);
    if (overrides.commitToken) {
      fixture.commitToken = overrides.commitToken;
    }
    await callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function seedOldCurrentArtifacts(root, workflowDir) {
  const verdictPath = path.join(root, '.claude/verification-verdict-old.json');
  fs.writeFileSync(verdictPath, '{"verdict":"passed","old":true}\n', 'utf8');
  const logPath = path.join(workflowDir, 'active-phase-run.log');
  fs.writeFileSync(logPath, 'old log head\nold log tail\n', 'utf8');
  const artifactHash = sha256RawBytes(verdictPath);
  const logHash = sha256RawBytes(logPath);
  const manifestPath = path.join(workflowDir, 'closeout-sync-manifest-old-current.json');
  const manifest = {
    schemaVersion: 1,
    manifestKind: 'closeout-sync-manifest',
    hashAlgorithm: 'sha256_raw_bytes',
    commitToken: 'old-current',
    verifiedGitTreeFingerprint: 'old-tree',
    artifacts: {
      'canonical-verdict': {
        kind: 'canonical-verdict',
        path: '.claude/verification-verdict-old.json',
        hashAlgorithm: 'sha256_raw_bytes',
        hash: artifactHash,
        commitToken: 'old-current',
      },
      'active-log': {
        kind: 'active-log',
        path: '.claude/logs/workflow-enforcement/active-phase-run.log',
        hashAlgorithm: 'sha256_raw_bytes',
        hash: logHash,
        commitToken: 'old-current',
      },
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const current = {
    schemaVersion: 1,
    commitToken: 'old-current',
    manifestPath: path.relative(root, manifestPath).replace(/\\/g, '/'),
    manifestHash: sha256RawBytes(manifestPath),
    hashAlgorithm: 'sha256_raw_bytes',
    artifacts: manifest.artifacts,
  };
  fs.writeFileSync(path.join(workflowDir, 'current-artifacts.json'), `${JSON.stringify(current, null, 2)}\n`, 'utf8');
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
