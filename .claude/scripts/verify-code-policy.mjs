#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { fileExists, readTextLines, walkFiles } from './lib/fs-utils.mjs';
import { collectGitStatusPaths, isInsideGitWorkTree } from './lib/git-utils.mjs';
import { printLines } from './lib/logging.mjs';

const MAX_FILE_LINES = Number.parseInt(process.env.VERIFY_CODE_POLICY_MAX_FILE_LINES ?? '800', 10);
const BASELINE_FILE = process.env.VERIFY_CODE_POLICY_BASELINE_FILE ?? '.claude/code-policy-baseline.txt';

const SUPPORTED_SUFFIXES = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts',
  '.cs', '.php', '.swift', '.scala', '.sh', '.bash',
  '.zsh', '.ps1', '.psm1', '.c', '.cc', '.cpp', '.cxx',
  '.h', '.hh', '.hpp', '.hxx',
]);

const CONSOLE_LOG_SUFFIXES = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const SKIP_PARTS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next',
  '.turbo', '.cache', 'vendor', 'target', 'out',
]);
const SKIP_SUFFIXES = [
  '.min.js', '.min.cjs', '.min.mjs', '.bundle.js', '.generated.js',
  '.generated.ts', '.generated.tsx',
];

const consoleLogPattern = /\bconsole\.log\s*\(/;
const todoPattern = /\b(TODO|FIXME)\b/i;
const issueRefPattern = /(#\d+|[A-Z][A-Z0-9]+-\d+|https?:\/\/|issue[: -]?\d+|gh-\d+)/i;

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, '/').replace(/^\.\//, '');
}

function shouldSkip(filePath) {
  const normalized = normalizePath(filePath);
  const parts = normalized.split('/');
  if (parts.some((part) => SKIP_PARTS.has(part))) {
    return true;
  }
  return SKIP_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isSupported(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName === 'bashrc' || baseName === 'zshrc') {
    return true;
  }
  return SUPPORTED_SUFFIXES.has(path.extname(filePath).toLowerCase());
}

function isConsoleLogTarget(filePath) {
  return CONSOLE_LOG_SUFFIXES.has(path.extname(filePath).toLowerCase());
}

function hasTodoComment(line) {
  const match = todoPattern.exec(line);
  if (!match) {
    return false;
  }

  const start = match.index;
  const end = start + match[0].length;
  if ((start > 0 && line[start - 1] === '/') || (end < line.length && line[end] === '/')) {
    return false;
  }

  const prefix = line.slice(0, start).trimEnd();
  if (!prefix) {
    return true;
  }

  return ['#', '//', '/*', '*', '--', ';', '<!--'].some((marker) => prefix.includes(marker));
}

function loadBaseline() {
  if (!fileExists(BASELINE_FILE)) {
    return new Set();
  }

  const entries = new Set();
  for (const rawLine of readTextLines(BASELINE_FILE)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('|');
    if (separatorIndex === -1) {
      continue;
    }
    const rule = line.slice(0, separatorIndex).trim();
    const filePath = line.slice(separatorIndex + 1).trim().replace(/^\.\//, '');
    entries.add(`${rule}|${filePath}`);
  }
  return entries;
}

function isBaselined(rule, filePath, baseline) {
  return baseline.has(`${rule}|${normalizePath(filePath)}`);
}

function collectCandidateFiles(argv) {
  if (process.env.VERIFY_CODE_POLICY_FILES) {
    return process.env.VERIFY_CODE_POLICY_FILES.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  if (argv.length > 0) {
    return argv.map((value) => value.trim()).filter(Boolean);
  }

  if (isInsideGitWorkTree()) {
    return collectGitStatusPaths();
  }

  return walkFiles('.', { skipDirs: SKIP_PARTS }).map((filePath) => normalizePath(filePath));
}

function collectViolations(files) {
  const baseline = loadBaseline();
  const checkedFiles = [];
  const violations = [];

  for (const rawPath of files) {
    const filePath = rawPath.trim();
    if (!filePath || !fileExists(filePath)) {
      continue;
    }
    if (shouldSkip(filePath) || !isSupported(filePath)) {
      continue;
    }

    checkedFiles.push(normalizePath(filePath));
    const lines = readTextLines(filePath);

    if (lines.length > MAX_FILE_LINES && !isBaselined('file-length', filePath, baseline)) {
      violations.push(`[file-length] ${normalizePath(filePath)}: ${lines.length} lines > ${MAX_FILE_LINES}`);
    }

    if (isConsoleLogTarget(filePath)) {
      for (const [index, line] of lines.entries()) {
        if (consoleLogPattern.test(line) && !isBaselined('console-log', filePath, baseline)) {
          violations.push(`[console-log] ${normalizePath(filePath)}:${index + 1}: ${line.trim()}`);
        }
      }
    }

    for (const [index, line] of lines.entries()) {
      if (hasTodoComment(line) && !issueRefPattern.test(line) && !isBaselined('todo-reference', filePath, baseline)) {
        violations.push(`[todo-reference] ${normalizePath(filePath)}:${index + 1}: ${line.trim()}`);
      }
    }
  }

  return { checkedFiles, violations };
}

const candidateFiles = collectCandidateFiles(process.argv.slice(2));

if (candidateFiles.length === 0) {
  printLines(['Code policy check: no candidate files found']);
  process.exit(0);
}

const { checkedFiles, violations } = collectViolations(candidateFiles);

if (checkedFiles.length === 0) {
  printLines(['Code policy check: no supported changed code files found']);
  process.exit(0);
}

printLines([
  'Code Policy Check',
  `Checked files: ${checkedFiles.length}`,
  `Max file lines: ${MAX_FILE_LINES}`,
]);

if (violations.length > 0) {
  printLines([
    `Violations: ${violations.length}`,
    ...violations.map((item) => `- ${item}`),
  ]);
  process.exit(1);
}

printLines(['Violations: 0']);
