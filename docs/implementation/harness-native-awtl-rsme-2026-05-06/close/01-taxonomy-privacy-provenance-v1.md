# Phase 01: Taxonomy, Privacy, and Provenance Contract (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| AWTL-001 | 첨부 Summary | AWTL raw observation과 MemoryGraph compact fact 분리 | P01-1, P01-4 |
| AWTL-009 | Trace Store | `.claude/traces/`는 ignored artifact | P01-3 |
| AWTL-010 | Privacy Policy | fail-closed redaction, 금지/허용 저장 항목 | P01-2 |
| AWTL-011 | MemoryGraph Boundary | 승인된 compact fact만 provenance와 함께 승격 | P01-4 |
| AWTL-012 | MemoryGraph Boundary | `project-memory-agent`는 AWTL raw trace를 직접 조회하지 않음 | P01-4 |
| AWTL-013 | Phase 0 | taxonomy, privacy, provenance 정책 확정 | P01-1, P01-2, P01-4 |

## 목표
- AWTL/RSME 용어, failure taxonomy, privacy policy, MemoryGraph provenance boundary를 코드 구현 전에 고정한다.
- 첨부 문서의 taxonomy 개수 충돌과 `RSME` 약어 미정의를 열린 결정으로 닫거나 ADR로 기록한다.

## 기대 결과
- 실행자가 schema/sink를 만들기 전에 따라야 할 단일 계약 문서와 redaction helper skeleton이 생긴다.
- `.claude/traces/`가 버전 관리에 들어가지 않는다는 정책과 ignore 상태가 명확해진다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "02-schema-trace-sink-foundation-v1"
    - "03-native-harness-capture-v1"
    - "05-replay-gate-memory-promotion-v1"
  ownedPaths:
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
    - ".claude/scripts/lib/awtl-taxonomy.mjs"
    - ".claude/scripts/lib/awtl-redaction.mjs"
    - ".claude/scripts/lib/awtl-redaction.test.mjs"
    - ".gitignore"
  readOnlyPaths:
    - "/Users/seokgimoon/Downloads/Harness-native AWTL + RSME 최종 적용 계획.md"
    - ".claude/docs/guidelines/memorygraph-workflow.md"
    - ".claude/rules/security.md"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths:
    - ".gitignore"
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_policy"
  parallelBlockers:
    - "공유 정책/ignore/용어 결정을 후속 phase가 읽기 때문에 선행 순차 작업이어야 한다."
