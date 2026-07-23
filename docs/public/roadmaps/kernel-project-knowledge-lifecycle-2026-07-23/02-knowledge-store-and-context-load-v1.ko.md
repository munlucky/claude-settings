# Phase 02 — Kernel Knowledge Store and Context Load v1

## Status

`complete`

## Objective

Kernel 전용 프로젝트 지식 저장소를 구축하고, `FRAME/SHAPE/SLICE/SCHEDULE/EXECUTE/PROVE/CLOSE` 단계에 맞는 compact `projectKnowledgeContext`와 immutable context receipt를 생성한다.

## Dependencies

- Phase 01 project identity 및 record contract

## Inputs and Read-only References

- `scripts/knowledge-context-build.mjs`
- `kernel/context-policy.yaml`
- `scripts/kernel/context-build.mjs`
- `scripts/kernel/control-plane.mjs`
- `scripts/kernel/state-store.mjs`
- `scripts/kernel/state-projector.mjs`

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - scripts/kernel/knowledge/store.mjs
  - scripts/kernel/knowledge/context-load.mjs
  - scripts/kernel/knowledge/context-render.mjs
  - schemas/kernel.knowledge-context.schema.json
  - schemas/kernel.knowledge-context-receipt.schema.json
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - scripts/kernel/state-projector.mjs
  - tests/kernel-knowledge-store.test.mjs
  - tests/kernel-knowledge-context.test.mjs
  - tests/kernel-knowledge-context-redaction.test.mjs
sharedSurfaces:
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - scripts/kernel/state-projector.mjs
```

## Surface Classification

- Source implementation: `source_only`
- SQLite additive schema and project knowledge directories: `data_or_state_migration`

필수 evidence: additive migration test, old DB compatibility, transaction rollback, atomic projection read, no Relay DB access.

## Storage Layout

```text
~/.moon-relay-kernel/state/projects/<projectId>/
  identity.json
  knowledge/
    revision.json
    policy/policy-anchors.jsonl
    semantic/verified-facts.jsonl
    semantic/supersession-log.jsonl
    episodic/observations.jsonl
    graph/kg-relations.jsonl
    ontology/constraints.jsonl
    provenance/prov-log.jsonl
    candidates/pending.jsonl
    candidates/rejected.jsonl
  context-packs/<runId>/<stage>.json
  receipts/<runId>-knowledge-closeout.json
```

JSONL은 portable source record, SQLite는 run-bound authority와 receipt index로 사용한다. JSONL write는 temp file + fsync + rename의 atomic replace를 사용하고 revision은 모든 파일 write 성공 후 마지막에 증가시킨다.

## Runtime State Additions

`runs` additive columns:

- `project_id`
- `knowledge_revision_start`
- `knowledge_revision_close`
- `knowledge_status`
- `context_pack_ref`

신규 tables:

- `knowledge_context_receipts`
- `knowledge_candidates`
- `knowledge_commit_receipts`
- `git_closeout_events`는 Phase 06에서 추가

## Stage Mapping and Retrieval Budget

| Kernel stage | Primary knowledge |
|---|---|
| FRAME | policy, domain terms, architecture boundaries, non-goals |
| SHAPE | semantic facts, ADR/ASR, ontology constraints |
| SLICE | component relations, ownership, dependency edges |
| SCHEDULE | write-set conflict, shared surfaces, validation dependencies |
| EXECUTE | changed-path conventions, component/API rules, known failure patterns |
| PROVE | verification rules, blocking constraints, acceptance mappings |
| CLOSE | supersession candidates, reusable lessons, Git closeout policy |

기본 prompt budget는 `kernel/context-policy.yaml`의 stage budget 안에서 별도 knowledge quota를 설정한다. quota 초과 시 trust, stage match, path match, severity 순으로 deterministic truncation하며 omission receipt를 남긴다.

## Context Contract

```yaml
projectKnowledgeContext:
  schemaVersion: 1
  projectId: string
  knowledgeRevision: string
  status: ready|stale|degraded_read|degraded_write|not_configured
  strictness: advisory|required
  stage: FRAME|SHAPE|SLICE|SCHEDULE|EXECUTE|PROVE|CLOSE
  policyAnchors: []
  semanticFacts: []
  graphSynopsis: []
  ontologyConstraints: []
  staleOrUnavailable: []
  omittedByPolicy: []
  promptBlock: string
  contextPackRef: string
  digest: sha256
```

Raw records는 control-plane 반환값이나 prompt에 포함하지 않는다.

## Control-plane Integration

- `startRun()`에서 project identity와 knowledge revision snapshot을 고정한다.
- `buildStageContext()`가 caller 제공 reference보다 먼저 canonical project knowledge loader를 호출한다.
- receipt에는 runId, sourceIdentity, projectId, stage, knowledgeRevision, digest, token estimate, omissions를 기록한다.
- 동일 stage/revision/task contract는 동일 digest를 생성한다.
- revision 변경 시 다음 stage context를 재빌드하되 이전 receipt는 보존한다.

## Tasks

1. storage reader/writer와 revision manifest를 구현한다.
2. stage-scoped selector와 prompt-safe renderer를 구현한다.
3. secret/raw graph/log/transcript redaction을 이식한다.
4. context receipt를 Kernel DB와 projection bundle에 기록한다.
5. stale/required/degraded fail-open/fail-closed 정책을 구현한다.
6. crash-injection과 partial-write recovery tests를 추가한다.

## Acceptance Criteria

- Kernel run 시작 시 projectId와 knowledge revision이 고정된다.
- 모든 stage context가 digest와 provenance를 가진다.
- raw graph/ontology/log/transcript/secret-like 문자열이 promptBlock에 나타나지 않는다.
- required strictness에서 unavailable/blocking knowledge는 EXECUTE 진입을 차단한다.
- advisory strictness는 typed warning으로 진행할 수 있다.
- crash 중 revision이나 일부 record만 advance하지 않는다.
- Relay home과 DB에 read/write가 발생하지 않는다.

## Verification and Evidence

- deterministic context golden fixtures
- prompt purity/redaction fuzz fixtures
- token budget/omission order tests
- stale/degraded/strictness matrix
- SQLite migration and old fixture compatibility
- atomic write fault injection
- Kernel E2E context receipt test

## Rollback

SQLite additive columns/tables는 호환 유지하고 기능 flag를 off로 전환한다. 신규 knowledge files는 manifest-owned 파일만 제거하며 사용자가 작성한 authoritative project docs는 삭제하지 않는다.