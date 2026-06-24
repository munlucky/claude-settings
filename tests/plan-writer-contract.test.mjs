import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

const planWriterFiles = [
  ['skills', 'moonshot-plan-writer', 'SKILL.md'],
  ['skills', 'moonshot-plan-writer', 'SKILL.ko.md'],
  ['skills', 'moonshot-plan-writer', 'references', 'plan-package-contract.md'],
  ['skills', 'moonshot-plan-writer', 'references', 'independent-review-loop.md'],
  ['skills', 'moonshot-plan-writer', 'assets', 'master-plan.template.md'],
  ['skills', 'moonshot-plan-writer', 'assets', 'master-plan.template.ko.md'],
  ['skills', 'moonshot-plan-writer', 'assets', 'phase-plan.template.md'],
  ['skills', 'moonshot-plan-writer', 'assets', 'phase-plan.template.ko.md'],
];

test('plan writer uses project-neutral surface classification instead of repository-specific gates', async () => {
  const combined = (await Promise.all(planWriterFiles.map((file) => readRoot(...file)))).join('\n');

  for (const category of [
    'source_only',
    'package_runtime_payload',
    'installed_profile_or_account_root',
    'external_deployment_or_service',
    'data_or_state_migration',
  ]) {
    assert.match(combined, new RegExp(category));
  }

  for (const slot of [
    'preflight_or_dry_run',
    'independent_review',
    'targeted_tests',
    'build_or_package_verification',
    'post_adoption_verification',
    'rollback_or_recovery_evidence',
    'git_closeout_parity',
  ]) {
    assert.match(combined, new RegExp(slot));
  }

  assert.match(combined, /policySourcePaths/);
  assert.match(combined, /project_policy/);
  assert.match(combined, /missing_policy/);
  assert.match(combined, /Concrete gate commands must be copied from the target project's policy sources|구체 gate 명령은 대상 프로젝트의 policy source/);
});

test('plan writer generic contract does not hard-code Moonshot Relay operational commands', async () => {
  const combined = (await Promise.all(planWriterFiles.map((file) => readRoot(...file)))).join('\n');

  for (const forbidden of [
    /npm run test:lab/,
    /harness-lab/,
    /doctor\.mjs/,
    /skills-audit\.mjs/,
    /install-account-root-harness\.mjs/,
    /profileSurfaceParity/,
    /extraCanonicalCount/,
    /package\/runtime-surface\.json/,
  ]) {
    assert.doesNotMatch(combined, forbidden);
  }
});

test('plan writer review loop escalates document review by risk without making it harness-specific', async () => {
  const reviewLoop = await readRoot('skills', 'moonshot-plan-writer', 'references', 'independent-review-loop.md');

  assert.match(reviewLoop, /High-risk plans should use at least two independent perspectives/);
  assert.match(reviewLoop, /Per-document review entries are required/);
  assert.match(reviewLoop, /package\/runtime payloads|package\/runtime/);
  assert.match(reviewLoop, /external services/);
  assert.match(reviewLoop, /data\/state/);
  assert.doesNotMatch(reviewLoop, /harness-lab|profileSurfaceParity|skills-audit\.mjs|doctor\.mjs/);
});
