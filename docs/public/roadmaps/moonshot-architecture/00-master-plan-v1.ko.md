# Moonshot Architecture - 구현 마스터 플랜 v1

## Scope Status

Status: implementation-ready-design-plan

이 문서는 `moonshot-relay`에 PRD/요구사항 기반 아키텍처 설계 하네스를 추가하기 위한 최종 구현 문서다.

기존 가칭 `architecture-orchestrator`는 사용하지 않는다. 최종 skill/runtime 명칭은 **`moonshot-architecture`** 로 고정한다.

`EGMAD(Evidence-Grounded Multi-Agent Architecture Design)`는 외부 표준 용어가 아니라, 본 프로젝트에서 정의하는 방법론/코드명으로만 사용한다. 런타임 skill, 파일명, public entrypoint, package surface에서는 `moonshot-architecture`를 사용한다.

## Objective

`moonshot-relay`를 단순 product-definition 및 implementation workflow harness에서 한 단계 확장하여, 다음 두 진입 상황을 모두 처리하는 근거 기반 아키텍처 설계 하네스로 고도화한다.

1. **Greenfield PRD Mode**: PRD 문서 하나로 프로젝트를 시작하는 경우
2. **Brownfield Codebase Mode**: 기존 코드베이스에서 요구사항/PRD/작업 지시를 받아 시작하는 경우

최종 목표는 다음 체인을 안정화하는 것이다.

```text
PRODUCT_INTENT
  -> PRD
  -> moonshot-architecture
  -> ARCHITECTURE_BRIEF
  -> ASR_CATALOG
  -> DOMAIN_MODEL / CAPABILITY_MAP
  -> ARCHITECTURE_OPTIONS
  -> TRADEOFF_ANALYSIS
  -> C4_MODEL
  -> ADR
  -> SPEC
  -> PLAN
  -> tasks/*.md
  -> moonshot-plan-writer
  -> moonshot-orchestrator | moonshot-phase-runner
```

## Non-Goals

- `moonshot-architecture`는 직접 코드를 구현하지 않는다.
- `moonshot-architecture`는 시장 검증, 사용자 인터뷰, 제품 포지셔닝을 자동화하지 않는다.
- `moonshot-architecture`는 raw KG, raw MemoryGraph, raw ontology dump를 prompt에 넣지 않는다.
- `moonshot-architecture`는 `moonshot-orchestrator` 또는 `moonshot-phase-runner`의 completion authority를 대체하지 않는다.
- 이 단계에서는 기존 runtime control-plane DB authority를 변경하지 않는다.

## Current Baseline

현재 `moonshot-relay`는 다음 공개 entrypoint를 중심으로 동작한다.

- `product-orchestrator`: idea/product-definition 단계의 공개 진입점
- `moonshot-plan-writer`: phase 기반 실행 계획 패키지 생성/갱신
- `moonshot-orchestrator`: bounded implementation slice 실행
- `moonshot-phase-runner`: large, phase-based, long-running implementation 실행
- `commit-moonshot`: commit/closeout utility
- `session-logger`: session/documentation utility

현재 product-definition 체인은 다음 산출물을 중심으로 동작한다.

- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `ADR/*.md`
- `PLAN.md`
- `tasks/*.md`
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

이 계획은 기존 체인을 제거하지 않고, `PRD -> SOLUTION/SPEC` 사이에 `moonshot-architecture` 설계 단계를 명시적으로 삽입한다.

## Naming Decision

### Final Runtime Skill Name

```text
moonshot-architecture
```

### Rejected Name

```text
architecture-orchestrator
```

### Reason

`moonshot-relay`의 공개 skill 명명 규칙은 이미 `moonshot-orchestrator`, `moonshot-phase-runner`, `moonshot-plan-writer`를 중심으로 정렬되어 있다. PRD/코드베이스 기반 아키텍처 설계 역시 Moonshot workflow의 1급 stage이므로 `moonshot-architecture`가 더 일관적이다.

### Usage Examples

