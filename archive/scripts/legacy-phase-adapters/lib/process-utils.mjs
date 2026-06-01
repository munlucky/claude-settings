#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}
