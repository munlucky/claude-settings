import { nowMs } from './clock.mjs';

const SUCCESS_RETURN_BOUNDARIES = new Set(['success-return']);
const SUCCESS_STOP_REASON_CODES = new Set([
  'plan-directory-complete',
  'success-return',
  'scope_complete',
  'clean_finish',
  'current-session-clean-finish',
]);

export function parseIsoTimestamp(value) {
  if (!value) {
    return Number.NaN;
  }
  const normalized = String(value).trim().replace(/^"|"$/g, '').replace(/Z$/, '+00:00');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function staleSeconds() {
  return Number.parseInt(process.env.PHASE_RUN_LEASE_STALE_SECONDS ?? '14400', 10) || 14400;
}

function processExists(pid) {
  const parsed = Number.parseInt(String(pid || '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return true;
  }
  try {
    process.kill(parsed, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

export function hasLocalFallbackCompletion(payload = {}) {
  const completion = payload.localFallbackCompletion;
  return payload.completionStatus === 'completed-via-local-fallback'
    || payload.returnBoundary === 'local-fallback'
    || (completion && typeof completion === 'object' && String(completion.completionStatus || '').includes('fallback'));
}

export function staleLeaseReason(payload = {}, currentMs = nowMs()) {
  if (!processExists(payload.dispatcherPid)) {
    return 'dead-dispatcher-pid';
  }
  const heartbeatAt = parseIsoTimestamp(payload.lastHeartbeatAt);
  if (Number.isNaN(heartbeatAt) || currentMs - heartbeatAt > staleSeconds() * 1000) {
    return 'stale-heartbeat-ttl';
  }
  return '';
}

function isSuccessLikeStopReason(value) {
  return SUCCESS_STOP_REASON_CODES.has(String(value || '').trim().toLowerCase());
}

export function normalizeFinishOutcome({ actionable, returnBoundary, stopReasonCode, stopReasonDetail }) {
  if (actionable === 0) {
    return {
      status: 'finished',
      returnBoundary,
      stopReasonCode,
      stopReasonDetail,
    };
  }

  const normalizedBoundary = String(returnBoundary || '').trim().toLowerCase();
  const normalizedReason = String(stopReasonCode || '').trim().toLowerCase();
  if (SUCCESS_RETURN_BOUNDARIES.has(normalizedBoundary) || isSuccessLikeStopReason(normalizedReason)) {
    const detail = stopReasonDetail
      ? `${stopReasonDetail} Next actionable phase continuation is still required.`
      : 'Actionable phases remain; the dispatcher must continue or pause instead of finishing the plan.';
    return {
      status: 'paused',
      returnBoundary: 'dispatch-paused',
      stopReasonCode: 'actionable-phases-remaining',
      stopReasonDetail: detail,
    };
  }

  return {
    status: 'paused',
    returnBoundary: returnBoundary || 'dispatch-paused',
    stopReasonCode: stopReasonCode || 'actionable-phases-remaining',
    stopReasonDetail: stopReasonDetail || 'Actionable phases remain; execution paused before plan completion.',
  };
}

export function assertReturnAllowedFromFiles({ actionable, executionIntent, prepareOnly, existing }) {
  if (!executionIntent || prepareOnly) {
    return {
      RETURN_ALLOWED: 'true',
      RETURN_REASON: 'non_execution_or_prepare_only',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  if (actionable === 0) {
    return {
      RETURN_ALLOWED: 'true',
      RETURN_REASON: 'plan_directory_complete',
      ACTIONABLE_PHASES_REMAINING: '0',
    };
  }

  if (!existing) {
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'missing-active-run-lease',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  if (existing.status !== 'active') {
    if (existing.status === 'paused') {
      return {
        RETURN_ALLOWED: 'false',
        RETURN_REASON: 'paused-run-lease-with-actionable-phases',
        ACTIONABLE_PHASES_REMAINING: String(actionable),
      };
    }
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'inactive-run-lease-with-actionable-phases',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  const heartbeatAt = parseIsoTimestamp(existing.lastHeartbeatAt);
  if (Number.isNaN(heartbeatAt) || nowMs() - heartbeatAt > staleSeconds() * 1000) {
    return {
      RETURN_ALLOWED: 'false',
      RETURN_REASON: 'stale-run-lease',
      ACTIONABLE_PHASES_REMAINING: String(actionable),
    };
  }

  return {
    RETURN_ALLOWED: 'false',
    RETURN_REASON: 'actionable-phases-remaining',
    ACTIONABLE_PHASES_REMAINING: String(actionable),
  };
}
