#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { printLines } from './lib/logging.mjs';

const DEFAULT_SHELL_FILES = [
  'install-claude.sh',
  'bin/browserctl',
  'agents/verification/run-verify-changes.sh',
  'agents/verification/verify-changes.sh',
  'agents/verification/verify-runtime.sh',
  'scripts/install-browser-runtime.sh',
  'skills/moonshot-relay-setup/scripts/install-account-root.sh',
];

function parseFileList(argv) {
  if (argv.length > 0) {
    return argv.map((entry) => entry.replace(/\\/g, '/'));
  }
  const raw = process.env.VERIFY_SHELL_SYNTAX_FILES || '';
  if (!raw.trim()) {
    return DEFAULT_SHELL_FILES;
  }
  return raw
    .split(/[\r\n;,]+/)
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/\\/g, '/'))
    .filter(Boolean);
}

function parseCommandList(options = {}) {
  if (Array.isArray(options.commands)) {
    return options.commands;
  }
  const raw = process.env.VERIFY_SHELL_SYNTAX_COMMANDS || '';
  if (!raw.trim()) {
    return [];
  }
  return raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

export function diagnoseShellCommand(command, options = {}) {
  const shell = String(options.shell || process.env.SHELL || process.env.ComSpec || '').toLowerCase();
  const text = String(command || '').trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)=('[^']*'|"[^"]*"|[^\s;]+)\s+(.+)$/);
  const isPowerShell = shell.includes('powershell') || shell.includes('pwsh');
  if (isPowerShell && /(?:<<\s*['"]?\w+['"]?|ParserError|Missing file specification after redirection operator|The '<' operator is reserved|Array index expression is missing or not valid|Unexpected token .* in expression or statement)/i.test(text)) {
    return {
      ok: false,
      code: 'powershell_command_syntax',
      message: "PowerShell does not support POSIX here-doc/parser syntax. Use a PowerShell here-string piped to the command or run the command in Git Bash.",
      example: "@'\nconsole.log('example')\n'@ | node -",
    };
  }
  if (isPowerShell && match) {
    const key = match[1];
    const value = match[2].replace(/^['"]|['"]$/g, '');
    const rest = match[3];
    return {
      ok: false,
      code: 'windows_shell_env_syntax',
      message: `PowerShell does not support POSIX env prefix syntax. Use $env:${key}='${value}'; ${rest}`,
      example: `$env:${key}='${value}'; ${rest}`,
    };
  }
  return { ok: true, code: 'ok', message: '', example: '' };
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
  const commands = parseCommandList(options);
  const shell = options.shell || process.env.SHELL || process.env.ComSpec || '';
  const runSyntaxCheck = options.runSyntaxCheck || runBashSyntax;
  const lines = [];
  const failures = [];
  const unavailable = [];

  for (const command of commands) {
    const diagnostic = diagnoseShellCommand(command, { shell });
    if (!diagnostic.ok) {
      failures.push({ command, reason: diagnostic.code, message: diagnostic.message, example: diagnostic.example });
      lines.push(`[${diagnostic.code}] ${diagnostic.message}`);
    }
  }

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
