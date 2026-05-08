#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LEDGER = '.claude/logs/agent-loop/patch-failures.json';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return { failures: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function recordPatchFailure(input = {}) {
  const root = input.root ? path.resolve(input.root) : process.cwd();
  const ledgerPath = path.resolve(root, input.ledger || DEFAULT_LEDGER);
  const targetPath = String(input.file || input.path || '').replace(/\\/g, '/');
  if (!targetPath) {
    throw new Error('Missing --file');
  }
  const ledger = readJson(ledgerPath);
  const failures = Array.isArray(ledger.failures) ? ledger.failures : [];
  const sameFileCount = failures.filter((entry) => entry.file === targetPath).length + 1;
  const classification = sameFileCount >= 2 ? 'stale_context' : 'transient_patch_mismatch';
  const entry = {
    observedAt: input.now || new Date().toISOString(),
    file: targetPath,
    message: String(input.message || 'apply_patch verification failed'),
    sameFileCount,
    classification,
  };
  const next = {
    schemaVersion: '1.0',
    updatedAt: entry.observedAt,
    failures: [...failures, entry],
  };
  writeJson(ledgerPath, next);
  return { ledgerPath, entry };
}

function parseArgs(argv) {
  const result = {};
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--file':
        result.file = args.shift() || '';
        break;
      case '--message':
        result.message = args.shift() || '';
        break;
      case '--root':
        result.root = args.shift() || '';
        break;
      case '--ledger':
        result.ledger = args.shift() || '';
        break;
      case '--now':
        result.now = args.shift() || '';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-failure-ledger-'));
  try {
    const first = recordPatchFailure({ root, file: 'src/a.ts', now: '2026-05-08T00:00:00.000Z' });
    const second = recordPatchFailure({ root, file: 'src/a.ts', now: '2026-05-08T00:00:01.000Z' });
    assert.equal(first.entry.classification, 'transient_patch_mismatch');
    assert.equal(second.entry.classification, 'stale_context');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv[2] === 'self-test') {
    selfTest();
    console.log('patch-failure-ledger self-test passed');
    return;
  }
  const result = recordPatchFailure(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result.entry, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
