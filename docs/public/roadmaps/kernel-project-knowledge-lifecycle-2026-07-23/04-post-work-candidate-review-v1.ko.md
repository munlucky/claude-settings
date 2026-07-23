# Phase 04 — Post-work Knowledge Candidate Review v1

## Status

`complete`

## Objective

작업 중 발견된 사실, 관계, 제약, 관례를 즉시 장기 지식에 쓰지 않고 run-bound candidate로 수집한 뒤 diff와 fresh verification evidence를 기반으로 분류·검증한다.

## Dependencies

- Phase 02 knowledge store/context receipts
- Phase 03 applicable architecture/ontology/tacit slice

## Inputs and Read-only References

- Kernel run objective/acceptance/source identity
- FRAME~EXECUTE context receipts
- predicted write set와 actual changed files
- git diff summary 또는 trusted change manifest
- latest Kernel verifications/evidence pack
- applicable architecture and ontology slice
- `agents/project-memory-reviewer.md` 패턴

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - scripts/kernel/knowledge/candidate-extract.mjs
  - scripts/kernel/knowledge/candidate-review.mjs
  - scripts/kernel/knowledge/change-diff.mjs
  - schemas/kernel.knowledge-candidate.schema.json
  - schemas/kernel.knowledge-review-result.schema.json
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - tests/kernel-knowledge-candidate.test.mjs
  - tests/kernel-knowledge-review.test.mjs
sharedSurfaces:
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
```

## Surface Classification

- Candidate extraction/review: `source_only`
- Candidate rows and pending JSONL: `data_or_state_migration`

## Candidate Contract

```yaml
knowledgeCandidate:
  candidateId: string
  runId: string
  projectId: string
  proposedType: policy_anchor|semantic_fact|kg_relation|ontology_constraint|episodic_observation
  statement: string
  scope: []
  relatedFiles: []
  sourceRefs: []
  evidenceRefs: []
  derivedFromContextPackRefs: []
  confidence: 0..1
  status: observed|staged|verified|rejected|committed|superseded|archived
  supersedes: []
  rejectionReasons: []
```

## Candidate Sources

- implementation이 입증한 새로운 project fact
- 기존 architecture/ADR/spec와 코드 사이의 delta
- 새 component/API/data dependency relation
- 반복적으로 필요한 verification/operational constraint
- root-cause와 regression evidence가 있는 bug lesson
- 기존 지식이 더 이상 유효하지 않음을 보여주는 변경

다음은 candidate로 생성하지 않는다.

- 일반적인 프로그래밍 상식
- 시스템/개발자 지시 반복
- raw transcript/log/tool/browser body
- sourceRef 없는 추측
- 현재 task에만 필요한 임시 단계
- secret-like value

## Review Pipeline

```text
OBSERVE
  → normalize/dedupe
  → bind source/diff/evidence
  → classify type and scope
  → compare existing records
  → ontology and policy safety check
  → VERIFIED | REJECTED | EPISODIC_ONLY
```

### Review dimensions

1. **Factuality**: 코드/테스트/schema/doc evidence가 있는가
2. **Reusability**: 다른 run에서 재사용 가능한가
3. **Scope**: project/component/path/API 범위가 명확한가
4. **Novelty**: 기존 record와 중복 또는 supersession 관계인가
5. **Safety**: secret/raw external/transcript-only 후보가 아닌가
6. **Authority**: candidate가 authoritative docs를 임의로 덮어쓰지 않는가
7. **Stability**: 일시적 환경 상태가 아닌가

## Review Result

```yaml
knowledgeReviewResult:
  status: passed|failed|needs_approval|degraded
  verifiedCandidates: []
  episodicCandidates: []
  rejectedCandidates: []
  supersessionProposals: []
  ontologyViolations: []
  approvalRequired: []
  evidenceCoverage: []
```

Never/critical constraint 위반은 PROVE 통과를 막는다. Ask-first 항목은 사용자 승인 receipt 없이는 knowledge commit과 Git closeout 모두 진행하지 않는다.

## Tasks

1. trusted diff/change manifest adapter를 구현한다.
2. candidate extraction rules와 dedupe fingerprint를 구현한다.
3. candidate↔acceptance↔verification evidence binding을 구현한다.
4. existing knowledge conflict/supersession proposal을 생성한다.
5. architecture/ontology/tacit reviewer를 deterministic contract로 구현한다.
6. review result를 Kernel DB 및 projection에 기록한다.

## Acceptance Criteria

- candidate는 runId/projectId/source/evidence 없이 verified가 될 수 없다.
- failed verification에만 근거한 candidate는 semantic/ontology verified가 될 수 없다.
- 중복 candidate는 하나로 정규화되고 provenance는 합쳐진다.
- authoritative record 변경은 explicit supersedes 또는 approval을 요구한다.
- raw/secret/transcript-only 후보는 durable rejection reason과 함께 차단된다.
- review 결과가 completion evidence와 동일 source/mutation revision에 바인딩된다.

## Verification and Evidence

- candidate extraction fixtures: feature/bug/refactor/docs-only
- duplicate and contradictory candidate tests
- stale evidence and source identity mismatch tests
- never/ask-first/always ontology matrix
- reviewer unavailable/degraded behavior tests
- false knowledge promotion regression corpus

## Rollback

Pending/rejected candidates는 archive 가능하며 verified records에는 아직 mutation이 없어야 한다. Phase 04 rollback은 기존 project knowledge revision을 변경하지 않는다.