```text
moonshot-architecture를 사용해서 이 PRD를 아키텍처 설계 패키지로 변환해줘.
```

```text
moonshot-architecture로 기존 코드베이스 기준 PRD fit-gap과 실행 계획을 만들어줘.
```

```text
moonshot-architecture를 사용해서 하네스 자체의 ontology/KG/memory context 통합 설계를 만들어줘.
```

## Target Architecture

```text
moonshot-relay
├── Product Definition Plane
│   └── product-orchestrator
│       ├── PRODUCT_INTENT
│       └── PRD
│
├── Architecture Design Plane
│   └── moonshot-architecture
│       ├── PRD normalization
│       ├── ASR extraction
│       ├── domain/capability modeling
│       ├── architecture option generation
│       ├── trade-off review
│       ├── C4/ADR generation
│       ├── brownfield architecture recovery
│       └── execution handoff packaging
│
├── Planning Plane
│   └── moonshot-plan-writer
│       ├── master plan
│       ├── phase docs
│       ├── owned/read-only/staged paths
│       └── acceptance/evidence mapping
│
├── Execution Plane
│   ├── moonshot-orchestrator
│   └── moonshot-phase-runner
│
└── Knowledge Plane
    ├── harness knowledge
    └── project knowledge
```

## Operating Modes

### 1. Greenfield PRD Mode

입력:

```text
PRD.md only
```

라우팅:

```text
product-orchestrator
  -> PRD.md
  -> moonshot-architecture --mode greenfield_prd
  -> architecture design package
  -> moonshot-plan-writer
  -> moonshot-orchestrator | moonshot-phase-runner
```

필수 산출물:

```text
.moonshot-relay/docs/tasks/<feature>/architecture/
├── ARCHITECTURE_BRIEF.md
├── REQUIREMENT_INVENTORY.md
├── ASR_CATALOG.md
├── QUALITY_ATTRIBUTE_SCENARIOS.md
├── DOMAIN_MODEL.md
├── CAPABILITY_MAP.md
├── ARCHITECTURE_OPTIONS.md
├── TRADEOFF_ANALYSIS.md
├── C4/
│   ├── 01-context.md
│   ├── 02-container.md
│   └── 03-component.md
├── ADR/
│   ├── 0001-architecture-style.md
│   ├── 0002-data-boundary.md
│   └── 0003-integration-strategy.md
├── SPEC.md
├── PLAN.md
├── TRACEABILITY_MATRIX.md
├── ASSUMPTIONS.md
└── BLOCKERS.md
```

Greenfield PRD Mode의 핵심 제약:

- PRD에서 바로 구현 계획으로 넘어가지 않는다.
- 먼저 ASR, 품질속성 시나리오, domain/capability model을 만든다.
- 최소 2개 이상의 architecture option을 비교한다.
- 주요 선택은 ADR로 기록한다.
- 모든 accepted requirement는 implementation owner와 verification signal에 연결한다.

### 2. Brownfield Codebase Mode

입력:

```text
existing repository + PRD | issue | user objective
```

라우팅:

```text
moonshot-architecture --mode brownfield_codebase
  -> project identity resolve
  -> project knowledge context build
  -> code-review-graph lazy refresh when needed
  -> current architecture recovery
  -> PRD/objective fit-gap
  -> impact map
  -> migration/compatibility ADR
  -> SPEC_DELTA
  -> moonshot-plan-writer
  -> moonshot-orchestrator | moonshot-phase-runner
```

필수 산출물:

```text
.moonshot-relay/docs/tasks/<feature>/architecture/
├── CURRENT_ARCHITECTURE.md
├── CODEBASE_MAP.md
├── EXISTING_CONSTRAINTS.md
├── CURRENT_C4/
│   ├── 01-context.md
│   ├── 02-container.md
│   └── 03-component.md
├── PRD_FIT_GAP.md
├── IMPACT_MAP.md
├── MIGRATION_STRATEGY.md
├── COMPATIBILITY_CONTRACT.md
├── RISK_REGISTER.md
├── ADR/
│   ├── 0001-preserve-existing-boundary.md
│   ├── 0002-adopt-new-module-boundary.md
│   └── 0003-migration-path.md
├── SPEC_DELTA.md
├── PLAN.md
├── TRACEABILITY_MATRIX.md
├── ASSUMPTIONS.md
└── BLOCKERS.md
```

