# Phase 04 - SQLite Runtime Knowledge and Derived Projection

## Objective

Runtime knowledge revision, context, ontology, typed retrieval의 authority를 SQLite로 일원화하고 JSON/JSONL을 완전 재생성 가능한 derived projection으로 전환한다.

## Phase Execution Metadata

```yaml
phaseExecutionMetadata:
  phaseId: PH-04
  dependsOn: [PH-03]
  executionMode: sequential
  entryState: atomic_authority_ready
  exitState: sqlite_runtime_authority_ready
  owners:
    primary: knowledge-runtime
    verification: projection-recovery
  verificationSignals:
    - VS-sqlite-only-runtime-read
    - VS-typed-context-routing
    - VS-projection-rebuild-parity
    - VS-projection-failure-recoverable
    - VS-revision-source-consistency
```

## Surface Classification

- `source_only`: context/ontology readers, projection service, repair command, tests.
- `data_or_state_migration`: no record rewrite by default; reader authority switch and projection metadata only.
- `package_runtime_payload`: repair/status CLI additions are Phase 05 promotion 대상이며 이 Phase에서는 internal API만 구현한다.

## Owned Paths

```text
scripts/kernel/knowledge/context-load.mjs
scripts/kernel/knowledge/ontology-evaluate.mjs
scripts/kernel/knowledge/projection.mjs
scripts/kernel/knowledge/canonical-record.mjs
scripts/kernel/persistence/knowledge-repository.mjs
scripts/kernel/control-plane.mjs
scripts/kernel/state-store.mjs
tests/kernel-sqlite-runtime-knowledge.test.mjs
tests/kernel-typed-context-retrieval.test.mjs
tests/kernel-projection-rebuild-equivalence.test.mjs
tests/kernel-projection-failure-recovery.test.mjs
```

## Read-Only Paths

```text
scripts/kernel/knowledge/store.mjs
scripts/kernel/knowledge/context-render.mjs
scripts/kernel/knowledge/path-scope.mjs
package/package-contract.yaml
```

## Write-Set Boundary

- Existing JSONL files는 migration input 또는 derived output으로만 사용한다.
- Runtime start/context/review/completion에서 JSONL fallback 금지.
- Legacy import는 별도 explicit command 없이는 실행하지 않는다.

## Work

1. `startRun()`의 knowledge revision을 `knowledge_revisions` SQLite row에서 읽는다.
2. `buildProjectKnowledgeContext()`는 mandatory stateStore/repository를 받고 SQLite committed records만 읽는다.
3. Context를 다음 typed category로 구성한다.
   - policyAnchors
   - semanticFacts
   - architectureDecisions
   - domainTerms
   - componentBoundaries
   - apiContracts
   - graphRelations
   - ontologyConstraints
   - episodicObservations/tacitPractices
   - knownFailurePatterns
   - requiredVerifications
4. Stage policy는 exact type을 적용하며 `semantic_fact` 허용이 모든 type을 우회하지 않게 한다.
5. Policy, graph, ontology를 포함한 전체 context item에 relevance score와 token estimate를 적용한다.
6. Ontology evaluator는 SQLite committed ontology constraints를 읽는다.
7. `listKnowledgeRecords()`는 DB columns와 record JSON을 canonical하게 병합한다.
8. Projection은 SQLite committed set 전체를 type별 파일로 atomic replacement한다.
9. `revision.json`은 SQLite revision을 그대로 투영한다.
10. Projection file을 모두 삭제한 뒤 rebuild하여 동일 set/digest가 나오는 repair path를 구현한다.
11. Projection 실패는 authority finalization을 취소하지 않고 recoverable failure receipt를 남긴다.
12. Runtime code에서 `loadAllProjectRecords()` 호출이 남아 있지 않은지 contract test로 검사한다.

## Projection Layout

```text
knowledge/semantic/verified-facts.jsonl
knowledge/architecture/records.jsonl
knowledge/graph/kg-relations.jsonl
knowledge/ontology/constraints.jsonl
knowledge/episodic/observations.jsonl
knowledge/provenance/prov-log.jsonl
knowledge/revision.json
```

## Acceptance Criteria

- 정상 runtime lifecycle은 projection directory가 없어도 동작한다.
- Run start revision과 authority transaction expected revision이 같은 SQLite source를 사용한다.
- Ontology constraint 변경은 SQLite commit 이후 즉시 review에 반영된다.
- 각 canonical type이 올바른 context category에 들어간다.
- 전체 context payload가 stage budget을 넘지 않는다.
- Projection A 이후 commit B를 수행해도 A와 B가 모두 projection에 존재한다.
- Projection 삭제 후 rebuild 결과 record IDs, types, statuses, revision이 SQLite와 동일하다.
- Projection write failure 이후 다음 run/finalization이 stale file revision 때문에 차단되지 않는다.

## Spec-Test Obligations

- FAR-REQ-005, FAR-REQ-006, FAR-REQ-007
- FAR-SCN-010, FAR-SCN-011, FAR-SCN-012

## Verification

```bash
node --test tests/kernel-sqlite-runtime-knowledge.test.mjs tests/kernel-typed-context-retrieval.test.mjs tests/kernel-projection-rebuild-equivalence.test.mjs tests/kernel-projection-failure-recovery.test.mjs
npm run test:kernel
npm run test:package
```

## Evidence

```text
artifacts/kernel/finalization-refactor/phase-04/sqlite-read-authority.json
artifacts/kernel/finalization-refactor/phase-04/typed-context-matrix.json
artifacts/kernel/finalization-refactor/phase-04/projection-equivalence.json
artifacts/kernel/finalization-refactor/phase-04/projection-failure-recovery.json
artifacts/kernel/finalization-refactor/phase-04/runtime-jsonl-callers.json
```

## Risks and Rollback

- 기존 JSONL만 존재하는 사용자는 explicit migration/repair 명령 전까지 SQLite에 없는 legacy records를 runtime에서 보지 못할 수 있다. Phase 01 inventory로 영향 범위를 확인하고 explicit import를 별도 migration으로 제공한다.
- Reader authority 전환은 feature flag가 아니라 일괄 전환하되, 이전 commit으로 rollback 가능한 단일 commit boundary를 유지한다.
