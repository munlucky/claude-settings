# Phase 04: Next Run Recall Brief (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| TFP-001 | Downloaded plan Summary | 실패 턴 hint를 다음 작업에 활용 | phase runner preflight brief로 주입 |
| TFP-005 | Downloaded plan Next-Run Recall | matching case만 compact summary로 주입 | matcher, limiter, prompt section 추가 |
| TFP-010 | Downloaded plan Test Plan | unrelated case 제외와 최대 5개 제한 | recall unit tests와 prompt build checks |

## 목표
- 다음 phase run 시작 전 최근 failed turn cases를 read-only로 조회한다.
- 현재 phase/stage/artifact/failure type과 겹치는 case만 `Failure Prevention Brief`로 주입한다.

## 기대 결과
- MemoryGraph가 unavailable이어도 cache-based recall은 동작한다.
- unrelated case는 prompt에 들어가지 않는다.
- brief는 raw JSON이 아니라 최대 5개의 1문장 bullet로 제한된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "03-failed-turn-case-builder"
  conflictsWith:
    - "05-verified-memory-promotion-replay-scorecard"
  ownedPaths:
    - ".claude/scripts/lib/awtl-failure-prevention-brief.mjs"
    - ".claude/scripts/lib/awtl-failure-prevention-brief.test.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - ".claude/skills/moonshot-phase-runner/SKILL.ko.md"
  readOnlyPaths:
    - ".claude/scripts/lib/awtl-failed-turn-case.mjs"
    - ".claude/cache/awtl/failed_turn_cases.jsonl"
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - ".claude/skills/moonshot-phase-runner/SKILL.ko.md"
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness_patch"
```

## 범위
- 포함:
  - failed turn case loader/matcher/brief formatter
  - phase runner prompt build 전 read-only preflight
  - `Failure Prevention Brief` prompt section 추가
  - low-confidence/imported-only handling
- 제외:
  - MemoryGraph read dependency
  - case generation
  - automatic write/promotion

## 선행조건과 입력
- Phase 03 완료.
- `.claude/cache/awtl/failed_turn_cases.jsonl`이 없으면 no-op brief로 통과해야 한다.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P04-1 | case recall matcher 구현 | 1) case cache read 2) phase doc/artifact/stage/failure type matching 3) replay scorecard stale filter hook 준비 | matching/unrelated tests pass |
| P04-2 | brief formatter 구현 | 1) 최대 5개 제한 2) item당 1문장 제한 3) raw JSON 금지 4) confidence label 처리 | formatted brief snapshot pass |
| P04-3 | runner prompt injection | 1) `buildPhasePrompt` 입력에 brief 추가 2) no case/no cache는 prompt 변경 최소화 3) warnings only logging | runner syntax and prompt test pass |
| P04-4 | skill docs sync | 1) phase-runner skill에 recall preflight 계약 추가 2) Korean mirror sync | docs reflect runtime behavior |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P04-1 | `.claude/scripts/lib/awtl-failure-prevention-brief.mjs` | none | `.claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | matching/unrelated tests pass |
| P04-2 | none | `.claude/scripts/lib/awtl-failure-prevention-brief.mjs` | `.claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | max 5 and raw JSON exclusion pass |
| P04-3 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | existing runner checks | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | syntax pass |
| P04-4 | none | `.claude/skills/moonshot-phase-runner/SKILL.md`, `.claude/skills/moonshot-phase-runner/SKILL.ko.md` | docs review | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass |

## Blockers And Review
- Blocker condition: prompt includes raw failed case JSON, raw trace path contents, prompt body, or more than 5 items.
- First review checkpoint: unrelated case filtering must be conservative; false positives are more harmful than missing a hint.
- Re-review trigger: phase runner prompt template changes or replay scorecard schema changes.
- Verification evidence path: `docs/implementation/turn-failure-prevention-harness-2026-05-06/execution/04-next-run-recall-brief-v1/QA_REPORT.md`

## Critical Product Scenarios
| Scenario | Required Evidence | Pass Signal |
|----------|-------------------|-------------|
| SCN-P04-01 | Failed-turn cache contains one matching and one unrelated case | matcher selects only the matching case |
| SCN-P04-02 | Prompt is built with a matching failed-turn case | prompt includes compact `Failure Prevention Brief` and excludes raw JSON |
| SCN-P04-03 | Failed-turn cache is missing | recall path is no-op and prompt can still be built |

## Critical Product Scenarios
| Scenario ID | Flow | Required Evidence |
|---|---|---|
| SCN-TFP-P04-BRIEF | Phase prompt receives only matching compact prevention hints and omits raw JSON. | QA report row marked pass with prevention brief evidence. |

## 검증 계획
- [x] recall unit: `node --test .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs`
- [x] runner syntax: `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [x] knowledge audit: `bash .claude/scripts/knowledge-repo-audit.sh`
- [x] workflow verify: `bash .claude/scripts/workflow-enforcement.sh verify <phase-04 changed files>`

## 완료 표시용 증거
- QA report에 matching case included, unrelated case excluded, no-cache no-op 결과를 기록한다.
- Prompt excerpt는 `Failure Prevention Brief` section만 compact하게 기록한다.

## 산출물
- next-run failure prevention brief engine
- phase runner prompt injection contract

## Phase 완료 체크리스트
- [x] case matcher가 관련 case만 선택함
- [x] brief가 최대 5개 1문장 항목으로 제한됨
- [x] MemoryGraph unavailable과 no-cache 상태가 no-op으로 통과함
- [x] 검증 체크를 통과함

## 핸드오프 메모
- Phase 05는 replay scorecard 결과를 matcher에 반영한다. Phase 04에서는 scorecard hook만 만들고 promotion decision은 구현하지 않는다.
