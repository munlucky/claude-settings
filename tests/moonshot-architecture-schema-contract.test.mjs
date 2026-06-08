import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const requiredSchemas = [
  'architecture-brief.schema.json',
  'requirement-inventory.schema.json',
  'asr-catalog.schema.json',
  'quality-attribute-scenario.schema.json',
  'architecture-option.schema.json',
  'tradeoff-analysis.schema.json',
  'adr.schema.json',
  'c4-model.schema.json',
  'traceability-matrix.schema.json',
  'architecture-context-pack.schema.json',
];

const runValidator = (mode, fixtureName) => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/architecture-artifact-validate.mjs',
      '--mode',
      mode,
      '--path',
      `tests/fixtures/moonshot-architecture/artifacts/${fixtureName}`,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  const output = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  return { ...result, output };
};

const runValidatorPath = (mode, artifactPath, extraArgs = []) => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/architecture-artifact-validate.mjs',
      '--mode',
      mode,
      '--path',
      artifactPath,
      '--json',
      ...extraArgs,
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  const output = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  return { ...result, output };
};

const withMutatedGreenfieldFixture = async (mutate, callback) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-architecture-'));
  const packagePath = path.join(tempRoot, 'package');
  await cp(fromRoot('tests', 'fixtures', 'moonshot-architecture', 'artifacts', 'greenfield-valid'), packagePath, { recursive: true });
  try {
    await mutate(packagePath);
    await callback(packagePath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

const collectPatternSchemas = (schema, results = []) => {
  if (!schema || typeof schema !== 'object') {
    return results;
  }
  if (Object.hasOwn(schema, 'pattern')) {
    results.push(schema);
  }
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectPatternSchemas(item, results);
      }
    } else {
      collectPatternSchemas(value, results);
    }
  }
  return results;
};

test('architecture schema inventory is complete and parseable', async () => {
  const schemaDir = fromRoot('schemas', 'architecture');
  const entries = await readdir(schemaDir);

  assert.deepEqual(entries.sort(), requiredSchemas.sort());

  for (const schema of requiredSchemas) {
    const content = await readFile(fromRoot('schemas', 'architecture', schema), 'utf8');
    const parsed = JSON.parse(content);

    assert.equal(parsed.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.match(parsed.$id, /schemas\/architecture\//);
    assert.equal(parsed.type, 'object');
    assert.ok(Array.isArray(parsed.required), `${schema} should declare required fields`);
    for (const patternSchema of collectPatternSchemas(parsed)) {
      assert.equal(patternSchema.type, 'string', `${schema} pattern schemas should be typed as string`);
    }
  }
});

test('architecture artifact validator help exits cleanly', () => {
  const result = spawnSync(process.execPath, ['scripts/architecture-artifact-validate.mjs', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /greenfield_prd\|brownfield_codebase/);
});

test('architecture artifact validator accepts valid packages', () => {
  for (const [mode, fixtureName] of [
    ['greenfield_prd', 'greenfield-valid'],
    ['brownfield_codebase', 'brownfield-valid'],
  ]) {
    const result = runValidator(mode, fixtureName);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output.status, 'passed');
    assert.equal(result.output.mode, mode);
    assert.equal(result.output.errors.length, 0);
    assert.ok(result.output.checkedFiles.length > 0);
  }
});

test('architecture artifact validator rejects incomplete packages', () => {
  for (const [fixtureName, expectedCode] of [
    ['missing-asr', 'missing_required_file'],
    ['missing-adr', 'missing_adr_directory'],
    ['missing-traceability', 'missing_required_file'],
  ]) {
    const result = runValidator('greenfield_prd', fixtureName);

    assert.notEqual(result.status, 0, `${fixtureName} should fail validation`);
    assert.equal(result.output.status, 'failed');
    assert.ok(
      result.output.errors.some((error) => error.code === expectedCode),
      `${fixtureName} should include ${expectedCode}: ${JSON.stringify(result.output.errors)}`,
    );
  }
});

test('architecture artifact validator rejects broken traceability references', async () => {
  await withMutatedGreenfieldFixture(
    async (packagePath) => {
      await writeFile(
        path.join(packagePath, 'TRACEABILITY_MATRIX.md'),
        `# Traceability Matrix

| Requirement ID | ASR ID | Option ID | ADR ID | Verification Signal | Owner |
|---|---|---|---|---|---|
| REQ-001 | ASR-999 | OPT-001 | ADR-9999 | validator pass | architecture |
`,
      );
    },
    async (packagePath) => {
      const result = runValidatorPath('greenfield_prd', packagePath);

      assert.notEqual(result.status, 0);
      assert.equal(result.output.status, 'failed');
      assert.ok(result.output.errors.some((error) => error.code === 'traceability_unknown_asr'));
      assert.ok(result.output.errors.some((error) => error.code === 'traceability_unknown_adr'));
    },
  );
});

test('architecture artifact validator rejects isolated ASR ADR and traceability omissions', async () => {
  for (const [removeTarget, expectedCode] of [
    ['ASR_CATALOG.md', 'missing_asr_id'],
    ['TRACEABILITY_MATRIX.md', 'traceability_missing_requirement'],
    ['ADR', 'missing_adr_directory'],
  ]) {
    await withMutatedGreenfieldFixture(
      async (packagePath) => {
        await rm(path.join(packagePath, removeTarget), { recursive: true, force: true });
      },
      async (packagePath) => {
        const result = runValidatorPath('greenfield_prd', packagePath);

        assert.notEqual(result.status, 0, `${removeTarget} should fail validation`);
        assert.equal(result.output.status, 'failed');
        assert.ok(
          result.output.errors.some((error) => error.code === expectedCode),
          `${removeTarget} should include ${expectedCode}: ${JSON.stringify(result.output.errors)}`,
        );
      },
    );
  }
});

test('architecture artifact validator emits json for argument errors', () => {
  const result = spawnSync(process.execPath, ['scripts/architecture-artifact-validate.mjs', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'failed');
  assert.equal(output.errors[0].code, 'missing_required_argument');
});
