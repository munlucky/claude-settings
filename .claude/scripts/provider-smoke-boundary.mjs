#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableFingerprint } from './verification-verdict-state.mjs';
import { classifyFailure } from './lib/failure-classifier.mjs';

function parseArgs(argv) {
  const result = {
    sandboxStatus: '',
    sandboxError: '',
    hostStatus: '',
    check: 'provider-live-smoke',
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--sandbox-status':
        result.sandboxStatus = args.shift() || '';
        break;
      case '--sandbox-error':
        result.sandboxError = args.shift() || '';
        break;
      case '--host-status':
        result.hostStatus = args.shift() || '';
        break;
      case '--check':
        result.check = args.shift() || '';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

export function classifyProviderSmokeBoundary(input = {}) {
  const sandboxStatus = String(input.sandboxStatus || '').toLowerCase();
  const hostStatus = String(input.hostStatus || '').toLowerCase();
  const sandboxFailure = sandboxStatus === 'failed' || sandboxStatus === 'blocked';
  const hostPassed = hostStatus === 'passed' || hostStatus === 'pass';
  const classification = classifyFailure({
    code: input.sandboxError,
    message: input.sandboxError,
    source: input.check || 'provider-live-smoke',
  });
  const candidate = classification.code === 'sandbox_network_boundary_candidate';
  const pairId = stableFingerprint({
    check: input.check || 'provider-live-smoke',
    sandboxError: input.sandboxError || '',
  });

  return {
    pairId,
    check: input.check || 'provider-live-smoke',
    classification: candidate ? 'sandbox_network_boundary_candidate' : classification.code,
    sandboxStatus,
    hostStatus,
    providerFailure: !(sandboxFailure && candidate && hostPassed),
    environmentBoundary: sandboxFailure && candidate && hostPassed,
    decision: sandboxFailure && candidate && hostPassed ? 'continue_with_environment_boundary' : classification.decision,
  };
}

function selfTest() {
  const result = classifyProviderSmokeBoundary({
    sandboxStatus: 'failed',
    sandboxError: 'E_PROVIDER_NETWORK websocket os error 10013 blocked by sandbox',
    hostStatus: 'passed',
  });
  assert.equal(result.classification, 'sandbox_network_boundary_candidate');
  assert.equal(result.providerFailure, false);
  assert.equal(result.environmentBoundary, true);
}

function main() {
  if (process.argv[2] === 'self-test') {
    selfTest();
    console.log('provider-smoke-boundary self-test passed');
    return;
  }
  const result = classifyProviderSmokeBoundary(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
