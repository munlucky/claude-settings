import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import { compactContextState } from '../scripts/lib/context-state-engine.mjs';

const root = process.cwd();
const tempRoots = [];

const makeTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-context-state-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runNode = (args, env = {}) => spawnSync(process.execPath, args, {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    ...env,
  },
});

const parseJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const runtimeState = (args, env) => parseJson(runNode(['scripts/runtime-state.mjs', ...args, '--json'], env));

test('forced restart resumes from DB context state without chat transcript replay', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };
  const runId = 'run-context-restart';
  const goalId = 'goal-context-restart';
  const resumeBrief = {
    objective: 'modernize harness control plane',
    phase: '04-context-state-engine-compaction-and-prompt-assembly-v2.md',
    nextAction: 'continue context engine implementation',
    currentBlocker: '',
    lineage: ['00-master-plan-v2.md', '04-context-state-engine-compaction-and-prompt-assembly-v2.md'],
    assumptions: ['runtime-state DB is the resume authority'],
    evidence: [{ command: 'npm test', status: 'pending' }],
    changedFiles: ['scripts/context-state.mjs', 'scripts/lib/context-state-engine.mjs'],
    openRisks: ['remote CI matrix is pending branch publication'],
  };

  runtimeState([
    'snapshot-resume',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--status-json',
    JSON.stringify({ phase: resumeBrief.phase, changedFiles: resumeBrief.changedFiles }),
    '--resume-brief-json',
    JSON.stringify(resumeBrief),
  ], env);

  const built = parseJson(runNode([
    'scripts/context-state.mjs',
    'build',
    '--run-id',
    runId,
    '--goal-id',
    goalId,
    '--json',
  ], env));

  assert.equal(built.status, 'built');
  assert.equal(built.contextState.objective, resumeBrief.objective);
  assert.equal(built.contextState.phase, resumeBrief.phase);
  assert.equal(built.contextState.nextAction, resumeBrief.nextAction);
  assert.deepEqual(built.contextState.changedFiles, resumeBrief.changedFiles);

  const rehydrated = parseJson(runNode([
    'scripts/context-state.mjs',
    'rehydrate',
    '--context-json',
    JSON.stringify(built.contextState),
    '--json',
  ], env));

  assert.equal(rehydrated.status, 'rehydrated');
  assert.match(rehydrated.phaseBrief, /continue context engine implementation/);
  assert.match(rehydrated.phaseBrief, /scripts\/context-state\.mjs/);
});

test('stale projection warnings are visible and make context completion ineligible', async () => {
  const tempRoot = await makeTempRoot();
  const env = { PHASE_RUNTIME_DB: path.join(tempRoot, 'runtime-state.sqlite') };

  runtimeState([
    'snapshot-resume',
    '--run-id',
    'run-stale-projection',
    '--goal-id',
    'goal-stale-projection',
    '--status-json',
    JSON.stringify({
      projectionFreshness: {
        stale: true,
        staleReason: 'source-diff-after-projection',
      },
    }),
    '--resume-brief-json',
    JSON.stringify({
      nextAction: 'refresh projection before closeout',
      lineage: ['projection-v1'],
      projectionFreshness: {
        stale: true,
        staleReason: 'source-diff-after-projection',
      },
    }),
  ], env);

  const built = parseJson(runNode([
    'scripts/context-state.mjs',
    'build',
    '--run-id',
    'run-stale-projection',
    '--goal-id',
    'goal-stale-projection',
    '--json',
  ], env));

  assert.equal(built.contextState.projectionFreshness.stale, true);
  assert.equal(built.contextState.completionEligible, false);
  assert.equal(built.contextState.nextAction, 'refresh projection before closeout');
});

test('large context histories compact without losing required resume fields', async () => {
  const contextState = {
    authoritySource: 'runtime-state.sqlite',
    objective: 'large history compaction',
    phase: 'phase-04',
    currentBlocker: 'blocked by stale projection',
    lineage: ['a', 'b', 'c'],
    assumptions: Array.from({ length: 50 }, (_, index) => `assumption-${index}`),
    evidence: Array.from({ length: 200 }, (_, index) => ({ id: index, status: 'observed' })),
    changedFiles: Array.from({ length: 120 }, (_, index) => `file-${index}.mjs`),
    openRisks: Array.from({ length: 40 }, (_, index) => `risk-${index}`),
    nextAction: 'resume from compacted state',
    staleWarnings: ['stale run lease: run-old'],
    projectionFreshness: { stale: false },
    eventHistory: Array.from({ length: 300 }, (_, index) => ({ sequence: index, payload: 'x'.repeat(120) })),
  };

  const compacted = compactContextState(contextState, {
    maxEvidence: 12,
    maxChangedFiles: 20,
  });

  assert.equal(compacted.status, 'compacted');
  assert.equal(compacted.contextState.nextAction, 'resume from compacted state');
  assert.equal(compacted.contextState.currentBlocker, 'blocked by stale projection');
  assert.deepEqual(compacted.metrics.lostRequiredFields, []);
  assert.equal(compacted.metrics.omittedEventHistoryCount, 300);
  assert.ok(compacted.metrics.contextCompactionRatio < 1);
});

test('prompt assembly keeps stable prefix before volatile state and records cache metrics', async () => {
  const contextState = {
    authoritySource: 'runtime-state.sqlite',
    objective: 'prompt assembly',
    phase: 'phase-04',
    currentBlocker: '',
    lineage: ['stable-prefix'],
    assumptions: [],
    evidence: [],
    changedFiles: ['scripts/context-state.mjs'],
    openRisks: [],
    nextAction: 'run verification',
    staleWarnings: [],
    projectionFreshness: { stale: false },
    completionEligible: true,
  };

  const first = parseJson(runNode([
    'scripts/context-state.mjs',
    'assemble-prompt',
    '--context-json',
    JSON.stringify(contextState),
    '--json',
  ]));
  assert.equal(first.status, 'assembled');
  assert.equal(first.prompt.startsWith(first.stablePrefix), true);
  assert.ok(first.prompt.indexOf('# Moonshot Relay Runtime Context') < first.prompt.indexOf('## Volatile Runtime State'));
  assert.equal(first.metrics.cacheablePrefix, true);
  assert.equal(first.metrics.promptCacheHit, false);

  const second = parseJson(runNode([
    'scripts/context-state.mjs',
    'assemble-prompt',
    '--context-json',
    JSON.stringify(contextState),
    '--previous-stable-prefix-hash',
    first.metrics.stablePrefixHash,
    '--json',
  ]));
  assert.equal(second.metrics.promptCacheHit, true);
});
