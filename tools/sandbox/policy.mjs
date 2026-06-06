#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { recordRuntimeEvent } from '../../scripts/lib/runtime-state-store.mjs';

export const APPROVAL_REQUIRED_OPERATIONS = new Set([
  'destructive_file',
  'dependency_install',
  'network',
  'external_write',
  'account_root_install_sync',
  'generated_state_promotion',
]);

export const PROTECTED_PATH_FRAGMENTS = [
  '.claude/',
  '.codex/',
  '.moonshot-relay/',
  '.moonshot-state/',
  'runtime-state.sqlite',
  '/logs/',
  '/cache/',
  '/traces/',
  '/browser-artifacts/',
  '/sandbox-artifacts/',
];

const usage = () => `Usage: node tools/sandbox/policy.mjs <check|lease|cleanup> [--operation <kind>] [--path <path>] [--root <dir>] [--lease-root <dir>] [--run-id <id>] [--goal-id <id>] [--approval-id <id>] [--json]`;

const parseArgs = (argv) => {
  const [command = ''] = argv;
  const options = { command, json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
};

const portable = (target) => String(target || '').replace(/\\/g, '/');

export function classifyPath(target) {
  const normalized = portable(path.resolve(target || '.'));
  const lowered = normalized.toLowerCase();
  const matched = PROTECTED_PATH_FRAGMENTS.find((fragment) => lowered.includes(fragment.toLowerCase()));
  return {
    path: normalized,
    protected: Boolean(matched),
    reason: matched ? `protected path fragment: ${matched}` : '',
  };
}

export function classifyOperation(operation) {
  const normalized = String(operation || '').trim();
  return {
    operation: normalized,
    approvalRequired: APPROVAL_REQUIRED_OPERATIONS.has(normalized),
  };
}

const recordBlocking = async (options, payload) => {
  if (!options.runId || !options.goalId) return null;
  return recordRuntimeEvent({
    runId: options.runId,
    goalId: options.goalId,
    eventType: 'sandbox.violation',
    severity: 'blocking',
    payload,
  });
};

export async function checkPolicy(options) {
  const pathClass = classifyPath(options.path || '.');
  const operationClass = classifyOperation(options.operation || 'write');
  const missingApproval = operationClass.approvalRequired && !options.approvalId;
  const blocked = pathClass.protected || missingApproval;
  const payload = {
    status: blocked ? 'blocked' : 'allowed',
    operation: operationClass.operation,
    path: pathClass.path,
    protectedPath: pathClass.protected,
    approvalRequired: operationClass.approvalRequired,
    approvalId: options.approvalId || '',
    reason: pathClass.reason || (missingApproval ? `missing approval for ${operationClass.operation}` : ''),
  };
  if (blocked) {
    payload.record = await recordBlocking(options, payload);
  }
  return payload;
}

export async function leaseSandbox(options) {
  const root = path.resolve(options.root || path.join(process.cwd(), '.moonshot-relay', 'sandbox'));
  const runId = String(options.runId || `run-${Date.now()}`).replace(/[^a-zA-Z0-9._-]+/g, '-');
  const leaseRoot = path.join(root, runId);
  const artifactRoot = path.join(leaseRoot, 'sandbox-artifacts');
  await mkdir(artifactRoot, { recursive: true });
  return {
    status: 'leased',
    leaseRoot,
    artifactRoot,
    disposable: true,
  };
}

export async function cleanupSandbox(options) {
  const leaseRoot = path.resolve(options.leaseRoot || '');
  if (!leaseRoot) {
    throw new Error('--lease-root is required');
  }
  await rm(leaseRoot, { recursive: true, force: true });
  return {
    status: 'cleaned',
    leaseRoot,
  };
}

const write = (payload, json) => {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.status || 'ok');
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.command === 'check') {
    result = await checkPolicy(options);
  } else if (options.command === 'lease') {
    result = await leaseSandbox(options);
  } else if (options.command === 'cleanup') {
    result = await cleanupSandbox(options);
  } else if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  } else {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }
  write(result, options.json);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
