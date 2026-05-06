# Phase 03: Native Harness Capture (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| AWTL-003 | 첨부 Summary | LLM 없이 wrapper가 raw logging 자동 기록 | P03-1, P03-2 |
| AWTL-006 | Canonical Event Model | required event types를 실제 하네스 실행에서 생성 | P03-1, P03-2, P03-3 |
| AWTL-008 | Trace Store | `judge_result` materialized view 생성 | P03-2 |
| AWTL-015 | Phase 2 | run/attempt/span, command, verifier, memory_read, file_reconciliation capture | P03-1, P03-2, P03-3, P03-4 |
| AWTL-020 | Test Plan | command/verifier capture와 logging failure isolation 검증 | P03-5 |

## 목표
- phase runner, command wrapper, verifier wrapper, memory read boundary, file reconciliation 경계에서 AWTL event를 자동 기록한다.

## 기대 결과
- `/moonshot-phase-runner` 경로의 하네스 실행 후 `.claude/traces/<run-id>/agent_work_trace.jsonl`이 생성된다.
- logging failure는 warning으로 남고 phase verdict를 오염시키지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3-capture"
  dependsOn:
    - "02-schema-trace-sink-foundation-v1"
  conflictsWith:
    - "04-failure-attribution-memory-candidate-v1"
  ownedPaths:
    - ".claude/scripts/lib/awtl-harness-capture.mjs"
    - ".claude/scripts/lib/awtl-harness-capture.test.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-shell-core.sh"
    - ".claude/scripts/workflow-enforcement.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/awtl-trace-sink.mjs"
    - ".claude/scripts/awtl-trace.mjs"
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-shell-core.sh"
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch_when_phase06_importers_only"
```

## 범위
- 포함:
  - `run_started`, `attempt_started`, `span_started`, `action_started`, `action_completed`, `judge_result`, `memory_read`, `file_reconciliation`, `run_completed`, `privacy_event`
  - command exit code, duration, stdout/stderr hash and redacted excerpt metadata
  - verifier verdict mapping to `judge_result`
  - MemoryGraph read query hash/node ids/tags only
  - `git diff --name-only` file reconciliation event
- 제외:
  - attribution ranking
  - memory candidate creation
  - transcript importer backfill

## 선행조건과 입력
- 필수 문서:
  - `02-schema-trace-sink-foundation-v1.md`
- 필수 코드/데이터:
  - `.claude/scripts/lib/awtl-trace-sink.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop-shell-core.sh`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P03-1 | Run/attempt/span lifecycle capture | 1. dispatch에서 run id 생성 2. attempt lifecycle 기록 3. span parent/child 연결 | dry-run trace에 run/attempt/span events가 순서대로 있음 |
| P03-2 | Command/verifier wrapper capture | 1. command before/after 기록 2. verifier verdict를 `judge_result`로 기록 3. logging failure warning 처리 | 실패 command와 verifier failure가 source action id로 연결 가능함 |
| P03-3 | Memory read event capture | 1. project-memory-agent boundary에서 query hash 기록 2. raw content 제외 3. node ids/tags만 기록 | trace에 memory text가 없고 ids/tags/query_hash만 있음 |
| P03-4 | File reconciliation capture | 1. phase 전후 git touched files 수집 2. event artifact_refs 기록 3. absolute path 제거 | event에 repo-relative paths만 있음 |
| P03-5 | Runtime parity regression | 1. existing verification commands 유지 2. logging disabled/failure fixture 실행 | logging failure가 main verdict 실패로 분류되지 않음 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P03-1 | `.claude/scripts/lib/awtl-harness-capture.mjs` | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-attempt.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | Fail: lifecycle events missing. Pass: expected event sequence found |
| P03-2 | none | `.claude/scripts/agent-loop-shell-core.sh`, `.claude/scripts/workflow-enforcement.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `bash -n .claude/scripts/agent-loop-shell-core.sh` | Fail: shell syntax error. Pass: exit 0 |
| P03-3 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | Fail: memory raw content appears. Pass: only hashes/ids/tags appear |
| P03-4 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | Fail: absolute cwd appears. Pass: repo-relative paths only |
| P03-5 | none | `.claude/verification.contract.yaml` if new check is needed | existing runtime tests | `bash .claude/scripts/verify-phase-runner-boundary.sh` | Fail: runtime boundary regression. Pass: boundary verification passes |

## Critical Product Scenarios
| Scenario | User-visible expectation | Command that proves it | Expected pass signal | Evidence path |
|---|---|---|---|---|
| SCN-P03-1 | A phase runner dry run creates AWTL lifecycle events without user prompt logging | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | event sequence assertion passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-native-harness-capture/QA_REPORT.md` |
| SCN-P03-2 | A failed verifier produces `judge_result` linked to source action ids | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | `judge_result` test passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-native-harness-capture/QA_REPORT.md` |
| SCN-P03-3 | Logging failure does not fail or pass the main task verdict | `bash .claude/scripts/verify-phase-runner-boundary.sh` | boundary check passes with warning-only logging semantics | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-native-harness-capture/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: current shell wrapper cannot inject event capture without breaking Windows/runtime parity.
- First review checkpoint: after lifecycle and command capture tests pass, before verifier and memory read hooks are merged.
- Re-review trigger: any wrapper starts writing JSONL directly instead of using `awtl-trace-sink.mjs`.
- Verification evidence path: `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-native-harness-capture/QA_REPORT.md`

## 검증 계획
- [ ] Unit tests: `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs`
- [ ] Shell syntax: `bash -n .claude/scripts/agent-loop-shell-core.sh`
- [ ] Runtime boundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] Workflow enforcement: `bash .claude/scripts/workflow-enforcement.sh verify`

## 완료 표시용 증거
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-native-harness-capture/QA_REPORT.md`
- A trace path reference containing lifecycle, command, verifier, memory_read, file_reconciliation events

## 산출물
- `.claude/scripts/lib/awtl-harness-capture.mjs`
- wrapper integrations in phase runner scripts
- `.claude/scripts/lib/awtl-harness-capture.test.mjs`

## Phase 완료 체크리스트
- [ ] lifecycle events are automatically captured
- [ ] command and verifier events are linked by action/source ids
- [ ] memory_read excludes raw memory content
- [ ] file_reconciliation uses repo-relative paths only
- [ ] logging failure is warning-only for main verdict

## 핸드오프 메모
- Phase 04 consumes traces generated here. Do not start Phase 04 until source action ids and `judge_result` linkage are proven.
