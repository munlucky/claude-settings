#!/usr/bin/env node

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shellCorePath = path.join(scriptDir, 'verify-phase-runtime-parity-shell-core.sh');
const compactOutput = process.argv.includes('--compact') || String(process.env.TOKEN_OUTPUT_MODE || '').toLowerCase() === 'compact';

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
  const bash = resolveBashCommand();
  if (!bash) {
    console.error('ERROR: bash is required for verify-phase-runtime-parity shell core');
    process.exit(1);
  }

  const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--compact');
  const child = spawn(bash, [toBashPath(shellCorePath), ...passthroughArgs], {
    stdio: compactOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
  let exiting = false;

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
          || /phase runtime parity smoke (passed|failed)/.test(trimmed)
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
    terminateChildTree();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (exiting) {
      return;
    }
    exiting = true;
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