Brownfield Codebase Mode의 핵심 제약:

- 현재 코드 구조를 읽기 전에는 신규 구조를 제안하지 않는다.
- existing boundary, owned path, read-only path, staged path를 분리한다.
- migration이 필요한 경우 반드시 compatibility contract를 만든다.
- 기존 test/build/lint signal을 verification source로 연결한다.
- 이상적인 설계보다 현재 코드베이스에 적용 가능한 incremental architecture를 우선한다.

### 3. Hybrid PRD + Existing Repo Mode

입력:

```text
PRD.md + existing repository
```

라우팅:

```text
moonshot-architecture --mode hybrid_prd_plus_existing_repo
  -> PRD normalization
  -> current architecture recovery
  -> ASR extraction
  -> PRD/current architecture fit-gap
  -> option generation under existing constraints
  -> ADR/SPEC_DELTA/PLAN
```

이 모드는 Greenfield와 Brownfield 산출물을 모두 만들되, `SPEC.md`보다 `SPEC_DELTA.md`를 우선한다.

### 4. Meta Harness Design Mode

입력:

```text
moonshot-relay harness improvement objective
```

라우팅:

```text
moonshot-architecture --mode meta_harness_design
  -> harness ontology/KG/memory impact analysis
  -> skill surface design
  -> context pack design
  -> schema/template/test impact map
  -> moonshot-plan-writer
  -> moonshot-phase-runner
```

이 모드는 하네스 자체 변경을 다루므로 기본적으로 `moonshot-phase-runner`로 handoff한다.

## Skill Surface Design

### Public Runtime Surface

`package/runtime-surface.json`에 `moonshot-architecture`를 추가한다.

```json
{
  "schemaVersion": 1,
  "publicRuntimeSkills": [
    "product-orchestrator",
    "moonshot-architecture",
    "moonshot-orchestrator",
    "moonshot-phase-runner",
    "moonshot-plan-writer",
    "commit-moonshot",
    "session-logger"
  ],
  "serviceProfileSkillPolicy": "allowlist_only",
  "commonPayloadSkillPolicy": "preserve_all_canonical_skills",
  "managedSkillPrunePolicy": "prune_previously_managed_profile_skills_absent_from_current_payload_preserve_external"
}
```

### New Public Skill

```text
skills/moonshot-architecture/
├── SKILL.md
└── SKILL.ko.md
```

### Internal Supporting Skills

```text
skills/asr-extractor/
├── SKILL.md
└── SKILL.ko.md

skills/architecture-option-generator/
├── SKILL.md
└── SKILL.ko.md

skills/architecture-tradeoff-reviewer/
├── SKILL.md
└── SKILL.ko.md

skills/adr-c4-writer/
├── SKILL.md
└── SKILL.ko.md

skills/architecture-gate-reviewer/
├── SKILL.md
└── SKILL.ko.md

skills/codebase-architecture-recovery/
├── SKILL.md
└── SKILL.ko.md
```

Internal skills must not be added to profile-local public discovery unless a later controlled adoption phase explicitly changes the surface policy.

## `skills/moonshot-architecture/SKILL.ko.md` Contract

