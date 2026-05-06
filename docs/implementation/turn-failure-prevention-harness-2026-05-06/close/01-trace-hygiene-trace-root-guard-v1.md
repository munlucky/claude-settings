# Phase 01: Trace Hygiene And Trace Root Guard (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| TFP-002 | Downloaded plan P0 Safety | trace artifact 유출과 nested trace root를 hard fail | policy, gitignore, trace root resolver로 차단 |
| TFP-010 | Downloaded plan Test Plan | trace hygiene 검증 | tracked fixture, normal source, nested root 테스트 |

## 목표
- `.claude/traces/**`와 nested `.claude/.claude/traces/**`가 tracked source나 staging 후보에 들어오지 못하게 한다.
- AWTL trace sink가 repo root 기준 `.claude/traces/<run-id>/` 밖으로 쓰지 못하게 한다.

## 기대 결과
- 현재 tracked `.claude/.claude/traces/self-test-*` artifact는 제거 대상이 된다.
- `verify-code-policy`가 forbidden trace artifact를 source policy violation으로 보고한다.
- trace sink는 nested trace root를 fail-fast 한다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "02-turn-identity-capture"
    - "03-failed-turn-case-builder"
  ownedPaths:
    - ".gitignore"
    - ".claude/scripts/verify-code-policy.mjs"
    - ".claude/scripts/lib/awtl-trace-sink.mjs"
    - ".claude/scripts/lib/awtl-trace-sink.test.mjs"
    - ".claude/.claude/traces/**"
  readOnlyPaths:
    - ".claude/schemas/awtl-event-v1.schema.json"
    - ".claude/scripts/lib/awtl-harness-capture.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness_patch"
```

## 범위
- 포함:
  - `.gitignore`에 nested trace/raw trace artifact 방어 패턴 추가
  - `verify-code-policy`에 tracked/changed forbidden trace path check 추가
  - `awtl-trace-sink` trace root resolver 정규화와 fail-fast 추가
  - tracked nested trace artifact 제거
- 제외:
  - AWTL event schema 변경
  - MemoryGraph promotion 로직 변경
  - phase runner prompt 변경

## 선행조건과 입력
- 필수 문서:
  - `docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md`
- 필수 코드/데이터:
  - 현재 tracked trace artifact 목록은 `git ls-files .claude/.claude/traces .claude/traces`로 확인한다.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P01-1 | forbidden trace path policy 추가 | 1) `verify-code-policy.mjs`에 path-only violation collector 추가 2) `git ls-files`와 candidate files 모두 검사 | forbidden artifact가 있으면 exit 1 |
| P01-2 | ignore 방어 패턴 추가 | 1) `.gitignore`에 nested trace/raw judge patterns 추가 2) normal cache ignore와 충돌 없는지 확인 | trace artifacts가 untracked noise로 남지 않음 |
| P01-3 | trace root guard 추가 | 1) `resolveTracePaths`에서 repo root 기준 expected root 검증 2) nested `.claude/.claude/traces`와 repo 외부 path reject | nested trace root test가 실패 신호를 검증 |
| P01-4 | tracked trace artifact 제거 | 1) `.claude/.claude/traces/self-test-*` tracked files 제거 2) policy check 재실행 | `git ls-files .claude/.claude/traces`가 empty |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P01-1 | none | `.claude/scripts/verify-code-policy.mjs` | none | `node .claude/scripts/verify-code-policy.mjs .claude/.claude/traces/self-test-1778036826516/agent_work_trace.jsonl` | forbidden trace path violation으로 exit 1 |
| P01-2 | none | `.gitignore` | none | `git status --short --ignored .claude/.claude/traces .claude/traces` | trace runtime files는 ignored 또는 tracked removal로만 표시 |
| P01-3 | none | `.claude/scripts/lib/awtl-trace-sink.mjs` | `.claude/scripts/lib/awtl-trace-sink.test.mjs` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` | nested root reject test 포함 pass |
| P01-4 | none | tracked trace artifact removal | none | `git ls-files .claude/.claude/traces .claude/traces` | output empty |

## Blockers And Review
- Blocker condition: `verify-code-policy`가 normal source files까지 forbidden trace로 오탐하면 중단한다.
- First review checkpoint: trace path matcher가 Windows `\`와 POSIX `/`를 모두 normalize하는지 확인한다.
- Re-review trigger: `.claude/traces` 기본 경로 또는 trace file names가 바뀌면 재검토한다.
- Verification evidence path: `docs/implementation/turn-failure-prevention-harness-2026-05-06/execution/01-trace-hygiene-trace-root-guard-v1/QA_REPORT.md`

## Critical Product Scenarios
| Scenario ID | Flow | Required Evidence |
|---|---|---|
| SCN-TFP-P01-TRACE-GUARD | Trace policy rejects nested trace roots and prevents tracked trace leakage. | QA report row marked pass with trace sink and code policy evidence. |

## 검증 계획
- [ ] 정책 검증: `node .claude/scripts/verify-code-policy.mjs .claude/.claude/traces/self-test-1778036826516/agent_work_trace.jsonl`
- [ ] trace sink 테스트: `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs`
- [ ] tracked artifact 확인: `git ls-files .claude/.claude/traces .claude/traces`
- [ ] 전체 정책 smoke: `bash .claude/scripts/verify-code-policy.sh`

## 완료 표시용 증거
- `QA_REPORT.md`에 forbidden trace fixture 실패, normal policy pass, tracked artifact empty 결과를 기록한다.
- `SCORECARD.md`에 TFP-002, TFP-010 pass를 기록한다.

## 산출물
- hardened trace ignore/policy/root guard
- tracked nested trace artifact removal

## Phase 완료 체크리스트
- [ ] forbidden trace path policy가 동작함
- [ ] nested trace root가 fail-fast 됨
- [ ] tracked trace artifact가 제거됨
- [ ] 검증 체크를 통과함

## 핸드오프 메모
- Phase 02는 이 phase 완료 뒤 `turn_id` capture를 추가한다. trace sink guard 실패가 남아 있으면 Phase 02를 시작하지 않는다.
