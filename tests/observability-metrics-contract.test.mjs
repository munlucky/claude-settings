import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const teamMetricsBlock = (text) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'teamMetrics:');
  assert.notEqual(start, -1, 'teamMetrics should exist');
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
};

const extractList = (text, sectionName) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${sectionName}:`);
  assert.notEqual(start, -1, `${sectionName} should exist`);
  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{4}\S/.test(line) && !line.trim().startsWith('- ')) break;
    const match = line.match(/^\s+- "([^"]+)"$/);
    if (match) values.push(match[1]);
  }
  return values;
};

test('team metrics preserve requiredFields compatibility and split decision/reporting fields', async () => {
  const contract = await readFile(path.join(root, 'schemas', 'verification.contract.yaml'), 'utf8');
  const block = teamMetricsBlock(contract);
  const requiredFields = extractList(block, 'requiredFields');
  const decisionFields = extractList(block, 'decisionFields');
  const reportingFields = extractList(block, 'reportingFields');

  assert.ok(requiredFields.includes('selectedPattern'));
  assert.deepEqual(decisionFields, [
    'selectedPattern',
    'selectedHarnessComponents',
    'skippedHarnessComponents',
    'runtimeIsolation',
    'verifierFailureCategories',
  ]);
  assert.deepEqual(reportingFields, [
    'selectedTeam',
    'selectionReason',
    'modelEffortProfile',
    'selectedModelProvider',
    'selectedModel',
    'selectedModelEffort',
    'modelSelectionReason',
    'retryCount',
    'handoffCount',
    'indeterminateRatio',
    'completionLeadTimeSeconds',
  ]);
  for (const field of [...decisionFields, ...reportingFields]) {
    assert.ok(requiredFields.includes(field), `${field} should remain in deprecated requiredFields compatibility list`);
  }
});

test('observability contract names memory control-plane metric surfaces', async () => {
  const contract = await readFile(path.join(root, 'schemas', 'verification.contract.yaml'), 'utf8');
  for (const field of [
    'metrics.memoryProvenanceCoverage',
    'metrics.staleMemorySuppression',
    'metrics.memoryGateFailureCount',
    'metrics.memoryPromotionRollbackCount',
  ]) {
    assert.match(contract, new RegExp(field.replaceAll('.', '\\.')));
  }
});
