#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  canonicalizeCloseoutReason,
  canonicalizeNextPath,
  normalizeArtifactText,
  parseScenarioRowEvidence,
  scenarioEvidencePassed,
  sectionText,
} from './artifact-normalizer.mjs';

const MODE = process.argv[2] || 'self-test';

function testCanonicalBlockedFixture() {
  const qaText = `# QA REPORT

## Verdict
- Status: pass
- Summary: blocked round normalized
- Scope status: partial
- Next path: blocked
- Closeout reason: stop_and_handoff

## Finish Readiness
- Why this round may stop now: blocked round
- Remaining in-scope work: artifact normalization
- Remaining blockers before closeout: runtime pause
`;

  const handoffText = `# HANDOFF

## Resume Trigger
- Why this handoff exists: blocked round
- Stop reason: stop_and_handoff
- Why this cannot continue in the current round: dependency unresolved
- Condition to resume: artifact normalizer verified
`;

  const normalizedQa = normalizeArtifactText(qaText, { artifactType: 'qa' });
  const normalizedHandoff = normalizeArtifactText(handoffText, { artifactType: 'handoff' });

  assert.match(normalizedQa, /- Next path: resume_later_handoff/);
  assert.match(normalizedQa, /- Closeout reason: blocked/);
  assert.match(normalizedHandoff, /- Stop reason: blocked/);
  assert.equal(canonicalizeNextPath('stop_and_handoff'), 'resume_later_handoff');
  assert.equal(canonicalizeNextPath('blocked'), 'resume_later_handoff');
  assert.equal(canonicalizeCloseoutReason('stop_and_handoff'), 'blocked');
}

function testKoreanHeadingAliases() {
  const phaseDoc = `# Phase 02: Artifact Schema Normalizer (v1)

## 목표
- normalize artifacts

## 범위
- keep schema canonical

## 상세 작업
- do the work

## 정확한 실행 대상
| Item | Value |
|---|---|
| P02-1 | node .claude/scripts/artifact-normalizer.test.mjs |

## Phase 완료 체크리스트
- [ ] blocked QA/HANDOFF가 canonical schema로 생성 또는 정규화됨
`;

  assert.equal(sectionText(phaseDoc, 'Goal'), '- normalize artifacts');
  assert.equal(sectionText(phaseDoc, 'Scope'), '- keep schema canonical');
  assert.equal(sectionText(phaseDoc, 'Detailed Tasks'), '- do the work');
  assert.match(sectionText(phaseDoc, 'Exact Execution Targets'), /P02-1/);
  assert.match(sectionText(phaseDoc, 'Phase Completion Checklist'), /canonical schema/);
}

function testScenarioEvidenceParsing() {
  const evidence = `
SCN-HR-003 | pass | .claude/logs/agent-loop/artifact-normalizer-blocked.log
SCN-HR-004 | verified | .claude/logs/agent-loop/artifact-normalizer-korean.log
SCN-HR-005 | blocked | .claude/logs/agent-loop/artifact-normalizer-korean.log
`;

  assert.equal(scenarioEvidencePassed('SCN-HR-003', evidence), true);
  assert.equal(scenarioEvidencePassed('SCN-HR-004', evidence), true);
  assert.equal(scenarioEvidencePassed('SCN-HR-005', evidence), false);
  assert.deepEqual(parseScenarioRowEvidence('SCN-HR-003 | pass | .claude/logs/agent-loop/artifact-normalizer-blocked.log'), {
    scenarioId: 'SCN-HR-003',
    status: 'pass',
    evidencePath: '.claude/logs/agent-loop/artifact-normalizer-blocked.log',
  });
}

if (MODE === 'blocked-fixture') {
  testCanonicalBlockedFixture();
  process.stdout.write('artifact-normalizer blocked fixture passed\n');
} else if (MODE === 'korean-headings') {
  testKoreanHeadingAliases();
  testScenarioEvidenceParsing();
  process.stdout.write('artifact-normalizer korean headings test passed\n');
} else {
  testCanonicalBlockedFixture();
  testKoreanHeadingAliases();
  testScenarioEvidenceParsing();
  process.stdout.write('artifact-normalizer self-test passed\n');
}
