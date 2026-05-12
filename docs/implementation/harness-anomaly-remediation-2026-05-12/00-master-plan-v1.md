# Harness Anomaly Remediation Master Plan v1

> 이 문서는 세션 `019e1773-406e-7a51-81b6-0fb8b78951c1`에서 반복된 하네스 이상징후 중 `3d86dfd final outcome 상태 모델 정규화`에 이미 포함된 항목을 제외하고 남은 개선 범위를 실행 가능한 phase 작업문서로 내린 상위 계획입니다.

## Source Baseline
- 사용자 제공 계획: `하네스 이상징후 잔여 개선 계획` (역할: scope/priority, technical contract)
- `docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md` (역할: 완료된 baseline; canonical final outcome/no-op, summary projection, recovered blocker warning, runtime/repository closeout split, runtime parity classifier, runtime profile 분리)
- `docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md` (역할: current-artifacts single source, publish ordering, diagnostics baseline)
- `.claude/scripts/lib/failure-classifier.mjs` (역할: environment/runtime failure taxonomy)
- `.claude/scripts/agent-loop-phase-runtime.mjs` (역할: delegated-terminal child execution, heartbeat, stop reason)
- `.claude/scripts/moonshot-phase-dispatch.mjs` (역할: dispatcher/liveness supervisor)
- `.claude/scripts/phase-closeout-finalize.mjs` (역할: artifact publish and closeout finalizer)
- `.claude/scripts/lib/current-artifacts-state.mjs` (역할: current-artifacts hash validation)
- `.claude/scripts/verification-verdict-state.mjs` (역할: verdict scope/blocker classification)
- `.claude/scripts/verify-plan-conformance.mjs` (역할: source plan conformance CLI)
- `.claude/scripts/verify-phase-runtime-parity.mjs` and `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` (역할: runtime parity reference fixture validation)
- `.claude/scripts/verify-phase-closeout.mjs` (역할: phase closeout evidence gate)
- `.claude/scripts/agent-loop-phase-artifacts.mjs` (역할: WORKSETS/QA/HANDOFF/SCORECARD projection)
- `.claude/verification.contract.yaml` (역할: harness change ledger and closeout evidence contract)

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.91
  ambiguityScore: 0.09
  readinessDecision: executable
