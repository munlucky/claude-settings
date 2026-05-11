#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { printLines } from './lib/logging.mjs';

const DEFAULT_SHELL_FILES = [
  '.claude/scripts/knowledge-repo-audit.sh',
  '.claude/scripts/verify-code-policy.sh',
  '.claude/scripts/workflow-enforcement.sh',
  '.claude/scripts/agent-loop.sh',
  '.claude/scripts/moonshot-phase-dispatch.sh',
  '.claude/scripts/phase-worktree-coordinator.sh',
  '.claude/scripts/verify-phase-runtime-parity.sh',
  '.claude/scripts/verify-phase-runner-boundary.sh',
  '.claude/agents/verification/verify-changes.sh',
  '.claude/agents/verification/verify-runtime.sh',
];

function parseFileList(argv) {
  if (argv.length > 0) {
    return argv;
  }
  const raw = process.env.VERIFY_SHELL_SYNTAX_FILES || '';
  if (!raw.trim()) {
    return DEFAULT_SHELL_FILES;
  }
  return raw
    .split(/[\r\n;,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasCrLf(filePath) {
  return fs.readFileSync(filePath).includes(Buffer.from('\r\n'));
}

function runBashSyntax(filePath, bashCommand = process.env.VERIFY_SHELL_SYNTAX_BASH || 'bash') {
  const result = spawnSync(bashCommand, ['-n', filePath], {
    encoding: 'utf8',
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
  };
}

export function evaluateShellSyntax(argv = [], options = {}) {
  const files = options.files || parseFileList(argv);
  const runSyntaxCheck = options.runSyntaxCheck || runBashSyntax;
  const lines = [];
  const failures = [];
  const unavailable = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      failures.push({ filePath, reason: 'missing_shell_file' });
      lines.push(`[missing_shell_file] ${filePath}`);
      continue;
    }
    if (hasCrLf(filePath)) {
      failures.push({ filePath, reason: 'crlf_line_endings' });
      lines.push(`[crlf_line_endings] ${filePath}`);
      continue;
    }

    const result = runSyntaxCheck(filePath);
    if (result.error) {
      unavailable.push({ filePath, reason: result.error });
      lines.push(`[verifier_unavailable] ${filePath}: ${result.error}`);
      continue;
    }
    if (result.status !== 0) {
      failures.push({ filePath, reason: result.stderr || result.stdout || 'bash syntax failed' });
      lines.push(`[bash_syntax_failed] ${filePath}: ${result.stderr || result.stdout || 'bash syntax failed'}`);
      continue;
    }
    lines.push(`[passed] ${filePath}`);
  }

  if (failures.length > 0) {
    return { status: 1, files, failures, unavailable, lines };
  }
  if (unavailable.length > 0) {
    return { status: 2, files, failures, unavailable, lines };
  }
  lines.push(`Shell syntax policy passed (${files.length} files)`);
  return { status: 0, files, failures, unavailable, lines };
}

function isCliEntrypoint() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntrypoint()) {
  const result = evaluateShellSyntax(process.argv.slice(2));
  printLines(result.lines);
  process.exit(result.status);
}
