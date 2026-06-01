#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fileExists, readTextLines, walkFiles } from './lib/fs-utils.mjs';
import { collectGitStatusPaths, isInsideGitWorkTree } from './lib/git-utils.mjs';
import { runCommand } from './lib/process-utils.mjs';
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
const FORBIDDEN_TRACE_PATH_PATTERNS = [
  /(^|[\\/])\.claude[\\/]\.claude[\\/]traces([\\/]|$)/i,
  /(^|[\\/])\.claude[\\/]traces([\\/]|$)/i,
];

const consoleLogPattern = /\bconsole\.log\s*\(/;
const todoPattern = /\b(TODO|FIXME)\b/i;
const issueRefPattern = /(#\d+|[A-Z][A-Z0-9]+-\d+|https?:\/\/|issue[: -]?\d+|gh-\d+)/i;

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, '/').replace(/^\.\//, '');
}

function collectTrackedTracePaths(cwd = process.cwd()) {
  const result = runCommand('git', ['ls-files', '--', '.claude/.claude/traces', '.claude/traces'], { cwd });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasForbiddenTracePath(filePath) {
  const normalized = normalizePath(filePath);
  return FORBIDDEN_TRACE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
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
    const trackedTracePaths = new Set(collectTrackedTracePaths().map((filePath) => normalizePath(filePath)));
    return [...new Set([...collectGitStatusPaths(), ...trackedTracePaths].map((filePath) => normalizePath(filePath)))]
      .filter((filePath) => !hasForbiddenTracePath(filePath) || trackedTracePaths.has(filePath));
  }

  return walkFiles('.', { skipDirs: SKIP_PARTS })
    .map((filePath) => normalizePath(filePath))
    .filter((filePath) => !hasForbiddenTracePath(filePath));
}

function collectViolations(files) {
  const baseline = loadBaseline();
  const trackedTracePaths = new Set(collectTrackedTracePaths().map((filePath) => normalizePath(filePath)));
  const checkedFiles = [];
  const violations = [];

  for (const rawPath of files) {
    const filePath = rawPath.trim();
    const normalizedPath = normalizePath(filePath);
    if (!filePath || !fileExists(filePath)) {
      if (hasForbiddenTracePath(filePath) && trackedTracePaths.has(normalizedPath)) {
        violations.push(`[forbidden-trace-path] ${normalizedPath}`);
      }
      continue;
    }
    if (hasForbiddenTracePath(filePath)) {
      violations.push(`[forbidden-trace-path] ${normalizedPath}`);
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

export function evaluateCodePolicy(argv = []) {
  const candidateFiles = collectCandidateFiles(argv);

  if (candidateFiles.length === 0) {
    return {
      status: 0,
      lines: ['Code policy check: no candidate files found'],
    };
  }

  const { checkedFiles, violations } = collectViolations(candidateFiles);
  const lines = [
    'Code Policy Check',
    `Checked files: ${checkedFiles.length}`,
    `Max file lines: ${MAX_FILE_LINES}`,
  ];

  if (violations.length > 0) {
    return {
      status: 1,
      lines: [
        ...lines,
        `Violations: ${violations.length}`,
        ...violations.map((item) => `- ${item}`),
      ],
    };
  }

  if (checkedFiles.length === 0) {
    return {
      status: 0,
      lines: [
        ...lines,
        'Code policy check: no supported changed code files found',
      ],
    };
  }

  return {
    status: 0,
    lines: [
      ...lines,
      'Violations: 0',
    ],
  };
}

function isCliEntrypoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const result = evaluateCodePolicy(process.argv.slice(2));
  printLines(result.lines);
  process.exit(result.status);
}
