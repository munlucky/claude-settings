import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCodeReviewGraphEvidence } from './code-review-graph-evidence.mjs';

const fixtureRoot = new URL('./code-review-graph-fixtures/', import.meta.url);

function readFixture(name) {
  return JSON.parse(fs.readFileSync(new URL(name, fixtureRoot), 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function baseInput(overrides = {}) {
  return {
    validationProfile: 'strict',
    evidenceCarrier: 'phase',
    changedFiles: {
      files: ['src/app.js'],
      source: 'verdict_json',
      baseRef: 'HEAD~1',
      baseRefSource: 'explicit',
      baseRefWarning: null,
      fallbackUsed: false,
    },
    selectedHarnessComponents: [],
    skippedHarnessComponents: [],
    codeReviewGraph: {
      crgCliVersion: 'test-1',
      stages: {
        execute: { operation: 'scan', exitCode: 0 },
        review: { operation: 'review', exitCode: 0 },
        finish: { operation: 'publish', exitCode: 0 },
      },
    },
    ...overrides,
  };
}

test('passes for complete phase evidence artifact inside allowed root', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crg-node-'));
  const phaseExecutionDir = 'execution/phase-03';
  const artifactPath = path.join(repoRoot, phaseExecutionDir, 'evidence', 'code-review-graph', 'evidence.json');
  writeJson(artifactPath, {
    adapterRunId: 'run-1',
    crgCliVersion: 'test-1',
    stages: ['execute', 'review', 'finish'],
  });

  const decision = validateCodeReviewGraphEvidence(
    baseInput({
      codeReviewGraph: {
        ...baseInput().codeReviewGraph,
        adapterRunId: 'run-1',
        evidenceArtifactPath: path.relative(repoRoot, artifactPath),
        evidenceDigest: digest(artifactPath),
      },
    }),
    { repoRoot, phaseExecutionDir },
  );

  assert.equal(decision.status, 'pass');
  assert.equal(decision.blocking, false);
  assert.equal(decision.reason, 'ok');
  assert.equal(decision.normalizedEvidence.adapterRunId, 'run-1');
});

test('returns shared fixture pass decision', () => {
  const decision = validateCodeReviewGraphEvidence(readFixture('phase-pass.json'), {
    repoRoot: process.cwd(),
    phaseExecutionDir: 'execution/phase-03',
  });

  assert.equal(decision.status, 'pass');
  assert.equal(decision.blocking, false);
  assert.equal(decision.reason, 'ok');
});

test('returns shared fixture blocker decisions', () => {
  const missingStage = validateCodeReviewGraphEvidence(readFixture('missing-required-stage.json'), {
    repoRoot: process.cwd(),
    phaseExecutionDir: 'execution/phase-03',
  });
  const unresolved = validateCodeReviewGraphEvidence(readFixture('changed-files-unresolved.json'), {
    repoRoot: process.cwd(),
    phaseExecutionDir: 'execution/phase-03',
  });

  assert.equal(missingStage.blockerCode, 'missing_required_stage_coverage');
  assert.equal(unresolved.blockerCode, 'changed_files_unresolved');
});

test('blocks code-changing strict closeout when required stages are missing', () => {
  const decision = validateCodeReviewGraphEvidence(
    baseInput({
      codeReviewGraph: {
        crgCliVersion: 'test-1',
        stages: {
          execute: { operation: 'scan', exitCode: 0 },
        },
      },
    }),
    { repoRoot: process.cwd(), phaseExecutionDir: 'execution/phase-03' },
  );

  assert.equal(decision.status, 'block');
  assert.equal(decision.blockerCode, 'missing_required_stage_coverage');
  assert.deepEqual(decision.missingStages, ['review', 'finish']);
});

test('rejects phase artifact path resolving outside allowed root', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crg-node-outside-'));
  const outsidePath = path.join(repoRoot, 'outside', 'evidence.json');
  writeJson(outsidePath, {
    adapterRunId: 'run-2',
    crgCliVersion: 'test-1',
  });

  const decision = validateCodeReviewGraphEvidence(
    baseInput({
      codeReviewGraph: {
        ...baseInput().codeReviewGraph,
        adapterRunId: 'run-2',
        evidenceArtifactPath: path.relative(repoRoot, outsidePath),
        evidenceDigest: digest(outsidePath),
      },
    }),
    { repoRoot, phaseExecutionDir: 'execution/phase-03' },
  );

  assert.equal(decision.status, 'block');
  assert.equal(decision.blockerCode, 'evidence_artifact_outside_allowed_root');
});

test('blocks strict profile when changedFiles and baseRef are unresolved', () => {
  const decision = validateCodeReviewGraphEvidence(
    baseInput({
      changedFiles: {},
      codeReviewGraph: {
        crgCliVersion: 'test-1',
      },
    }),
    { repoRoot: process.cwd(), phaseExecutionDir: 'execution/phase-03' },
  );

  assert.equal(decision.status, 'block');
  assert.equal(decision.blockerCode, 'changed_files_unresolved');
});
