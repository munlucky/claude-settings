# Phase 03: Supporting Internal Skills (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-03 | Master `Internal Supporting Skills` | Add stage-owner skills for ASR, options, tradeoff, C4/ADR, gate review, Brownfield recovery | source skills only, no public exposure |

## 목표

- `moonshot-architecture`가 호출할 internal supporting skills의 contract를 만든다.
- internal skills가 profile-local public runtime discovery에 노출되지 않도록 보장한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-1"
  dependsOn: ["01"]
  conflictsWith: ["01", "07"]
  ownedPaths:
    - "skills/asr-extractor/**"
    - "skills/architecture-option-generator/**"
    - "skills/architecture-tradeoff-reviewer/**"
    - "skills/adr-c4-writer/**"
    - "skills/architecture-gate-reviewer/**"
    - "skills/codebase-architecture-recovery/**"
    - "skills/moonshot-architecture/SKILL.md"
    - "skills/moonshot-architecture/SKILL.ko.md"
    - "tests/moonshot-architecture-internal-skills.test.mjs"
  readOnlyPaths:
    - "package/runtime-surface.json"
    - "package/package-contract.yaml"
    - "docs/implementation/moonshot-architecture-2026-06-08/00-master-plan-v1.ko.md"
  stagedPaths:
    - "skills/asr-extractor/**"
    - "skills/architecture-option-generator/**"
    - "skills/architecture-tradeoff-reviewer/**"
    - "skills/adr-c4-writer/**"
    - "skills/architecture-gate-reviewer/**"
    - "skills/codebase-architecture-recovery/**"
    - "tests/moonshot-architecture-internal-skills.test.mjs"
  sharedMutablePaths:
    - "skills/moonshot-architecture/SKILL.md"
    - "skills/moonshot-architecture/SKILL.ko.md"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge_for_shared_skill_docs"
```

## 범위

- 포함:
  - six internal skill directories and bilingual skill contracts.
  - stage ownership, inputs, outputs, hard stops, evidence.
  - negative test that internal skills are not public runtime entrypoints.
- 제외:
  - runtime orchestration engine.
  - template/schema implementation owned by Phase 02.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P03-1 | Internal skill contracts | six skill folders 작성 | each skill has role, flow, hard stops, evidence |
| P03-2 | Public exposure guard | runtime-surface negative assertion | internal skills absent from public allowlist |
| P03-3 | Orchestrator references | `moonshot-architecture` references internal stages | stage names match actual skill dirs |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P03-1 | `skills/<internal>/**` | none | `tests/moonshot-architecture-internal-skills.test.mjs` | `npm test -- tests/moonshot-architecture-internal-skills.test.mjs` | exit 0 |
| P03-2 | none | none | same | `npm test -- tests/plugin-manifest.test.mjs` | exit 0 |

## Blockers And Review

- Blocker condition: internal supporting skill appears in public runtime skill allowlist.
- First review checkpoint: after all skill metadata names are fixed.
- Re-review trigger: package tests expose internal skills in profile payload.
- Verification evidence path: `docs/implementation/moonshot-architecture-2026-06-08/execution/phase-03/QA_REPORT.md`

## 검증 계획

- [ ] `npm test -- tests/moonshot-architecture-internal-skills.test.mjs tests/plugin-manifest.test.mjs`
- [ ] `npm run test:package`
- [ ] `git diff --check`

## 완료 표시용 증거

- internal skill inventory.
- public surface negative assertion output.
- package materialization evidence.

## 핸드오프 메모

- Phase 04 may consume the internal skill names in context synopsis after this phase.

