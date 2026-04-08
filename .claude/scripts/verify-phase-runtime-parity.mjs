#!/usr/bin/env node

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const shellCorePath = path.join(scriptDir, 'verify-phase-runtime-parity-shell-core.sh');

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

  const child = spawn(bash, [shellCorePath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error(`ERROR: failed to start verify-phase-runtime-parity shell core: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
