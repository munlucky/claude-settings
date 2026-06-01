import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  detectSidecarMode,
  readBlockerSidecarState,
  readJsonlFile,
  reduceLatestBlockerStatus,
} from './blocker-sidecar-state.mjs';

function makeSidecarDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocker-sidecar-state-'));
  return {
    dir,
    blockerEvidencePath: path.join(dir, 'BLOCKER_EVIDENCE.jsonl'),
    attemptLedgerPath: path.join(dir, 'ATTEMPT_LEDGER.jsonl'),
    projectionManifestPath: path.join(dir, 'projection-manifest.json'),
  };
}

test('detects legacy_verifier when no sidecar files exist', () => {
  const paths = makeSidecarDir();
  assert.equal(detectSidecarMode(paths).mode, 'legacy_verifier');
});

test('detects sidecar_canonical when manifest and sidecars exist', () => {
  const paths = makeSidecarDir();
  fs.writeFileSync(paths.blockerEvidencePath, '', 'utf8');
  fs.writeFileSync(paths.attemptLedgerPath, '', 'utf8');
  fs.writeFileSync(paths.projectionManifestPath, '{}', 'utf8');
  assert.equal(detectSidecarMode(paths).mode, 'sidecar_canonical');
});

test('detects manifest_sidecar_missing instead of falling back to legacy', () => {
  const paths = makeSidecarDir();
  fs.writeFileSync(paths.projectionManifestPath, '{}', 'utf8');
  assert.equal(detectSidecarMode(paths).mode, 'manifest_sidecar_missing');
});

test('detects incomplete_transaction when sidecars exist without manifest', () => {
  const paths = makeSidecarDir();
  fs.writeFileSync(paths.blockerEvidencePath, '', 'utf8');
  fs.writeFileSync(paths.attemptLedgerPath, '', 'utf8');
  assert.equal(detectSidecarMode(paths).mode, 'incomplete_transaction');
});

test('parses JSONL defensively and keeps valid records usable', () => {
  const paths = makeSidecarDir();
  fs.writeFileSync(
    paths.blockerEvidencePath,
    '{"id":"B-1","status":"open"}\nnot-json\n{"id":"B-2","status":"resolved"}\n',
    'utf8',
  );

  const result = readJsonlFile(paths.blockerEvidencePath);

  assert.equal(result.records.length, 2);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].type, 'invalid_json');
});

test('open -> resolved latest status is historical', () => {
  const latest = reduceLatestBlockerStatus([
    { id: 'B-1', status: 'open', timestamp: '2026-05-12T00:00:00Z', __appendIndex: 0 },
    { id: 'B-1', status: 'resolved', timestamp: '2026-05-12T00:01:00Z', __appendIndex: 1 },
  ]);

  assert.equal(latest.active.length, 0);
  assert.equal(latest.historical.length, 1);
  assert.equal(latest.historical[0].status, 'resolved');
});

test('open -> resolved -> regressed latest status is active', () => {
  const latest = reduceLatestBlockerStatus([
    { id: 'B-1', status: 'open', timestamp: '2026-05-12T00:00:00Z', __appendIndex: 0 },
    { id: 'B-1', status: 'resolved', timestamp: '2026-05-12T00:01:00Z', __appendIndex: 1 },
    { id: 'B-1', status: 'regressed', timestamp: '2026-05-12T00:02:00Z', __appendIndex: 2 },
  ]);

  assert.equal(latest.active.length, 1);
  assert.equal(latest.active[0].status, 'regressed');
  assert.equal(latest.historical.length, 0);
});

test('canonical reader dedupes blocker evidence and attempt ledger records', () => {
  const paths = makeSidecarDir();
  fs.writeFileSync(paths.projectionManifestPath, '{}', 'utf8');
  fs.writeFileSync(
    paths.blockerEvidencePath,
    [
      '{"id":"B-1","status":"open","timestamp":"2026-05-12T00:00:00Z"}',
      '{"id":"B-1","status":"resolved","timestamp":"2026-05-12T00:01:00Z"}',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    paths.attemptLedgerPath,
    [
      '{"attemptId":"A-1","transactionId":"T-1","status":"started"}',
      '{"attemptId":"A-1","transactionId":"T-1","status":"committed"}',
    ].join('\n'),
    'utf8',
  );

  const result = readBlockerSidecarState(paths);

  assert.equal(result.mode, 'sidecar_canonical');
  assert.equal(result.blockerEvidence.length, 1);
  assert.equal(result.blockerEvidence[0].status, 'resolved');
  assert.equal(result.attemptLedger.length, 1);
  assert.equal(result.attemptLedger[0].status, 'committed');
});
