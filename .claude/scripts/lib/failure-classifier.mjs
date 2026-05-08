#!/usr/bin/env node

import { stableFingerprint } from '../verification-verdict-state.mjs';

const FAILURE_DEFINITIONS = new Map([
  ['bash_access_denied', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'use-host-shell-or-fallback-runtime' }],
  ['git_eperm', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'use-host-git-or-fallback-runtime' }],
  ['git_index_denied', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-git-index-permissions-or-use-host-fallback' }],
  ['rg_access_denied', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-rg-or-fallback-search-path' }],
  ['get_ciminstance_access_denied', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'avoid-cim-or-use-host-permission-fallback' }],
  ['npm_queue_smoke_git_eperm', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-git-spawn-permissions-before-queue-smoke' }],
  ['safe_git_ignore_permission_warning', { category: 'environment_warning', decision: 'continue', retryPolicy: 'continue', fallbackHint: 'record-warning-and-continue-with-safe-directory' }],
  ['sandbox_network_boundary_candidate', { category: 'environment_warning', decision: 'continue', retryPolicy: 'continue', fallbackHint: 'rerun-provider-smoke-on-host-and-pair-results' }],
  ['docker_daemon_unavailable', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'verify-docker-daemon-on-host' }],
  ['network_fetch_failed', { category: 'network', decision: 'host_fallback', retryPolicy: 'no_retry', fallbackHint: 'use-cache-or-offline-fallback' }],
  ['codex_unavailable', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'resolve-codex-runtime-on-host' }],
  ['codex_session_storage_readonly', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'make-codex-session-storage-writable' }],
  ['codex_home_readonly', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'make-codex-home-writable' }],
  ['codex_state_db_readonly', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'make-codex-state-db-writable' }],
  ['shell_snapshot_failure', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-shell-snapshot-path-or-fallback-runtime' }],
  ['mcp_cleanup_eperm', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-mcp-cleanup-permissions-or-stop-process-tree-manually' }],
  ['path_update_denied', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-path-update-permissions-or-use-host-fallback' }],
  ['plugin_network_sync_failed', { category: 'network', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'reconnect-plugin-network-sync-or-fallback-runtime' }],
  ['node_spawn_eperm', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'repair-node-spawn-permissions-or-fallback-runtime' }],
  ['memorygraph_unavailable', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'install-or-repair-memorygraph-or-defer-memory-backed-verification' }],
  ['verifier_unavailable', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'restore-verification-runtime-or-defer-verification' }],
  ['command_not_found', { category: 'environment', decision: 'host_fallback', retryPolicy: 'no_retry', fallbackHint: 'resolve-command-path-or-fallback-runtime' }],
  ['spawn_blocked', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'use-host-fallback-runtime' }],
  ['unknown_failure', { category: 'unknown', decision: 'continue', retryPolicy: 'retryable', fallbackHint: '' }],
]);

