# Phase 05: Replay Gate and Memory Promotion (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| AWTL-002 | Summary Flow | candidate -> replay/human approval -> MemoryGraph fact | P05-1, P05-2 |
| AWTL-011 | MemoryGraph Boundary | only approved compact fact with provenance may be stored | P05-2, P05-3 |
| AWTL-012 | MemoryGraph Boundary | project-memory-agent reads promoted deltas, not raw trace | P05-3 |
| AWTL-018 | Phase 4 | probe manifest, promotion gate, blocked rules | P05-1, P05-2 |
| AWTL-020 | Test Plan | memory boundary, pollution, promotion precision, regression | P05-4 |

## 목표
- replay 또는 human approval이 없는 memory candidate를 MemoryGraph에 쓰지 못하게 한다.
- promotion provenance와 scope를 machine-checkable하게 만든다.

## 기대 결과
- `memory_update_candidates.jsonl`에서 승격 가능한 candidate만 compact fact로 변환된다.
- raw AWTL trace, transcript-only imported event, environment/flaky failure는 MemoryGraph promotion이 차단된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "04-failure-attribution-memory-candidate-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/awtl-replay-probes.mjs"
    - ".claude/scripts/lib/awtl-memory-promotion.mjs"
    - ".claude/scripts/lib/awtl-memory-promotion.test.mjs"
    - ".claude/scripts/awtl-memory-promotion.mjs"
    - ".claude/agents/harness-memory-promoter.md"
    - ".claude/agents/harness-memory-promoter.ko.md"
    - ".claude/skills/harness-memory-promoter/SKILL.md"
    - ".claude/skills/harness-memory-promoter/SKILL.ko.md"
    - ".claude/docs/guidelines/memorygraph-workflow.md"
    - ".claude/docs/guidelines/memorygraph-workflow.ko.md"
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
  readOnlyPaths:
    - ".claude/scripts/lib/awtl-memory-candidate.mjs"
    - ".claude/scripts/memorygraph-direct.mjs"
    - ".claude/scripts/commit-moonshot-memory-refresh.mjs"
  sharedMutablePaths:
    - ".claude/docs/guidelines/memorygraph-workflow.md"
    - ".claude/docs/guidelines/memorygraph-workflow.ko.md"
  requiresManualEvidence: true
  mergePolicy: "sequential_promotion_gate"
  parallelBlockers:
    - "MemoryGraph write boundary and approval semantics are shared policy."
```

## 범위
- 포함:
  - easy/hard/regression replay probe manifest shape
  - candidate promotion gate
  - compact fact conversion with provenance tags
  - human approval evidence path support
  - MemoryGraph unavailable non-blocking behavior
- 제외:
  - automatic approval
  - raw trace storage in MemoryGraph
  - transcript-only candidate promotion

## 선행조건과 입력
- 필수 문서:
  - `04-failure-attribution-memory-candidate-v1.md`
- 필수 코드/데이터:
  - `.claude/scripts/lib/awtl-memory-candidate.mjs`
  - candidate fixture from Phase 04
  - `.claude/docs/guidelines/memorygraph-workflow.md`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P05-1 | Replay probe manifest 구현 | 1. easy/hard/regression probe fields 정의 2. replay result parser 작성 3. regression 악화 감지 | failed regression probe blocks promotion |
| P05-2 | Promotion gate 구현 | 1. required gate fields 검사 2. replay 또는 human approval 요구 3. imported-only/env/flaky/harness blocker 유지 | incomplete candidate is blocked with reason |
| P05-3 | Compact fact/provenance writer 구현 | 1. raw trace 제거 2. compact fact shape 작성 3. tags: `project:<projectId>`, `source:moonshot`, `origin:awtl`, `origin_run:<runId>`, `origin_candidate:<candidateId>`, `validated_by:<method>` | promotion output contains provenance and no raw trace |
| P05-4 | MemoryGraph boundary regression | 1. direct write mocked test 2. MemoryGraph unavailable test 3. project-memory-agent raw lookup ban docs update | unavailable MemoryGraph does not block unrelated workflow; promotion itself reports failure |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P05-1 | `.claude/scripts/lib/awtl-replay-probes.mjs` | none | `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | Fail: regression worsening ignored. Pass: promotion blocked |
| P05-2 | `.claude/scripts/lib/awtl-memory-promotion.mjs` | none | `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | Fail: incomplete candidate promoted. Pass: blocked |
| P05-3 | `.claude/scripts/awtl-memory-promotion.mjs` | `.claude/skills/harness-memory-promoter/SKILL.md`, `.claude/agents/harness-memory-promoter.md` | `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --check .claude/scripts/awtl-memory-promotion.mjs` | Fail: syntax error. Pass: exit 0 |
| P05-4 | none | `.claude/docs/guidelines/memorygraph-workflow.md`, `.claude/docs/guidelines/awtl-rsme.md` | `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `bash .claude/scripts/knowledge-repo-audit.sh` | Fail: docs audit error. Pass: audit exits 0 |

## Critical Product Scenarios
| Scenario | User-visible expectation | Command that proves it | Expected pass signal | Evidence path |
|---|---|---|---|---|
| SCN-P05-1 | A candidate without replay or human approval cannot be promoted | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | no-approval fixture is blocked | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-replay-gate-memory-promotion/QA_REPORT.md` |
| SCN-P05-2 | Promoted fact contains provenance tags and no raw trace body | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | provenance/no-raw assertions pass | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-replay-gate-memory-promotion/QA_REPORT.md` |
| SCN-P05-3 | Imported-only or flaky/environment candidate remains blocked | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | blocker fixture passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-replay-gate-memory-promotion/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: human approval evidence format is not accepted by maintainer, or replay probe cannot identify pass/worsen state.
- First review checkpoint: before any MemoryGraph write path is enabled.
- Re-review trigger: new validation method, new provenance tag, or MemoryGraph backend API change.
- Verification evidence path: `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-replay-gate-memory-promotion/QA_REPORT.md`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/awtl-memory-promotion.mjs`
- [ ] Promotion tests: `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`
- [ ] Docs audit: `bash .claude/scripts/knowledge-repo-audit.sh`

## 완료 표시용 증거
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-replay-gate-memory-promotion/QA_REPORT.md`
- promotion gate fixture output path listed in QA report

## 산출물
- `.claude/scripts/lib/awtl-replay-probes.mjs`
- `.claude/scripts/lib/awtl-memory-promotion.mjs`
- `.claude/scripts/awtl-memory-promotion.mjs`
- updated harness memory promoter docs/skills

## Phase 완료 체크리스트
- [ ] replay/human approval is required before promotion
- [ ] compact fact includes provenance tags
- [ ] raw AWTL trace is not written to MemoryGraph
- [ ] imported-only and flaky/environment candidates are blocked

## 핸드오프 메모
- Phase 06 must verify importer events cannot bypass this promotion gate.
