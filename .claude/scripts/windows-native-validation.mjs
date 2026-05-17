#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const logDir = path.join(rootDir, '.claude', 'logs', 'windows-native-validation');
const reportPath = path.join(logDir, 'latest.json');
const tempInstallDir = path.join(os.tmpdir(), 'browserctl-install-windows-validation');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? result.error.message : '',
  };
}

function bashAvailable() {
  for (const candidate of ['bash.exe', 'bash']) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!result.error) {
      return true;
    }
  }
  return false;
}

function check(name, runner, options = {}) {
  const result = runner();
  const ok = options.accept ? options.accept(result) : result.status === 0;
  return {
    name,
    ok,
    outcome: ok ? 'pass' : 'fail',
    exitCode: result.status,
    ...result,
  };
}

function skip(name, reason) {
  return {
    name,
    ok: true,
    outcome: 'skip',
    reason,
    command: '',
    stdout: '',
    stderr: '',
    error: '',
  };
}

function main() {
  fs.mkdirSync(logDir, { recursive: true });

  const results = [];
  results.push(check('runtime-cli active workspace contract', () =>
    run('node', ['.claude/scripts/runtime-cli.mjs', 'active-workspace-contract']),
  ));
  results.push(check('install-browser-runtime help', () =>
    run('node', ['.claude/scripts/install-browser-runtime.mjs', '--help']),
  ));
  results.push(check('install-browser-runtime temp install', () =>
    run('node', ['.claude/scripts/install-browser-runtime.mjs', '--bin-dir', tempInstallDir, '--force']),
  ));
  results.push(check('moonshot-phase-dispatch dry-run', () =>
    run('node', [
      '.claude/scripts/moonshot-phase-dispatch.mjs',
      '.claude/docs/runtime-parity-reference-plan',
      '--execution-mode', 'delegated-terminal',
      '--dry-run',
    ]),
  ));
  results.push(check('agent-loop dry-run', () =>
    run('node', ['.claude/scripts/agent-loop.mjs', '.claude/docs/runtime-parity-reference-plan', '--dry-run']),
  ));

  if (bashAvailable()) {
    results.push(check('verify-phase-runtime-parity render-only', () =>
      run('node', [
        '.claude/scripts/verify-phase-runtime-parity.mjs',
        '.claude/docs/runtime-parity-reference-plan',
        '--render-only',
      ]),
    ));
  } else {
    results.push(skip(
      'verify-phase-runtime-parity render-only',
      'bash is not available on this Windows host; parity shell core still requires bash',
    ));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    cwd: rootDir,
    platform: process.platform,
    results,
    failures: results.filter((entry) => entry.outcome === 'fail').map((entry) => entry.name),
    skipped: results.filter((entry) => entry.outcome === 'skip').map((entry) => entry.name),
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log('Windows Native Validation');
  console.log(`Report: ${reportPath}`);
  for (const result of results) {
    const suffix = result.outcome === 'skip'
      ? ` (${result.reason})`
      : result.outcome === 'fail'
        ? ` (exit=${result.exitCode ?? result.status})`
        : '';
    console.log(`- ${result.outcome.toUpperCase()}: ${result.name}${suffix}`);
    if (result.outcome === 'fail') {
      const detail = result.stderr || result.error || result.stdout;
      if (detail) {
        console.log(`  ${detail.split(/\r?\n/).filter(Boolean)[0]}`);
      }
    }
  }

  process.exit(summary.failures.length === 0 ? 0 : 1);
}

main();
