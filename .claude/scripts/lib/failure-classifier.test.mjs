#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildFailureClassCounts,
  classifyCapabilityCheck,
  classifyFailure,
  classifyStagnationPattern,
  classifyTimeoutBudget,
  decisionForFailureCode,
  isEnvironmentBlockerCode,
  normalizeStopOutcome,
  normalizeFailureCode,
  summarizeFailureDecision,
} from './failure-classifier.mjs';

function detectFinalStopReason(rawLines) {
  for (const line of rawLines) {
    const code = classifyFailure({ detail: line }).code;
    if (code !== 'unknown_failure') {
      return code;
    }
  }
  return classifyFailure({ detail: rawLines.join('\n') }).code;
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
  const cimAccess = classifyFailure({ name: 'process.cim', status: 'warning', detail: 'Get-CimInstance access is denied' });
  const memoryGraph = classifyFailure({ name: 'memorygraph.health', status: 'warning', detail: 'memorygraph transport closed' });
  const verifier = classifyFailure({ name: 'verifier.runtime', status: 'warning', detail: 'runtime verifier unavailable' });
  const verifierSpawn = classifyFailure({
    failureCode: 'command_not_found',
    name: 'verifier.runtime',
    detail: 'node --test .claude/scripts/lib/current-artifacts-state.test.mjs failed: spawn EPERM',
  });
  const nodeTestWorker = classifyFailure({
    name: 'node.test.worker',
    detail: 'Node test worker spawn EPERM',
  });
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
  assert.equal(cimAccess.code, 'get_ciminstance_access_denied');
  assert.equal(memoryGraph.code, 'memorygraph_unavailable');
  assert.equal(verifier.code, 'verifier_unavailable');
  assert.equal(verifierSpawn.code, 'verifier_unavailable');
  assert.equal(verifierSpawn.decision, 'resume_later_handoff');
  assert.equal(nodeTestWorker.code, 'verifier_unavailable');
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
  const queueSmoke = classifyFailure({ name: 'npm.queue-smoke', status: 'warning', detail: 'npm queue-smoke failed: spawnSync git EPERM' });
  const gitIgnoreWarning = classifyFailure({ name: 'git.warning', status: 'warning', detail: "warning: unable to access 'C:\\Users\\moon/.config/git/ignore': Permission denied" });
  const sandboxProvider = classifyFailure({ name: 'provider.smoke', status: 'warning', detail: 'E_PROVIDER_NETWORK websocket os error 10013 blocked by sandbox' });
  const network = classifyFailure({ name: 'network.fetch', status: 'warning', detail: 'fetch failed: ENOTFOUND' });

  assert.equal(git.code, 'git_eperm');
  assert.equal(queueSmoke.code, 'npm_queue_smoke_git_eperm');
  assert.equal(gitIgnoreWarning.code, 'safe_git_ignore_permission_warning');
  assert.equal(gitIgnoreWarning.blocker, false);
  assert.equal(sandboxProvider.code, 'sandbox_network_boundary_candidate');
  assert.equal(sandboxProvider.blocker, false);
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
      'node --test .claude/scripts/lib/current-artifacts-state.test.mjs failed: spawnSync node EPERM',
    ]),
    'verifier_unavailable',
  );
  assert.equal(
    detectFinalStopReason([
      'failed to initialize MCP client during shutdown: MCP startup failed: handshaking with MCP server failed: connection closed',
      'phase worker still running',
    ]),
    'mcp_shutdown_warning',
  );
  assert.equal(
    classifyFailure({ failureCode: 'command_not_found', detail: 'actual command not found' }).code,
    'command_not_found',
  );
  assert.equal(
    classifyFailure({ name: 'node.spawn', detail: 'spawnSync node EPERM' }).code,
    'node_spawn_eperm',
  );
  assert.equal(
    classifyFailure({ name: 'node.spawn', detail: 'spawnSync node EPERM' }).decision,
    'resume_later_handoff',
  );
  assert.equal(
    classifyFailure({ detail: 'failed to initialize MCP client during shutdown: connection closed' }).blocker,
    false,
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

function testStagnationPatternsAndRetrySuppression() {
  const spinning = classifyStagnationPattern([
    { reason: 'verification command missing', detail: 'same missing verdict' },
    { reason: 'verification command missing', detail: 'same missing verdict' },
  ]);
  assert.equal(spinning.pattern, 'spinning');
  assert.equal(spinning.recoveryAction, 'unstuck_replan');
  assert.equal(spinning.retrySuppressed, true);

  const oscillation = classifyStagnationPattern([
    { code: 'git_eperm' },
    { code: 'memorygraph_unavailable' },
    { code: 'git_eperm' },
    { code: 'memorygraph_unavailable' },
  ]);
  assert.equal(oscillation.pattern, 'oscillation');
  assert.equal(oscillation.recoveryAction, 'unstuck_replan');

  const noDrift = classifyStagnationPattern([
    { code: 'unknown_failure', changedFiles: 0, lineDelta: 0, driftScore: 0 },
    { code: 'unknown_failure', changedFiles: 0, lineDelta: 0, driftScore: 0 },
  ], { threshold: 3 });
  assert.equal(noDrift.pattern, 'no_drift');

  const diminishing = classifyStagnationPattern([
    { code: 'unknown_failure', improvementScore: 3 },
    { code: 'unknown_failure', improvementScore: 1 },
    { code: 'unknown_failure', improvementScore: 0 },
  ], { threshold: 4 });
  assert.equal(diminishing.pattern, 'diminishing_returns');
}

function testStopOutcomeAndTimeoutSplit() {
  assert.equal(
    classifyTimeoutBudget({ iterationElapsedMs: 120000, iterationTimeoutMs: 120000, totalElapsedMs: 180000, totalTimeoutMs: 600000 }),
    'per_iteration_timeout',
  );
  assert.equal(
    classifyTimeoutBudget({ totalElapsedMs: 600000, totalTimeoutMs: 600000 }),
    'total_run_timeout',
  );

  const recovered = normalizeStopOutcome({
    rawStopReason: 'provider websocket failed',
    detail: 'E_PROVIDER_NETWORK websocket os error 10013 blocked by sandbox',
    recovered: true,
    recoveryAction: 'local_fallback',
  });
  assert.equal(recovered.rawStopReasonCode, 'sandbox_network_boundary_candidate');
  assert.equal(recovered.recoveryAction, 'local_fallback');
  assert.equal(recovered.normalizedRunVerdict, 'recovered_success');
  assert.notEqual(recovered.normalizedRunVerdict, recovered.rawStopReasonCode);

  const timeout = normalizeStopOutcome({
    rawStopReason: 'iteration timeout',
    iterationElapsedMs: 30000,
    iterationTimeoutMs: 30000,
  });
  assert.equal(timeout.timeoutBudget, 'per_iteration_timeout');
  assert.equal(timeout.stopReasonClass, 'per_iteration_timeout');
}

testBashAccessDenied();
testCodexStorageAndStateCodes();
testShellSnapshotMcpNodeGitRgMemoryGraphCodes();
testGitAndNetworkCodes();
testDetectFinalStopReasonForRawLogs();
testCountsAndCapabilityClassification();
testStagnationPatternsAndRetrySuppression();
testStopOutcomeAndTimeoutSplit();

process.stdout.write('failure-classifier self-test passed\n');
