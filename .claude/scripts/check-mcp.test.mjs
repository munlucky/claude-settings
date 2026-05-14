import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrapperPath = path.join(repoRoot, '.claude/scripts/code-review-graph-mcp-wrapper.js');

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('CRG MCP native transport failure records diagnostic and suppresses repeated same-run native attempt', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-mcp-crg-'));
  try {
    const diagnosticsPath = path.join(tempRoot, 'mcp-diagnostics.jsonl');
    const cachePath = path.join(tempRoot, 'native-cache.json');
    const fallbackEvidencePath = path.join(tempRoot, 'fallback-status.log');
    const env = {
      ...process.env,
      PATH: tempRoot,
      PHASE_RUN_ID: 'phase-05-run-a',
      CODE_REVIEW_GRAPH_COMMAND: path.join(tempRoot, 'missing-code-review-graph.exe'),
      CODE_REVIEW_GRAPH_MCP_DIAGNOSTICS_PATH: diagnosticsPath,
      CODE_REVIEW_GRAPH_MCP_CACHE_PATH: cachePath,
      CODE_REVIEW_GRAPH_NATIVE_FAILURE_FIXTURE: 'transport closed before initialize response',
      CODE_REVIEW_GRAPH_FALLBACK_COMMAND: 'code-review-graph status --repo .',
      CODE_REVIEW_GRAPH_FALLBACK_EVIDENCE_PATH: fallbackEvidencePath,
      CODE_REVIEW_GRAPH_FALLBACK_RANGE: 'HEAD~1..HEAD',
    };

    const first = spawnSync(process.execPath, [wrapperPath], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });
    const second = spawnSync(process.execPath, [wrapperPath], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });

    assert.notEqual(first.status, 0);
    assert.notEqual(second.status, 0);

    const records = readJsonl(diagnosticsPath);
    assert.equal(records.length, 2);
    assert.equal(records[0].tool, 'code-review-graph');
    assert.equal(records[0].transport, 'native_mcp');
    assert.equal(records[0].cacheKey, 'code-review-graph:native_mcp:phase-05-run-a');
    assert.equal(records[0].failureClass, 'transport_closed');
    assert.equal(records[0].nativeAttempted, true);
    assert.equal(records[0].nativeSuppressed, false);
    assert.equal(records[0].fallbackKind, 'cli');
    assert.equal(records[0].fallbackCommand, 'code-review-graph status --repo .');
    assert.equal(records[0].fallbackEvidencePath, fallbackEvidencePath);
    assert.equal(records[0].fallbackRange, 'HEAD~1..HEAD');
    assert.equal(records[1].nativeAttempted, false);
    assert.equal(records[1].nativeSuppressed, true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
