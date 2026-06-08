import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyFailure } from '../scripts/lib/failure-classifier.mjs';
import { diagnoseShellCommand } from '../scripts/lib/shell-command-diagnostics.mjs';
import { REQUIRED_HARNESS_CONTROL_PLANE_CASES, runHarnessControlPlaneEval } from '../tools/evals/harness-control-plane.mjs';

test('active tests do not import archive runtime helpers', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const testsDir = path.join(process.cwd(), 'tests');
  const files = (await readdir(testsDir))
    .filter((name) => (
      name.endsWith('.test.mjs')
      && name !== 'harness-regression-contract.test.mjs'
      && name !== 'legacy-archive-contract.test.mjs'
    ));
  const violations = [];

  for (const file of files) {
    const text = await readFile(path.join(testsDir, file), 'utf8');
    if (/\.\.\/archive\/scripts\/legacy-phase-adapters/.test(text)) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, []);
});

test('PowerShell parser mistakes are diagnosed as operator command syntax errors', () => {
  const hereDoc = diagnoseShellCommand("node <<'EOF'\nconsole.log('x')\nEOF", {
    shell: 'powershell.exe',
  });
  const parserError = diagnoseShellCommand('ParserError: Missing file specification after redirection operator.', {
    shell: 'pwsh.exe',
  });

  assert.equal(hereDoc.ok, false);
  assert.equal(hereDoc.code, 'powershell_command_syntax');
  assert.match(hereDoc.example, /@'[\s\S]*'@ \| node -/);
  assert.equal(parserError.ok, false);
  assert.equal(parserError.code, 'powershell_command_syntax');
});

test('failure classifier treats PowerShell parser errors as operator errors', () => {
  for (const detail of [
    'ParserError: Missing file specification after redirection operator.',
    'The \'<\' operator is reserved for future use.',
    'Array index expression is missing or not valid.',
    'Unexpected token \']\' in expression or statement.',
  ]) {
    const classification = classifyFailure({ name: 'operator.powershell', detail });
    assert.equal(classification.code, 'powershell_command_syntax');
    assert.equal(classification.category, 'operator_error');
    assert.equal(classification.decision, 'fix_command');
  }
});

test('harness golden eval includes architecture regression blockers', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const fixturePath = path.join(process.cwd(), 'tools', 'evals', 'fixtures', 'harness-control-plane', 'golden-regression.json');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const architectureCases = [
    'architecture-missing-traceability',
    'architecture-raw-kg-leakage',
    'architecture-missing-verification-signal',
    'architecture-phase-status-only-closeout',
  ];
  const caseIds = new Set(fixture.cases.map((entry) => entry.id));

  for (const id of architectureCases) {
    assert.ok(REQUIRED_HARNESS_CONTROL_PLANE_CASES.includes(id), `${id} should be required by the eval runner`);
    assert.ok(caseIds.has(id), `${id} should be present in the golden fixture`);
  }

  const result = runHarnessControlPlaneEval(fixture);
  assert.equal(result.status, 'passed');
  assert.equal(result.regressionWorsened, false);
  assert.equal(result.missingCases.length, 0);
});