```

## Objective
- 실행환경 문제를 phase 구현 실패로 오분류하지 않고 `verification_environment_unavailable` 또는 parent 재검증 경로로 분리한다.
- artifact publish가 attempt-local verdict와 hash 검증을 거친 뒤에만 canonical/current index를 atomic promotion하게 한다.
- dispatcher가 1시간 tool timeout 전에 child liveness를 관측하고 `stale_child_no_progress`, `child_exited_without_closeout`, `child_still_running`을 구분한다.
- CLI/문서 계약과 Windows UX를 맞춰 잘못된 호출이 대체 명령과 shell syntax를 안내하게 한다.
- runtime parity reference plan validation이 상위 디렉터리 자동 fallback과 default fixture 암묵 사용을 하지 않게 한다.
- closeout truth source를 free-form Markdown이 아니라 구조화된 artifact metadata 우선으로 바꾼다.
- 하네스 스크립트/스킬/verification contract 변경 시 `Harness Change Ledger` 누락을 phase closeout에서 즉시 차단한다.

## Scope
- 포함:
  - EPERM/E_ACCESSDENIED verifier environment taxonomy and parent reverify state
  - stale `current-artifacts.json` hash diagnostics with recovery command
  - dispatcher heartbeat/log timestamp/PID liveness diagnostics
  - `verify-plan-conformance.mjs --help`, unknown option usage, unsupported option alternatives
  - Windows POSIX env prefix classification and `$env:` examples
  - runtime parity reference dir validation and `--allow-default-fixture` opt-in
  - structured metadata-first evidence gate and `expected_blocker_passed` verdict
  - phase closeout `Harness Change Ledger` requirement
- 제외:
  - `3d86dfd` final outcome model baseline 재구현
  - 새 phase runner 도입
  - `.claude/runtime-state.sqlite` schema 전면 재설계
  - 실제 세션 `019e1773-406e-7a51-81b6-0fb8b78951c1` JSONL 전체 replay 의존 테스트
  - downstream repository sync
  - commit/push closeout

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Verifier Environment Blocker And Parent Reverify | `docs/implementation/harness-anomaly-remediation-2026-05-12/01-verifier-environment-parent-reverify-v1.md` | - |
| 02 | Attempt-local Artifact Publish And Stale Hash Diagnostics | `docs/implementation/harness-anomaly-remediation-2026-05-12/02-attempt-local-artifact-publish-v1.md` | 01 |
| 03 | Dispatcher Liveness And Timeout Classification | `docs/implementation/harness-anomaly-remediation-2026-05-12/03-dispatcher-liveness-timeout-v1.md` | 01 |
| 04 | Plan Conformance CLI And Windows UX Contract | `docs/implementation/harness-anomaly-remediation-2026-05-12/04-plan-conformance-cli-windows-ux-v1.md` | - |
| 05 | Runtime Parity Reference Plan Validation | `docs/implementation/harness-anomaly-remediation-2026-05-12/05-runtime-parity-reference-validation-v1.md` | 04 |
| 06 | Structured Evidence Gate And Expected Blocker Verdict | `docs/implementation/harness-anomaly-remediation-2026-05-12/06-structured-evidence-gate-v1.md` | 01, 02 |
| 07 | Harness Change Ledger Closeout Gate | `docs/implementation/harness-anomaly-remediation-2026-05-12/07-harness-change-ledger-closeout-gate-v1.md` | 06 |

## Execution Order Notes
- Phase 01 is the mandatory first slice because later closeout and evidence behavior depends on separating implementation blockers from verifier environment blockers.
- Phase 02 depends on Phase 01 so stale artifact diagnostics do not convert verifier-environment failures into implementation failures.
- Phase 03 can run after Phase 01 and must stay scoped to dispatcher/runtime liveness fields.
- Phase 04 is independent and should be done before Phase 05 because reference validation errors must reuse the CLI usage contract.
- Phase 06 depends on Phase 01/02 because metadata truth source must consume normalized blocker and artifact identity fields.
- Phase 07 is last because it adds a closeout gate over script/skill/contract changes and should reuse the structured evidence path from Phase 06.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01, 04 | limited parallel | Disjoint ownership if Phase 01 stays in runtime/failure/verdict classification and Phase 04 stays in `verify-plan-conformance` plus shell syntax UX. |
| wave-2 | 02, 03, 05 | limited parallel | Phase 02 touches finalizer/current artifacts; Phase 03 touches dispatcher/runtime liveness; Phase 05 touches runtime parity validation. Avoid shared test fixture churn. |
| wave-3 | 06 | sequential | Reads normalized blocker/artifact contracts from prior phases. |
| wave-4 | 07 | sequential | Adds closeout blocking policy over harness file changes after structured evidence is stable. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | User plan / Verifier false blocker | EPERM/E_ACCESSDENIED verifier failures become `verification_environment_unavailable`, not implementation failure. | 01 | `01-verifier-environment-parent-reverify-v1.md` | mapped |
| REQ-1.2 | AC-02 | User plan / Parent reverify | Parent/current session reverify can move active blocker to historical warning after pass. | 01 | `01-verifier-environment-parent-reverify-v1.md` | mapped |
| REQ-1.3 | AC-03 | User plan / Scorecard blocker split | `scorecard-verdict=blocked` separates implementation blocker and verifier-environment blocker reason codes. | 01, 06 | `01-verifier-environment-parent-reverify-v1.md`, `06-structured-evidence-gate-v1.md` | mapped |
| REQ-2.1 | AC-04 | User plan / Artifact publish order | Attempt-local verdict is written and hashed before canonical verdict/current index promotion. | 02 | `02-attempt-local-artifact-publish-v1.md` | mapped |
| REQ-2.2 | AC-05 | User plan / Stale hash recovery | Stale current artifact index diagnostic includes old/new hash, source attempt, and recovery command. | 02 | `02-attempt-local-artifact-publish-v1.md` | mapped |
| REQ-3.1 | AC-06 | User plan / Dispatcher liveness | Dispatcher records child PID, last heartbeat, last log timestamp, and phase number. | 03 | `03-dispatcher-liveness-timeout-v1.md` | mapped |
| REQ-3.2 | AC-07 | User plan / Timeout classification | Stale/no-progress, exited-without-closeout, and still-running timeout outcomes are distinct. | 03 | `03-dispatcher-liveness-timeout-v1.md` | mapped |
| REQ-4.1 | AC-08 | User plan / CLI help | `verify-plan-conformance.mjs --help`, unknown option usage, and unsupported plan-level option alternatives are explicit. | 04 | `04-plan-conformance-cli-windows-ux-v1.md` | mapped |
| REQ-4.2 | AC-09 | User plan / Windows shell UX | POSIX env prefix in PowerShell is classified as `windows_shell_env_syntax` with `$env:` example. | 04 | `04-plan-conformance-cli-windows-ux-v1.md` | mapped |
| REQ-5.1 | AC-10 | User plan / Reference plan validation | Runtime parity verifier rejects broad parent dirs and requires `--allow-default-fixture` for default fixture use. | 05 | `05-runtime-parity-reference-validation-v1.md` | mapped |
| REQ-6.1 | AC-11 | User plan / Metadata truth source | `SCN-*`, `REQ-*`, and blocker status are read from structured artifact metadata before Markdown rows. | 06 | `06-structured-evidence-gate-v1.md` | mapped |
| REQ-6.2 | AC-12 | User plan / Expected blocker verdict | `expected_blocker_passed` is not counted as closeout failure. | 06 | `06-structured-evidence-gate-v1.md` | mapped |
| REQ-7.1 | AC-13 | User plan / Harness ledger | `.claude/scripts/**`, `.claude/skills/**`, or `.claude/verification.contract.yaml` changes require `QA_REPORT.md` or plan package `Harness Change Ledger` at phase closeout. | 07 | `07-harness-change-ledger-closeout-gate-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Verifier Environment Blocker And Parent Reverify (`docs/implementation/harness-anomaly-remediation-2026-05-12/01-verifier-environment-parent-reverify-v1.md`)
- [x] Phase 02 - Attempt-local Artifact Publish And Stale Hash Diagnostics (`docs/implementation/harness-anomaly-remediation-2026-05-12/02-attempt-local-artifact-publish-v1.md`)
- [x] Phase 03 - Dispatcher Liveness And Timeout Classification (`docs/implementation/harness-anomaly-remediation-2026-05-12/03-dispatcher-liveness-timeout-v1.md`)
- [x] Phase 04 - Plan Conformance CLI And Windows UX Contract (`docs/implementation/harness-anomaly-remediation-2026-05-12/04-plan-conformance-cli-windows-ux-v1.md`)
- [x] Phase 05 - Runtime Parity Reference Plan Validation (`docs/implementation/harness-anomaly-remediation-2026-05-12/05-runtime-parity-reference-validation-v1.md`)
- [x] Phase 06 - Structured Evidence Gate And Expected Blocker Verdict (`docs/implementation/harness-anomaly-remediation-2026-05-12/06-structured-evidence-gate-v1.md`)
- [x] Phase 07 - Harness Change Ledger Closeout Gate (`docs/implementation/harness-anomaly-remediation-2026-05-12/07-harness-change-ledger-closeout-gate-v1.md`)

## Replay Scenario Contract
- Fixture name: `harness-anomaly-019e1773-replay`
- Source shape: deterministic reduced fixtures for Phase 01/03/05 patterns, not live session JSONL dependency.
- Expected result:
  - verifier EPERM/E_ACCESSDENIED moves to parent reverify path
  - dispatcher timeout is classified by liveness reason
  - expected blocker is recorded as pass evidence

## Completion Rule
- Mark a phase checked only when its phase plan completion criteria and verification commands pass.
- Do not treat `verification_environment_unavailable` as implementation failure when parent/current reverify evidence passes.
- Do not treat free-form Markdown evidence rows as closeout truth source when structured metadata exists.
- Runtime pointer preparation is intentionally out of scope for this document-writing turn.
