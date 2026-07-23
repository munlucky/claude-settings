# Phase 01 — Baseline, Project Identity, Knowledge Contracts v1

## Status

`ready_after_preflight`

## Objective

Kernel 프로젝트 지식 라이프사이클의 제품 경계, project identity, record contract, authority hierarchy, migration 금지 원칙을 고정한다. Relay 자산은 source pattern만 선별 재사용하고 Kernel runtime/state namespace는 독립적으로 설계한다.

## Dependencies

없음.

## Inputs and Read-only References

- `kernel/product.yaml`
- `kernel/context-policy.yaml`
- `scripts/kernel/runtime-home.mjs`
- `scripts/kernel/control-plane.mjs`
- `scripts/kernel/state-store.mjs`
- `scripts/project-identity.mjs`
- `scripts/knowledge-records.mjs`
- `scripts/knowledge-improvement-lifecycle.mjs`
- `schemas/verification.contract.yaml`
- 기존 Kernel isolation/no-migration 테스트

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - scripts/kernel/project-identity.mjs
  - scripts/kernel/knowledge/records.mjs
  - schemas/kernel.knowledge-record.schema.json
  - schemas/kernel.knowledge-contract.schema.json
  - kernel/knowledge-policy.yaml
  - tests/kernel-project-identity.test.mjs
  - tests/kernel-knowledge-records.test.mjs
  - tests/kernel-knowledge-isolation.test.mjs
readOnlyPaths:
  - scripts/project-identity.mjs
  - scripts/knowledge-records.mjs
  - scripts/knowledge-improvement-lifecycle.mjs
  - scripts/kernel/runtime-home.mjs
  - kernel/product.yaml
```

## Surface Classification

- Source contracts: `source_only`
- Kernel project knowledge root 생성: `data_or_state_migration`
- Relay knowledge/state read: 금지

Policy sources: `AGENTS.md`, `kernel/product.yaml`, `package/kernel/manifest.json`, `schemas/verification.contract.yaml`.

## Design Decisions

### Project identity

Resolver 우선순위:

1. `.moon-relay/project.identity.yaml`
2. Kernel account-root alias registry
3. canonical git remote
4. `package.json` name
5. git root basename
6. normalized path hash

결과에는 `projectId`, `projectRoot`, `identitySource`, `aliases`, `identityDigest`를 포함한다. 현재 작업 디렉터리명만으로 durable identity를 결정하지 않는다.

### Namespace

```text
~/.moon-relay-kernel/state/projects/<projectId>/knowledge/
```

Relay의 `~/.moonshot-relay/state/projects/**` 및 legacy `.claude/memorygraph/**`를 읽거나 수정하지 않는다.

### Record types

- `policy_anchor`
- `semantic_fact`
- `episodic_observation`
- `kg_relation`
- `ontology_constraint`
- `provenance_event`
- `knowledge_candidate`

각 record는 `projectId`, `id`, `status`, timestamps, source/provenance, supersedes를 가진다. verified fact는 fresh verification evidence 없이는 생성할 수 없다.

### Trust tiers

`authoritative > verified > derived > quarantined > degraded`

Raw external/tool/browser/transcript 내용은 `quarantined` 이상으로 자동 승격할 수 없다.

## Tasks

1. Relay resolver의 플랫폼·remote normalization 로직을 Kernel namespace로 포팅한다.
2. Kernel knowledge contract와 record schemas를 작성한다.
3. status transition과 supersession 규칙을 구현한다.
4. cross-project supersession과 projectId spoofing을 차단한다.
5. knowledge root와 Relay root가 동일하거나 중첩되면 fail closed 처리한다.
6. empty/not-configured/degraded 상태 vocabulary를 확정한다.
7. ADR-0001과 traceability row를 코드 계약에 연결한다.

## Acceptance Criteria

- 동일 repository는 경로가 달라도 canonical remote 기준으로 동일 `projectId`를 얻는다.
- 서로 다른 remote의 동일 basename 프로젝트가 충돌하지 않는다.
- Kernel resolver와 storage는 Relay home을 읽거나 쓰지 않는다.
- 잘못된 record/status transition은 typed error로 거부된다.
- verified semantic fact는 evidence/provenance 없이 저장되지 않는다.
- supersession cycle과 cross-project overwrite가 거부된다.

## Verification and Evidence

- RED: identity collision, path alias, namespace overlap, invalid transition fixtures
- GREEN: targeted Kernel identity/record/isolation tests
- repository policy가 허용하는 경우 `npm run test:kernel`
- ontology contract validation
- evidence paths와 command output을 Phase QA ledger에 기록

## Rollback

신규 source 파일과 신규 Kernel namespace fixture만 제거한다. Relay runtime/state에는 rollback 동작이 없어야 한다.

## Handoff

Phase 02는 이 Phase의 `projectId`, record schema, knowledge root, status vocabulary를 변경 없이 소비한다.