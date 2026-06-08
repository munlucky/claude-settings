# Phase 01: Public Surface and Skill Skeleton (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-01 | Master `Skill Surface Design` | `moonshot-architecture`를 public runtime skill로 추가 | skill skeleton, runtime surface, docs/tests anchor |

## 목표

- `moonshot-architecture`의 public entrypoint와 최소 skill contract를 추가한다.
- internal supporting skills는 common payload source로 보존하되 public runtime surface에는 노출하지 않는 경계를 고정한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-0"
  dependsOn: []
  conflictsWith: ["03", "07"]
  ownedPaths:
    - "skills/moonshot-architecture/SKILL.md"
    - "skills/moonshot-architecture/SKILL.ko.md"
    - "package/runtime-surface.json"
    - "docs/public/reference/runtime-skill-surface.md"
    - "README.md"
    - "package/README.md"
    - "tests/moonshot-architecture-skill-surface.test.mjs"
    - "tests/package-materialization.test.mjs"
    - "tests/plugin-manifest.test.mjs"
  readOnlyPaths:
    - "package/package-contract.yaml"
    - "schemas/verification.contract.yaml"
    - "skills/moonshot-plan-writer/**"
    - "skills/moonshot-phase-runner/**"
  stagedPaths:
    - "skills/moonshot-architecture/**"
    - "package/runtime-surface.json"
    - "docs/public/reference/runtime-skill-surface.md"
    - "README.md"
    - "package/README.md"
    - "tests/moonshot-architecture-skill-surface.test.mjs"
  sharedMutablePaths:
    - "README.md"
    - "package/README.md"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge"
```

## 범위

- 포함:
  - `moonshot-architecture` skill metadata, Korean/English contract, flow, hard stops, required evidence.
  - public runtime allowlist update.
  - package/materialization and plugin manifest regression coverage.
- 제외:
  - supporting internal skill implementation.
  - architecture artifact templates/schemas.
  - live `.claude/**`, `.codex/**`, account-root install mutation.

## 선행조건과 입력

- 필수 문서:
  - `docs/implementation/moonshot-architecture-2026-06-08/00-master-plan-v1.ko.md`
  - `package/runtime-surface.json`
  - `package/package-contract.yaml`

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P01-1 | Public skill skeleton | `skills/moonshot-architecture` 생성 | skill has role, triggers, flow, hard stops, evidence contract |
| P01-2 | Runtime surface update | allowlist에 `moonshot-architecture` 추가 | profile public surface includes only intended public skills |
| P01-3 | Docs update | README/reference docs 갱신 | user-facing entrypoint and boundary documented |
| P01-4 | Tests | skill surface/materialization tests 추가 또는 갱신 | tests fail before change and pass after change |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P01-1 | `skills/moonshot-architecture/SKILL*.md` | none | `tests/moonshot-architecture-skill-surface.test.mjs` | `npm test -- tests/moonshot-architecture-skill-surface.test.mjs` | exit 0 |
| P01-2 | none | `package/runtime-surface.json` | `tests/plugin-manifest.test.mjs` | `npm test -- tests/plugin-manifest.test.mjs` | exit 0 |
| P01-3 | none | `README.md`, `package/README.md`, `docs/public/reference/runtime-skill-surface.md` | existing docs/package tests | `npm run test:package` | exit 0 |

## Blockers And Review

- Blocker condition: runtime allowlist exposes internal supporting skills.
- First review checkpoint: after `package/runtime-surface.json` and skill skeleton are changed.
- Re-review trigger: package materialization test changes public profile payload.
- Verification evidence path: `docs/implementation/moonshot-architecture-2026-06-08/execution/phase-01/QA_REPORT.md`

## 검증 계획

- [ ] `npm test`
- [ ] `npm run test:package`
- [ ] `node package/build-package.mjs --runtime all --dry-run --json`
- [ ] `git diff --check`

## 완료 표시용 증거

- changed file list for phase-owned paths.
- command output summary for all verification commands.
- review note confirming no live profile mutation.

## 핸드오프 메모

- Phase 02 and Phase 03 may start after this phase because the public name and exposure boundary are stable.

