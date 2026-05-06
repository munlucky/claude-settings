#!/usr/bin/env node

import {
  clearGoal,
  statusPayload,
  updateGoalStatus,
  withDb,
} from './runtime-state.mjs';

function usage() {
  console.error([
    'Usage:',
    '  phase-goal-control.mjs status <plan-dir>',
    '  phase-goal-control.mjs pause <plan-dir> [detail]',
    '  phase-goal-control.mjs resume <plan-dir> [detail]',
    '  phase-goal-control.mjs clear <plan-dir> [detail]',
  ].join('\n'));
}

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function renderAssignments(payload) {
  return Object.entries(payload || {})
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join('\n');
}

function writeLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function renderStatus(payload) {
  if (!payload.found) {
    writeLine(`Goal runtime: not found`);
    writeLine(`Plan: ${payload.planDir || 'n/a'}`);
    return;
  }
  const goal = payload.goal || {};
  const activePhase = payload.activePhase || null;
  const nextPhase = payload.nextPhase || null;
  const blockedPhase = payload.blockedPhase || null;
  const lease = payload.lease || null;
  writeLine(`Goal: ${goal.goal_id}`);
  writeLine(`Status: ${goal.status}`);
  writeLine(`Objective: ${goal.objective}`);
  writeLine(`Plan: ${goal.plan_dir}`);
  writeLine(`Actionable phases: ${payload.actionablePhasesRemaining}`);
  writeLine(`Active phase: ${activePhase ? `${activePhase.phase_number} ${activePhase.phase_title}${activePhase.status ? ` (${activePhase.status})` : ''}` : 'none'}`);
  writeLine(`Next phase: ${blockedPhase ? 'none until unblock' : nextPhase ? `${nextPhase.phase_number} ${nextPhase.phase_title} (${nextPhase.status})` : 'none'}`);
  if (blockedPhase) {
    writeLine(`Blocked phase: ${blockedPhase.phase_number} ${blockedPhase.phase_title} (${blockedPhase.status})`);
  }
  writeLine(`Lease: ${lease ? `${lease.lease_id} (${lease.status})` : 'none'}`);
  writeLine(`Time used: ${goal.time_used_seconds || 0}s`);
  writeLine(`Accounting: ${goal.accounting_quality || 'unavailable'}`);
  writeLine(`Continuation suppressed: ${goal.continuation_suppressed ? 'true' : 'false'}`);
}

const [command, planDir, ...rest] = process.argv.slice(2);
if (!command || !planDir) {
  usage();
  process.exit(64);
}

try {
  switch (command) {
    case 'status': {
      const payload = await withDb((db) => statusPayload(db, planDir));
      renderStatus(payload);
      break;
    }
    case 'pause': {
      const result = await withDb((db) => updateGoalStatus(db, {
        planDir,
        status: 'paused',
        detail: rest.join(' ') || 'operator pause',
      }));
      writeLine(renderAssignments(result ? { GOAL_ID: result.goal_id, STATUS: result.status } : { STATUS: 'not_found' }));
      break;
    }
    case 'resume': {
      const result = await withDb((db) => updateGoalStatus(db, {
        planDir,
        status: 'active',
        detail: rest.join(' ') || 'operator resume',
      }));
      writeLine(renderAssignments(result ? { GOAL_ID: result.goal_id, STATUS: result.status } : { STATUS: 'not_found' }));
      break;
    }
    case 'clear': {
      const result = await withDb((db) => clearGoal(db, planDir, rest.join(' ') || 'operator clear'));
      writeLine(renderAssignments(result ? { GOAL_ID: result.goal_id, STATUS: 'cleared' } : { STATUS: 'not_found' }));
      break;
    }
    default:
      usage();
      process.exit(64);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
