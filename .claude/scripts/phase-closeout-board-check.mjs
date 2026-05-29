#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { buildPhaseStateBoard, evaluateCloseoutReadiness } from './phase-state-board.mjs';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  const board = buildPhaseStateBoard({
    rootDir: valueAfter(argv, '--root') || undefined,
    overlayRoot: valueAfter(argv, '--overlay-root') || process.env.HARNESS_OVERLAY_ROOT || '',
    statusFile: valueAfter(argv, '--status-file') || undefined,
    workflowDir: valueAfter(argv, '--workflow-dir') || undefined,
  });
  const result = evaluateCloseoutReadiness(board);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.allowed) {
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
