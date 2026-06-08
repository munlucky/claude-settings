# Phase 04: Architecture Context Builder (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-04 | Master `Context Pack Design` | Build prompt-safe architecture context from harness/project/runtime slices | wrapper script and context-pack tests |

## 목표

- `architecture-context-build.mjs`를 추가해 기존 `knowledge-context-build.mjs`를 감싸고, architecture stage에 필요한 compact context를 만든다.
- raw graph, ontology, memory, logs, transcripts, secret-like strings가 prompt-facing output에 들어가지 않게 한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn: ["02", "03"]
  conflictsWith: ["05", "06", "08"]
  ownedPaths:
    - "scripts/architecture-context-build.mjs"
    - "tests/moonshot-architecture-context-pack.test.mjs"
    - "tests/context-pack-contract.test.mjs"
    - "tests/knowledge-context-build-contract.test.mjs"
    - "docs/public/guidelines/moonshot-architecture.md"
    - "docs/public/guidelines/moonshot-architecture.ko.md"
  readOnlyPaths:
    - "scripts/knowledge-context-build.mjs"
    - "schemas/architecture/architecture-context-pack.schema.json"
    - "docs/public/guidelines/memorygraph-workflow.ko.md"
    - "docs/public/runtime-control-plane.md"
  stagedPaths:
    - "scripts/architecture-context-build.mjs"
    - "tests/moonshot-architecture-context-pack.test.mjs"
    - "docs/public/guidelines/moonshot-architecture*.md"
  sharedMutablePaths:
    - "tests/context-pack-contract.test.mjs"
    - "tests/knowledge-context-build-contract.test.mjs"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge"
```

## 범위

- 포함:
  - context builder CLI.
  - stage/mode metadata.
  - prompt safety redaction/rejection checks.
  - compatibility with existing knowledge context helper.
- 제외:
  - DB authority changes.
  - raw MemoryGraph/KG/ontology storage changes.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P04-1 | CLI 추가 | `--stage`, `--mode`, `--json` 지원 | emits ContextPackV2 shape |
| P04-2 | Helper wrapping | existing knowledge helper 호출 | compatibility tests remain green |
| P04-3 | Prompt safety | forbidden raw content negative tests | raw dump/leakage cases fail |
| P04-4 | Guidelines | architecture context policy 문서화 | public guideline references are stable |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P04-1 | `scripts/architecture-context-build.mjs` | none | `tests/moonshot-architecture-context-pack.test.mjs` | `node scripts/architecture-context-build.mjs --stage plan --mode greenfield_prd --json` | valid JSON |
| P04-2 | none | compatibility tests as needed | `tests/knowledge-context-build-contract.test.mjs` | `npm test -- tests/knowledge-context-build-contract.test.mjs` | exit 0 |
| P04-3 | none | none | `tests/moonshot-architecture-context-pack.test.mjs` | `npm test -- tests/moonshot-architecture-context-pack.test.mjs` | exit 0 |

## Blockers And Review

- Blocker condition: promptBlock includes raw MemoryGraph/KG/ontology/log/transcript/secret-like content.
- First review checkpoint: after greenfield and brownfield JSON examples pass.
- Re-review trigger: existing knowledge context tests change behavior.
- Verification evidence path: `docs/implementation/moonshot-architecture-2026-06-08/execution/phase-04/QA_REPORT.md`

## 검증 계획

- [ ] `npm test -- tests/moonshot-architecture-context-pack.test.mjs tests/context-pack-contract.test.mjs tests/knowledge-context-build-contract.test.mjs`
- [ ] `npm test`
- [ ] `git diff --check`

## 완료 표시용 증거

- sample greenfield context JSON summary.
- sample brownfield context JSON summary.
- leakage negative test output.

## 핸드오프 메모

- Phase 05 and Phase 06 must use this script rather than building prompt context ad hoc.