const FAILURE_CODE_ALIASES = new Map([
  ['codex_session', 'codex_session_storage_readonly'],
  ['codex_session_storage', 'codex_session_storage_readonly'],
  ['codex_state', 'codex_state_db_readonly'],
  ['codex_state_db', 'codex_state_db_readonly'],
  ['session_storage_permission_denied', 'codex_session_storage_readonly'],
  ['session_storage_unwritable', 'codex_session_storage_readonly'],
  ['codex_home', 'codex_home_readonly'],
  ['codex_home_readonly', 'codex_home_readonly'],
  ['codex_home_unwritable', 'codex_home_readonly'],
  ['state_db_inconsistent', 'codex_state_db_readonly'],
  ['state_db_locked', 'codex_state_db_readonly'],
  ['state_db_permission_denied', 'codex_state_db_readonly'],
  ['shell_snapshot', 'shell_snapshot_failure'],
  ['shell_snapshot_inconsistent', 'shell_snapshot_failure'],
  ['shell_snapshot_unavailable', 'shell_snapshot_failure'],
  ['shell_snapshot_readonly', 'shell_snapshot_failure'],
  ['codex_session_storage_readonly', 'codex_session_storage_readonly'],
  ['codex_state_db_readonly', 'codex_state_db_readonly'],
  ['shell_snapshot_failure', 'shell_snapshot_failure'],
  ['mcp_cleanup', 'mcp_cleanup_eperm'],
  ['mcp_cleanup_permission_denied', 'mcp_cleanup_eperm'],
  ['mcp_cleanup_failed', 'mcp_cleanup_eperm'],
  ['path_update', 'path_update_denied'],
  ['path_update_permission_denied', 'path_update_denied'],
  ['plugin_network_sync', 'plugin_network_sync_failed'],
  ['plugin_sync_failed', 'plugin_network_sync_failed'],
  ['plugin_network_sync_unavailable', 'plugin_network_sync_failed'],
  ['node_spawn', 'node_spawn_eperm'],
  ['node_spawn_permission_denied', 'node_spawn_eperm'],
  ['git_index', 'git_index_denied'],
  ['git_index_permission_denied', 'git_index_denied'],
  ['git_access_denied', 'git_index_denied'],
  ['rg_access_denied', 'rg_access_denied'],
  ['get_ciminstance_access_denied', 'get_ciminstance_access_denied'],
  ['cim_access_denied', 'get_ciminstance_access_denied'],
  ['wmi_access_denied', 'get_ciminstance_access_denied'],
  ['npm_queue_smoke_git_eperm', 'npm_queue_smoke_git_eperm'],
  ['queue_smoke_git_eperm', 'npm_queue_smoke_git_eperm'],
  ['safe_git_ignore_permission_warning', 'safe_git_ignore_permission_warning'],
  ['git_ignore_permission_warning', 'safe_git_ignore_permission_warning'],
  ['sandbox_network_boundary_candidate', 'sandbox_network_boundary_candidate'],
  ['e_provider_network', 'sandbox_network_boundary_candidate'],
  ['provider_network_sandbox', 'sandbox_network_boundary_candidate'],
  ['memorygraph_transport_closed', 'memorygraph_unavailable'],
  ['memorygraph_transport_failure', 'memorygraph_unavailable'],
  ['memorygraph_unavailable', 'memorygraph_unavailable'],
  ['runtime_verifier', 'verifier_unavailable'],
  ['verification_runtime', 'verifier_unavailable'],
  ['runtime_verifier_unavailable', 'verifier_unavailable'],
  ['verification_runtime_unavailable', 'verifier_unavailable'],
  ['verifier_unavailable', 'verifier_unavailable'],
  ['git_eperm', 'git_eperm'],
  ['bash_access_denied', 'bash_access_denied'],
  ['docker_daemon_unavailable', 'docker_daemon_unavailable'],
  ['network_fetch_failed', 'network_fetch_failed'],
  ['codex_unavailable', 'codex_unavailable'],
  ['command_not_found', 'command_not_found'],
  ['spawn_blocked', 'spawn_blocked'],
]);

