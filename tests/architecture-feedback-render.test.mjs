import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { renderArchitectureFeedback, renderTextFeedback } from '../scripts/architecture-feedback-render.mjs';

const root = process.cwd();

const contract = {
  constraints: [
    {
      id: 'constraint-no-client-token',
      severity: 'blocking',
      summary: 'No client token access.',
      sourceRef: 'ADR/ADR-0001.md',
    },
  ],
  verificationSignals: [
    { id: 'VerificationSignal:npm run test:auth', commandOrEvidence: 'npm run test:auth' },
  ],
};

const handoff = {
  readBeforeRetry: ['ARCHITECTURE_HANDOFF.json'],
};

test('feedback renderer produces actionable JSON and text', () => {
  const feedback = renderArchitectureFeedback({
    contract,
    handoff,
    violation: {
      constraintId: 'constraint-no-client-token',
      sourceRef: 'src/app/page.tsx',
      summary: 'Touched client token boundary.',
      requiredActions: ['Move token access behind the BFF route.'],
    },
    refs: { contractSlice: 'ARCHITECTURE_CONTRACT_SLICE.json', handoff: 'ARCHITECTURE_HANDOFF.json' },
  });
  const text = renderTextFeedback(feedback);

  assert.equal(feedback.artifactId, 'ARCHITECTURE_FEEDBACK');
  assert.equal(feedback.status, 'ready');
  assert.equal(feedback.violated[0].id, 'constraint-no-client-token');
  assert.ok(feedback.readBeforeRetry.includes('ADR/ADR-0001.md'));
  assert.ok(feedback.verificationSignals.some((signal) => signal.commandOrEvidence === 'npm run test:auth'));
  assert.ok(text.includes('ARCHITECTURE_CONTRACT_FAILED'));
  assert.ok(text.includes('Move token access behind the BFF route.'));
});

test('feedback renderer blocks and omits unsafe raw payload', () => {
  const feedback = renderArchitectureFeedback({
    contract,
    handoff,
    violation: {
      constraintId: 'constraint-no-client-token',
      rawGraph: { nodes: ['no'] },
    },
  });

  assert.equal(feedback.status, 'blocked');
  assert.equal(JSON.stringify(feedback).includes('rawGraph'), false);
  assert.ok(feedback.errors.some((error) => error.code === 'unsafe_raw_payload'));
});

test('feedback renderer CLI emits text and JSON', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'akcb-feedback-'));
  try {
    const contractPath = path.join(tempRoot, 'ARCHITECTURE_CONTRACT_SLICE.json');
    const handoffPath = path.join(tempRoot, 'ARCHITECTURE_HANDOFF.json');
    await writeFile(contractPath, JSON.stringify(contract), 'utf8');
    await writeFile(handoffPath, JSON.stringify(handoff), 'utf8');
    const result = spawnSync(process.execPath, [
      'scripts/architecture-feedback-render.mjs',
      '--contract-slice',
      contractPath,
      '--handoff',
      handoffPath,
      '--violation-json',
      '{"constraintId":"constraint-no-client-token","sourceRef":"src/app/page.tsx"}',
      '--json',
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.artifactId, 'ARCHITECTURE_FEEDBACK');
    assert.ok(output.text.includes('ARCHITECTURE_CONTRACT_FAILED'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
