const PID_NAMESPACES = new Set(['windows', 'wsl', 'node-parent']);

function field(source, name) {
  if (!source || typeof source !== 'object') {
    return '';
  }
  return source[name] ?? source.payload?.[name] ?? '';
}

function text(value) {
  return String(value ?? '').trim();
}

function sameText(left, right) {
  return text(left) !== '' && text(left) === text(right);
}

export function defaultCheckerNamespace() {
  if (process.platform === 'win32') {
    return 'windows';
  }
  if (String(process.env.WSL_DISTRO_NAME || '').trim()) {
    return 'wsl';
  }
  return 'node-parent';
}

export function pidNamespacesCompatible(pidNamespace, checkerNamespace) {
  const pid = String(pidNamespace || '').trim();
  const checker = String(checkerNamespace || '').trim();
  if (!PID_NAMESPACES.has(pid) || !PID_NAMESPACES.has(checker)) {
    return false;
  }
  return pid === checker;
}

export function isPidAliveInCurrentNamespace(pid) {
  if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) {
    return false;
  }
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function evaluatePidLiveness({
  pid,
  pidNamespace,
  checkerNamespace = defaultCheckerNamespace(),
  staleNoProgress = false,
  toolTimedOut = false,
  livenessChecker = isPidAliveInCurrentNamespace,
} = {}) {
  if (!pid) {
    return {
      checked: false,
      degraded: true,
      reason: 'pid_missing',
      childAlive: false,
      staleChild: false,
    };
  }
  if (!pidNamespace) {
    return {
      checked: false,
      degraded: true,
      reason: 'pid_namespace_missing',
      childAlive: false,
      staleChild: false,
    };
  }
  if (!pidNamespacesCompatible(pidNamespace, checkerNamespace)) {
    return {
      checked: false,
      degraded: true,
      reason: 'pid_namespace_mismatch',
      childAlive: false,
      staleChild: false,
      pidNamespace,
      checkerNamespace,
    };
  }

  const childAlive = Boolean(livenessChecker(pid));
  if (childAlive && staleNoProgress) {
    return { checked: true, degraded: false, reason: 'stale_child_no_progress', childAlive, staleChild: true };
  }
  if (childAlive && toolTimedOut) {
    return { checked: true, degraded: false, reason: 'child_still_running', childAlive, staleChild: false };
  }
  if (!childAlive && (staleNoProgress || toolTimedOut)) {
    return { checked: true, degraded: false, reason: 'child_exited_without_closeout', childAlive, staleChild: false };
  }
  return { checked: true, degraded: false, reason: 'progress_observed', childAlive, staleChild: false };
}

export function evaluateWorkerIdentityLiveness({
  manifest,
  heartbeat,
  observedProcess,
  artifactProgress = false,
} = {}) {
  const manifestStartTime = text(field(manifest, 'childProcessStartTime'));
  const manifestIdentity = {
    attemptId: text(field(manifest, 'attemptId')),
    childPid: text(field(manifest, 'childPid')),
    childProcessStartTime: manifestStartTime,
    commandHash: text(field(manifest, 'commandHash')),
  };
  const observedIdentity = {
    childPid: text(field(observedProcess, 'childPid') || field(heartbeat, 'childPid')),
    childProcessStartTime: text(field(observedProcess, 'childProcessStartTime') || field(heartbeat, 'childProcessStartTime')),
    commandHash: text(field(observedProcess, 'commandHash') || field(heartbeat, 'commandHash')),
  };
  const heartbeatAttemptId = text(field(heartbeat, 'attemptId'));

  if (!manifestStartTime || !observedIdentity.childProcessStartTime) {
    return {
      checked: true,
      degraded: true,
      classification: 'worker_liveness_unknown',
      reason: !manifestStartTime ? 'manifest_child_start_time_missing' : 'observed_child_start_time_missing',
      workerActive: false,
      completionEligible: false,
      manifestIdentity,
      observedIdentity,
      heartbeatAttemptId,
    };
  }

  const matches = {
    attemptId: sameText(manifestIdentity.attemptId, heartbeatAttemptId),
    childPid: sameText(manifestIdentity.childPid, observedIdentity.childPid),
    childProcessStartTime: sameText(manifestIdentity.childProcessStartTime, observedIdentity.childProcessStartTime),
    commandHash: sameText(manifestIdentity.commandHash, observedIdentity.commandHash),
  };
  const workerActive = Object.values(matches).every(Boolean);
  if (workerActive) {
    return {
      checked: true,
      degraded: false,
      classification: 'controller_stale_worker_active',
      reason: 'worker_identity_match',
      workerActive: true,
      completionEligible: false,
      matches,
      manifestIdentity,
      observedIdentity,
      heartbeatAttemptId,
    };
  }

  return {
    checked: true,
    degraded: false,
    classification: artifactProgress ? 'controller_stale_artifact_progress' : 'controller_stale_worker_inactive',
    reason: artifactProgress ? 'artifact_progress_without_worker_identity' : 'worker_identity_mismatch',
    workerActive: false,
    completionEligible: false,
    matches,
    manifestIdentity,
    observedIdentity,
    heartbeatAttemptId,
  };
}