```yaml
---
name: moonshot-architecture
description: PRD 또는 기존 코드베이스를 근거 기반 아키텍처 설계 패키지로 변환할 때 사용합니다.
layer: orchestrator
loads:
  - architecture-design-artifacts
  - project-knowledge-context
  - requirements-traceability
  - verdict-summaries
deepReferences:
  - docs/public/guidelines/moonshot-architecture.ko.md
  - docs/public/guidelines/requirements-traceability-harness.md
  - docs/public/guidelines/memorygraph-workflow.ko.md
outputArtifacts:
  - ARCHITECTURE_BRIEF.md
  - ASR_CATALOG.md
  - DOMAIN_MODEL.md
  - ARCHITECTURE_OPTIONS.md
  - TRADEOFF_ANALYSIS.md
  - C4/*.md
  - ADR/*.md
  - SPEC.md
  - PLAN.md
  - TRACEABILITY_MATRIX.md
triggers:
  - "moonshot architecture"
  - "PRD to architecture"
  - "architecture design"
  - "architecture recovery"
  - "architecture fit gap"
---
```

### Flow

1. Classify mode: `greenfield_prd`, `brownfield_codebase`, `hybrid_prd_plus_existing_repo`, `meta_harness_design`.
2. Build `projectKnowledgeContext` with `stage=intake` or `stage=plan`.
3. Build `architectureContext` through `scripts/architecture-context-build.mjs`.
4. Normalize PRD/objective into requirement inventory.
5. Extract ASR and quality attribute scenarios.
6. Build domain model, capability map, and data/integration flow.
7. For Brownfield/Hybrid, recover current architecture and existing constraints.
8. Generate architecture options.
9. Run trade-off review.
10. Write C4 model and ADRs.
11. Produce `SPEC.md` or `SPEC_DELTA.md`.
12. Produce `PLAN.md` and `TRACEABILITY_MATRIX.md`.
13. Handoff to `moonshot-plan-writer`, `moonshot-orchestrator`, or `moonshot-phase-runner`.

### Hard Stops

- Do not skip ASR extraction for non-trivial PRD.
- Do not claim architecture readiness without ADR for significant decisions.
- Do not hand off to implementation without traceability mapping.
- Do not invent Brownfield current architecture without codebase evidence.
- Do not inline raw MemoryGraph, KG, ontology, logs, transcripts, or secrets.
- Do not mutate live `.claude/**`, `.codex/**`, account-root state, or runtime profile during architecture design.

## Knowledge Plane Design

### Two-Level Knowledge Model

```text
Knowledge Plane
├── Harness Knowledge
│   ├── Harness Ontology
│   ├── Harness KG
│   └── Harness Memory
│
└── Project Knowledge
    ├── Project Ontology
    ├── Project KG
    └── Project Memory
```

### Harness Ontology

Harness-level entities:

```text
Skill
Agent
Stage
Artifact
Gate
Evidence
Decision
Policy
RuntimeState
ContextPack
```

Harness-level relations:

```text
Skill produces Artifact
Artifact requires Gate
Gate requires Evidence
Stage invokes Skill
Skill handoff_to Skill
CompletionAuthority consumes Evidence
```

### Project Ontology

Project-level entities:

```text
Requirement
Scenario
ASR
QualityAttributeScenario
Capability
DomainEntity
Component
Container
API
Event
DataStore
ExternalSystem
ADR
Risk
Constraint
TestSignal
Evidence
```

Project-level relations:

```text
Requirement has_scenario Scenario
Requirement derives ASR
ASR constrained_by QualityAttributeScenario
ADR decides ComponentBoundary
Component implements Capability
CodePath realizes Component
TestSignal verifies Requirement
Evidence supports CompletionClaim
```

## Context Pack Design

### ContextPackV2 Target Shape

```json
{
  "schemaVersion": 2,
  "stage": "intake | plan | execute | verify | finish",
  "mode": "greenfield_prd | brownfield_codebase | hybrid_prd_plus_existing_repo | meta_harness_design",
  "harnessSlice": {
    "policyAnchors": [],
    "skillGraphSynopsis": [],
    "artifactContracts": [],
    "gateRules": []
  },
  "projectSlice": {
    "semanticFacts": [],
    "requirementSynopsis": [],
    "architectureSynopsis": [],
    "kgSynopsis": [],
    "ontologyConstraints": []
  },
  "runtimeSlice": {
    "goalId": "",
    "runId": "",
    "planDir": "",
    "activePhase": "",
    "ownedPaths": [],
    "readOnlyPaths": [],
    "stagedPaths": []
  },
  "promptFacingAuthority": "projectKnowledgeContext.promptBlock",
  "promptBlock": "## Project Knowledge Context\n..."
}
```

