# Harness Reliability Improvement Master Plan v1

> 이 문서는 `harness-reliability-retro-2026-05-05` 개선 작업의 상위 계획이다.

## 소스 기준선
- `README.md` (역할: 범위/운영 배경)
- `CURRENT_FINDINGS.md` (역할: root cause와 개선 방향)
- `ISSUE_REGISTER.md` (역할: 요구사항/이슈 register)
- `WORK_LOG.md` (역할: replay-lens 장기 실행 증거)

## 목표
- replay-lens 장기 실행에서 드러난 하네스 실패를 `claude-settings` 하네스 개선 작업으로 분리한다.
- strict completion gate는 유지하되, capability blocker, environment failure, artifact schema mismatch, external daemon dependency를 조기에 분리한다.
- 동일 실패 반복을 줄이고, blocked handoff도 verifier가 읽을 수 있는 canonical artifact로 만든다.
- runtime parity fixture와 archive/status truth source가 원본 fixture를 오염시키지 않도록 막는다.
- wall-clock, runner active, verification, remediation, blocked/manual closeout 시간을 분리해 운영 비용을 설명 가능하게 만든다.

## Non-goals
- `C:\dev\replay-lens` 제품 코드를 이 저장소로 옮기지 않는다.
- completion gate를 완화하거나 Docker daemon 없는 deployment smoke를 fake pass 처리하지 않는다.
- public sharing, billing, production GPU scaling 같은 제품 scope를 하네스 개선에 섞지 않는다.

## Phase 인덱스
| Phase | 제목 | 계획 파일 | 선행 의존성 |
|---|---|---|---|
| 01 | Capability and Fingerprint Foundation | `docs/implementation/harness-reliability-retro-2026-05-05/01-capability-fingerprint-foundation-v1.md` | - |
| 02 | Artifact Schema Normalizer | `docs/implementation/harness-reliability-retro-2026-05-05/02-artifact-schema-normalizer-v1.md` | Phase 01 |
| 03 | Runtime Parity Fixture and Archive Safety | `docs/implementation/harness-reliability-retro-2026-05-05/03-runtime-parity-fixture-archive-safety-v1.md` | Phase 01 |
| 04 | Runtime Resolver and Dependency Gates | `docs/implementation/harness-reliability-retro-2026-05-05/04-runtime-resolver-and-dependency-gates-v1.md` | Phase 01, Phase 02 |
| 05 | Timing Telemetry and Diagnosis Trace | `docs/implementation/harness-reliability-retro-2026-05-05/05-timing-telemetry-trace-v1.md` | Phase 01, Phase 04 |
| 06 | Regression Fixtures and Docs Sync | `docs/implementation/harness-reliability-retro-2026-05-05/06-regression-fixtures-and-doc-sync-v1.md` | Phase 02, Phase 03, Phase 04, Phase 05 |

## 실행 순서 메모
- Phase 01은 shared classifier/preflight 기반을 만들기 때문에 첫 단계로 고정한다.
- Phase 02와 Phase 03은 Phase 01 이후 병렬 가능하다. artifact schema와 runtime parity fixture/archive 경계가 disjoint path를 가진다.
- Phase 04는 runner retry/fallback 정책을 건드리므로 Phase 02의 canonical artifact enum 이후 실행한다.
- Phase 05는 Phase 04의 requested/effective runtime과 blocker fingerprint를 timing trace에 싣는다.
- Phase 06은 전체 regression fixture, documentation, audit closeout이므로 마지막에만 실행한다.

## 병렬 실행 계획
| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | shared policy foundation 생성 |
| wave-2 | 02, 03 | parallel | `ownedPaths`가 artifact schema와 parity/archive로 분리됨 |
| wave-3 | 04 | sequential | runner retry/fallback shared path 수정 |
| wave-4 | 05 | sequential | runner/state/trace timing 연결 |
| wave-5 | 06 | sequential | 모든 회귀 fixture와 문서 closeout |

