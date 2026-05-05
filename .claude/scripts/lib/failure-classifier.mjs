#!/usr/bin/env node

import { stableFingerprint } from '../verification-verdict-state.mjs';

const FAILURE_DEFINITIONS = new Map([
  ['bash_access_denied', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'use-host-shell-or-fallback-runtime' }],
  ['git_eperm', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'use-host-git-or-fallback-runtime' }],
  ['docker_daemon_unavailable', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'verify-docker-daemon-on-host' }],
  ['network_fetch_failed', { category: 'network', decision: 'host_fallback', retryPolicy: 'no_retry', fallbackHint: 'use-cache-or-offline-fallback' }],
  ['codex_unavailable', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'resolve-codex-runtime-on-host' }],
  ['command_not_found', { category: 'environment', decision: 'host_fallback', retryPolicy: 'no_retry', fallbackHint: 'resolve-command-path-or-fallback-runtime' }],
  ['spawn_blocked', { category: 'environment', decision: 'resume_later_handoff', retryPolicy: 'no_retry', fallbackHint: 'use-host-fallback-runtime' }],
  ['unknown_failure', { category: 'unknown', decision: 'continue', retryPolicy: 'retryable', fallbackHint: '' }],
]);

const ENVIRONMENT_PATTERNS = [
  { code: 'bash_access_denied', test: /(?:^|\b)bash(?:\b|:).*(ep?erm|eacces|access is denied|permission denied|spawn blocked|unable to create process)/i },
  { code: 'git_eperm', test: /(?:^|\b)git(?:\b|:).*(ep?erm|eacces|access is denied|permission denied|spawn blocked|unable to create process)/i },
  { code: 'docker_daemon_unavailable', test: /(?:^|\b)docker(?:\b|:).*(daemon|cannot connect|connection refused|unavailable|not running|permission denied)/i },
  { code: 'network_fetch_failed', test: /(?:^|\b)(network|fetch|http|https|undici|request|econnreset|etimedout|eai_again|enotfound)\b/i },
  { code: 'codex_unavailable', test: /(?:^|\b)codex(?:\b|:).*(not found|unavailable|spawn blocked|unable to create process|ep?erm|eacces)/i },
  { code: 'command_not_found', test: /(?:command not found|not recognized|no such file or directory|is not recognized as the name of a cmdlet)/i },
  { code: 'spawn_blocked', test: /(?:spawn blocked|unable to create process|ep?erm|eacces|access is denied)/i },
];

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

export function normalizeFailureCode(input = {}) {
  const explicit = firstMeaningfulValue(
    input.code,
    input.failureCode,
    input.blockingReasonCode,
    input.reason,
    input.name,
    input.failureClass,
  );
  if (FAILURE_DEFINITIONS.has(explicit)) {
    return explicit;
  }

  const sanitizedExplicit = explicit
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (FAILURE_DEFINITIONS.has(sanitizedExplicit)) {
    return sanitizedExplicit;
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
  return normalized === 'bash_access_denied'
    || normalized === 'git_eperm'
    || normalized === 'docker_daemon_unavailable'
    || normalized === 'codex_unavailable'
    || normalized === 'spawn_blocked'
    || normalized === 'command_not_found';
}

export function classifyStopReason(reason = '') {
  return classifyFailure({ reason, message: reason });
}
