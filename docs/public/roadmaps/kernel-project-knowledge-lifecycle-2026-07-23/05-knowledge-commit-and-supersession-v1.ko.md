# Phase 05 — Knowledge Commit, Revision, Supersession v1

## Status

`complete`

## Objective

Kernel completion authority가 `accepted`를 반환한 run에 한해 verified candidate를 프로젝트 지식 저장소에 원자적으로 반영하고, 기존 지식의 supersession 및 provenance lineage를 기록한다.

## Dependencies

- Phase 04 candidate review result
- Kernel fresh verification 및 accepted completion decision

## Inputs and Read-only References

- `scripts/kernel/control-plane.mjs`
- `scripts/kernel/state-store.mjs`
- latest verifications/evidence pack
- knowledge review result
- knowledge revision at run start
- current project knowledge revision

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - scripts/kernel/knowledge/commit.mjs
  - scripts/kernel/knowledge/supersession.mjs
  - scripts/kernel/knowledge/revision.mjs
  - scripts/kernel/knowledge/receipt.mjs
  - schemas/kernel.knowledge-commit-receipt.schema.json
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - scripts/kernel/state-projector.mjs
  - tests/kernel-knowledge-commit.test.mjs
  - tests/kernel-knowledge-supersession.test.mjs
  - tests/kernel-knowledge-revision.test.mjs
sharedSurfaces:
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - scripts/kernel/state-projector.mjs
```

## Surface Classification

- Source: `source_only`
- Project knowledge files 및 SQLite receipts: `data_or_state_migration`

## Hard Preconditions

1. run state가 `PROVE` 또는 accepted closeout transition 직전이다.
2. `assessCompletion(..., commitDecision: true)` 결과가 `accepted`다.
3. source identity와 mutation revision이 candidate review와 일치한다.
4. blocking ontology violation이 없다.
5. approval-required candidate는 approval receipt를 가진다.
6. current knowledge revision이 start revision과 다르면 rebase/re-review를 수행한다.

## Knowledge Commit Transaction

```text
lock project knowledge namespace
  → reload current revision
  → validate candidates and supersession graph
  → build next record sets in temp area
  → validate all JSONL and ontology constraints
  → write provenance and supersession log
  → atomic replace record files
  → advance revision manifest last
  → record SQLite knowledge_commit_receipt
  → release lock
```

Partial write나 revision-only advance를 허용하지 않는다.

## Type-specific Commit Rules

- `semantic_fact`: fresh verification/provenance 필수
- `kg_relation`: from/to/relation/sourceRef 필수, derived 또는 verified status
- `ontology_constraint`: scope/appliesTo/severity/enforcedBy 필수, blocking constraint는 independent review 권장
- `policy_anchor`: authoritative source 또는 explicit approval 필수
- `episodic_observation`: accepted completion 없이도 archive 가능한 quarantine layer이나 prompt-visible reusable fact가 아님

## Supersession Rules

- 동일 projectId 내부에서만 일반 supersession 허용
- explicit `supersedes` 필수
- cycle 차단
- authoritative record는 equal/higher authority evidence 없이는 supersede 금지
- 기존 record는 삭제하지 않고 `superseded` 상태와 supersession log를 남긴다
- concurrent revision conflict는 자동 overwrite하지 않고 candidate를 re-review queue로 돌린다

## Knowledge Commit Receipt

```yaml
knowledgeCommitReceipt:
  schemaVersion: 1
  runId: string
  projectId: string
  sourceIdentity: string
  mutationRevision: integer
  completionDecisionRef: string
  revisionBefore: string
  revisionAfter: string
  acceptedCandidates: []
  rejectedCandidates: []
  supersededRecords: []
  evidenceRefs: []
  filesWritten: []
  digest: sha256
  status: committed|no_change|conflict|failed
```

## Control-plane Integration

- `commitProjectKnowledge(runId)` command를 추가한다.
- `closeRun()`은 knowledge commit 결과를 조회하되 자동 Git commit은 실행하지 않는다.
- accepted completion 후 knowledge commit 실패 시 run은 `accepted_with_knowledge_warning` 또는 strict mode에서 `closeout_blocked`로 projection한다.
- receipt는 completion authority가 아니라 post-completion knowledge lineage다.

## Tasks

1. project-scoped lock 및 atomic transaction writer를 구현한다.
2. revision conflict와 re-review flow를 구현한다.
3. type-specific validation과 supersession graph 검증을 구현한다.
4. receipt digest와 provenance event를 기록한다.
5. close/status projection에 knowledge closeout 상태를 추가한다.
6. crash/fault/concurrency tests를 추가한다.

## Acceptance Criteria

- accepted completion 이전에는 verified knowledge write가 불가능하다.
- 모든 committed candidate가 fresh evidence와 source identity에 바인딩된다.
- revision conflict에서 기존 지식을 overwrite하지 않는다.
- crash 중 partial record/revision advance가 발생하지 않는다.
- superseded record의 history와 provenance가 보존된다.
- no-change run은 revision을 불필요하게 증가시키지 않는다.

## Verification and Evidence

- pre-completion write rejection tests
- accepted/no-change/conflict/failed matrix
- concurrent run and lock expiry tests
- atomic write fault injection
- supersession cycle/cross-project/authority tests
- receipt digest tamper tests
- end-to-end `start → context → execute → prove → accepted → knowledge commit`

## Rollback

revision manifest가 가리키는 이전 snapshot과 supersession log를 사용해 manifest-owned write만 되돌린다. rollback 자체도 provenance event와 receipt를 남긴다.