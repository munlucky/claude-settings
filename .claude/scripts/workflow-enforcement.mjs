#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { buildPhaseStateBoard } from './phase-state-board.mjs';
import { buildWorkflowCapabilityState } from './runtime-capability-preflight.mjs';

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'verify';
  if (command === 'status') {
    const board = buildPhaseStateBoard();
    printJson({
      ok: true,
      mode: 'status',
      sourceAuthority: board.sourceAuthority,
      activePhase: board.activePhase,
      nextAction: board.nextAction,
      forkedAgentAttempt: board.forkedAgentAttempt,
      parentEvidenceCollection: board.parentEvidenceCollection,
      fallbackAdapterState: board.fallbackAdapterState,
      staleReadModelWarnings: board.staleReadModelWarnings,
      adoptedContract: {
        controlPlaneOwner: 'current-session-phase-runner',
        phaseAttemptOwner: 'forked-agent',
        diffAndEvidenceOwner: 'parent-session',
        agentLoopRole: 'legacy-headless-cron-fallback',
      },
    });
    return;
  }
  if (command !== 'verify') {
    printJson({
      ok: false,
      errorCode: 'unsupported_workflow_enforcement_command',
      command,
    });
    process.exitCode = 64;
    return;
  }

  const capabilityState = buildWorkflowCapabilityState();
  printJson({
    ok: true,
    mode: 'verify',
    evidenceClass: 'runtime_capability',
    capabilityState,
    degradedCapabilities: capabilityState.filter((item) => item.ok),
    blockedRequiredCapabilities: capabilityState.filter((item) => item.blocksRequiredEvidence),
    strictProductGatesPreserved: true,
    productAcceptancePolicy: 'AC/SCN/scorecard evidence remains required and is not satisfied by capability preflight',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
