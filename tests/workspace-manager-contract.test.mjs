import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { assessWorkspaceLeaseReturn } from '../scripts/lib/workspace-manager.mjs';

test('dirty untracked or secret workspace blocks safe lease return', () => {
  assert.equal(assessWorkspaceLeaseReturn({ gitStatusShort: '' }).status, 'safe_to_return');
  assert.equal(assessWorkspaceLeaseReturn({ gitStatusShort: ' M scripts/x.mjs' }).status, 'blocked');
  assert.equal(assessWorkspaceLeaseReturn({ gitStatusShort: '?? temp.txt' }).status, 'blocked');
  assert.equal(assessWorkspaceLeaseReturn({ secretFindings: ['secret.txt'] }).status, 'blocked');
});

test('workspace assessment never allows destructive cleanup implicitly', () => {
  const result = assessWorkspaceLeaseReturn({ gitStatusShort: ' M file.txt' });
  assert.equal(result.destructiveCleanupAllowed, false);
  assert.equal(result.blockers[0].type, 'dirty_workspace');
});

test('workspace manager CLI blocks dirty return', () => {
  const result = spawnSync(process.execPath, [
    'scripts/workspace-manager.mjs',
    'assess-return',
    '--git-status-short',
    ' M file.txt',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'blocked');
});
