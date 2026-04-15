#!/usr/bin/env node

import { runCommand } from './process-utils.mjs';

export function isInsideGitWorkTree(cwd = process.cwd()) {
  const result = runCommand('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  return result.status === 0;
}

export function collectGitStatusPaths(cwd = process.cwd()) {
  const result = runCommand('git', ['status', '--short'], { cwd });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      let filePath = line.slice(3);
      const renameMarker = ' -> ';
      if (filePath.includes(renameMarker)) {
        filePath = filePath.split(renameMarker).at(-1);
      }
      return filePath.trim();
    })
    .filter(Boolean);
}