### Context Safety Policy

Prompt에 허용:

```text
compact policy anchors
compact semantic facts
compact architecture synopsis
compact traceability focus
status metadata
omission category
```

Prompt에 금지:

```text
raw MemoryGraph JSON
raw KG edge dump
raw ontology dump
runtime log
browser scrape
transcript
prompt archive
secret-like string
env/config secret
```

### Stage-Specific Context Policy

| Stage | Harness Context | Project Context | Code Context | Purpose |
|---|---|---|---|---|
| `intake` | product/architecture routing rules | PRD summary, prior decisions | none/minimal | scope boundary |
| `plan` | artifact schema, gate rules, ADR/C4 rules | requirements, ASR, domain, constraints | Brownfield architecture summary | design and planning |
| `execute` | implementation and verification contract | selected ADR, component contract | owned paths | code execution |
| `verify` | completion/verifier rules | requirement-test mapping | test/build/lint signal | verification |
| `finish` | closeout/session rules | changed req/ADR/evidence summary | diff summary | handoff/closeout |

## State and File Layout

### Harness Knowledge State

```text
~/.moonshot-relay/state/harness/knowledge/
├── policy/policy-anchors.jsonl
├── semantic/verified-facts.jsonl
├── graph/kg-relations.jsonl
├── ontology/constraints.jsonl
└── architecture/
    ├── artifact-contracts.jsonl
    ├── gate-rules.jsonl
    └── skill-graph.jsonl
```

### Project Knowledge State

```text
~/.moonshot-relay/state/projects/<projectId>/knowledge/
├── policy/policy-anchors.jsonl
├── semantic/verified-facts.jsonl
├── graph/kg-relations.jsonl
├── ontology/constraints.jsonl
└── architecture/
    ├── requirements.jsonl
    ├── asrs.jsonl
    ├── decisions.jsonl
    ├── components.jsonl
    ├── test-signals.jsonl
    └── traceability.jsonl
```

### Runtime Output

```text
.moonshot-relay/docs/tasks/<feature>/architecture/
```

Architecture design output is runtime/generated task output unless explicitly promoted into tracked docs by a controlled source documentation phase.

## Required New Files

### Skills

```text
skills/moonshot-architecture/SKILL.md
skills/moonshot-architecture/SKILL.ko.md
skills/asr-extractor/SKILL.md
skills/asr-extractor/SKILL.ko.md
skills/architecture-option-generator/SKILL.md
skills/architecture-option-generator/SKILL.ko.md
skills/architecture-tradeoff-reviewer/SKILL.md
skills/architecture-tradeoff-reviewer/SKILL.ko.md
skills/adr-c4-writer/SKILL.md
skills/adr-c4-writer/SKILL.ko.md
skills/architecture-gate-reviewer/SKILL.md
skills/architecture-gate-reviewer/SKILL.ko.md
skills/codebase-architecture-recovery/SKILL.md
skills/codebase-architecture-recovery/SKILL.ko.md
```

### Guidelines

```text
docs/public/guidelines/moonshot-architecture.md
docs/public/guidelines/moonshot-architecture.ko.md
docs/public/guidelines/asr-extraction.md
docs/public/guidelines/asr-extraction.ko.md
docs/public/guidelines/c4-adr-design-contract.md
docs/public/guidelines/c4-adr-design-contract.ko.md
docs/public/guidelines/brownfield-architecture-recovery.md
docs/public/guidelines/brownfield-architecture-recovery.ko.md
```

### Templates

