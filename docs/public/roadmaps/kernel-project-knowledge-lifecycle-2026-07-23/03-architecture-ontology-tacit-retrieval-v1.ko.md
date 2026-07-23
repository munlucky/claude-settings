# Phase 03 — Architecture, Ontology, Tacit Retrieval v1

## Status

`blocked_by_phase_02`

## Objective

현재 작업의 objective, acceptance, predicted/actual changed files를 기준으로 프로젝트 전체 지식 중 실제로 적용되는 아키텍처 결정, 컴포넌트 관계, 온톨로지 제약, 암묵지 패턴만 좁게 조회한다.

## Dependencies

- Phase 01 identity/record contracts
- Phase 02 knowledge store/context receipt

## Inputs and Read-only References

- `scripts/architecture-context-build.mjs`
- `scripts/architecture-knowledge-resolve.mjs`
- `scripts/ontology-constraint-validate.mjs`
- `scripts/memorygraph-project-index.mjs`
- project `AGENTS.md` knowledge anchors
- project ADR/architecture/spec/test docs

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - scripts/kernel/knowledge/architecture-resolve.mjs
  - scripts/kernel/knowledge/ontology-evaluate.mjs
  - scripts/kernel/knowledge/tacit-resolve.mjs
  - scripts/kernel/knowledge/path-scope.mjs
  - schemas/kernel.applicable-knowledge-slice.schema.json
  - tests/kernel-architecture-knowledge.test.mjs
  - tests/kernel-ontology-evaluate.test.mjs
  - tests/kernel-tacit-retrieval.test.mjs
readOnlyPaths:
  - scripts/architecture-knowledge-resolve.mjs
  - scripts/ontology-constraint-validate.mjs
  - project architecture/ADR/spec/test files
```

## Surface Classification

`source_only`. Derived index/cache는 Kernel state root에만 생성하며 authoritative source가 아니다.

## Retrieval Inputs

```yaml
knowledgeQuery:
  projectId: string
  runId: string
  stage: KernelStage
  objective: string
  acceptanceCriteria: []
  taskClass: feature|bug|refactor|analysis|long-running
  predictedWriteSet: []
  actualChangedFiles: []
  surfaces: []
  riskTier: T0|T1|T2|T3
```

## Applicable Knowledge Slice

```yaml
applicableKnowledge:
  architectureDecisions: []
  architectureRequirements: []
  domainTerms: []
  componentBoundaries: []
  apiDataContracts: []
  graphRelations: []
  ontologyConstraints: []
  tacitPractices: []
  knownFailurePatterns: []
  requiredVerifications: []
  unresolvedConflicts: []
  provenance: []
```

## Source Priority

1. current repository policy/schema/test/ADR/architecture docs
2. verified project knowledge records
3. derived KG relations with source refs
4. repeated verified tacit patterns
5. episodic observations as warning-only

Source conflicts are silently merged하지 않는다. higher authority wins only when explicit; otherwise `unresolvedConflicts`로 SHAPE 또는 PROVE에 전달한다.

## Architecture Retrieval

- objective token, domain term, path, component, public seam, sourceRef를 사용한다.
- ADR은 status가 accepted/current인 항목만 기본 적용한다.
- superseded ADR/fact는 history evidence로만 사용한다.
- changed path와 직접 관련된 component neighborhood는 depth 1을 기본으로 한다.
- planning/review에서만 직접 연관성이 확인되면 depth 2를 허용한다.
- raw graph는 반환하지 않고 compact relation synopsis만 반환한다.

## Ontology Evaluation

제약 유형:

- `never`: 위반 시 halt
- `ask_first`: 승인 없으면 block
- `always`: verification obligation 생성
- `invariant`: PROVE에서 fresh evidence 필수
- `compatibility`: package/profile/data 경계 검사

제약은 `scope`, `appliesTo`, `severity`, `enforcedBy`, `sourceRef`, `supersedes`를 가진다. 동일 범위 충돌은 project-local constraint가 우선하되 equal-or-higher specificity와 explicit supersedes가 필요하다.

## Tacit Knowledge Rules

암묵지는 다음 조건을 충족할 때만 prompt-visible reusable pattern으로 조회한다.

- 서로 다른 run에서 2회 이상 반복 관찰
- 최소 1개의 성공 verification 또는 reviewer evidence
- 반례/실패가 있으면 confidence 하향 및 warning 표시
- 특정 개인·세션·transcript에만 의존하지 않음
- projectId와 component/path scope가 명확함

단일 run 관찰은 `episodic_observation`으로만 유지한다.

## Tasks

1. objective/path-aware scoring과 deterministic ordering을 구현한다.
2. project docs/knowledge anchors를 compact metadata로 읽는다.
3. architecture relation neighborhood와 provenance를 생성한다.
4. ontology applicability/conflict evaluator를 구현한다.
5. repeated observations 기반 tacit pattern eligibility를 구현한다.
6. applicable slice를 FRAME/SHAPE/EXECUTE/PROVE context에 결합한다.

## Acceptance Criteria

- unrelated project knowledge가 context에 포함되지 않는다.
- blocking ontology constraint가 applicable path에서 누락되지 않는다.
- superseded record가 current guidance로 노출되지 않는다.
- 단일 episodic observation은 reusable tacit knowledge로 승격되지 않는다.
- 모든 item이 sourceRef/provenance와 selection reason을 가진다.
- 동일 입력은 동일 ordering과 digest를 생성한다.

## Verification and Evidence

- objective/path/authority scoring golden tests
- graph depth and raw payload exclusion tests
- ontology conflict/specificity/supersedes matrix
- tacit repetition/contradiction/confidence tests
- architecture-heavy Kernel scenario eval

## Rollback

Derived index/cache만 manifest 기준으로 삭제한다. verified source knowledge와 project documents는 변경하지 않는다.