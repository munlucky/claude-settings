import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRemoteParity } from '../scripts/kernel/git/remote-parity.mjs';

test('verifyRemoteParity returns structured parity result', () => {
  const result = verifyRemoteParity(process.cwd());
  assert.ok(['matched', 'mismatched'].includes(result.parity));
});
