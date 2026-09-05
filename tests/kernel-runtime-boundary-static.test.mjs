import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE_EXECUTION_FILES, auditActiveRuntimeBoundary } from '../scripts/kernel/runtime-boundary-audit.mjs';
import {
  HOST_EXECUTION_CONTRACT_SCHEMA_VERSION,
  buildHostExecutionContract,
  validateHostExecutionContract,
} from '../scripts/kernel/run/host-execution-contract.mjs';
import {
  HOST_EXECUTION_ORDER,
  normalizeHostBoundaryRequest,
} from '../scripts/host/kernel/host-boundary.mjs';

const collectFiles = async (dir, ext = '.mjs') => {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(fullPath, ext));
    } else if (entry.isFile() && (ext ? fullPath.endsWith(ext) : true)) {
      result.push(fullPath);
    }
  }
  return result;
};

test('Static boundary: No production file imports deleted legacy launchers', async () => {
  const productionDirs = [
    path.resolve('scripts/kernel'),
    path.resolve('scripts/switcher'),
    path.resolve('scripts/host'),
    path.resolve('bin'),
  ];
  const forbiddenPatterns = [
    /codex-cli-launcher/i,
    /codex-runtime/i,
    /codex-profile-materializer/i,
    /codex-review-host/i,
    /moon-relay-kernel-host/i,
  ];

  for (const dir of productionDirs) {
    const files = await collectFiles(dir);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Forbidden legacy launcher reference matched in production file ${file}: ${pattern}`,
        );
      }
    }
  }
});

test('Static boundary: No production file contains forbidden legacy vocabulary strings', async () => {
  const productionDirs = [
    path.resolve('scripts/kernel'),
    path.resolve('scripts/switcher'),
    path.resolve('scripts/host'),
    path.resolve('bin'),
  ];
  const forbiddenStrings = [
    'relaunch-through-kernel-host',
    'shared-host-dispatch',
    'profile-and-data-root',
  ];

  for (const dir of productionDirs) {
    const files = await collectFiles(dir);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const str of forbiddenStrings) {
        assert.equal(
          content.includes(str),
          false,
          `Forbidden legacy string '${str}' found in production file ${file}`,
        );
      }
    }
  }
});

test('Static boundary: Active Kernel surfaces cannot reintroduce retired runtime paths', async () => {
  const audit = await auditActiveRuntimeBoundary({ repoRoot: path.resolve('.') });
  assert.equal(audit.status, 'pass', JSON.stringify(audit.findings, null, 2));
  for (const file of ACTIVE_EXECUTION_FILES) assert.ok(audit.scannedFiles.includes(file), `${file} must be audited as a reachable execution target`);
  assert.ok(audit.migrationOnlyFiles.includes('scripts/install-account-root-harness.mjs'));
});

test('Static boundary: Reachable local helpers are included in active execution audit', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-boundary-closure-'));
  try {
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'scripts', 'delivery-submit.mjs'), "import(/* comment before specifier */ './reachable-helper.mjs');\n", 'utf8');
    await writeFile(path.join(fixtureRoot, 'scripts', 'reachable-helper.mjs'), "export const marker = 'MOONSHOT_RELAY_HOME';\n", 'utf8');
    const audit = await auditActiveRuntimeBoundary({ repoRoot: fixtureRoot });
    assert.equal(audit.status, 'fail');
    assert.ok(audit.scannedFiles.includes('scripts/reachable-helper.mjs'));
    assert.ok(audit.findings.some((finding) => finding.file === 'scripts/reachable-helper.mjs' && finding.code === 'active-runtime-relay-home-interactive'));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Static boundary: Symlinked reachable helpers outside the repository fail closed', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-boundary-symlink-'));
  const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-boundary-external-'));
  try {
    await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'scripts', 'delivery-submit.mjs'), "import './linked/helper.mjs';\n", 'utf8');
    await writeFile(path.join(externalRoot, 'helper.mjs'), "export const marker = 'MOONSHOT_RELAY_HOME';\n", 'utf8');
    await symlink(externalRoot, path.join(fixtureRoot, 'scripts', 'linked'), 'junction');

    const audit = await auditActiveRuntimeBoundary({ repoRoot: fixtureRoot });
    assert.equal(audit.status, 'fail', JSON.stringify(audit, null, 2));
    assert.ok(audit.findings.some((finding) => finding.code === 'active-runtime-import-outside-repo'));
    assert.equal(audit.scannedFiles.some((file) => file.includes('kernel-boundary-external-')), false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test('Static boundary: Host boundary manifest declares the six Host execution concerns', async () => {
  const manifest = await readFile(path.resolve('kernel/host-boundary.yaml'), 'utf8');
  for (const concern of ['provider', 'model', 'reasoning-effort', 'session', 'worktree', 'git', 'prompt-envelope', 'prompt-cache', 'package-materialization', 'account-profile-projection']) {
    assert.match(manifest, new RegExp(`^  - ${concern.replace('-', '\\-')}$`, 'm'));
  }
  assert.deepEqual(HOST_EXECUTION_ORDER, [
    'model/provider-policy',
    'prompt-envelope/cache',
    'session-execution',
    'worktree',
    'git',
    'package/profile',
  ]);
});

test('Static boundary: Kernel emits a provider-neutral HostExecutionContract', () => {
  const contract = buildHostExecutionContract({
    decision: {
      runId: 'run-boundary',
      decisionId: 'route-000000000000000000000000',
      actionKind: 'implement',
      role: 'implementer',
      permissions: 'workspace_write',
      executionClass: 'complex_implementation',
      workProfile: { executionClass: 'complex_implementation', complexity: 'complex', independentContextRequired: false },
    },
    assignment: {
      executionMode: 'owner-direct',
      delegation: { mode: 'optional', requested: false },
      freshSessionRequired: false,
    },
    workUnit: { objective: 'bounded change', allowedPaths: ['src/'], forbiddenPaths: ['.env'] },
  });
  assert.equal(contract.schemaVersion, HOST_EXECUTION_CONTRACT_SCHEMA_VERSION);
  assert.equal(contract.executionClass, 'complex_implementation');
  assert.equal(contract.workUnit.objective, 'bounded change');
  for (const forbidden of ['provider', 'model', 'effort', 'sessionId', 'worktreeRoot', 'gitState', 'cacheKey']) {
    assert.equal(Object.hasOwn(contract, forbidden), false, `${forbidden} must stay Host-owned`);
    assert.equal(JSON.stringify(contract).includes(`\"${forbidden}\"`), false, `${forbidden} must stay Host-owned`);
  }
  assert.equal(validateHostExecutionContract(contract), contract);
});

test('Static boundary: Host validates the boundary before it accepts a directive', () => {
  const directive = {
    modelRouteDecision: {
      runId: 'run-boundary',
      decisionId: 'route-111111111111111111111111',
      actionKind: 'implement',
      role: 'implementer',
      permissions: 'workspace_write',
      executionClass: 'standard',
      workProfile: { executionClass: 'standard', complexity: 'standard' },
    },
    executionAssignment: { executionMode: 'owner-direct', delegation: { mode: 'optional', requested: false } },
  };
  const normalized = normalizeHostBoundaryRequest({
    modelInput: { action: { step: { stepId: 'step-boundary' } } },
    hostDirective: directive,
  });
  assert.equal(normalized.contract.executionClass, 'standard');
  assert.throws(
    () => validateHostExecutionContract({ ...normalized.contract, model: 'gpt-6-astra' }),
    /host_execution_contract_provider_field/,
  );
});