const ENVIRONMENT_PATTERNS = [
  { code: 'codex_session_storage_readonly', test: /(?:^|\b)(?:\.codex\/sessions|session storage|codex session storage|session store|sessions directory)(?:\b|:).*(read only|readonly|unwritable|permission denied|access is denied|ep?erm|eacces)/i },
  { code: 'codex_home_readonly', test: /(?:^|\b)(?:codex home|\.codex|codex settings|codex root)(?:\b|:).*(read only|readonly|unwritable|permission denied|access is denied|ep?erm|eacces)/i },
  { code: 'codex_state_db_readonly', test: /(?:^|\b)(?:state db|runtime state|sqlite|sqlite3|runtime-state\.sqlite|rollout\/session state db|state database)(?:\b|:).*(read only|readonly|locked|permission denied|access is denied|ep?erm|eacces|discrepancy|inconsistent)/i },
  { code: 'shell_snapshot_failure', test: /(?:^|\b)(?:shell snapshot|snapshot age|rollout age for snapshot|snapshot directory|shell_snapshot)(?:\b|:).*(failed|unavailable|inconsistent|read only|readonly|permission denied|access is denied|ep?erm|eacces)/i },
  { code: 'mcp_cleanup_eperm', test: /(?:^|\b)(?:mcp cleanup|cleanup mcp|kill mcp process group|terminate mcp process group|failed to terminate mcp process group|process group cleanup|tree cleanup)(?:\b|:).*(ep?erm|eacces|permission denied|access is denied|operation not permitted)/i },
  { code: 'path_update_denied', test: /(?:^|\b)(?:path update|update path|prepend path|PATH)(?:\b|:).*(denied|permission denied|access is denied|ep?erm|eacces|operation not permitted|readonly|read only)/i },
  { code: 'plugin_network_sync_failed', test: /(?:^|\b)(?:plugin sync|plugin network sync|network sync|sync failed|plugin registry|plugin mirror)(?:\b|:).*(failed|unavailable|timeout|network|econnreset|etimedout|eai_again|enotfound|permission denied|access is denied)/i },
  { code: 'node_spawn_eperm', test: /(?:^|\b)node(?:\b|:).*(ep?erm|eacces|permission denied|access is denied|unable to create process|spawn blocked)/i },
  { code: 'bash_access_denied', test: /(?:^|\b)bash(?:\b|:).*(ep?erm|eacces|access is denied|permission denied|spawn blocked|unable to create process)/i },
  { code: 'git_index_denied', test: /(?:^|\b)(?:git index|index write|git index write|git add|git update-index)(?:\b|:).*(ep?erm|eacces|access is denied|permission denied|readonly|read only)/i },
  { code: 'safe_git_ignore_permission_warning', test: /(?:unable to access|warning).*(?:\.config[\\/]+git[\\/]+ignore|git[\\/]+ignore).*(?:permission denied|access is denied|eacces|eperm)/i },
  { code: 'sandbox_network_boundary_candidate', test: /(?:sandbox|provider|websocket|ws|network).*(?:e_provider_network|os error 10013|permission denied|access is denied|eacces|eperm|network boundary|blocked by sandbox)/i },
  { code: 'npm_queue_smoke_git_eperm', test: /(?:npm|queue-smoke|queue smoke).*(?:spawnSync|spawn).*git.*(?:ep?erm|eacces|access is denied|permission denied)/i },
  { code: 'git_eperm', test: /(?:^|\b)git(?:\b|:).*(ep?erm|eacces|access is denied|permission denied|spawn blocked|unable to create process)/i },
  { code: 'rg_access_denied', test: /(?:^|\b)rg(?:\b|:).*(ep?erm|eacces|access is denied|permission denied|spawn blocked|unable to create process)/i },
  { code: 'get_ciminstance_access_denied', test: /(?:Get-CimInstance|CimInstance|WMI)(?:\b|:).*(ep?erm|eacces|access is denied|permission denied)/i },
  { code: 'memorygraph_unavailable', test: /(?:^|\b)(?:memorygraph|memory graph)(?:\b|:).*(transport closed|unavailable|not found|health check failed|spawn blocked|unable to create process|ep?erm|eacces)/i },
  { code: 'verifier_unavailable', test: /(?:^|\b)(?:runtime verifier|verification runtime|verifier)(?:\b|:).*(unavailable|not found|spawn blocked|unable to create process|ep?erm|eacces|permission denied)/i },
  { code: 'codex_unavailable', test: /(?:^|\b)codex(?:\b|:).*(not found|unavailable|spawn blocked|unable to create process|ep?erm|eacces)/i },
  { code: 'docker_daemon_unavailable', test: /(?:^|\b)docker(?:\b|:).*(daemon|cannot connect|connection refused|unavailable|not running|permission denied)/i },
  { code: 'network_fetch_failed', test: /(?:^|\b)(network|fetch|http|https|undici|request|econnreset|etimedout|eai_again|enotfound|could not resolve host|resolve host|name or service not known|temporary failure in name resolution)\b/i },
  { code: 'command_not_found', test: /(?:command not found|not recognized|no such file or directory|is not recognized as the name of a cmdlet)/i },
  { code: 'spawn_blocked', test: /(?:spawn blocked|unable to create process|ep?erm|eacces|access is denied)/i },
];

