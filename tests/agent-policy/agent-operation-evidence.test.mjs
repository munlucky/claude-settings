import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

test('agent operation evidence is non-authoritative and keeps completion authority with runtime-state', async () => {
  const schema = await readRoot('schemas', 'agent-operation.contract.yaml');
  const completionVerifier = await readRoot('skills', 'completion-verifier', 'SKILL.md');
  const verificationEvidence = await readRoot('docs', 'public', 'guidelines', 'verification-workflow-evidence.md');

  assert.match(schema, /agentOperationEvidence/);
  assert.match(schema, /completionAuthority: false/);
  assert.match(schema, /runtime-state accepted completion authority remains required/);
  assert.match(completionVerifier, /agent operating policy evidence/i);
  assert.match(completionVerifier, /does not own completion authority policy/i);
  assert.match(verificationEvidence, /accepted completion authority remains with `scripts\/runtime-state\.mjs assess-completion`/);
});

test('cumulative risk starts as evidence and not an implicit DB migration', async () => {
  const riskGuideline = await readRoot('docs', 'public', 'guidelines', 'safety-drift-and-cumulative-risk.md');
  const schema = await readRoot('schemas', 'agent-operation.contract.yaml');

  assert.match(riskGuideline, /runtime event or verification evidence payloads/);
  assert.match(riskGuideline, /Add database migration only when/);
  assert.match(schema, /cumulativeRisk/);
});
