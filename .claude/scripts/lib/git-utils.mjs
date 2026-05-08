#!/usr/bin/env node

import assert from 'node:assert/strict';
import { classifyFailure } from './failure-classifier.mjs';
import { runCommand } from './process-utils.mjs';

export function extractGitEnvironmentWarnings(text = '') {
  const warnings = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const classification = classifyFailure({ message: line });
    if (classification.code === 'safe_git_ignore_permission_warning') {
      warnings.push({
        code: 'environment_warning.git_global_ignore_permission',
        classifierCode: classification.code,
        message: line,
      });
    }
  }
  return warnings;
}

export function stripGitEnvironmentWarnings(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => classifyFailure({ message: line }).code !== 'safe_git_ignore_permission_warning')
    .join('\n')
    .trim();
}

export function runGit(args = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const safeDirectory = options.safeDirectory || cwd;
  const result = runCommand('git', ['-c', `safe.directory=${safeDirectory}`, '-c', 'core.editor=true', ...args], {
    cwd,
    allowFailure: true,
    env: {
      ...process.env,
      ...(options.env || {}),
      GIT_EDITOR: 'true',
    },
  });
  const combinedOutput = `${result.stderr || ''}\n${result.stdout || ''}`;
  return {
    ...result,
    stdout: stripGitEnvironmentWarnings(result.stdout || ''),
    stderr: stripGitEnvironmentWarnings(result.stderr || ''),
    rawStdout: result.stdout || '',
    rawStderr: result.stderr || '',
    environmentWarnings: extractGitEnvironmentWarnings(combinedOutput),
  };
}

export function isInsideGitWorkTree(cwd = process.cwd()) {
  const result = runGit(['rev-parse', '--is-inside-work-tree'], { cwd });
  return result.status === 0;
}

export function collectGitStatusPaths(cwd = process.cwd()) {
  const result = runGit(['-c', 'core.autocrlf=true', 'status', '--short', '--untracked-files=all'], { cwd });
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

export function selfTest() {
  const fixture = "warning: unable to access 'C:\\Users\\moon/.config/git/ignore': Permission denied\n M file.txt\n";
  const warnings = extractGitEnvironmentWarnings(fixture);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, 'environment_warning.git_global_ignore_permission');
  assert.equal(stripGitEnvironmentWarnings(fixture), 'M file.txt');
}