## 소스 추적 매트릭스
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|
| HR-001 | ISSUE_REGISTER | phase 시작 전 capability matrix 필요 | 01 | `01-capability-fingerprint-foundation-v1.md` | mapped |
| HR-002 | ISSUE_REGISTER | 동일 environment failure retry 억제 | 01 | `01-capability-fingerprint-foundation-v1.md` | mapped |
| HR-003 | ISSUE_REGISTER | sandbox/codex 실패와 host 통과를 공식 fallback으로 표현 | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-004 | ISSUE_REGISTER | implementation verification과 meta verifier 분리 | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-005 | ISSUE_REGISTER | runtime parity fixture side effect 제거 | 03 | `03-runtime-parity-fixture-archive-safety-v1.md` | mapped |
| HR-006 | ISSUE_REGISTER | archivedPhaseDoc pollution 방지 | 03 | `03-runtime-parity-fixture-archive-safety-v1.md` | mapped |
| HR-007 | ISSUE_REGISTER | Windows path handling을 `fileURLToPath`로 고정 | 06 | `06-regression-fixtures-and-doc-sync-v1.md` | mapped |
| HR-008 | ISSUE_REGISTER | Korean heading alias canonicalization | 02 | `02-artifact-schema-normalizer-v1.md` | mapped |
| HR-009 | ISSUE_REGISTER | QA generator와 workflow-enforcement schema drift 제거 | 02 | `02-artifact-schema-normalizer-v1.md` | mapped |
| HR-010 | ISSUE_REGISTER | blocked state enum canonicalization | 02 | `02-artifact-schema-normalizer-v1.md` | mapped |
| HR-011 | ISSUE_REGISTER | verdict writer runtime wrapper | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-012 | ISSUE_REGISTER | pnpm/corepack/host equivalent resolver | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-013 | ISSUE_REGISTER | corepack cache/network blocker 분리 | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-014 | ISSUE_REGISTER | Python/pytest runtime resolver contract | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-015 | ISSUE_REGISTER | git EPERM preflight와 host route | 01 | `01-capability-fingerprint-foundation-v1.md` | mapped |
| HR-016 | ISSUE_REGISTER | bash access denied preflight와 no-retry blocker | 01 | `01-capability-fingerprint-foundation-v1.md` | mapped |
| HR-017 | ISSUE_REGISTER | docker compose config와 daemon smoke 분리 | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-018 | ISSUE_REGISTER | Docker daemon retry waste 제거 | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-019 | ISSUE_REGISTER | sameFailureClassCount 정책 강제 | 01 | `01-capability-fingerprint-foundation-v1.md` | mapped |
| HR-020 | ISSUE_REGISTER | phase-status.yaml authoritative traversal | 03 | `03-runtime-parity-fixture-archive-safety-v1.md` | mapped |
| HR-021 | ISSUE_REGISTER | wall-clock과 active time 분리 | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-022 | ISSUE_REGISTER | retry time attribution 분리 | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-023 | ISSUE_REGISTER | host manual closeout 비용 기록 | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-024 | ISSUE_REGISTER | oversized raw logs를 trace bundle로 압축 | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-025 | ISSUE_REGISTER | diagnosis manifest로 truth source 정리 | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-026 | ISSUE_REGISTER | product phase와 harness 개선 분리 | 06 | `06-regression-fixtures-and-doc-sync-v1.md` | mapped |
| HR-027 | ISSUE_REGISTER | blocked QA/HANDOFF generator | 02 | `02-artifact-schema-normalizer-v1.md` | mapped |
| HR-028 | ISSUE_REGISTER | SCN evidence parser/template 통합 | 02 | `02-artifact-schema-normalizer-v1.md` | mapped |
| HR-029 | ISSUE_REGISTER | approved equivalent command policy | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-030 | ISSUE_REGISTER | requested/effective runtime split 강화 | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-031 | ISSUE_REGISTER | dependency-aware phase gate | 04 | `04-runtime-resolver-and-dependency-gates-v1.md` | mapped |
| HR-032 | ISSUE_REGISTER | total/planned/remaining counter 분리 | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-033 | ISSUE_REGISTER | network blocker classifier | 01 | `01-capability-fingerprint-foundation-v1.md` | mapped |
| HR-034 | ISSUE_REGISTER | final audit partial-mode option 검토 | 06 | `06-regression-fixtures-and-doc-sync-v1.md` | mapped |
| HR-035 | ISSUE_REGISTER | reusable verification result import | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-036 | ISSUE_REGISTER | stale/superseded verdict enforcement | 05 | `05-timing-telemetry-trace-v1.md` | mapped |
| HR-037 | ISSUE_REGISTER | ignored evidence include policy | 06 | `06-regression-fixtures-and-doc-sync-v1.md` | mapped |
| HR-038 | ISSUE_REGISTER | docs structural audit after external write | 06 | `06-regression-fixtures-and-doc-sync-v1.md` | mapped |

## 매핑되지 않은 소스 요구사항
- 없음. `ISSUE_REGISTER.md`의 HR-001부터 HR-038까지 모두 phase에 배정했다.

## Phase 완료 체크리스트
- [x] Phase 01 - Capability and Fingerprint Foundation (`01-capability-fingerprint-foundation-v1.md`)
- [x] Phase 02 - Artifact Schema Normalizer (`02-artifact-schema-normalizer-v1.md`)
- [x] Phase 03 - Runtime Parity Fixture and Archive Safety (`03-runtime-parity-fixture-archive-safety-v1.md`)
- [x] Phase 04 - Runtime Resolver and Dependency Gates (`04-runtime-resolver-and-dependency-gates-v1.md`)
- [x] Phase 05 - Timing Telemetry and Diagnosis Trace (`05-timing-telemetry-trace-v1.md`)
- [x] Phase 06 - Regression Fixtures and Docs Sync (`06-regression-fixtures-and-doc-sync-v1.md`)

## 완료 규칙
- 각 phase 계획의 완료 기준과 fresh verification evidence가 충족될 때만 체크한다.
- blocked 상태는 failure가 아니라 `resume_later_handoff` artifact가 verifier를 통과할 때만 인정한다.
- `phase-status.yaml`과 verdict/QA/HANDOFF/SCORECARD evidence가 상충하면 완료로 선언하지 않는다.
- source fixture 오염, stale verdict 공존, ignored evidence 누락이 있으면 Phase 06 완료 전까지 closeout하지 않는다.