```text
templates/architecture/ARCHITECTURE_BRIEF.md
templates/architecture/REQUIREMENT_INVENTORY.md
templates/architecture/ASR_CATALOG.md
templates/architecture/QUALITY_ATTRIBUTE_SCENARIOS.md
templates/architecture/DOMAIN_MODEL.md
templates/architecture/CAPABILITY_MAP.md
templates/architecture/ARCHITECTURE_OPTIONS.md
templates/architecture/TRADEOFF_ANALYSIS.md
templates/architecture/C4_CONTEXT.md
templates/architecture/C4_CONTAINER.md
templates/architecture/C4_COMPONENT.md
templates/architecture/ADR.md
templates/architecture/CURRENT_ARCHITECTURE.md
templates/architecture/PRD_FIT_GAP.md
templates/architecture/IMPACT_MAP.md
templates/architecture/SPEC_DELTA.md
templates/architecture/TRACEABILITY_MATRIX.md
```

### Schemas

```text
schemas/architecture/architecture-brief.schema.json
schemas/architecture/requirement-inventory.schema.json
schemas/architecture/asr-catalog.schema.json
schemas/architecture/quality-attribute-scenario.schema.json
schemas/architecture/architecture-option.schema.json
schemas/architecture/tradeoff-analysis.schema.json
schemas/architecture/adr.schema.json
schemas/architecture/c4-model.schema.json
schemas/architecture/traceability-matrix.schema.json
schemas/architecture/architecture-context-pack.schema.json
```

### Scripts

```text
scripts/architecture-context-build.mjs
scripts/architecture-artifact-validate.mjs
```

## Existing Files to Modify

```text
package/runtime-surface.json
README.md
package/README.md
docs/public/reference/runtime-skill-surface.md
package/package-contract.yaml
tests/plugin-manifest.test.mjs
tests/package-materialization.test.mjs
tests/context-pack-contract.test.mjs
tests/workflow-e2e-contract.test.mjs
```

## Implementation Phases

### Phase 01 - Public Surface and Skill Skeleton

Objective:

```text
`moonshot-architecture`를 public runtime skill로 추가하고, 설치/package materialization에서 누락되지 않게 한다.
```

Changes:

- Add `skills/moonshot-architecture/SKILL.md`.
- Add `skills/moonshot-architecture/SKILL.ko.md`.
- Add `moonshot-architecture` to `package/runtime-surface.json`.
- Update README public entrypoint description.
- Update runtime skill surface docs.
- Add package/materialization tests.

Acceptance:

- `moonshot-architecture` appears in public runtime skill allowlist.
- Internal supporting skills are preserved in common payload but not exposed as public entrypoints.
- `npm test` passes.
- `npm run test:package` passes.

### Phase 02 - Architecture Artifact Templates and Schemas

Objective:

```text
Greenfield/Brownfield architecture design outputs are contract-backed artifacts, not free-form markdown only.
```

Changes:

- Add `templates/architecture/**`.
- Add `schemas/architecture/**`.
- Add `scripts/architecture-artifact-validate.mjs`.
- Add template/schema fixture tests.

Acceptance:

- Required templates exist.
- Required schemas exist.
- Example Greenfield package validates.
- Example Brownfield package validates.

### Phase 03 - Supporting Internal Skills

Objective:

```text
`moonshot-architecture`가 내부 stage owner skills를 조합하여 ASR, option, tradeoff, C4, ADR, Brownfield recovery를 수행할 수 있게 한다.
```

Changes:

- Add `asr-extractor`.
- Add `architecture-option-generator`.
- Add `architecture-tradeoff-reviewer`.
- Add `adr-c4-writer`.
- Add `architecture-gate-reviewer`.
- Add `codebase-architecture-recovery`.

Acceptance:

- Each supporting skill has clear role, hard stops, required evidence, output artifacts.
- None of the supporting skills are public runtime entrypoints by default.
- `moonshot-architecture` references the supporting skills as internal stages.

### Phase 04 - Architecture Context Builder

Objective:

```text
Harness knowledge, project knowledge, architecture artifacts, and code graph synopsis are compacted into a safe prompt-facing architecture context.
```

Changes:

