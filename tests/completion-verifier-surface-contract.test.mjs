import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const readRoot = (...segments) => readFile(fromRoot(...segments), 'utf8');

test('completion verifier skill docs keep compact assembler surface and output shape', async () => {
  const english = await readRoot('skills', 'completion-verifier', 'SKILL.md');
  const korean = await readRoot('skills', 'completion-verifier', 'SKILL.ko.md');
  const requiredOutputKeys = [
    'completionStatus',
    'gateDecision',
    'workflowEvidence',
    'evidenceProvenance',
    'qaReport',
  ];
  const ownerReferences = [
    'scripts/runtime-state.mjs',
    'scripts/lib/verification-plane.mjs',
    'schemas/verification.contract.yaml',
    'docs/public/guidelines/verification-contract.md',
    'docs/public/guidelines/verification-workflow-evidence.md',
  ];

  for (const [label, text] of [['english', english], ['korean', korean]]) {
    for (const key of requiredOutputKeys) {
      assert.match(text, new RegExp(`\\b${key}\\b`), `${label} should keep ${key}`);
    }
    for (const owner of ownerReferences) {
      assert.match(text, new RegExp(owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label} should reference ${owner}`);
    }
    assert.match(text, /taskLocalCompletion/);
    assert.match(text, /wholePlanAuthority/);
  }

  assert.ok(english.split(/\r?\n/).length < 190, 'English verifier prompt should stay compact');
  assert.ok(korean.split(/\r?\n/).length < 170, 'Korean verifier prompt should stay compact');
});

test('workflow evidence guideline pair exists and is classified', async () => {
  assert.equal(existsSync(fromRoot('docs', 'public', 'guidelines', 'verification-workflow-evidence.md')), true);
  assert.equal(existsSync(fromRoot('docs', 'public', 'guidelines', 'verification-workflow-evidence.ko.md')), true);

  const layout = await readRoot('docs', 'public', 'repository-layout.md');
  assert.match(layout, /verification-workflow-evidence\.md` \/ `verification-workflow-evidence\.ko\.md/);
});

test('verification evidence gate is deprecated compatibility shim', async () => {
  const english = await readRoot('skills', 'verification-evidence-gate', 'SKILL.md');
  const korean = await readRoot('skills', 'verification-evidence-gate', 'SKILL.ko.md');

  for (const text of [english, korean]) {
    assert.match(text, /deprecated compatibility shim/i);
    assert.match(text, /completion-verifier/);
    assert.match(text, /verification-plane\.mjs/);
    assert.match(text, /runtime-state\.mjs assess-completion/);
    assert.match(text, /do not insert|직접 insert하지 않습니다/i);
  }
});

test('workspace isolation gate requires only minimum machine-checkable artifact fields', async () => {
  const english = await readRoot('skills', 'workspace-isolation-gate', 'SKILL.md');
  const korean = await readRoot('skills', 'workspace-isolation-gate', 'SKILL.ko.md');
  const requiredFields = [
    'branchOrWorktree',
    'prepareArtifact',
    'hydrationStatus',
    'baselineCommand',
    'baselineExitCode',
    'sandboxPolicyStatus',
  ];

  for (const text of [english, korean]) {
    for (const field of requiredFields) {
      assert.match(text, new RegExp(field));
    }
    assert.doesNotMatch(text, /ignoredAgentPaths:/);
    assert.match(text, /prepare artifact/i);
  }
});
