#!/usr/bin/env node

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
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

function main() {
  const bash = resolveBashCommand();
  if (!bash) {
    console.error('ERROR: bash is required for verify-phase-runtime-parity shell core');
    process.exit(1);
  }

  const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--compact');
  const child = spawn(bash, [shellCorePath, ...passthroughArgs], {
    stdio: compactOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });

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
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
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
