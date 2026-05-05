# Phase 06: Regression Fixtures and Docs Sync (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HR-007 | ISSUE_REGISTER | Windows path handling bug | regression fixture와 audit |
| HR-026 | ISSUE_REGISTER | product/harness 개선 혼재 | docs boundary 명시 |
| HR-034 | ISSUE_REGISTER | final audit partial-mode option | blocker-aware final audit policy 검토 |
| HR-037 | ISSUE_REGISTER | ignored artifact handling | evidence include policy 문서화 |
| HR-038 | ISSUE_REGISTER | docs structural audit | knowledge audit와 guideline sync |

## 목표
- Phase 01-05에서 구현한 정책을 replay-lens 장기 실행 이슈에 대응하는 regression fixture로 고정한다.
- 하네스 개선 범위와 downstream product phase 범위를 문서에서 분리한다.
- docs/guidelines와 verification contract가 새 capability/fallback/artifact/timing 정책을 설명하게 한다.

## 기대 결과
- bash unavailable, git EPERM, pnpm equivalent, Docker daemon missing, parity fixture mutation, blocked QA, SCN evidence format fixture가 모두 존재한다.
- `knowledge-repo-audit`와 Node/Python syntax checks로 docs/scripts drift를 잡는다.
- ignored evidence include policy가 closeout 절차에 명시된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5-regression-docs"
  dependsOn:
    - "02-artifact-schema-normalizer-v1"
    - "03-runtime-parity-fixture-archive-safety-v1"
    - "04-runtime-resolver-and-dependency-gates-v1"
    - "05-timing-telemetry-trace-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/*test*.mjs"
    - ".claude/docs/guidelines/long-running-harness.md"
    - ".claude/docs/guidelines/meta-harness-trace.md"
    - ".claude/docs/guidelines/verification-contract.md"
    - ".claude/docs/guidelines/codex-fallback.md"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/harness-reliability-retro-2026-05-05/"
  readOnlyPaths:
    - ".claude/scripts/knowledge-repo-audit.sh"
    - ".claude/scripts/verify-phase-runner-boundary.sh"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "final_integrated_patch"
```

## 범위
- 포함:
  - regression fixture matrix
  - docs/guidelines sync
  - Windows path handling audit
  - evidence include policy
  - final audit partial-mode decision note
- 제외:
  - replay-lens Phase 07 실제 Docker daemon 재개
  - downstream product source changes

## 선행조건과 입력
- Phase 01-05 완료 또는 구현 branch 통합본
- retro baseline docs in `docs/implementation/harness-reliability-retro-2026-05-05/`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P06-1 | regression fixture suite 작성 | 1) 7개 fixture 작성 2) 각 fixture expected decision 명시 3) scripts self-test에 연결 | fixture matrix all pass |
| P06-2 | docs/guidelines sync | 1) long-running harness 2) codex fallback 3) verification contract 4) meta-harness trace 업데이트 | docs가 새 policy를 설명 |
| P06-3 | Windows path and evidence policy audit | 1) `new URL(import.meta.url).pathname` 검색 2) ignored evidence include policy 문서화 3) audit result 기록 | path bug 재발 방지와 evidence staging 기준 명확 |
| P06-4 | final audit partial-mode decision | 1) Docker 같은 external blocker에서 final audit partial-mode 허용 조건 검토 2) fake pass 금지 조건 기록 | blocker-aware audit policy 결정 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P06-1 | fixture files under `.claude/scripts/` test scope | existing test entrypoints | `.claude/scripts/*test*.mjs` | `node .claude/scripts/lib/failure-classifier.test.mjs && node .claude/scripts/lib/command-resolver.test.mjs && node .claude/scripts/artifact-normalizer.test.mjs` | all self-tests passed |
| P06-2 | 없음 | `.claude/docs/guidelines/long-running-harness.md`, `.claude/docs/guidelines/meta-harness-trace.md`, `.claude/docs/guidelines/verification-contract.md`, `.claude/docs/guidelines/codex-fallback.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass or environment blocker classified |
| P06-3 | docs note in this plan dir | `.claude/verification.contract.yaml` | path audit fixture | `Select-String -Path .claude\\scripts\\*.mjs -Pattern \"new URL\\(import.meta.url\\)\\.pathname\"` | no unsafe occurrences or documented exception |
| P06-4 | decision note in `CURRENT_FINDINGS.md` or follow-up doc | `.claude/docs/guidelines/verification-contract.md` | docs audit | `node --check .claude/scripts/verify-phase-closeout.mjs` | exit code 0 |

## Critical Product Scenarios
| SCN ID | 사용자 기대 | 증명 명령 | Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-HR-012 | replay-lens 장기 실행 이슈가 fixture로 재현된다 | self-test suite commands | all fixture decisions match expected behavior | `.claude/logs/agent-loop/harness-reliability-regression.log` |
| SCN-HR-013 | 하네스 개선과 product phase truth source가 섞이지 않는다 | docs audit | retro plan dir and guidelines explain boundary | `.claude/logs/agent-loop/harness-reliability-doc-audit.log` |
| SCN-HR-014 | ignored verification evidence 포함 기준이 closeout에서 보인다 | docs audit and git status review | evidence include policy documented | `.claude/logs/agent-loop/evidence-include-policy.log` |

## Blockers And Review
- Blocker condition: regression fixture가 actual behavior 없이 documentation-only assertion으로 끝나면 중단한다.
- First review checkpoint: fixture matrix가 HR-001부터 HR-038 mapping을 빠뜨리지 않는지 확인한다.
- Re-review trigger: `.claude/verification.contract.yaml` 또는 closeout verifier policy 변경 시 재리뷰한다.
- Verification evidence path: `.claude/logs/agent-loop/harness-reliability-regression.log`, `.claude/logs/agent-loop/harness-reliability-doc-audit.log`

## 검증 계획
- [ ] Regression: `node .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] Regression: `node .claude/scripts/lib/command-resolver.test.mjs`
- [ ] Regression: `node .claude/scripts/artifact-normalizer.test.mjs`
- [ ] Syntax: `node --check .claude/scripts/verify-phase-closeout.mjs`
- [ ] Audit: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Status: `git -c safe.directory=C:/dev/claude-settings status --short`

## 완료 표시용 증거
- regression suite log
- docs audit log
- git status showing only intended harness reliability plan/code/doc changes

## 산출물
- harness reliability regression fixture matrix
- updated long-running harness/fallback/verification/trace docs
- evidence include and product/harness boundary policy

## Phase 완료 체크리스트
- [ ] regression fixtures cover bash, git, pnpm, corepack/network, Docker, parity mutation, blocked QA, SCN evidence
- [ ] docs and verification contract describe new policies
- [ ] Windows path handling unsafe pattern is absent or explicitly justified
- [ ] evidence include policy is documented
- [ ] final audit partial-mode decision is documented without fake pass semantics

## 핸드오프 메모
- 이 phase 완료 뒤 master checklist를 갱신하고, 필요하면 `moonshot-phase-runner docs/implementation/harness-reliability-retro-2026-05-05`로 실제 구현 phase 실행을 시작한다.
