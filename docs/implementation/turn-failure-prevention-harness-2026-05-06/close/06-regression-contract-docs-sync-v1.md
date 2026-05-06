# Phase 06: Regression Contract And Docs Sync (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| TFP-009 | Repo constraints | MemoryGraph transport failure는 workflow closeout을 막지 않음 | closeout evidence와 docs에 unavailable semantics 반영 |
| TFP-010 | Downloaded plan Test Plan | trace, turn, case, recall, promotion, regression 검증 | full regression suite와 phase closeout 업데이트 |

## 목표
- Phase 01-05 구현을 하네스 문서, skill contract, verification contract, phase closeout evidence에 반영한다.
- 기존 AWTL regression과 phase-runner boundary를 다시 실행해 재발 방지 루프가 shared harness를 깨지 않았음을 확인한다.

## 기대 결과
- 문서와 runtime behavior가 일치한다.
- phase closeout에는 trace hygiene, turn capture, failed turn case, recall brief, promotion/scorecard evidence가 모두 기록된다.
- unavailable MemoryGraph 상태가 completion failure로 오판되지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout"
  dependsOn:
    - "01-trace-hygiene-trace-root-guard"
    - "02-turn-identity-capture"
    - "03-failed-turn-case-builder"
    - "04-next-run-recall-brief"
    - "05-verified-memory-promotion-replay-scorecard"
  conflictsWith: []
  ownedPaths:
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
    - ".claude/docs/guidelines/memorygraph-workflow.md"
    - ".claude/docs/guidelines/memorygraph-workflow.ko.md"
    - ".claude/skills/failure-analyzer/SKILL.md"
    - ".claude/skills/failure-analyzer/SKILL.ko.md"
    - ".claude/skills/harness-memory-promoter/SKILL.md"
    - ".claude/skills/harness-memory-promoter/SKILL.ko.md"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/turn-failure-prevention-harness-2026-05-06/**"
  readOnlyPaths:
    - ".claude/scripts/**/*.mjs"
    - ".claude/schemas/*.json"
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout_patch"
```

## 범위
- 포함:
  - AWTL/MemoryGraph guideline update
  - failure-analyzer and harness-memory-promoter contract update
  - verification contract or closeout docs update if new commands/evidence are required
  - full regression evidence collection
  - master checklist update only for completed phases
- 제외:
  - 추가 runtime features
  - downstream project sync
  - memory artifact staging

## 선행조건과 입력
- Phase 01-05 완료 evidence.
- 모든 phase의 QA report, Scorecard, Handoff paths.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P06-1 | docs contract sync | 1) AWTL guideline에 failed turn loop 반영 2) MemoryGraph workflow에 verified-only write와 unavailable skip 반영 | docs match implemented behavior |
| P06-2 | skill contract sync | 1) failure-analyzer에 failure_turn/prevention hint target 추가 2) harness-memory-promoter에 denial/scorecard/write policy 추가 | skill trigger/output contract current |
| P06-3 | verification contract update | 1) 필요한 regression commands 추가 2) source-only completion 금지 유지 3) unavailable MemoryGraph semantics 명시 | closeout can verify new loop |
| P06-4 | full regression run | 1) targeted node tests 2) policy/audit/workflow 3) phase boundary/parity 4) plan conformance/closeout | all pass or explicit environment skip |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P06-1 | none | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md`, `.claude/docs/guidelines/memorygraph-workflow.md`, `.claude/docs/guidelines/memorygraph-workflow.ko.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass |
| P06-2 | none | `.claude/skills/failure-analyzer/SKILL.md`, `.claude/skills/failure-analyzer/SKILL.ko.md`, `.claude/skills/harness-memory-promoter/SKILL.md`, `.claude/skills/harness-memory-promoter/SKILL.ko.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass |
| P06-3 | none | `.claude/verification.contract.yaml` | closeout verifier | `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/turn-failure-prevention-harness-2026-05-06 --master-plan docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md` | closeout contract pass after phase evidence |
| P06-4 | none | phase evidence docs | all changed tests | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs .claude/scripts/lib/awtl-harness-capture.test.mjs .claude/scripts/lib/awtl-failure-attribution.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs .claude/scripts/lib/awtl-runtime-importers.test.mjs` | all targeted tests pass |

## Blockers And Review
- Blocker condition: phase evidence claims FULL while any critical command was skipped without explicit environment reason.
- First review checkpoint: docs must not promise automatic MemoryGraph write in normal phase runs.
- Re-review trigger: Phase 01-05 implementation changes after docs sync.
- Verification evidence path: `docs/implementation/turn-failure-prevention-harness-2026-05-06/execution/06-regression-contract-docs-sync-v1/QA_REPORT.md`

## Critical Product Scenarios
| Scenario ID | Flow | Required Evidence |
|---|---|---|
| SCN-TFP-P06-CONTRACT | Docs, skills, and verification contract describe the implemented failed-turn prevention loop. | QA report row marked pass with knowledge audit/workflow evidence. |
| SCN-TFP-P06-REGRESSION | Full regression covers trace, turn, failed case, recall, replay scorecard, promotion, and closeout. | QA report row marked pass with command evidence. |

## 검증 계획
- [ ] AWTL targeted tests: `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs .claude/scripts/lib/awtl-harness-capture.test.mjs .claude/scripts/lib/awtl-failure-attribution.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs .claude/scripts/lib/awtl-runtime-importers.test.mjs`
- [ ] new tests from phases 03-05: `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs .claude/scripts/lib/awtl-replay-scorecard.test.mjs`
- [ ] syntax checks: `node --check .claude/scripts/agent-loop-phase-runner.mjs .claude/scripts/awtl-failure-analyzer.mjs .claude/scripts/awtl-memory-promotion.mjs`
- [ ] repository audit: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] policy: `bash .claude/scripts/verify-code-policy.sh`
- [ ] workflow: `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] boundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] parity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`

## 완료 표시용 증거
- QA report에 command, exit status, skip reason, evidence path를 표로 기록한다.
- Master checklist는 각 phase evidence가 충족된 항목만 `[x]`로 업데이트한다.

## 산출물
- synced docs and skill contracts
- final regression evidence
- phase closeout-ready plan package

## Phase 완료 체크리스트
- [ ] docs/skills/verification contract가 current behavior와 일치함
- [ ] full regression evidence가 기록됨
- [ ] skipped check는 environment-specific reason으로 분리됨
- [ ] master checklist가 evidence 기준으로만 갱신됨

## 핸드오프 메모
- 이 phase 완료 뒤 `commit-moonshot`을 실행할 때도 `.claude/cache/**`, `.claude/traces/**`, `.claude/memorygraph/**`는 기본 staging 대상에서 제외한다.
