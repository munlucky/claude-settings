# Phase 04 - State Authority and Evidence Projection

## Objective

파일 의도와 SQLite 실행 권한을 분리하고, 사람이 읽는 상태 파일은 DB에서 생성되는 one-way projection으로 구현한다.

## Surface Classification

- `source_only`: schemas, state adapter, projection generator, tests.
- `data_or_state_migration`: 신규 Kernel DB 생성만 허용.
- Relay DB 자동 migration·공유·write 금지.

## Owned Paths

```text
kernel/state-policy.yaml
kernel/evidence-policy.yaml
scripts/kernel/state-store.mjs
scripts/kernel/state-projector.mjs
scripts/kernel/evidence-pack.mjs
schemas/kernel.runtime-state.schema.json
schemas/kernel.state-projection.schema.json
schemas/kernel.run-summary.schema.json
schemas/kernel.qa-report.schema.json
schemas/kernel.release-evidence.schema.json
tests/kernel-state-authority.test.mjs
tests/kernel-state-projection.test.mjs
tests/kernel-no-relay-db-migration.test.mjs
tests/kernel-evidence-pack.test.mjs
```

## Read-Only Paths

```text
scripts/runtime-state.mjs
scripts/lib/runtime-state-store.mjs
scripts/lib/runtime-state-db-path.mjs
scripts/lib/phase-run-lease-store.mjs
scripts/verification-plane.mjs
schemas/verification.contract.yaml
```

## Requirements

- KRN-REQ-005, 007, 015, 020.

## Work

1. Kernel DB 경로와 schema version을 Relay와 분리한다.
2. 파일은 Task Contract·slice manifest·ADR 등 실행 의도만 소유한다.
3. DB는 run, goal, lease, attempt, transition, verification, completion을 소유한다.
4. `STATE.md`, `run-status.json`, `QA_REPORT.json`은 DB revision과 hash를 포함한 projection으로 생성한다.
5. projection 수동 변경은 stale/tamper로 표시하고 DB에 역반영하지 않는다.
6. E0 RUN_SUMMARY, E1 TASK_CONTRACT+QA_REPORT, E2 RELEASE_EVIDENCE+slice graph 선택 계약을 구현한다.
7. crash/restart와 stale lease 복구 fixture를 만든다.

## Acceptance Criteria

- 같은 프로젝트에서 Relay와 Kernel DB 파일이 다르다.
- Relay DB가 존재해도 Kernel은 새 DB를 생성하고 Relay 파일을 변경하지 않는다.
- projection 수정으로 completion status를 바꿀 수 없다.
- fresh verification이 없으면 completion은 blocked다.
- Evidence Pack tier는 proof policy와 task metadata로 결정된다.

## Spec-Test Obligations

- `KRN-SCN-009`, `010`, `011`, `014`를 필수 fixture로 구현한다.
- 기존 Relay completion behavior는 characterization test로 먼저 고정한다.

## Verification

```bash
node --test tests/kernel-state-authority.test.mjs tests/kernel-state-projection.test.mjs tests/kernel-no-relay-db-migration.test.mjs tests/kernel-evidence-pack.test.mjs
node --test tests/completion-authority-contract.test.mjs tests/runtime-control-plane-contract.test.mjs
npm test
```

## Evidence

```text
artifacts/kernel/phase-04/state-matrix.json
artifacts/kernel/phase-04/projection-tamper-report.json
artifacts/kernel/phase-04/resume-report.json
artifacts/kernel/phase-04/evidence-pack-fixtures/**
```

## Risks and Rollback

- 기존 runtime-state 구현과 성급하게 공통화하면 Relay 회귀가 발생한다. Kernel namespace adapter를 먼저 구현한다.
- projection은 편의 출력이며 실행 입력으로 사용하지 않는다.