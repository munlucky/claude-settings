#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildFailureClassCounts,
  classifyCapabilityCheck,
  classifyFailure,
  decisionForFailureCode,
  isEnvironmentBlockerCode,
  normalizeFailureCode,
  summarizeFailureDecision,
} from './failure-classifier.mjs';

const runtimeCliPath = new URL('../agent-loop-phase-runtime.mjs', import.meta.url);

function detectFinalStopReason(rawLines) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase02-failure-classifier-'));
  const logFile = path.join(tempDir, 'runtime.log');
  fs.writeFileSync(logFile, `${rawLines.join('\n')}\n`, 'utf8');
  const result = spawnSync('node', [runtimeCliPath.pathname, 'detect-final-stop-reason', logFile, 'phase-failed', '2'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  return String(result.stdout ?? '').trim();
}

function testBashAccessDenied() {
  const a = classifyFailure({ name: 'shell:.claude/scripts/verify-code-policy.sh', status: 'warning', detail: 'spawnSync bash EPERM' });
  const b = classifyFailure({ name: 'shell:.claude/scripts/workflow-enforcement.sh', status: 'warning', detail: 'spawnSync bash Access is denied' });

  assert.equal(a.code, 'bash_access_denied');
  assert.equal(a.decision, 'resume_later_handoff');
  assert.equal(a.fingerprint, b.fingerprint);
}

function testCodexStorageAndStateCodes() {
  const home = classifyFailure({ name: 'codex.home', status: 'warning', detail: 'codex home directory permission denied' });
  const session = classifyFailure({ name: 'codex.session', status: 'warning', detail: 'session storage permission denied on .codex/sessions' });
  const state = classifyFailure({ name: 'codex.state', status: 'warning', detail: 'state db discrepancy reported for runtime-state.sqlite' });

  assert.equal(home.code, 'codex_home_readonly');
  assert.equal(session.code, 'codex_session_storage_readonly');
  assert.equal(state.code, 'codex_state_db_readonly');
  assert.equal(isEnvironmentBlockerCode('codex_home_readonly'), true);
  assert.equal(isEnvironmentBlockerCode('codex_session_storage_readonly'), true);
  assert.equal(isEnvironmentBlockerCode('codex_state_db_readonly'), true);
  assert.equal(decisionForFailureCode('codex_state_db_readonly'), 'resume_later_handoff');
}

function testShellSnapshotMcpNodeGitRgMemoryGraphCodes() {
  const shellSnapshot = classifyFailure({ name: 'shell.snapshot', status: 'warning', detail: 'Failed to check rollout age for snapshot' });
  const mcpCleanup = classifyFailure({ name: 'mcp.cleanup', status: 'warning', detail: 'MCP cleanup EPERM while killing process group' });
  const mcpTerminate = classifyFailure({ name: 'mcp.terminate', status: 'warning', detail: 'Failed to terminate MCP process group: Operation not permitted' });
  const nodeSpawn = classifyFailure({ name: 'node.spawn', status: 'warning', detail: 'spawnSync node EPERM' });
  const gitIndex = classifyFailure({ name: 'git.index', status: 'warning', detail: 'git index write access denied' });
  const rgAccess = classifyFailure({ name: 'search.rg', status: 'warning', detail: 'rg access is denied' });
  const memoryGraph = classifyFailure({ name: 'memorygraph.health', status: 'warning', detail: 'memorygraph transport closed' });
  const verifier = classifyFailure({ name: 'verifier.runtime', status: 'warning', detail: 'runtime verifier unavailable' });
  const pathUpdate = classifyFailure({ name: 'path.update', status: 'warning', detail: 'PATH update denied by host policy' });
  const pluginSync = classifyFailure({ name: 'plugin.sync', status: 'warning', detail: 'plugin network sync failed after timeout' });
  const pluginHost = classifyFailure({ name: 'plugin.sync.host', status: 'warning', detail: 'plugin sync failed: Could not resolve host: github.com' });
  const networkHost = classifyFailure({ name: 'network.host', status: 'warning', detail: 'Could not resolve host: github.com' });
  const spawnBlocked = classifyFailure({ name: 'child.spawn', status: 'warning', detail: 'spawn blocked by host policy' });

  assert.equal(shellSnapshot.code, 'shell_snapshot_failure');
  assert.equal(mcpCleanup.code, 'mcp_cleanup_eperm');
  assert.equal(mcpTerminate.code, 'mcp_cleanup_eperm');
  assert.equal(nodeSpawn.code, 'node_spawn_eperm');
  assert.equal(gitIndex.code, 'git_index_denied');
  assert.equal(rgAccess.code, 'rg_access_denied');
  assert.equal(memoryGraph.code, 'memorygraph_unavailable');
  assert.equal(verifier.code, 'verifier_unavailable');
  assert.equal(pathUpdate.code, 'path_update_denied');
  assert.equal(pluginSync.code, 'plugin_network_sync_failed');
  assert.equal(pluginHost.code, 'plugin_network_sync_failed');
  assert.equal(networkHost.code, 'network_fetch_failed');
  assert.equal(spawnBlocked.code, 'spawn_blocked');
  assert.equal(isEnvironmentBlockerCode('mcp_cleanup_eperm'), true);
  assert.equal(isEnvironmentBlockerCode('memorygraph_unavailable'), true);
  assert.equal(isEnvironmentBlockerCode('path_update_denied'), true);
}

function testGitAndNetworkCodes() {
  const git = classifyFailure({ name: 'git.version', status: 'warning', detail: 'spawnSync git EPERM' });
  const network = classifyFailure({ name: 'network.fetch', status: 'warning', detail: 'fetch failed: ENOTFOUND' });

  assert.equal(git.code, 'git_eperm');
  assert.equal(network.code, 'network_fetch_failed');
  assert.equal(network.decision, 'host_fallback');
  assert.equal(decisionForFailureCode('git_eperm'), 'resume_later_handoff');
  assert.equal(normalizeFailureCode({ reason: '  Bash Access Denied  ' }), 'bash_access_denied');
}

function testDetectFinalStopReasonForRawLogs() {
  assert.equal(
    detectFinalStopReason([
      'Failed to terminate MCP process group: Operation not permitted',
      'phase worker still running',
    ]),
    'mcp_cleanup_eperm',
  );
  assert.equal(
    detectFinalStopReason([
      'Could not resolve host: github.com',
      'plugin sync failed during bootstrap',
    ]),
    'network_fetch_failed',
  );
  assert.equal(
    detectFinalStopReason([
      'plugin sync failed: Could not resolve host: github.com',
    ]),
    'plugin_network_sync_failed',
  );
}

function testCountsAndCapabilityClassification() {
  const counts = buildFailureClassCounts([
    { name: 'shell:.claude/scripts/verify-code-policy.sh', status: 'warning', detail: 'spawnSync bash EPERM' },
    { name: 'shell:.claude/scripts/workflow-enforcement.sh', status: 'warning', detail: 'spawnSync bash EPERM' },
    { name: 'git.current', status: 'warning', detail: 'spawnSync git EPERM' },
    { name: 'codex.resolve', status: 'passed', detail: 'codex available' },
    { name: 'memorygraph.health', status: 'warning', detail: 'memorygraph transport closed' },
  ]);

  assert.equal(counts.bash_access_denied, 2);
  assert.equal(counts.git_eperm, 1);
  assert.equal(counts.memorygraph_unavailable, 1);

  const passed = classifyCapabilityCheck({ name: 'codex.resolve', status: 'passed', detail: 'codex available' });
  assert.equal(passed.code, 'ok');
  assert.equal(passed.decision, 'continue');
  assert.equal(passed.detail, 'codex available');
  assert.equal(passed.failureClass, '');

  const failed = classifyCapabilityCheck({ name: 'git.index', status: 'failed', detail: 'git index write access denied', command: 'git update-index -q --refresh' });
  assert.equal(failed.code, 'git_index_denied');
  assert.equal(failed.failureClass, 'git_index_denied');
  assert.equal(failed.command, 'git update-index -q --refresh');

  const optional = classifyCapabilityCheck({ name: 'docker.info', status: 'warning', detail: 'docker daemon permission denied', decision: 'continue' });
  assert.equal(optional.code, 'docker_daemon_unavailable');
  assert.equal(optional.blocker, false);
  assert.equal(optional.decision, 'continue');

  const summary = summarizeFailureDecision(counts);
  assert.equal(summary.blockerCode, 'bash_access_denied');
  assert.equal(summary.sameFailureClassCount, 2);
}

testBashAccessDenied();
testCodexStorageAndStateCodes();
testShellSnapshotMcpNodeGitRgMemoryGraphCodes();
testGitAndNetworkCodes();
testDetectFinalStopReasonForRawLogs();
testCountsAndCapabilityClassification();

process.stdout.write('failure-classifier self-test passed\n');
