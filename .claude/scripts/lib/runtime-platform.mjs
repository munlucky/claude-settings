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
