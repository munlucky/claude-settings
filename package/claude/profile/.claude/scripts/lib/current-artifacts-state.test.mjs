import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  readCurrentArtifacts,
  sha256RawBytes,
  validateCurrentArtifactsIndex,
} from './current-artifacts-state.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoot = path.join(repoRoot, '.claude/tests/fixtures/phase-closeout/phase-08-success');

test('current index validates manifest and selects only indexed artifacts', () => {
  const state = readCurrentArtifacts({ root: fixtureRoot });

  assert.equal(state.ok, true);
  assert.equal(state.isCurrent, true);
  assert.equal(state.commitToken, 'commit-token-current');
  assert.equal(state.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase08-final.json'), true);
  assert.equal(state.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase08-stale-newer.json'), false);
  assert.equal(state.manifestHash, sha256RawBytes(path.join(fixtureRoot, '.claude/logs/workflow-enforcement/closeout-manifest-commit-token-current.json')));
});

test('missing current index fails current mode without silently scanning', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-artifacts-missing-'));
  try {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude/verification-verdict-phase08-final.json'), '{}\n', 'utf8');

    const state = readCurrentArtifacts({ root });

    assert.equal(state.ok, false);
    assert.equal(state.code, 'current_index_missing');
    assert.equal(state.reason, 'current_index_missing');
    assert.equal(state.isCurrent, false);
    assert.deepEqual(state.artifacts, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manifest hash mismatch blocks current state', () => {
  const index = JSON.parse(fs.readFileSync(path.join(fixtureRoot, '.claude/logs/workflow-enforcement/current-artifacts.json'), 'utf8'));
  index.manifestHash = 'bad-hash';

  const state = validateCurrentArtifactsIndex(index, {
    root: fixtureRoot,
    indexPath: '.claude/logs/workflow-enforcement/current-artifacts.json',
  });

  assert.equal(state.ok, false);
  assert.equal(state.reason, 'manifest_hash_mismatch');
  assert.equal(state.isCurrent, false);
});

test('legacy scan is explicitly non-current', () => {
  const state = readCurrentArtifacts({ root: fixtureRoot, mode: 'legacy' });

  assert.equal(state.ok, true);
  assert.equal(state.mode, 'legacy');
  assert.equal(state.isCurrent, false);
  assert.equal(state.reason, 'legacy_scan');
  assert.equal(state.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase08-final.json'), true);
  assert.equal(state.artifacts.some((entry) => entry.relativePath === '.claude/verification-verdict-phase08-stale-newer.json'), true);
});

test('artifact hash mismatch blocks current state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-artifacts-hash-mismatch-'));
  try {
    fs.cpSync(fixtureRoot, root, { recursive: true });

    const indexPath = path.join(root, '.claude/logs/workflow-enforcement/current-artifacts.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const manifestPath = path.join(root, index.manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.artifacts['canonical-verdict'].hash = 'bad-hash';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    index.manifestHash = sha256RawBytes(manifestPath);

    const state = validateCurrentArtifactsIndex(index, {
      root,
      indexPath: '.claude/logs/workflow-enforcement/current-artifacts.json',
    });

    assert.equal(state.ok, false);
    assert.equal(state.code, 'artifact_hash_mismatch');
    assert.equal(state.reason, 'artifact_hash_mismatch');
    assert.equal(state.isCurrent, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('superseded artifacts are history snapshots, not current validation inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-artifacts-superseded-'));
  try {
    fs.mkdirSync(path.join(root, '.claude/logs/workflow-enforcement'), { recursive: true });
    fs.writeFileSync(path.join(root, 'canonical.txt'), 'current\n', 'utf8');
    fs.writeFileSync(path.join(root, 'snapshot.txt'), 'old\n', 'utf8');

    const manifestPath = path.join(root, '.claude/logs/workflow-enforcement/closeout-sync-manifest-current.json');
    const manifest = {
      schemaVersion: 1,
      commitToken: 'current-token',
      artifacts: {
        canonical: {
          kind: 'canonical',
          path: 'canonical.txt',
          hash: sha256RawBytes(path.join(root, 'canonical.txt')),
          commitToken: 'current-token',
        },
      },
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const index = {
      schemaVersion: 1,
      commitToken: 'current-token',
      manifestPath: path.relative(root, manifestPath).replace(/\\/g, '/'),
      manifestHash: sha256RawBytes(manifestPath),
      artifacts: manifest.artifacts,
      supersededArtifacts: [
        {
          canonicalPath: 'canonical.txt',
          snapshotPath: 'snapshot.txt',
          artifactHash: sha256RawBytes(path.join(root, 'snapshot.txt')),
          commitToken: 'old-token',
          supersededByCommitToken: 'current-token',
        },
      ],
    };

    const state = validateCurrentArtifactsIndex(index, {
      root,
      indexPath: '.claude/logs/workflow-enforcement/current-artifacts.json',
    });

    assert.equal(state.ok, true);
    assert.equal(state.commitToken, 'current-token');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
