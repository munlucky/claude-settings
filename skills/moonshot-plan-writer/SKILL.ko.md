---
name: moonshot-plan-writer
description: phase 기반 작업을 위한 project-scoped account-root master plan과 phase plan을 생성, 갱신, 정리합니다.
triggers:
  - "write plan"
  - "master plan"
  - "phase plan"
  - "implementation plan"
deepReferences:
  - references/plan-package-contract.md
  - references/independent-review-loop.md
---

# Moonshot Plan Writer

## 역할

phase runner가 추측 없이 실행할 수 있는 phase-plan package를 생성하거나 개정합니다. 산출물은 master plan, numbered phase docs, execution metadata, acceptance criteria, blocker, surface classification, 명확한 adoption boundary입니다.

기본 산출 위치는 `scripts/project-identity.mjs`가 resolve한 account-root project namespace입니다. 예: `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>/`. 사용자가 tracked source design package를 명시적으로 요청했거나 기존 tracked doc 자체를 수정하는 경우에만 repo-local `docs/implementation/<plan-slug>/`를 사용합니다.

## Hard Stops

- phase docs, dependencies, owned paths, read/write-set boundaries, acceptance evidence가 빠진 plan을 execution-ready로 표시하지 않습니다.
- `TRACEABILITY_MATRIX.md`, 선택된 `ADR/*.md`, `ARCHITECTURE_REVIEW.md`, task owner/verification signal mapping이 없으면 architecture package handoff를 수락하지 않습니다.
- 필요한 `ARCHITECTURE_CONTRACT_SLICE` 또는 `ARCHITECTURE_HANDOFF`가 없거나 blocked 상태이거나 verification signals가 없으면 architecture-heavy plan을 execution-ready로 표시하지 않습니다.
- child planning agent가 source plan을 직접 수정하게 두지 않습니다. parent session이 최종 plan edit을 소유합니다.
- plan이 controlled adoption phase를 명시적으로 예약하지 않았다면 early redesign phase에 live `.claude/**` adoption을 넣지 않습니다.
- 이 repository의 harness, package, doctor, installer, profile-parity 명령을 generic plan에 hard-code하지 않습니다. 구체 gate 명령은 대상 프로젝트의 policy source에서 가져오거나 missing policy로 기록해야 합니다.
- package/runtime payload, installed profile, external service, data/state를 변경하는 plan은 해당 surface를 분류하고 required evidence slot을 명명하기 전에는 execution-ready로 표시하지 않습니다.
- unresolved ambiguity를 숨기지 않습니다. assumption, blocker, user question 중 하나로 기록합니다.

## Flow

1. 사용자 objective와 기존 plan directory를 식별합니다.
1.1. project identity를 resolve하고 plan root를 선택합니다. 여러 repository 작업이 겹치지 않도록 `namespaces.planningPackageRoot/<plan-slug>/`를 우선 사용합니다. master plan metadata에는 projectId와 선택된 account-root plan directory를 기록합니다.
2. 현재 artifact와 stale phase docs를 감사합니다.
3. `00-master-plan-*.md`와 root `NN-*.md` phase file을 draft 또는 refresh합니다.
4. 모든 planned change surface를 `source_only`, `package_runtime_payload`, `installed_profile_or_account_root`, `external_deployment_or_service`, `data_or_state_migration` 중 하나로 분류합니다.
5. root `AGENTS.md`, verification contract, deployment runbook, package contract, migration policy, project-local guideline anchor처럼 해당 surface에 적용되는 local policy source만 읽습니다.
6. phase execution metadata를 추가합니다: dependencies, conflicts, owned paths, staged paths, read-only paths, write-set boundaries, adoption targets, live mutation policy, policy source paths, required evidence slots.
7. architecture package가 있으면 선택된 ADR과 `TRACEABILITY_MATRIX.md` row를 phase scope, owner, verification signal, acceptance evidence에 매핑합니다.
8. `ARCHITECTURE_HANDOFF.json`이 있으면 path, status, selected decision IDs, selected constraint IDs, owned/read-only/staged paths, verification signal IDs, blocking preconditions만 phase metadata에 싣습니다.
9. independent review loop는 sidecar review로 실행하고, parent가 accepted edit만 적용합니다.
10. readiness, traceability, handoff status, phase boundary, surface classification, policy-sourced adoption check가 만족된 뒤에만 execution을 준비합니다.

## Required Evidence

- plan directory와 master plan path.
- dependency, read-only paths, owned paths, write-set boundaries가 포함된 phase inventory.
- phase evidence에 매핑된 acceptance criteria.
- architecture package를 사용한 경우 traceability matrix, selected ADR, architecture review, Brownfield evidence boundary가 포함된 path inventory.
- architecture handoff를 사용한 경우 handoff path와 status, selected constraints, selected verification signals, blocked/ready decision.
- review loop finding과 accepted change.
- 모든 planned mutation에 대한 surface classification, policy source path, required evidence slot.
- scope에 포함된 workflow, skill, agent, package/runtime, deployment/service, profile/account-root, data/state surface에 대한 explicit adoption strategy.
- 구체 gate 명령은 대상 프로젝트 policy document에서 나온 경우에만 기록합니다. 그렇지 않으면 missing policy를 blocker 또는 assumption으로 기록합니다.
- package가 graph execution을 주장할 때 plan graph readiness evidence. Markdown-only package는 계속 지원하지만, validated DAG metadata 없이는 graph-ready로 표시하지 않습니다.

## References

- `references/plan-package-contract.md`: required files, phase metadata, readiness checks.
- `references/independent-review-loop.md`: reviewer loop rule과 parent-owned edit boundary.

## Project Knowledge Context Contract

planning intake는 `stage=plan`의 `projectKnowledgeContext`를 사용할 수 있지만, omission과 status를 typed metadata로 보존해야 합니다. independent review prompt에는 compact `## Project Knowledge Context` block만 전달합니다.

plan package에는 knowledge status와 omission category만 기록할 수 있습니다. raw MemoryGraph/KG/ontology record, runtime log, transcript, secret-like string을 master plan, phase docs, review brief에 복사하지 않습니다.
