import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildRemediationPacket,
  buildSourceHashManifest,
  computeSourceHash,
  defaultRemediationSourceRefs,
  formatRemediationPacketForPrompt,
  hasRemediationPacketReference,
  isRemediationPacketPath,
  readFreshRemediationPacket,
  writeRemediationPacket,
} from './phase-remediation-packet.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase-remediation-packet-'));
}

test('packet contains controller output, createdAt, source hash, manifest, and supersededBy field', () => {
  const root = tempRoot();
  try {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/phase.md'), '# Phase\n', 'utf8');
    fs.writeFileSync(path.join(root, 'SPRINT_CONTRACT.md'), '# Sprint\n', 'utf8');

    const packet = buildRemediationPacket({
      root,
      phaseNumber: 4,
      attemptNumber: 2,
      createdAt: '2026-05-13T00:00:00.000Z',
      sourceRefs: defaultRemediationSourceRefs({
        phaseDoc: 'docs/phase.md',
        sprintContract: 'SPRINT_CONTRACT.md',
        evidenceRefs: ['missing-verdict.json'],
      }),
      controllerOutput: {
        decision: 'rerun_verify',
        failedStage: 'verify',
        failedCases: [{ id: 'SCN-04-1', stage: 'verify', class: 'missing_verification_evidence', summary: 'verdict failed' }],
        improvementDirectives: [{ id: 'DIR-1', targetStage: 'verify', targetFiles: ['QA_REPORT.md'], instruction: 'rerun verifier', evidenceRequired: 'fresh verdict' }],
        evidenceRefs: ['QA_REPORT.md'],
        nextAttemptInput: {
          mustRead: ['QA_REPORT.md'],
          mustRerun: ['node --test .claude/scripts/lib/phase-remediation-packet.test.mjs'],
          prohibitedActions: ['do not use stale packet as evidence'],
          retryStrategy: 'same_direction_refine',
        },
      },
    });

    assert.equal(packet.schemaVersion, 1);
    assert.equal(packet.decision, 'rerun_verify');
    assert.equal(packet.phaseNumber, 4);
    assert.equal(packet.attemptNumber, 2);
    assert.equal(packet.createdAt, '2026-05-13T00:00:00.000Z');
    assert.equal(typeof packet.sourceHash, 'string');
    assert.equal(packet.sourceHash.length, 64);
    assert.equal(packet.sourceHashManifest.hashed.length, 2);
    assert.deepEqual(packet.sourceHashManifest.missing, ['missing-verdict.json']);
    assert.equal(packet.supersededBy, null);
    assert.equal(packet.failedCases[0].id, 'SCN-04-1');
    assert.equal(packet.improvementDirectives[0].instruction, 'rerun verifier');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('source hash manifest records missing refs without failing packet construction', () => {
  const root = tempRoot();
  try {
    fs.writeFileSync(path.join(root, 'existing.txt'), 'source\n', 'utf8');
    const manifest = buildSourceHashManifest(['existing.txt', 'absent.txt'], { root });

    assert.equal(manifest.hashed.length, 1);
    assert.equal(manifest.hashed[0].path, 'existing.txt');
    assert.deepEqual(manifest.missing, ['absent.txt']);
    assert.equal(computeSourceHash(manifest).length, 64);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fresh reader ignores stale and superseded remediation packets', () => {
  const root = tempRoot();
  try {
    fs.writeFileSync(path.join(root, 'phase.md'), 'v1\n', 'utf8');
    const packetPath = path.join(root, 'remediation-request.json');
    const packet = buildRemediationPacket({
      root,
      phaseNumber: 4,
      attemptNumber: 1,
      sourceRefs: ['phase.md'],
      controllerOutput: { decision: 'rerun_verify' },
    });
    writeRemediationPacket(packetPath, packet);

    assert.equal(readFreshRemediationPacket(packetPath, { root })?.sourceHash, packet.sourceHash);

    fs.writeFileSync(path.join(root, 'phase.md'), 'v2\n', 'utf8');
    assert.equal(readFreshRemediationPacket(packetPath, { root }), null);

    fs.writeFileSync(path.join(root, 'phase.md'), 'v1\n', 'utf8');
    writeRemediationPacket(packetPath, { ...packet, supersededBy: 'newer-packet' });
    assert.equal(readFreshRemediationPacket(packetPath, { root }), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prompt formatter includes fresh failed cases, directives, and retry controls', () => {
  const prompt = formatRemediationPacketForPrompt({
    decision: 'rerun_review',
    sourceDecisionId: 'decision-1',
    failedStage: 'review',
    failedCases: [{ id: 'CASE-1', stage: 'review', class: 'review_gap', summary: 'missing review evidence', command: 'node --test fixture.test.mjs' }],
    improvementDirectives: [{ id: 'DIR-1', instruction: 'record review completion', evidenceRequired: 'QA_REPORT.md review checkpoint' }],
    nextAttemptInput: {
      mustRead: ['QA_REPORT.md'],
      mustRerun: ['node --test fixture.test.mjs'],
      prohibitedActions: ['cite remediation packet as evidence'],
      retryStrategy: 'partial_redesign',
    },
  });

  assert.match(prompt, /CASE-1/);
  assert.match(prompt, /record review completion/);
  assert.match(prompt, /Must rerun: node --test fixture\.test\.mjs/);
  assert.match(prompt, /retry input only/);
});

test('remediation packet path classifier rejects packet-only completion evidence', () => {
  assert.equal(isRemediationPacketPath('docs/execution/remediation-request.json'), true);
  assert.equal(isRemediationPacketPath('docs/execution/remediation-request.123.superseded.json'), true);
  assert.equal(isRemediationPacketPath('docs/execution/QA_REPORT.md'), false);
  assert.equal(hasRemediationPacketReference('SCN-04-3 | passed | docs/execution/remediation-request.json'), true);
  assert.equal(hasRemediationPacketReference('SCN-04-3 | passed | docs/execution/QA_REPORT.md'), false);
});
