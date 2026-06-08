# Phase 07: Product and Execution Integration (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-07 | Master `Handoff Contracts` | Integrate product, architecture, plan-writer, orchestrator, phase-runner without role duplication | skill docs, workflow tests, controlled adoption boundary |

## 목표

- `product-orchestrator`, `moonshot-plan-writer`, `moonshot-orchestrator`, `moonshot-phase-runner`가 architecture package를 소비하는 handoff contract를 명확히 한다.
- runtime surface/package 변경은 source에서 검증한 뒤 controlled adoption gate로만 account-root/profile에 반영한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn: ["05", "06"]
  conflictsWith: ["01", "03", "08"]
  ownedPaths:
    - "skills/product-orchestrator/SKILL.md"
    - "skills/product-orchestrator/SKILL.ko.md"
    - "skills/moonshot-plan-writer/SKILL.md"
    - "skills/moonshot-plan-writer/SKILL.ko.md"
    - "skills/moonshot-orchestrator/SKILL.md"
    - "skills/moonshot-orchestrator/SKILL.ko.md"
    - "skills/moonshot-phase-runner/SKILL.md"
    - "skills/moonshot-phase-runner/SKILL.ko.md"
    - "docs/public/reference/phase-runner-user-workflow.md"
    - "docs/public/reference/runtime-skill-surface.md"
    - "docs/public/guidelines/moonshot-architecture.md"
    - "docs/public/guidelines/moonshot-architecture.ko.md"
    - "tests/workflow-e2e-contract.test.mjs"
    - "tests/moonshot-architecture-handoff-contract.test.mjs"
  readOnlyPaths:
    - "package/runtime-surface.json"
    - "package/package-contract.yaml"
    - "scripts/prepare-phase-runner-state.mjs"
    - "scripts/runtime-state.mjs"
    - "docs/public/runtime-control-plane.md"
  stagedPaths:
    - "skills/product-orchestrator/**"
    - "skills/moonshot-plan-writer/**"
    - "skills/moonshot-orchestrator/**"
    - "skills/moonshot-phase-runner/**"
    - "docs/public/reference/**"
    - "docs/public/guidelines/moonshot-architecture*.md"
    - "tests/workflow-e2e-contract.test.mjs"
    - "tests/moonshot-architecture-handoff-contract.test.mjs"
  adoptionTargets:
    - "source-only until package dry-run passes"
    - "account-root install only after controlled adoption verification"
  sharedMutablePaths:
    - "skills/**/SKILL*.md"
    - "docs/public/reference/**"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge"
```

## 범위

- 포함:
  - architecture package handoff input/output contracts.
  - bounded orchestrator vs phase-runner routing rules.
  - plan-writer acceptance of architecture package inputs.
  - workflow-e2e regression.
- 제외:
  - new architecture feature implementation beyond handoff.
  - direct live `.claude/**` or `.codex/**` edits.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P07-1 | Product routing | product-orchestrator contract update | architecture-heavy PRD routes through `moonshot-architecture` |
| P07-2 | Plan-writer input | plan-writer accepts architecture package | required inputs and phase metadata documented |
| P07-3 | Execution routing | orchestrator/phase-runner consume selected ADR/traceability | bounded vs multi-phase rules tested |
| P07-4 | Controlled adoption | package/install dry-run before profile/account-root sync | source tests pass before live adoption |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P07-1 | none | `skills/product-orchestrator/SKILL*.md` | `tests/workflow-e2e-contract.test.mjs` | `npm test -- tests/workflow-e2e-contract.test.mjs` | exit 0 |
| P07-2 | none | `skills/moonshot-plan-writer/SKILL*.md` | `tests/moonshot-architecture-handoff-contract.test.mjs` | `npm test -- tests/moonshot-architecture-handoff-contract.test.mjs` | exit 0 |
| P07-3 | none | `skills/moonshot-orchestrator/SKILL*.md`, `skills/moonshot-phase-runner/SKILL*.md` | same | same | routing assertions pass |
| P07-4 | none | docs only unless adoption explicitly requested | package tests | `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json` | dry-run success |

## Blockers And Review

- Blocker condition: non-trivial architecture work can bypass traceability and start implementation.
- First review checkpoint: after handoff tests and skill docs are aligned.
- Re-review trigger: controlled adoption step mutates live profile before package dry-run success.
- Verification evidence path: `docs/implementation/moonshot-architecture-2026-06-08/execution/phase-07/QA_REPORT.md`

## 검증 계획

- [ ] `npm test -- tests/workflow-e2e-contract.test.mjs tests/moonshot-architecture-handoff-contract.test.mjs`
- [ ] `npm test`
- [ ] `node package/build-package.mjs --runtime all --dry-run --json`
- [ ] `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
- [ ] `git diff --check`

## 완료 표시용 증거

- workflow-e2e contract output.
- package and installer dry-run output.
- statement that no live profile mutation occurred unless explicitly requested.

## 핸드오프 메모

- Phase 08 should treat this phase as the final routing contract and add regression coverage around it.