const ENVIRONMENT_BLOCKER_CODES = new Set([
  'bash_access_denied',
  'git_eperm',
  'git_index_denied',
  'rg_access_denied',
  'get_ciminstance_access_denied',
  'npm_queue_smoke_git_eperm',
  'docker_daemon_unavailable',
  'codex_unavailable',
  'codex_session_storage_readonly',
  'codex_home_readonly',
  'codex_state_db_readonly',
  'shell_snapshot_failure',
  'mcp_cleanup_eperm',
  'path_update_denied',
  'plugin_network_sync_failed',
  'node_spawn_eperm',
  'memorygraph_unavailable',
  'verifier_unavailable',
  'command_not_found',
  'spawn_blocked',
]);

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function firstMeaningfulValue(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function sanitizeCode(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizeFailureCode(input = {}) {
  const explicit = firstMeaningfulValue(
    input.code,
    input.failureCode,
    input.blockingReasonCode,
    input.blockerClass,
    input.reason,
    input.name,
    input.failureClass,
  );
  if (FAILURE_DEFINITIONS.has(explicit)) {
    return explicit;
  }

  const sanitizedExplicit = sanitizeCode(explicit);
  if (FAILURE_DEFINITIONS.has(sanitizedExplicit)) {
    return sanitizedExplicit;
  }
  if (FAILURE_CODE_ALIASES.has(sanitizedExplicit)) {
    return FAILURE_CODE_ALIASES.get(sanitizedExplicit);
  }

  const haystack = firstMeaningfulValue(
    input.message,
    input.detail,
    input.stderr,
    input.stdout,
    input.error,
    input.command,
    input.name,
    input.reason,
    input.blockingReasonCode,
    input.blockerClass,
  );

  for (const { code, test } of ENVIRONMENT_PATTERNS) {
    if (test.test(`${explicit} ${haystack}`.trim())) {
      return code;
    }
  }

  return sanitizedExplicit || explicit || 'unknown_failure';
}

export function classifyFailure(input = {}) {
  const code = normalizeFailureCode(input);
  const definition = FAILURE_DEFINITIONS.get(code) || FAILURE_DEFINITIONS.get('unknown_failure');
  const category = definition.category;
  const fingerprint = stableFingerprint({ code, category });
  const name = firstMeaningfulValue(input.source, input.name);
  const message = firstMeaningfulValue(
    input.detail,
    input.message,
    input.stderr,
    input.stdout,
    input.error,
    input.command,
    input.reason,
  );

  return {
    code,
    category,
    decision: definition.decision,
    retryPolicy: definition.retryPolicy,
    fallbackHint: definition.fallbackHint,
    fingerprint,
    blocker: definition.decision !== 'continue',
    source: name,
    name,
    message,
  };
}

export function classifyCapabilityCheck(check = {}) {
  const name = firstMeaningfulValue(check.name);
  const status = firstMeaningfulValue(check.status);
  const detail = firstMeaningfulValue(check.detail);
  const command = firstMeaningfulValue(check.command);
  const explicitDecision = firstMeaningfulValue(check.decision);
  const classification = classifyFailure({
    code: check.failureClass,
    failureCode: check.failureCode,
    blockingReasonCode: check.blockingReasonCode,
    reason: check.reason,
    name,
    message: detail,
    detail,
    error: check.error,
    stderr: check.stderr,
    stdout: check.stdout,
    command,
  });

  const base = {
    ...classification,
    detail: check.detail ?? classification.message,
    command: check.command ?? '',
    failureClass: classification.code,
    status,
    name,
  };

  if (status === 'passed' || status === 'passed_with_equivalent_evidence') {
    return {
      ...base,
      blocker: false,
      retryPolicy: 'retryable',
      decision: 'continue',
      code: 'ok',
      category: 'capability',
      fingerprint: stableFingerprint({ code: 'ok', category: 'capability' }),
      fallbackHint: '',
      failureClass: '',
    };
  }

  if (status === 'warning' && explicitDecision === 'continue') {
    return {
      ...base,
      blocker: false,
      retryPolicy: 'retryable',
      decision: 'continue',
    };
  }

  return base;
}

export function buildFailureClassCounts(entries = []) {
  const counts = {};
  for (const entry of entries) {
    const classification = classifyFailure(entry);
    if (!classification.blocker && classification.code === 'unknown_failure') {
      continue;
    }
    counts[classification.code] = (counts[classification.code] || 0) + 1;
  }
  return counts;
}

export function summarizeFailureDecision(counts = {}) {
  const entries = Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (entries.length === 0) {
    return {
      decision: 'continue',
      reason: 'ok',
      sameFailureClassCount: 0,
      blockerFingerprint: '',
      blockerCode: '',
      fallbackHint: '',
    };
  }

  const [blockerCode, sameFailureClassCount] = entries[0];
  const classification = classifyFailure({ code: blockerCode });
  return {
    decision: classification.decision,
    reason: blockerCode,
    sameFailureClassCount,
    blockerFingerprint: classification.fingerprint,
    blockerCode,
    fallbackHint: classification.fallbackHint,
  };
}

export function decisionForFailureCode(code) {
  return summarizeFailureDecision({ [normalizeFailureCode({ code })]: 1 }).decision;
}

export function isEnvironmentBlockerCode(code) {
  const normalized = normalizeFailureCode({ code });
  return ENVIRONMENT_BLOCKER_CODES.has(normalized);
}

export function classifyStopReason(reason = '') {
  return classifyFailure({ reason, message: reason });
}