```

## 범위
- 포함:
  - `AWTL`, `RSME`, `event`, `span`, `action`, `memory candidate`, `promotion` 용어 정의
  - failure taxonomy v1 leaf count 결정
  - redaction fail-closed policy와 secret detection test seed
  - MemoryGraph provenance tag 정책
  - `.claude/traces/` ignore 정책
- 제외:
  - append-only JSONL sink 구현
  - phase runner wrapper capture 연결
  - replay probe 실행기와 MemoryGraph write 구현

## 선행조건과 입력
- 필수 문서:
  - `docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md`
  - `/Users/seokgimoon/Downloads/Harness-native AWTL + RSME 최종 적용 계획.md`
- 필수 코드/데이터:
  - `.gitignore`
  - `.claude/docs/guidelines/memorygraph-workflow.md`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P01-1 | Taxonomy와 `RSME` 용어 확정 | 1. 첨부 taxonomy leaf를 inventory로 옮김 2. 15개 이하 요구 충돌을 ADR 섹션에 기록 3. 최종 export를 `awtl-taxonomy.mjs`에 둠 | `awtl-taxonomy.mjs`가 category/class/leaf를 export하고 docs에 충돌 결정이 기록됨 |
| P01-2 | Privacy fail-closed helper 정의 | 1. 금지 저장 항목 test case 작성 2. redaction uncertain/drop/hash 결과 shape 정의 3. helper skeleton 구현 | secret-like string이 excerpt로 남지 않는 test가 실패 후 통과함 |
| P01-3 | Trace ignore 정책 반영 | 1. `.gitignore`에 `.claude/traces/` 추가 2. docs에 ignored artifact 명시 | `git check-ignore .claude/traces/example/agent_work_trace.jsonl`가 경로를 출력함 |
| P01-4 | MemoryGraph provenance boundary 문서화 | 1. raw trace 금지 2. provenance tag 목록 3. `project-memory-agent` raw lookup 금지 기록 | `awtl-rsme.md`에 promotion tags와 non-goals가 명시됨 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P01-1 | `.claude/scripts/lib/awtl-taxonomy.mjs` | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md` | none | `node --check .claude/scripts/lib/awtl-taxonomy.mjs` | Fail: syntax error. Pass: exit 0 |
| P01-2 | `.claude/scripts/lib/awtl-redaction.mjs`, `.claude/scripts/lib/awtl-redaction.test.mjs` | none | `.claude/scripts/lib/awtl-redaction.test.mjs` | `node --test .claude/scripts/lib/awtl-redaction.test.mjs` | Fail: secret appears in excerpt. Pass: all tests pass |
| P01-3 | none | `.gitignore` | none | `git check-ignore .claude/traces/example/agent_work_trace.jsonl` | Fail: no output. Pass: `.claude/traces/` ignore match output |
| P01-4 | none | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md` | none | `bash .claude/scripts/knowledge-repo-audit.sh` | Fail: structural doc audit error. Pass: audit exits 0 |

## Critical Product Scenarios
| Scenario | User-visible expectation | Command that proves it | Expected pass signal | Evidence path |
|---|---|---|---|---|
| SCN-P01-1 | Maintainer can read one guideline and understand that raw AWTL never goes to MemoryGraph | `rg -n "raw trace.*MemoryGraph|origin:awtl|validated_by" .claude/docs/guidelines/awtl-rsme.md` | Required boundary/provenance lines are found | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-taxonomy-privacy-provenance/QA_REPORT.md` |
| SCN-P01-2 | Secret-like payload is dropped or hashed, never excerpted | `node --test .claude/scripts/lib/awtl-redaction.test.mjs` | Test output reports pass | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-taxonomy-privacy-provenance/QA_REPORT.md` |
| SCN-P01-3 | Trace artifacts are ignored by git | `git check-ignore .claude/traces/example/agent_work_trace.jsonl` | Command prints ignored path | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-taxonomy-privacy-provenance/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: `RSME` naming or taxonomy count cannot be resolved without maintainer decision.
- First review checkpoint: before Phase 02 starts, review `.claude/docs/guidelines/awtl-rsme.md` and `awtl-taxonomy.mjs` together.
- Re-review trigger: any later phase adds a new failure class, provenance tag, or allowed stored field.
- Verification evidence path: `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-taxonomy-privacy-provenance/QA_REPORT.md`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/lib/awtl-taxonomy.mjs`
- [ ] Redaction tests: `node --test .claude/scripts/lib/awtl-redaction.test.mjs`
- [ ] Ignore policy: `git check-ignore .claude/traces/example/agent_work_trace.jsonl`
- [ ] Docs audit: `bash .claude/scripts/knowledge-repo-audit.sh`

## 완료 표시용 증거
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-taxonomy-privacy-provenance/QA_REPORT.md`
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-taxonomy-privacy-provenance/HANDOFF.md`

## 산출물
- `.claude/docs/guidelines/awtl-rsme.md`
- `.claude/docs/guidelines/awtl-rsme.ko.md`
- `.claude/scripts/lib/awtl-taxonomy.mjs`
- `.claude/scripts/lib/awtl-redaction.mjs`
- `.claude/scripts/lib/awtl-redaction.test.mjs`

## Phase 완료 체크리스트
- [ ] `RSME` 명칭과 taxonomy 개수 충돌이 문서에 결정 또는 열린 결정으로 기록됨
- [ ] privacy fail-closed helper test가 통과함
- [ ] `.claude/traces/` ignore evidence가 있음
- [ ] MemoryGraph raw trace 금지와 provenance tags가 문서화됨

## 핸드오프 메모
- Phase 02는 이 phase의 `awtl-redaction.mjs`와 `awtl-taxonomy.mjs`를 import해 schema/sink validation을 구현한다.
