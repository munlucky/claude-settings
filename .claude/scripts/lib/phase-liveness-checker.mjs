const PID_NAMESPACES = new Set(['windows', 'wsl', 'node-parent']);

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
