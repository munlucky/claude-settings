import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolvePhaseExecutionDir } from './phase-execution-paths.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase-execution-paths-'));
}

test('resolves active execution directory and stable sidecar paths', () => {
  const root = makeTempDir();
  const planDir = path.join(root, 'docs', 'implementation', 'plan');
  const executionRoot = path.join(planDir, 'execution', 'blocker-closeout-prevention-v1');
  const phaseDir = path.join(executionRoot, '01-phase-01-phase-execution-paths-and-sidecar-reader-v1');
  fs.mkdirSync(phaseDir, { recursive: true });

  const resolved = resolvePhaseExecutionDir({
    planDir,
    executionRoot,
    phaseNumber: 1,
    phaseDoc: path.join(planDir, '01-phase-execution-paths-sidecar-reader-v1.md'),
  });

  assert.equal(resolved.executionDir, phaseDir);
  assert.equal(resolved.sidecarPaths.blockerEvidencePath, path.join(phaseDir, 'BLOCKER_EVIDENCE.jsonl'));
  assert.equal(resolved.sidecarPaths.attemptLedgerPath, path.join(phaseDir, 'ATTEMPT_LEDGER.jsonl'));
  assert.equal(resolved.sidecarPaths.projectionManifestPath, path.join(phaseDir, 'projection-manifest.json'));
});

test('resolves close archived execution directory before active fallback', () => {
  const root = makeTempDir();
  const planDir = path.join(root, 'docs', 'implementation', 'plan');
  const executionRoot = path.join(planDir, 'execution', 'blocker-closeout-prevention-v1');
  const archivedRoot = path.join(planDir, 'close', 'execution', 'blocker-closeout-prevention-v1');
  const archivedPhaseDir = path.join(archivedRoot, '02-phase-02-reader-consumer-v1');
  fs.mkdirSync(archivedPhaseDir, { recursive: true });

  const resolved = resolvePhaseExecutionDir({
    planDir,
    executionRoot,
    phaseNumber: '2',
    phaseSlug: 'reader-consumer-v1',
    phaseDoc: path.join(planDir, 'close', '02-reader-consumer-v1.md'),
  });

  assert.equal(resolved.executionDir, archivedPhaseDir);
});
