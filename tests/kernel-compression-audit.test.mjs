import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const collectSource = (relativeRoot) => {
  const absoluteRoot = path.join(root, relativeRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(readFileSync(absolute, 'utf8'));
    }
  };
  visit(absoluteRoot);
  return files.join('\n');
};

test('retired execution modules and public Wave dispatch exports are absent', () => {
  const retired = [
    'scripts/host/kernel/wave-dispatcher.mjs',
    'scripts/kernel/run/active-wave.mjs',
    'scripts/kernel/run/bounded-wave.mjs',
    'scripts/kernel/run/integration-coordinator.mjs',
    'scripts/kernel/run/wave-receipts.mjs',
    'scripts/kernel/wave-plan.mjs',
  ];
  for (const relativePath of retired) assert.equal(existsSync(path.join(root, relativePath)), false, relativePath);

  const production = [
    collectSource('scripts/kernel'),
    collectSource('scripts/host/kernel'),
    collectSource('bin'),
  ].join('\n');
  assert.doesNotMatch(production, /(?:from|import\s*\(|require\s*\()[^\n]*(?:active-wave|bounded-wave|integration-coordinator|wave-receipts|wave-plan|wave-dispatcher)/u);
  assert.doesNotMatch(production, /dispatchKernelWave/u);
});

test('persistent schema contains Step Ledger facts, not a replacement lifecycle', () => {
  const stateStore = read('scripts/kernel/state-store.mjs');
  const baseSchema = stateStore.split('const addCol', 1)[0];
  assert.doesNotMatch(baseSchema, /wave|batch_id|group_id|parallel_plan|integration_state|integrated_at/iu);
  assert.doesNotMatch(baseSchema, /CREATE TABLE[^;]*(?:batch|group|parallel_plan|wave)/iu);
  assert.match(stateStore, /ALTER TABLE run_steps DROP COLUMN wave_id/u);
  assert.match(stateStore, /DROP TABLE IF EXISTS run_waves/u);
  assert.doesNotMatch(stateStore, /CREATE TABLE[^;]*(?:run_waves|wave_integration_receipts|parallel_batches)/iu);
  assert.doesNotMatch(stateStore, /(?:batch_id|group_id|parallel_plan_id)/iu);
});

test('model-visible execution surface remains next/report only', () => {
  const entrypoint = read('bin/moon-relay-kernel.mjs');
  assert.match(entrypoint, /Model-visible (?:runtime )?command 1 of 2/u);
  assert.match(entrypoint, /Model-visible (?:runtime )?command 2 of 2/u);
  assert.doesNotMatch(entrypoint, /command\s*===\s*['"][^'"]*(?:wave|batch|parallel|work[- ]?unit)[^'"]*['"]/iu);
  assert.doesNotMatch(entrypoint, /dispatchKernelWave/u);
});

test('package and current documentation expose the compressed vocabulary', () => {
  const packageText = read('package.json');
  assert.doesNotMatch(packageText, /tests\/kernel-(?:bounded-wave|run-step-safe-wave|wave-conflict|wave-planner|wayfinder-runtime)\.test\.mjs/u);

  const guideline = read('docs/public/guidelines/kernel-execution-capsule-and-step-ledger.md');
  assert.match(guideline, /## Derived parallel selection/u);
  assert.match(guideline, /no persisted (?:batch|group|parallel plan)/iu);
  assert.match(guideline, /lifecycle/iu);
  assert.doesNotMatch(guideline, /safeWave\.approved|bounded-wave worker/iu);

  const traceability = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/TRACEABILITY_MATRIX.md');
  assert.match(traceability, /KRN-REQ-011.*derived Step Ledger parallel selection/iu);
  assert.doesNotMatch(traceability, /KRN-REQ-011[^\n]*Wave receipt/iu);

  const sourceReport = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/SOURCE_IMPLEMENTATION_REPORT.md');
  assert.match(sourceReport, /## Compression ledger/u);
  assert.match(sourceReport, /No persist(?:ed|ent) batch.*lifecycle/iu);

  const review = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/ARCHITECTURE_REVIEW.md');
  assert.match(review, /Current compression decision/u);
  const finalDesign = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/MOON_RELAY_KERNEL_FINAL_DESIGN.md');
  assert.match(finalDesign, /Current implementation addendum/u);
  const phasePlan = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/06-adaptive-proof-safe-wave-v1.ko.md');
  assert.match(phasePlan, /Current implementation note/u);
});

test('architecture handoff and historical plans distinguish current truth from legacy design', () => {
  const handoff = JSON.parse(read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/ARCHITECTURE_HANDOFF.json'));
  assert.match(handoff.promptBlock, /derived Step Ledger parallel selection/u);
  assert.doesNotMatch(handoff.promptBlock, /sequential-default Safe Wave/iu);
  assert.match(handoff.warnings.find((warning) => warning.code === 'parallel_execution_projection')?.message || '', /transient/iu);

  const masterPlan = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/00-master-plan-v1.ko.md');
  const adr = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/ADR/ADR-0004-managed-upstream-and-safe-wave.md');
  const reviewLoop = read('docs/public/roadmaps/moon-relay-kernel-2026-07-21/planning-loop/plan-quality-review-iter-01.yaml');
  assert.match(masterPlan, /Current implementation note/u);
  assert.match(adr, /Current implementation note/u);
  assert.match(reviewLoop, /currentImplementationNote/u);
});
