# Phase 04: Runtime Resolver and Dependency Gates (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HR-003 | ISSUE_REGISTER | host fallback route | requested/effective runtime split |
| HR-004 | ISSUE_REGISTER | implementation/meta verifier coupling | verdict scope와 gate 분리 |
| HR-011 | ISSUE_REGISTER | verdict writer runtime wrapper | Node/Python wrapper route |
| HR-012 | ISSUE_REGISTER | pnpm discovery gap | approved equivalent resolver |
| HR-013 | ISSUE_REGISTER | corepack cache/network issue | cache/network classifier |
| HR-014 | ISSUE_REGISTER | Python binding issue | Python/pytest resolver contract |
| HR-017 | ISSUE_REGISTER | Docker daemon hard blocker | static config와 daemon smoke 분리 |
| HR-018 | ISSUE_REGISTER | Docker retry waste | `docker info` preflight 후 immediate handoff |
| HR-029 | ISSUE_REGISTER | exact vs equivalent command ambiguity | approved equivalent command policy |
| HR-030 | ISSUE_REGISTER | runtime target confusion | verdict runtimeContext 강화 |
| HR-031 | ISSUE_REGISTER | Docker health hard gate | dependency-aware phase gate |

## 목표
- runtime/command resolver가 exact command 실패와 approved equivalent command 성공을 명시적으로 구분한다.
- host fallback은 임시 수동 판단이 아니라 verdict/QA/HANDOFF에 `requestedRuntime`, `effectiveRuntime`, `fallbackReason`으로 남긴다.
- Docker daemon-required smoke는 static config validation과 분리하고 daemon 부재 시 retry 없이 `resume_later_handoff`로 닫는다.

## 기대 결과
- `pnpm`이 PATH에 없고 `corepack pnpm` 또는 host `pnpm`이 가능하면 equivalent evidence로 기록된다.
- meta verifier failure가 product implementation pass evidence를 덮어쓰지 않는다.
- Docker daemon이 없으면 `docker compose config`까지는 validation으로 인정하고 `docker compose up --wait`는 external blocker로 handoff된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3-runtime-gates"
  dependsOn:
    - "01-capability-fingerprint-foundation-v1"
    - "02-artifact-schema-normalizer-v1"
  conflictsWith:
    - "01-capability-fingerprint-foundation-v1"
    - "05-timing-telemetry-trace-v1"
  ownedPaths:
    - ".claude/scripts/runtime-cli.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/lib/command-resolver.mjs"
    - ".claude/scripts/lib/command-resolver.test.mjs"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/templates/execution/QA_REPORT.template.md"
    - ".claude/templates/execution/HANDOFF.template.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_runner_patch"
```

## 범위
- 포함:
  - approved equivalent command policy
  - package manager/Python/Docker/git/bash resolver contract
  - requested/effective runtime split in verdict state
  - dependency-aware daemon smoke handoff
  - implementation verification vs meta-harness verification scope split
- 제외:
  - full timing telemetry persistence
  - runtime parity fixture temp copy

## 선행조건과 입력
- Phase 01 classifier and fingerprint library
- Phase 02 canonical artifact enum
- Existing verdict fields in `.claude/scripts/write-verification-verdict.py`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P04-1 | command resolver library 추가 | 1) exact command 2) approved equivalent 3) blocked/network/permission code 반환 | resolver fixture가 direct/equivalent/blocked를 구분 |
| P04-2 | runtime fallback schema 강화 | 1) requested/effective runtime/fallbackReason을 verdict/QA/HANDOFF에 기록 2) stale runtime verdict와 phase verifier verdict scope 분리 | runtimeContext가 health gate에서 정확히 해석됨 |
| P04-3 | Docker dependency gate 구현 | 1) `docker compose config` static validation 2) `docker info` daemon probe 3) daemon missing은 no-retry handoff | daemon 부재 fixture가 immediate handoff |
| P04-4 | implementation/meta verifier 분리 | 1) product test pass evidence 보존 2) meta verifier blocker는 separate closeout scope로 기록 | product pass가 meta failure 때문에 erased 되지 않음 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P04-1 | `.claude/scripts/lib/command-resolver.mjs` | `.claude/scripts/runtime-cli.mjs` | `.claude/scripts/lib/command-resolver.test.mjs` | `node .claude/scripts/lib/command-resolver.test.mjs` | `command-resolver self-test passed` |
| P04-2 | 없음 | `.claude/scripts/write-verification-verdict.py`, `.claude/scripts/verification-verdict-state.mjs` | existing self-test | `node .claude/scripts/verification-verdict-state.mjs self-test` | `verification-verdict-state self-test passed` |
| P04-3 | 없음 | `.claude/scripts/phase-capability-preflight.mjs`, `.claude/verification.contract.yaml` | command resolver fixture | `node .claude/scripts/phase-capability-preflight.mjs --json` | Docker daemon status classified, not retried |
| P04-4 | 없음 | `.claude/scripts/agent-loop-phase-runner.mjs` | command resolver fixture | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | exit code 0 |

## Critical Product Scenarios
| SCN ID | 사용자 기대 | 증명 명령 | Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-HR-007 | exact `pnpm` 실패 때 approved equivalent가 있으면 false blocked가 아니다 | `node .claude/scripts/lib/command-resolver.test.mjs pnpm-equivalent` | `status: passed_with_equivalent_evidence` | `.claude/logs/agent-loop/command-resolver-pnpm.log` |
| SCN-HR-008 | Docker daemon 부재는 retry 없이 handoff된다 | `node .claude/scripts/lib/command-resolver.test.mjs docker-daemon-missing` | `decision: resume_later_handoff` | `.claude/logs/agent-loop/command-resolver-docker.log` |
| SCN-HR-009 | host fallback 결과가 runtimeContext에 남는다 | `node .claude/scripts/verification-verdict-state.mjs self-test` | requested/effective runtime fixture passed | `.claude/logs/agent-loop/runtime-context-self-test.log` |

## Blockers And Review
- Blocker condition: equivalent command가 exact command와 같은 command string으로 위장되면 중단한다.
- First review checkpoint: resolver policy가 allowlist 기반인지 확인한다.
- Re-review trigger: verdict scope 또는 runtime health gate 변경 시 재리뷰한다.
- Verification evidence path: `.claude/logs/agent-loop/command-resolver-*.log`, `.claude/logs/agent-loop/runtime-context-self-test.log`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/runtime-cli.mjs`
- [ ] Unit: `node .claude/scripts/lib/command-resolver.test.mjs`
- [ ] Verdict: `node .claude/scripts/verification-verdict-state.mjs self-test`
- [ ] Preflight: `node .claude/scripts/phase-capability-preflight.mjs --json`

## 완료 표시용 증거
- command resolver self-test log
- Docker daemon missing fixture log
- verdict runtimeContext self-test output

## 산출물
- command resolver contract
- host fallback verdict schema
- Docker static/daemon split gate
- implementation/meta verifier scope split

## Phase 완료 체크리스트
- [ ] approved equivalent command policy가 test로 고정됨
- [ ] requested/effective runtime/fallbackReason이 verdict와 closeout artifact에 남음
- [ ] Docker daemon missing은 no-retry `resume_later_handoff`로 처리됨
- [ ] product implementation pass evidence가 meta verifier blocker와 분리됨

## 핸드오프 메모
- Phase 05 timing trace는 이 phase의 failure code, fallbackReason, verdict scope를 집계 대상으로 삼는다.
