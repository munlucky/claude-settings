import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendWasteLedgerEntry } from './waste-ledger.mjs';

test('waste ledger classifies runtime warning noise without creating retry entries', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waste-ledger-'));
  try {
    const pluginSync = appendWasteLedgerEntry({
      repoRoot,
      kind: 'warning',
      context: 'codex_core::plugins::startup_sync',
      detail: 'startup remote plugin sync failed with status 403 Forbidden for /backend-api/plugins/list',
    });
    const mcpShutdown = appendWasteLedgerEntry({
      repoRoot,
      kind: 'warning',
      context: 'mcp shutdown cleanup',
      detail: 'MCP cleanup failed with EPERM while shutting down runtime transport',
    });
    const pluginManifest = appendWasteLedgerEntry({
      repoRoot,
      kind: 'warning',
      context: 'codex_core_plugins::manifest',
      detail: 'ignoring interface.defaultPrompt in plugin.json',
    });

    assert.equal(pluginSync.entry.class, 'plugin_network_sync');
    assert.equal(mcpShutdown.entry.class, 'mcp_shutdown');
    assert.equal(pluginManifest.entry.class, 'plugin_manifest');
    assert.equal(pluginManifest.summary.totals.warningEntries, 3);
    assert.equal(pluginManifest.summary.totals.retryEntries, 0);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
