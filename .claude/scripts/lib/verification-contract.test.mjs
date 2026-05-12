#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceScriptsDir = path.resolve('.claude/scripts');

function copyTree(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

async function testWindowsSafeModuleResolution() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verification contract path test '));
  const tempScriptsDir = path.join(tempRoot, 'scripts');
  const fakeCodexBinary = path.join(tempRoot, 'fake codex binary', process.platform === 'win32' ? 'codex.exe' : 'codex');
  const previousBinaryPath = process.env.AGENT_LOOP_CODEX_BINARY;
  const previousAvailableRuntimes = process.env.PHASE_VERIFICATION_AVAILABLE_RUNTIMES;

  fs.mkdirSync(path.dirname(fakeCodexBinary), { recursive: true });
  fs.writeFileSync(fakeCodexBinary, '', 'utf8');
  copyTree(sourceScriptsDir, tempScriptsDir);

  try {
    process.env.AGENT_LOOP_CODEX_BINARY = fakeCodexBinary;
    process.env.PHASE_VERIFICATION_AVAILABLE_RUNTIMES = 'codex';
    const moduleUrl = pathToFileURL(path.join(tempScriptsDir, 'lib', 'verification-contract.mjs')).href;
    const runtimeContract = await import(moduleUrl);
    const runtimes = runtimeContract.resolveAvailableRuntimes({ currentRuntime: 'codex' });

    assert.ok(runtimes.includes('codex'));
    assert.equal(runtimes.at(-1), 'codex');
  } finally {
    if (previousBinaryPath === undefined) {
      delete process.env.AGENT_LOOP_CODEX_BINARY;
    } else {
      process.env.AGENT_LOOP_CODEX_BINARY = previousBinaryPath;
    }
    if (previousAvailableRuntimes === undefined) {
      delete process.env.PHASE_VERIFICATION_AVAILABLE_RUNTIMES;
    } else {
      process.env.PHASE_VERIFICATION_AVAILABLE_RUNTIMES = previousAvailableRuntimes;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

await testWindowsSafeModuleResolution();

async function testDeclaredAlternateVerifierNormalization() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-contract-alternates-'));
  const contractPath = path.join(tempRoot, 'verification.contract.yaml');
  fs.writeFileSync(contractPath, [
    'commands:',
    '  requiredVerifier: "node --test required.test.mjs"',
    '  declaredAlternate: "node --test alternate.test.mjs"',
    'declaredAlternateVerifiers:',
    '  declaredAlternate:',
    '    requiredVerifier: requiredVerifier',
    '    command: "node --test alternate.test.mjs"',
    'checkPolicies:',
    '  requiredVerifier:',
    '    declaredAlternates:',
    '      - requiredVerifier->secondAlternate',
    '',
  ].join('\n'), 'utf8');

  try {
    const moduleUrl = pathToFileURL(path.resolve('.claude/scripts/lib/verification-contract.mjs')).href;
    const runtimeContract = await import(moduleUrl);
    const context = runtimeContract.loadVerificationContractContext(contractPath, { currentRuntime: 'codex' });
    const alternates = context.declaredAlternateVerifiers;

    assert.deepEqual(
      alternates.map((entry) => `${entry.requiredVerifierId}->${entry.alternateVerifierId}`),
      ['requiredVerifier->declaredAlternate', 'requiredVerifier->secondAlternate'],
    );
    assert.equal(runtimeContract.isDeclaredAlternateVerifier(context.contract, 'requiredVerifier', 'declaredAlternate'), true);
    assert.equal(runtimeContract.isDeclaredAlternateVerifier(context.contract, 'requiredVerifier', 'undeclaredAlternate'), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

await testDeclaredAlternateVerifierNormalization();

process.stdout.write('verification-contract path regression test passed\n');
