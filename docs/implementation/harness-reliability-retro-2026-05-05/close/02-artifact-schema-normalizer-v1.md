# Phase 02: Artifact Schema Normalizer (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HR-008 | ISSUE_REGISTER | Korean heading parsing gap | heading alias table 추가 |
| HR-009 | ISSUE_REGISTER | QA schema drift | shared schema/normalizer 추가 |
| HR-010 | ISSUE_REGISTER | blocked state enum mismatch | canonical enum으로 변환 |
| HR-027 | ISSUE_REGISTER | blocked closeout quality | blocked QA/HANDOFF generator 보강 |
| HR-028 | ISSUE_REGISTER | SCN evidence format sensitivity | parser와 template 통합 |

## 목표
- QA_REPORT, HANDOFF, SCORECARD, SCENARIO_MATRIX가 clean/blocked/retry 상태 모두에서 verifier가 읽는 동일 schema를 사용하게 한다.
- blocked state를 `Next path: resume_later_handoff`, `Closeout reason: blocked`로 canonicalize한다.
- Korean phase docs의 주요 heading alias를 plan conformance와 closeout verifier가 인식하게 한다.

## 기대 결과
- blocked QA/HANDOFF도 `workflow-enforcement verify`를 통과한다.
- `SCN-ID | pass | evidence path` 형식이 template과 parser 양쪽에서 동일하게 다뤄진다.
- generator와 verifier가 허용 enum을 서로 다르게 갖지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2-artifact-schema"
  dependsOn:
    - "01-capability-fingerprint-foundation-v1"
  conflictsWith:
    - "04-runtime-resolver-and-dependency-gates-v1"
  ownedPaths:
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/verify-plan-conformance.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/artifact-normalizer.mjs"
    - ".claude/scripts/artifact-normalizer.test.mjs"
    - ".claude/templates/execution/QA_REPORT.template.md"
    - ".claude/templates/execution/HANDOFF.template.md"
    - ".claude/templates/execution/SCENARIO_MATRIX.template.md"
  readOnlyPaths:
    - "docs/implementation/harness-reliability-retro-2026-05-05/CURRENT_FINDINGS.md"
    - ".claude/templates/execution/SCORECARD.template.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## 범위
- 포함:
  - allowed `Next path`와 `Closeout reason` enum을 단일 source로 정리
  - blocked QA/HANDOFF normalizer 또는 generator 구현
  - Korean heading alias table 추가
  - SCN evidence parser 강화
- 제외:
  - runner retry suppression 정책
  - runtime parity fixture 이동 로직

## 선행조건과 입력
- Phase 01 classifier naming을 사용한다.
- 기존 enforcement entrypoint:
  - `.claude/scripts/workflow-enforcement.mjs`
  - `.claude/scripts/verify-plan-conformance.mjs`
  - `.claude/scripts/verify-phase-closeout.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P02-1 | artifact schema constants 추가 | 1) allowed enum을 module로 분리 2) workflow/closeout/verdict parser에서 공유 | enum drift가 test로 막힘 |
| P02-2 | blocked artifact normalizer 추가 | 1) legacy `blocked`/`stop_and_handoff`를 canonical value로 변환 2) 필수 section 채움 3) placeholder는 실패 처리 | blocked QA/HANDOFF가 verifier 통과 |
| P02-3 | Korean heading alias와 SCN parser 강화 | 1) `목표`, `범위`, `상세 작업`, `정확한 실행 대상`, `Phase 완료 체크리스트` alias 추가 2) `SCN-ID | pass | evidence path` 인식 | Korean phase fixture conformance 통과 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P02-1 | `.claude/scripts/artifact-normalizer.mjs` | `.claude/scripts/workflow-enforcement.mjs` | `.claude/scripts/artifact-normalizer.test.mjs` | `node .claude/scripts/artifact-normalizer.test.mjs` | `artifact-normalizer self-test passed` |
| P02-2 | 없음 | `.claude/templates/execution/QA_REPORT.template.md`, `.claude/templates/execution/HANDOFF.template.md` | `.claude/scripts/artifact-normalizer.test.mjs` | `node .claude/scripts/artifact-normalizer.test.mjs blocked-fixture` | blocked fixture passes |
| P02-3 | 없음 | `.claude/scripts/verify-plan-conformance.mjs`, `.claude/scripts/verify-phase-closeout.mjs`, `.claude/templates/execution/SCENARIO_MATRIX.template.md` | `.claude/scripts/artifact-normalizer.test.mjs` | `node --check .claude/scripts/verify-plan-conformance.mjs` | exit code 0 |

## Critical Product Scenarios
| SCN ID | 사용자 기대 | 증명 명령 | Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-HR-003 | blocked phase도 handoff-ready artifact로 닫힌다 | `node .claude/scripts/artifact-normalizer.test.mjs blocked-fixture` | `Next path: resume_later_handoff` accepted | `.claude/logs/agent-loop/artifact-normalizer-blocked.log` |
| SCN-HR-004 | Korean phase docs가 false fail을 만들지 않는다 | `node .claude/scripts/artifact-normalizer.test.mjs korean-headings` | heading alias test passed | `.claude/logs/agent-loop/artifact-normalizer-korean.log` |

## Blockers And Review
- Blocker condition: clean finish 필수 필드가 normalizer 때문에 완화되면 중단한다.
- First review checkpoint: enum constants를 verifier/generator가 공유하는지 확인한다.
- Re-review trigger: `workflow-enforcement.mjs`의 completion gate branch 변경 시 재리뷰한다.
- Verification evidence path: `.claude/logs/agent-loop/artifact-normalizer-*.log`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/workflow-enforcement.mjs`
- [ ] Syntax: `node --check .claude/scripts/verify-phase-closeout.mjs`
- [ ] Unit: `node .claude/scripts/artifact-normalizer.test.mjs`
- [ ] Smoke: blocked QA/HANDOFF fixture가 `workflow-enforcement verify` equivalent path를 통과

## 완료 표시용 증거
- `.claude/logs/agent-loop/artifact-normalizer-*.log`
- blocked QA/HANDOFF fixture diff
- updated execution templates

## 산출물
- artifact normalizer
- shared closeout enum/schema
- Korean heading and SCN evidence parser coverage

## Phase 완료 체크리스트
- [ ] blocked QA/HANDOFF가 canonical schema로 생성 또는 정규화됨
- [ ] verifier와 generator의 allowed enum이 drift하지 않음
- [ ] Korean heading alias와 SCN evidence fixture가 통과함

## 핸드오프 메모
- Phase 04 runner fallback은 이 phase의 canonical `resume_later_handoff` schema를 사용해야 한다.
