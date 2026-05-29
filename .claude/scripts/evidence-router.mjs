#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVIDENCE_CLASSES = Object.freeze({
  adapter_smoke: {
    purpose: 'runtime route smoke only',
    canSatisfyProductCloseout: false,
    requiresScorecard: false,
  },
  workflow_contract: {
    purpose: 'workflow contract and harness invariant verification',
    canSatisfyProductCloseout: false,
    requiresScorecard: false,
  },
  product_acceptance: {
    purpose: 'user-facing acceptance, AC, and SCN completion evidence',
    canSatisfyProductCloseout: true,
    requiresScorecard: true,
  },
  runtime_capability: {
    purpose: 'runtime/tool/browser/fork capability evidence',
    canSatisfyProductCloseout: false,
    requiresScorecard: false,
  },
  host_environment: {
    purpose: 'host, shell, filesystem, and environment health evidence',
    canSatisfyProductCloseout: false,
    requiresScorecard: false,
  },
  closeout_scope: {
    purpose: 'phase closeout scope and repository hygiene evidence',
    canSatisfyProductCloseout: false,
    requiresScorecard: true,
  },
  fixture_precondition: {
    purpose: 'test fixture seed and precondition evidence',
    canSatisfyProductCloseout: false,
    requiresScorecard: false,
  },
});

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : '';
}

export function validateEvidenceClass(evidenceClass) {
  const normalized = String(evidenceClass || '').trim();
  if (!Object.hasOwn(EVIDENCE_CLASSES, normalized)) {
    return {
      ok: false,
      errorCode: 'unknown_evidence_class',
      evidenceClass: normalized,
      allowedClasses: Object.keys(EVIDENCE_CLASSES),
    };
  }
  return {
    ok: true,
    evidenceClass: normalized,
    metadata: EVIDENCE_CLASSES[normalized],
  };
}

export function commandMetadata({ name, evidenceClass, command = '' } = {}) {
  const validation = validateEvidenceClass(evidenceClass);
  if (!validation.ok) {
    return validation;
  }
  return {
    ok: true,
    name: String(name || 'unnamed-command'),
    command: String(command || ''),
    evidenceClass: validation.evidenceClass,
    evidenceMetadata: validation.metadata,
  };
}

export function runAdapterSmoke({ scorecard = 'disabled' } = {}) {
  return {
    ok: true,
    verdict: 'passed',
    evidenceClass: 'adapter_smoke',
    scorecardRequired: false,
    scorecardStatus: scorecard,
    closeoutEligible: false,
  };
}

export function evaluateProductCloseout({ acEvidence = 0, scnEvidence = 0, scorecard = 'missing' } = {}) {
  const acCount = Number(acEvidence) || 0;
  const scnCount = Number(scnEvidence) || 0;
  const scorecardStatus = String(scorecard || 'missing').trim().toLowerCase();
  const missing = [];
  if (acCount <= 0) missing.push('AC');
  if (scnCount <= 0) missing.push('SCN');
  if (scorecardStatus !== 'passed') missing.push('scorecard');
  return {
    ok: missing.length === 0,
    verdict: missing.length === 0 ? 'passed' : 'failed',
    errorCode: missing.length === 0 ? '' : 'product_acceptance_missing',
    evidenceClass: 'product_acceptance',
    scorecardRequired: true,
    scorecardStatus,
    missingEvidence: missing,
    closeoutEligible: missing.length === 0,
  };
}

export function evaluateFixturePrecondition({ seedPath = '' } = {}) {
  if (!seedPath || !fs.existsSync(seedPath)) {
    return {
      ok: false,
      verdict: 'failed',
      errorCode: 'fixture_precondition_missing',
      evidenceClass: 'fixture_precondition',
      seedPath: seedPath || '',
    };
  }
  return {
    ok: true,
    verdict: 'passed',
    evidenceClass: 'fixture_precondition',
    seedPath,
  };
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'classes';
  if (command === 'classes') {
    printJson({ ok: true, classes: EVIDENCE_CLASSES });
    return;
  }
  if (command === 'validate') {
    const result = validateEvidenceClass(valueAfter(argv, '--class'));
    printJson(result);
    if (!result.ok) process.exitCode = 2;
    return;
  }
  if (command === 'command-metadata') {
    const result = commandMetadata({
      name: valueAfter(argv, '--name'),
      command: valueAfter(argv, '--command'),
      evidenceClass: valueAfter(argv, '--class'),
    });
    printJson(result);
    if (!result.ok) process.exitCode = 2;
    return;
  }
  if (command === 'adapter-smoke') {
    printJson(runAdapterSmoke({ scorecard: valueAfter(argv, '--scorecard') || 'disabled' }));
    return;
  }
  if (command === 'product-closeout') {
    const result = evaluateProductCloseout({
      acEvidence: valueAfter(argv, '--ac-count'),
      scnEvidence: valueAfter(argv, '--scn-count'),
      scorecard: valueAfter(argv, '--scorecard') || 'missing',
    });
    printJson(result);
    if (!result.ok) process.exitCode = 2;
    return;
  }
  if (command === 'fixture-precondition') {
    const seedArg = valueAfter(argv, '--seed');
    const seedPath = seedArg ? path.resolve(seedArg) : '';
    const result = evaluateFixturePrecondition({ seedPath });
    printJson(result);
    if (!result.ok) process.exitCode = 3;
    return;
  }
  printJson({
    ok: false,
    verdict: 'failed',
    errorCode: 'unsupported_evidence_router_command',
    command,
    evidenceClass: 'fixture_precondition',
  });
  process.exitCode = 64;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
