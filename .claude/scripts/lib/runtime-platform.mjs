#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function isWindows() {
  return process.platform === 'win32';
}

export function isWsl() {
  if (process.platform !== 'linux') {
    return false;
  }

  const release = os.release().toLowerCase();
  if (release.includes('microsoft')) {
    return true;
  }

  for (const candidate of ['/proc/version', '/proc/sys/kernel/osrelease']) {
    try {
      if (fs.readFileSync(candidate, 'utf8').toLowerCase().includes('microsoft')) {
        return true;
      }
    } catch {
      // Ignore missing proc files and continue probing.
    }
  }

  return false;
}

export function activeWorkspaceContract(cwd = process.cwd()) {
  const claudePath = path.join(cwd, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudePath)) {
    return '.claude/CLAUDE.md';
  }

  const rootPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(rootPath)) {
    return 'CLAUDE.md';
  }

  return '.claude/CLAUDE.md';
}

export function normalizeParentRuntime(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['codex', 'claude', 'unknown'].includes(normalized) ? normalized : 'unknown';
}

export function normalizeRequestedRuntime(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return ['codex', 'claude'].includes(normalized) ? normalized : 'auto';
}

export function normalizeVerificationRuntimeSelection(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return ['auto', 'current', 'claude', 'codex', 'both'].includes(normalized) ? normalized : 'auto';
}

export function normalizeRuntimeScope(value) {
  const normalized = String(value || 'same').trim().toLowerCase();
  return normalized === 'both' ? 'both' : 'same';
}

export function isCodexDesktopContext() {
  const originator = String(process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE || '').trim().toLowerCase();
  return originator.includes('codex desktop') || Boolean(process.env.CODEX_THREAD_ID);
}

export function resolveParentRuntimeContext({
  requestedRuntime = 'auto',
  verificationRuntimes = 'auto',
} = {}) {
  const envParentRuntime = normalizeParentRuntime(process.env.AGENT_LOOP_PARENT_RUNTIME);
  const parentRuntime = envParentRuntime !== 'unknown'
    ? envParentRuntime
    : isCodexDesktopContext()
      ? 'codex'
      : 'unknown';
  const runtimeScope = normalizeRuntimeScope(process.env.AGENT_LOOP_RUNTIME_SCOPE);
  const explicitRuntime = normalizeRequestedRuntime(requestedRuntime);
  const verificationRuntimeSelection = normalizeVerificationRuntimeSelection(verificationRuntimes);
  const mixedRuntimeExplicit = runtimeScope === 'both' || verificationRuntimeSelection === 'both';
  const fixedRuntime = explicitRuntime !== 'auto'
    ? explicitRuntime
    : runtimeScope === 'same' && (parentRuntime === 'codex' || parentRuntime === 'claude')
      ? parentRuntime
      : '';

  return {
    parentRuntime,
    runtimeScope,
    explicitRuntime,
    verificationRuntimeSelection,
    mixedRuntimeExplicit,
    fixedRuntime,
    allowClaudeChecks: mixedRuntimeExplicit || explicitRuntime === 'claude' || parentRuntime === 'claude',
    allowCodexChecks: mixedRuntimeExplicit || explicitRuntime === 'codex' || parentRuntime === 'codex' || parentRuntime === 'unknown',
    allowCrossRuntimeFallback: mixedRuntimeExplicit,
  };
}
