#!/usr/bin/env node

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shellCorePath = path.join(scriptDir, 'verify-phase-runtime-parity-shell-core.sh');
const compactOutput = process.argv.includes('--compact') || String(process.env.TOKEN_OUTPUT_MODE || '').toLowerCase() === 'compact';

function resolvePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveWrapperTimeoutMs() {
  const explicit = resolvePositiveInteger(process.env.PHASE_RUNTIME_PARITY_WRAPPER_TIMEOUT_SECONDS);
  if (explicit) {
    return explicit * 1000;
  }
  const runtimeWatchdog = resolvePositiveInteger(process.env.PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS) || 600;
  return Math.max(120, runtimeWatchdog * 2 + 240) * 1000;
}

function appendRuntimeProfileFromEnv(args) {
  if (args.includes('--runtime-profile') || args.some((arg) => String(arg).startsWith('--runtime-profile='))) {
    return args;
  }
  const profile = String(process.env.PHASE_RUNTIME_PROFILE || '').trim();
  if (profile === 'optional_probe' || profile === 'required_runtime') {
    return [...args, '--runtime-profile', profile];
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  verify-phase-runtime-parity.mjs <reference-plan-dir> [--render-only] [--compact] [--runtime-profile optional_probe|required_runtime]',
    '  verify-phase-runtime-parity.mjs --allow-default-fixture [--render-only] [--runtime-profile optional_probe|required_runtime]',
    '  verify-phase-runtime-parity.mjs --help',
    '',
    'Environment:',
    '  PHASE_RUNTIME_PROFILE=optional_probe|required_runtime',
    '  PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=auto|current|claude|codex|both',
    '  PHASE_RUNTIME_PARITY_WATCHDOG_MAX_SECONDS=<seconds>',
  ].join('\n');
}

function resolveBashCommand() {
  const candidates = process.platform === 'win32' ? ['bash.exe', 'bash'] : ['bash'];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!result.error) {
      return candidate;
    }
  }
  return '';
}

function toBashPath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) {
    return normalized;
  }
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const bash = resolveBashCommand();
  if (!bash) {
    console.error('ERROR: bash is required for verify-phase-runtime-parity shell core');
    process.exit(1);
  }
  if (process.argv.includes('self-test')) {
    const result = spawnSync(bash, ['-n', toBashPath(shellCorePath)], { encoding: 'utf8' });
    if (result.status !== 0 || result.error) {
      const detail = result.error?.message || result.stderr || result.stdout || 'shell core syntax check failed';
      console.error(`ERROR: ${detail.trim()}`);
      process.exit(result.status || 1);
    }
    process.stdout.write('verify-phase-runtime-parity wrapper self-test passed\n');
    process.exit(0);
  }

  const passthroughArgs = appendRuntimeProfileFromEnv(process.argv.slice(2).filter((arg) => arg !== '--compact'));
  const child = spawn(bash, [toBashPath(shellCorePath), ...passthroughArgs], {
    stdio: compactOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
  let exiting = false;
  const wrapperTimeoutMs = resolveWrapperTimeoutMs();

  const terminateChildTree = () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // Child already exited.
    }
  };

  for (const signalName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signalName, () => {
      if (exiting) {
        return;
      }
      exiting = true;
      terminateChildTree();
      process.exit(128 + (os.constants.signals?.[signalName] ?? 1));
    });
  }

  const timeoutHandle = setTimeout(() => {
    if (exiting) {
      return;
    }
    exiting = true;
    terminateChildTree();
    const seconds = Math.round(wrapperTimeoutMs / 1000);
    if (compactOutput) {
      bufferedLines.push(`timeout: phase runtime parity wrapper timed out after ${seconds}s`);
      process.stdout.write(`${bufferedLines.join('\n')}\n`);
    } else {
      console.error(`ERROR: phase runtime parity wrapper timed out after ${seconds}s`);
    }
    process.exit(124);
  }, wrapperTimeoutMs);
  timeoutHandle.unref?.();

  const bufferedLines = [];
  if (compactOutput) {
    const sink = (chunk) => {
      for (const line of String(chunk || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        if (
          /^WARN:/.test(trimmed)
          || /runtime probe passed:/.test(trimmed)
          || /actual runtime smoke (starting|passed):/.test(trimmed)
          || /actual runtime timings:/.test(trimmed)
          || /runtime exercise level:/.test(trimmed)
          || /phase runtime parity smoke (passed|failed)/.test(trimmed)
          || /timeout:/.test(trimmed)
          || /cleanup incomplete:/.test(trimmed)
          || /debug temp root:/.test(trimmed)
          || /keeping temp artifacts:/.test(trimmed)
        ) {
          bufferedLines.push(trimmed);
        }
      }
    };
    child.stdout.on('data', sink);
    child.stderr.on('data', sink);
  }

  child.on('error', (error) => {
    console.error(`ERROR: failed to start verify-phase-runtime-parity shell core: ${error.message}`);
    clearTimeout(timeoutHandle);
    terminateChildTree();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (exiting) {
      return;
    }
    exiting = true;
    clearTimeout(timeoutHandle);
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if (compactOutput) {
      const output = bufferedLines.length > 0 ? bufferedLines : ['phase runtime parity smoke failed'];
      process.stdout.write(`${output.join('\n')}\n`);
    }
    process.exit(code ?? 0);
  });
}

main();
