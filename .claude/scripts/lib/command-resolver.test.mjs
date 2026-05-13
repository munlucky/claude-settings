#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveCommandEvidence,
  resolveDockerDependencyGate,
  selfTestCommandResolver,
} from './command-resolver.mjs';

function probeFactory(handlers) {
  return (command, args) => {
    const key = `${command} ${args.join(' ')}`.trim();
    const handler = handlers[key] || handlers[command] || handlers['*'];
    if (!handler) {
      return { status: 1, stdout: '', stderr: `missing handler for ${key}`, error: '' };
    }
    return handler(command, args);
  };
}

function testPnpmEquivalent() {
  const probe = probeFactory({
    'pnpm --version': () => ({ status: 1, stdout: '', stderr: 'pnpm not found', error: '' }),
    'corepack pnpm --version': () => ({ status: 0, stdout: 'pnpm 9.0.0', stderr: '', error: '' }),
  });

  const result = resolveCommandEvidence('pnpm', {
    probeCommand: probe,
    exactCandidates: [{ command: 'pnpm', args: [] }],
    equivalentCandidates: [{ command: 'corepack', args: ['pnpm'], label: 'corepack pnpm' }],
  });

  assert.equal(result.status, 'passed_with_equivalent_evidence');
  assert.equal(result.decision, 'continue');
  assert.equal(result.resolvedCommand, 'corepack');
  assert.equal(result.resolvedArgs.join(' '), 'pnpm');
  assert.match(result.fallbackReason, /approved equivalent/i);
  process.stdout.write('status: passed_with_equivalent_evidence\n');
  process.stdout.write('decision: continue\n');
  process.stdout.write(`fallbackReason: ${result.fallbackReason}\n`);
}

function testDockerDaemonMissing() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'command-resolver-'));
  fs.writeFileSync(path.join(tempRoot, 'compose.yaml'), 'services:\n  app:\n    image: alpine:3.20\n', 'utf8');
  const probe = probeFactory({
    'docker --version': () => ({ status: 0, stdout: 'Docker version 27.0.0', stderr: '', error: '' }),
    [`docker compose -f ${path.join(tempRoot, 'compose.yaml')} config`]: () => ({ status: 0, stdout: 'name: sample', stderr: '', error: '' }),
    'docker info': () => ({ status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon', error: '' }),
  });

  const result = resolveDockerDependencyGate({
    probeCommand: probe,
    workspaceRoot: tempRoot,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.decision, 'resume_later_handoff');
  assert.equal(result.staticConfig.status === 'passed' || result.staticConfig.status === 'skipped', true);
  assert.equal(result.daemon.status, 'failed');
  assert.match(result.daemon.detail, /docker daemon/i);
  process.stdout.write('decision: resume_later_handoff\n');
  process.stdout.write(`daemonStatus: ${result.daemon.status}\n`);
  process.stdout.write(`fallbackReason: ${result.fallbackReason}\n`);
}

function testDockerMissingWithoutComposeIsOptional() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'command-resolver-no-compose-'));
  const probe = probeFactory({
    'docker --version': () => ({ status: 1, stdout: '', stderr: 'docker not found', error: '' }),
  });

  const result = resolveDockerDependencyGate({
    probeCommand: probe,
    workspaceRoot: tempRoot,
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.decision, 'continue');
  assert.equal(result.version.status, 'warning');
  assert.equal(result.version.decision, 'continue');
  assert.equal(result.daemon.status, 'skipped');
  process.stdout.write('dockerOptionalWithoutCompose: continue\n');
}

function run() {
  const scenario = String(process.argv[2] || '').trim();
  if (scenario === 'pnpm-equivalent') {
    testPnpmEquivalent();
    return;
  }
  if (scenario === 'docker-daemon-missing') {
    testDockerDaemonMissing();
    return;
  }
  if (scenario === 'docker-missing-without-compose') {
    testDockerMissingWithoutComposeIsOptional();
    return;
  }

  selfTestCommandResolver();
  process.stdout.write('command-resolver self-test passed\n');
}

run();
