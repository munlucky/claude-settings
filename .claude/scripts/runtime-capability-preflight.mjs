#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

export const FAILURE_TAXONOMY = Object.freeze({
  product_failure: {
    owner: 'implementation',
    blocksProductAcceptance: true,
    blocksUnrelatedCloseout: false,
  },
  harness_contract_failure: {
    owner: 'harness',
    blocksProductAcceptance: true,
    blocksUnrelatedCloseout: true,
  },
  runtime_capability_failure: {
    owner: 'runtime',
    blocksProductAcceptance: false,
    blocksUnrelatedCloseout: false,
  },
  host_environment_failure: {
    owner: 'host',
    blocksProductAcceptance: false,
    blocksUnrelatedCloseout: false,
  },
});

const FIXTURES = Object.freeze({
  'memorygraph-transport-closed': {
    capability: 'memorygraph',
    message: 'Transport closed',
    requiredEvidence: false,
    explicitPersistenceRequested: false,
  },
  'memorygraph-persistence-required': {
    capability: 'memorygraph',
    message: 'Transport closed',
    requiredEvidence: true,
    explicitPersistenceRequested: true,
  },
  'windows-rg-access-denied': {
    capability: 'shell',
    message: 'rg.exe Access is denied',
    requiredEvidence: false,
  },
  'browser-missing-optional': {
    capability: 'browser',
    message: 'browser backend unavailable',
    requiredEvidence: false,
  },
  'browser-missing-required': {
    capability: 'browser',
    message: 'browser backend unavailable',
    requiredEvidence: true,
  },
  'product-assertion-failed': {
    capability: 'product',
    message: 'expected user-facing AC output was not persisted',
    requiredEvidence: true,
  },
  'contract-missing-scorecard': {
    capability: 'workflow_contract',
    message: 'scorecard is required for product acceptance closeout',
    requiredEvidence: true,
  },
});

export function classifyCapabilityFailure(input = {}) {
  const capability = String(input.capability || '').trim().toLowerCase();
  const message = String(input.message || '');
  const requiredEvidence = input.requiredEvidence === true;
  const explicitPersistenceRequested = input.explicitPersistenceRequested === true;

  if (capability === 'product') {
    return outcome({
      failureClass: 'product_failure',
      errorCode: 'product_acceptance_failed',
      capability,
      message,
      requiredEvidence,
      fallbackPolicy: 'fix product behavior or acceptance evidence',
    });
  }

  if (capability === 'workflow_contract') {
    return outcome({
      failureClass: 'harness_contract_failure',
      errorCode: 'harness_contract_missing',
      capability,
      message,
      requiredEvidence,
      fallbackPolicy: 'repair the harness contract before closeout',
    });
  }

  if (capability === 'memorygraph' || /memorygraph|mcp|transport closed/i.test(message)) {
    return outcome({
      failureClass: 'runtime_capability_failure',
      errorCode: explicitPersistenceRequested ? 'memory_persistence_unavailable' : 'memorygraph_unavailable',
      capability: capability || 'memorygraph',
      message,
      requiredEvidence: explicitPersistenceRequested || requiredEvidence,
      fallbackPolicy: explicitPersistenceRequested
        ? 'block only the explicit memory persistence requirement'
        : 'continue with degraded memory recall and record boundaryStatus=not_checked',
    });
  }

  if (capability === 'browser' || /browser|playwright|chrome/i.test(message)) {
    return outcome({
      failureClass: 'runtime_capability_failure',
      errorCode: 'browser_unavailable',
      capability: capability || 'browser',
      message,
      requiredEvidence,
      fallbackPolicy: requiredEvidence
        ? 'block only browser-required evidence and request browser capability recovery'
        : 'continue non-browser work and record browser capability as unavailable',
    });
  }

  if (capability === 'shell' || /windows|powershell|rg\.exe|access is denied|cp949|safe\.directory/i.test(message)) {
    return outcome({
      failureClass: 'host_environment_failure',
      errorCode: 'host_shell_unavailable',
      capability: capability || 'shell',
      message,
      requiredEvidence,
      fallbackPolicy: 'use native PowerShell, Select-String, or explicit runtime paths and keep product gates strict',
    });
  }

  return outcome({
    failureClass: 'runtime_capability_failure',
    errorCode: 'runtime_capability_unknown',
    capability: capability || 'unknown',
    message,
    requiredEvidence,
    fallbackPolicy: requiredEvidence
      ? 'block only the evidence that requires this capability'
      : 'continue unrelated work with degraded capability evidence',
  });
}

function outcome({ failureClass, errorCode, capability, message, requiredEvidence, fallbackPolicy }) {
  const taxonomy = FAILURE_TAXONOMY[failureClass];
  const blocksRequiredEvidence = requiredEvidence === true;
  return {
    ok: failureClass !== 'product_failure' && failureClass !== 'harness_contract_failure' && !blocksRequiredEvidence,
    failureClass,
    errorCode,
    capability,
    message,
    requiredEvidence,
    blocksRequiredEvidence,
    blocksProductAcceptance: taxonomy.blocksProductAcceptance,
    blocksUnrelatedCloseout: taxonomy.blocksUnrelatedCloseout,
    fallbackPolicy,
  };
}

export function preflightFixture(name) {
  const fixture = FIXTURES[String(name || '').trim()];
  if (!fixture) {
    return {
      ok: false,
      failureClass: 'harness_contract_failure',
      errorCode: 'unknown_runtime_capability_fixture',
      fixture: String(name || ''),
      allowedFixtures: Object.keys(FIXTURES),
    };
  }
  return {
    fixture: name,
    ...classifyCapabilityFailure(fixture),
  };
}

export function buildWorkflowCapabilityState() {
  return [
    preflightFixture('memorygraph-transport-closed'),
    preflightFixture('windows-rg-access-denied'),
    preflightFixture('browser-missing-optional'),
  ];
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'taxonomy';
  if (command === 'taxonomy') {
    printJson({ ok: true, taxonomy: FAILURE_TAXONOMY });
    return;
  }
  if (command === 'fixture') {
    const result = preflightFixture(valueAfter(argv, '--name'));
    printJson(result);
    if (!result.ok) process.exitCode = result.failureClass === 'harness_contract_failure' ? 2 : 3;
    return;
  }
  if (command === 'workflow-state') {
    const capabilityState = buildWorkflowCapabilityState();
    printJson({
      ok: true,
      capabilityState,
      strictProductGatesPreserved: true,
    });
    return;
  }
  printJson({
    ok: false,
    failureClass: 'harness_contract_failure',
    errorCode: 'unsupported_runtime_capability_command',
    command,
  });
  process.exitCode = 64;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