- Add `scripts/architecture-context-build.mjs`.
- It wraps `knowledge-context-build.mjs` rather than replacing it.
- It adds `harnessSlice`, `projectSlice`, and `runtimeSlice` metadata.
- It emits prompt-safe compact context only.
- It rejects or redacts raw graph/ontology/memory/log/secret-like content.

Acceptance:

- `architecture-context-build.mjs --stage plan --mode greenfield_prd --json` emits valid context.
- `architecture-context-build.mjs --stage plan --mode brownfield_codebase --json` emits valid context.
- Prompt block never contains raw MemoryGraph/KG/ontology dumps.
- Existing `knowledge-context-build.mjs` compatibility tests remain green.

### Phase 05 - Greenfield PRD Flow

Objective:

```text
PRD only input can produce execution-ready architecture package.
```

Flow:

```text
PRD.md
  -> REQUIREMENT_INVENTORY.md
  -> ASR_CATALOG.md
  -> QUALITY_ATTRIBUTE_SCENARIOS.md
  -> DOMAIN_MODEL.md
  -> CAPABILITY_MAP.md
  -> ARCHITECTURE_OPTIONS.md
  -> TRADEOFF_ANALYSIS.md
  -> C4/*.md
  -> ADR/*.md
  -> SPEC.md
  -> PLAN.md
  -> TRACEABILITY_MATRIX.md
```

Acceptance:

- Every accepted requirement has a scenario ID.
- Every ASR has at least one quality attribute scenario.
- Architecture options include rejected alternatives.
- ADRs include decision, context, consequences, and rejected alternatives.
- PLAN tasks map back to requirement IDs and verification signals.

### Phase 06 - Brownfield Codebase Flow

Objective:

```text
Existing codebase work starts from architecture recovery and fit-gap analysis before implementation planning.
```

Flow:

```text
existing repo
  -> CURRENT_ARCHITECTURE.md
  -> CODEBASE_MAP.md
  -> EXISTING_CONSTRAINTS.md
  -> CURRENT_C4/*.md
  -> PRD_FIT_GAP.md
  -> IMPACT_MAP.md
  -> MIGRATION_STRATEGY.md
  -> COMPATIBILITY_CONTRACT.md
  -> RISK_REGISTER.md
  -> ADR/*.md
  -> SPEC_DELTA.md
  -> PLAN.md
  -> TRACEABILITY_MATRIX.md
```

Acceptance:

- Current architecture claims are backed by repository evidence.
- Owned/read-only/staged paths are identified.
- Migration and compatibility risks are explicit.
- PLAN is suitable for `moonshot-plan-writer`.

### Phase 07 - Product and Execution Integration

Objective:

```text
`product-orchestrator`, `moonshot-plan-writer`, `moonshot-orchestrator`, and `moonshot-phase-runner` can use `moonshot-architecture` outputs without duplicating responsibilities.
```

Changes:

- Update `product-orchestrator` workflow to route PRD/SOLUTION/SPEC architecture-heavy work through `moonshot-architecture`.
- Update `moonshot-plan-writer` references to accept architecture package inputs.
- Update `moonshot-orchestrator` context contract to consume selected ADR/traceability focus for bounded implementation.
- Update `moonshot-phase-runner` context contract to consume architecture package and plan package for phase attempts.

Acceptance:

- Small architecture package can hand off to `moonshot-orchestrator`.
- Large architecture package can hand off to `moonshot-plan-writer` and `moonshot-phase-runner`.
- No implementation starts without traceability matrix for non-trivial work.

### Phase 08 - Regression and Evaluation Gates

Objective:

```text
Architecture design quality becomes testable and regression-protected.
```

Required evaluation dimensions:

- Requirement coverage
- ASR coverage
- Quality attribute scenario coverage
- ADR completeness
- Architecture option comparison quality
- Traceability completeness
- Brownfield impact precision
- Verification signal coverage
- Prompt safety compliance
- Execution handoff readiness

Acceptance:

