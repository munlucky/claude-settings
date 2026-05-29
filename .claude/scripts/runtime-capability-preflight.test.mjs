#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FAILURE_TAXONOMY,
  buildWorkflowCapabilityState,
  classifyCapabilityFailure,
  preflightFixture,
} from './runtime-capability-preflight.mjs';

test('taxonomy is closed and separates product, harness, runtime, and host failures', () => {
  assert.deepEqual(Object.keys(FAILURE_TAXONOMY).sort(), [
    'harness_contract_failure',
    'host_environment_failure',
    'product_failure',
    'runtime_capability_failure',
  ]);
});

test('MemoryGraph transport closed degrades memory recall without blocking unrelated closeout', () => {
  const result = preflightFixture('memorygraph-transport-closed');

  assert.equal(result.failureClass, 'runtime_capability_failure');
  assert.equal(result.errorCode, 'memorygraph_unavailable');
  assert.equal(result.blocksUnrelatedCloseout, false);
  assert.equal(result.blocksRequiredEvidence, false);
});

test('MemoryGraph explicit persistence request blocks only required memory evidence', () => {
  const result = preflightFixture('memorygraph-persistence-required');

  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'runtime_capability_failure');
  assert.equal(result.errorCode, 'memory_persistence_unavailable');
  assert.equal(result.blocksRequiredEvidence, true);
  assert.equal(result.blocksUnrelatedCloseout, false);
});

test('Windows shell fallback is a host environment failure with command guidance', () => {
  const result = preflightFixture('windows-rg-access-denied');

  assert.equal(result.failureClass, 'host_environment_failure');
  assert.equal(result.errorCode, 'host_shell_unavailable');
  assert.match(result.fallbackPolicy, /PowerShell|Select-String/);
  assert.equal(result.blocksProductAcceptance, false);
});

test('Windows shell failure blocks required shell evidence without becoming product failure', () => {
  const result = classifyCapabilityFailure({
    capability: 'shell',
    message: 'rg.exe Access is denied',
    requiredEvidence: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'host_environment_failure');
  assert.equal(result.blocksRequiredEvidence, true);
  assert.equal(result.blocksProductAcceptance, false);
});

test('browser missing blocks only browser-required evidence', () => {
  const optional = preflightFixture('browser-missing-optional');
  const required = preflightFixture('browser-missing-required');

  assert.equal(optional.failureClass, 'runtime_capability_failure');
  assert.equal(optional.blocksRequiredEvidence, false);
  assert.equal(required.failureClass, 'runtime_capability_failure');
  assert.equal(required.ok, false);
  assert.equal(required.blocksRequiredEvidence, true);
  assert.equal(required.blocksProductAcceptance, false);
  assert.equal(required.blocksUnrelatedCloseout, false);
});

test('product acceptance failure remains strict product failure', () => {
  const result = preflightFixture('product-assertion-failed');

  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'product_failure');
  assert.equal(result.blocksProductAcceptance, true);
});

test('harness contract failure remains strict harness failure', () => {
  const result = preflightFixture('contract-missing-scorecard');

  assert.equal(result.ok, false);
  assert.equal(result.failureClass, 'harness_contract_failure');
  assert.equal(result.blocksUnrelatedCloseout, true);
});

test('unknown runtime capability defaults to runtime capability failure', () => {
  const result = classifyCapabilityFailure({
    capability: 'forked-agent',
    message: 'sub-agent runtime unavailable',
    requiredEvidence: false,
  });

  assert.equal(result.failureClass, 'runtime_capability_failure');
  assert.equal(result.errorCode, 'runtime_capability_unknown');
});

test('workflow capability state exposes typed degraded capability without weakening product gates', () => {
  const state = buildWorkflowCapabilityState();

  assert.equal(state.length, 3);
  assert.ok(state.every((item) => item.failureClass.endsWith('_failure')));
  assert.ok(state.some((item) => item.capability === 'memorygraph'));
  assert.ok(state.some((item) => item.capability === 'shell'));
  assert.ok(state.some((item) => item.capability === 'browser'));
  assert.equal(state.some((item) => item.failureClass === 'product_failure'), false);
});

test('fixture CLI exits non-zero when a required capability evidence path is blocked', () => {
  const scriptPath = fileURLToPath(new URL('./runtime-capability-preflight.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, 'fixture', '--name', 'browser-missing-required'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 3);
  assert.match(result.stdout, /"blocksRequiredEvidence": true/);
  assert.match(result.stdout, /"blocksProductAcceptance": false/);
});

test('workflow verify CLI exposes runtime capability state without product acceptance proof', () => {
  const scriptPath = fileURLToPath(new URL('./workflow-enforcement.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, 'verify'], {
    encoding: 'utf8',
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.evidenceClass, 'runtime_capability');
  assert.equal(payload.strictProductGatesPreserved, true);
  assert.match(payload.productAcceptancePolicy, /AC\/SCN\/scorecard/);
});
