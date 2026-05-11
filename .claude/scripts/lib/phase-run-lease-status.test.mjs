import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildCompositeMonitorCursor } from './phase-run-lease-status.mjs';
import { sha256RawBytes } from './current-artifacts-state.mjs';

test('composite monitor cursor changes when manifest changes without parent status movement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-run-lease-status-'));
  try {
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    const verdictFile = path.join(root, '.claude/verification-verdict-phase08-final.json');
    const manifestFile = path.join(workflowDir, 'closeout-sync-manifest-phase08.json');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.mkdirSync(path.dirname(verdictFile), { recursive: true });
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(statusFile, 'phases:\n  - number: 8\n    status: in_progress\n', 'utf8');
    fs.writeFileSync(verdictFile, '{"verdict":"passed"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'latest-dispatch.json'), '{"status":"running"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'active-phase-run.json'), '{"runLeaseId":"lease-1","status":"active"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), '{"status":"running"}\n', 'utf8');
    fs.writeFileSync(manifestFile, '{"commitToken":"phase08","round":1}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'current-artifacts.json'), `${JSON.stringify({
      commitToken: 'phase08',
      manifestPath: '.claude/logs/workflow-enforcement/closeout-sync-manifest-phase08.json',
      manifestHash: sha256RawBytes(manifestFile),
      artifacts: {
        'canonical-verdict-phase08': {
          kind: 'canonical-verdict-phase08',
          path: '.claude/verification-verdict-phase08-final.json',
          hash: sha256RawBytes(verdictFile),
          commitToken: 'phase08',
        },
      },
    }, null, 2)}\n`, 'utf8');

    const before = buildCompositeMonitorCursor({ repoRoot: root, statusFile, workflowDir: path.relative(root, workflowDir) });
    fs.writeFileSync(manifestFile, '{"commitToken":"phase08","round":2}\n', 'utf8');
    const after = buildCompositeMonitorCursor({ repoRoot: root, statusFile, workflowDir: path.relative(root, workflowDir) });

    assert.notEqual(after.fingerprint, before.fingerprint);
    assert.equal(after.currentIndex.commitToken, 'phase08');
    assert.equal(after.workflowLogs.length, 3);
    assert.equal(after.activeVerdicts.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
