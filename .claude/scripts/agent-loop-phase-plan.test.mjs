import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { getNextPhase } from './agent-loop-phase-plan.mjs';

test('get-next-phase prefers pending_reverify before pending phases', () => {
  withStatusFile([
    'phases:',
    '  - number: 9',
    '    status: pending',
    '    planConfirmed: true',
    '  - number: 10',
    '    status: pending_reverify',
    '    planConfirmed: true',
    '',
  ], (statusFile) => {
    assert.equal(getNextPhase(statusFile), '10');
  });
});

test('get-next-phase does not skip blocked phases by default', () => {
  withStatusFile([
    'phases:',
    '  - number: 9',
    '    status: verification_blocked',
    '    planConfirmed: true',
    '  - number: 10',
    '    status: pending',
    '    planConfirmed: true',
    '',
  ], (statusFile) => {
    assert.equal(getNextPhase(statusFile), '');
  });
});

function withStatusFile(lines, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-plan-'));
  try {
    const statusFile = path.join(root, 'phase-status.yaml');
    fs.writeFileSync(statusFile, `${lines.join('\n')}\n`, 'utf8');
    callback(statusFile);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