- Add fixture for Greenfield PRD package.
- Add fixture for Brownfield codebase package.
- Add negative tests for missing ASR, missing ADR, missing traceability, raw KG leakage, and implementation handoff without verification signal.
- `npm test` includes the new regression tests.

## Handoff Contracts

### Handoff to `moonshot-plan-writer`

Required inputs:

```text
architecture package path
SPEC.md or SPEC_DELTA.md
PLAN.md
TRACEABILITY_MATRIX.md
ADR directory
owned/read-only/staged path hints when Brownfield
```

Expected output:

```text
00-master-plan-*.md
NN-phase docs
phase metadata
dependencies
owned paths
staged paths
adoption targets
read-only paths
acceptance evidence mapping
```

### Handoff to `moonshot-orchestrator`

Allowed only when:

```text
bounded implementation
clear owned paths
clear acceptance criteria
fresh verification path exists
no migration phase required
```

Required context:

```text
selected ADR summary
component contract
requirement IDs
verification signal
owned files
risk notes
```

### Handoff to `moonshot-phase-runner`

Required when:

```text
multi-phase work
migration
runtime surface change
harness-level change
controlled adoption
large Brownfield refactor
```

Required context:

```text
architecture package path
plan directory
phase status seed
SPRINT_CONTRACT seed
verification and scorecard expectations
closeout evidence expectations
```

## Test Plan

Minimum active gate:

```bash
npm test
npm run test:package
node package/build-package.mjs --runtime all --dry-run --json
node scripts/install-account-root-harness.mjs --runtime all --dry-run --json
git diff --check
```

New tests:

```text
tests/moonshot-architecture-skill-surface.test.mjs
tests/moonshot-architecture-template-contract.test.mjs
tests/moonshot-architecture-schema-contract.test.mjs
tests/moonshot-architecture-context-pack.test.mjs
tests/moonshot-architecture-greenfield-flow.test.mjs
tests/moonshot-architecture-brownfield-flow.test.mjs
```

## Completion Criteria

This plan is complete only when all conditions are true:

- `moonshot-architecture` exists as a public runtime skill.
- Package/runtime surface includes `moonshot-architecture`.
- Greenfield PRD Mode produces the required architecture package.
- Brownfield Codebase Mode produces current architecture, fit-gap, impact map, and SPEC_DELTA.
- Architecture package can hand off to `moonshot-plan-writer`.
- Bounded package can hand off to `moonshot-orchestrator`.
- Large package can hand off to `moonshot-phase-runner`.
- Traceability matrix maps accepted requirements to implementation owners and verification signals.
- Prompt context contains only compact safe summaries.
- Raw MemoryGraph/KG/ontology/log/transcript/secret-like content is not included in prompts or manifests.
- Active tests and package tests pass.

## Adoption Strategy

Adoption must be staged.

1. Add source-only skill, templates, schemas, and docs.
2. Add package materialization support.
3. Add runtime surface entry.
4. Validate temp-home installer dry-run.
5. Run Greenfield fixture.
6. Run Brownfield fixture.
7. Update README and public usage docs.
8. Only then treat `moonshot-architecture` as a stable public entrypoint.

## Final Architecture Summary

`moonshot-architecture` is the missing design harness between product definition and implementation execution.

It does not replace `product-orchestrator`, `moonshot-plan-writer`, `moonshot-orchestrator`, or `moonshot-phase-runner`.

It adds the architecture reasoning layer that converts PRD/codebase evidence into:

```text
ASR
Quality Attribute Scenarios
Domain Model
Capability Map
Architecture Options
Trade-off Analysis
C4 Model
ADR
SPEC / SPEC_DELTA
PLAN
Traceability Matrix
```

The final end-to-end chain becomes:

```text
product-orchestrator
  -> moonshot-architecture
  -> moonshot-plan-writer
  -> moonshot-orchestrator | moonshot-phase-runner
  -> verification / scorecard / closeout
```

This structure supports both project-start PRD workflows and existing-codebase Brownfield workflows while preserving the existing Moonshot execution harness boundaries.
