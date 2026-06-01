import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateOntologyConstraints } from './ontology-constraint-validate.mjs';

const NOW = '2026-05-30T00:00:00Z';
const SCRIPT = fileURLToPath(new URL('./ontology-constraint-validate.mjs', import.meta.url));

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function write(filePath, text) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, text);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ontology-constraint-'));
  const repo = path.join(root, 'repo');
  const state = path.join(root, 'state');
  mkdirp(path.join(repo, '.claude'));
  write(path.join(repo, '.claude', 'project.identity.yaml'), 'projectId: demo-project\naliases: []\n');
  return { root, repo, state, env: { ...process.env, CODEX_STATE_ROOT: state } };
}

function constraint(id, extra = {}) {
  return {
    type: 'ontology_constraint',
    id,
    projectId: 'demo-project',
    status: 'verified',
    origin: 'global',
    scope: 'prompt-purity',
    appliesTo: ['promptBlock'],
    severity: 'error',
    enforcedBy: 'ontologyConstraints',
    sourceRef: `ontology/${id}.yaml`,
    supersedes: [],
    specificity: 10,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function jsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function runCli(args, fixture) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: fixture.repo,
    env: fixture.env,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: JSON.parse(result.stdout),
  };
}

test('validates global and project-local constraints with explicit supersedes and sufficient specificity', () => {
  const fixture = makeFixture();
  const globalPath = path.join(fixture.root, 'global.jsonl');
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(globalPath, jsonl([constraint('global-prompt-purity')]));
  write(projectPath, jsonl([
    constraint('project-prompt-purity', {
      origin: 'project',
      supersedes: ['global-prompt-purity'],
      specificity: 10,
    }),
  ]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    globalConstraints: [globalPath],
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, true);
  assert.equal(result.projectId, 'demo-project');
  assert.equal(result.checked, 2);
  assert.deepEqual(result.violations, []);
});

test('fails project-local override when supersedes does not name the matching global constraint', () => {
  const fixture = makeFixture();
  const globalPath = path.join(fixture.root, 'global.jsonl');
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(globalPath, jsonl([constraint('global-prompt-purity')]));
  write(projectPath, jsonl([constraint('project-prompt-purity', { origin: 'project', supersedes: [] })]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    globalConstraints: [globalPath],
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations[0].code, 'ontology_override_conflict');
  assert.equal(result.violations[0].globalConstraintId, 'global-prompt-purity');
});

test('fails project-local override when specificity is lower than the superseded global constraint', () => {
  const fixture = makeFixture();
  const globalPath = path.join(fixture.root, 'global.json');
  const projectPath = path.join(fixture.root, 'project.json');
  write(globalPath, JSON.stringify([constraint('global-runtime-contract', { specificity: 30 })]));
  write(projectPath, JSON.stringify([
    constraint('project-runtime-contract', {
      origin: 'project',
      supersedes: ['global-runtime-contract'],
      specificity: 10,
    }),
  ]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    globalConstraints: [globalPath],
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations[0].code, 'ontology_override_conflict');
  assert.equal(result.violations[0].localSpecificity, 10);
  assert.equal(result.violations[0].globalSpecificity, 30);
});

test('maps warn and info constraints to non-blocking degraded evidence', () => {
  const fixture = makeFixture();
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(projectPath, jsonl([
    constraint('project-warning', { origin: 'project', severity: 'warn' }),
    constraint('project-info', { origin: 'project', severity: 'info' }),
  ]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, true);
  assert.equal(result.checked, 2);
  assert.equal(result.degradedEvidence.length, 2);
  assert.deepEqual(result.degradedEvidence.map((item) => item.severity), ['warn', 'info']);
});

test('rejects invalid constraint records with blocking schema diagnostics', () => {
  const fixture = makeFixture();
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(projectPath, `${JSON.stringify({ id: 'missing-required-fields', severity: 'error' })}\n`);

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.equal(result.checked, 0);
  assert.ok(result.violations.some((item) => item.code === 'invalid_ontology_constraint'));
});

test('rejects invalid status values instead of silently ignoring records', () => {
  const fixture = makeFixture();
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(projectPath, jsonl([constraint('project-invalid-status', { origin: 'project', status: 'typo' })]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => (
    item.code === 'invalid_ontology_constraint'
    && item.message.includes('status must be one of')
  )));
});

test('rejects project constraint records that spoof global origin', () => {
  const fixture = makeFixture();
  const globalPath = path.join(fixture.root, 'global.jsonl');
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(globalPath, jsonl([constraint('global-prompt-purity')]));
  write(projectPath, jsonl([constraint('project-origin-spoof', { origin: 'global' })]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    globalConstraints: [globalPath],
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => (
    item.code === 'invalid_ontology_constraint'
    && item.message.includes('does not match project constraint source')
  )));
});

test('rejects unknown fields so raw ontology dumps cannot ride along in constraint records', () => {
  const fixture = makeFixture();
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(projectPath, jsonl([constraint('project-raw-dump-field', {
    origin: 'project',
    rawOntologyDump: '@prefix sh: <http://www.w3.org/ns/shacl#> . sh:NodeShape',
  })]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => (
    item.code === 'invalid_ontology_constraint'
    && item.message.includes('unknown field: rawOntologyDump')
  )));
});

test('rejects raw records that attempt to provide validator internal fields', () => {
  const fixture = makeFixture();
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(projectPath, jsonl([constraint('project-internal-field-spoof', {
    origin: 'project',
    recordRef: 'spoofed',
    declaredOrigin: 'project',
  })]));

  const result = validateOntologyConstraints({
    projectRoot: fixture.repo,
    projectConstraints: [projectPath],
    env: fixture.env,
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => (
    item.code === 'invalid_ontology_constraint'
    && item.message.includes('unknown field: recordRef')
  )));
  assert.ok(result.violations.some((item) => (
    item.code === 'invalid_ontology_constraint'
    && item.message.includes('unknown field: declaredOrigin')
  )));
});

test('returns nonzero from CLI for explicit unreadable constraint files', () => {
  const fixture = makeFixture();
  const missingPath = path.join(fixture.root, 'missing.jsonl');

  const result = runCli([
    '--project-root', fixture.repo,
    '--project-constraints', missingPath,
    '--json',
  ], fixture);

  assert.equal(result.status, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.violations[0].code, 'constraint_file_unreadable');
});

test('returns zero from CLI when only warn severity constraints are present', () => {
  const fixture = makeFixture();
  const projectPath = path.join(fixture.root, 'project.jsonl');
  write(projectPath, jsonl([constraint('project-warning', { origin: 'project', severity: 'warning' })]));

  const result = runCli([
    '--project-root', fixture.repo,
    '--project-constraints', projectPath,
    '--json',
  ], fixture);

  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.degradedEvidence[0].severity, 'warn');
});
