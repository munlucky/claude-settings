---
name: moonshot-phase-runner
description: 준비된 plan package에서 large, phase-based, long-running implementation을 실행할 때 사용합니다.
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
deepReferences:
  - references/control-plane.md
  - references/execution-modes.md
  - references/closeout-gates.md
---

# Moonshot Phase Runner

## 역할

phase 기반 작업의 public control-plane entrypoint입니다. active plan directory를 찾고, package를 검증하고, `phase-status.yaml`을 seed/reconcile하며, in-session/forked-agent 실행 경로를 선택합니다. 전체 plan directory가 끝나거나 구체적 blocker가 기록될 때까지 run을 계속 진행합니다.

## Hard Stops

- `작업시작`, `start work`, `run this plan`, plan directory와 master plan만 주어진 요청은 전체 plan 실행 의도로 취급합니다. 사용자가 `Phase 01만`, `only phase 01`처럼 단일 phase만 명시하지 않는 한 Phase 01, waiver phase, preparation slice로 임의 축소하지 않습니다.
- `phase-status.yaml`에 actionable phase가 남아 있으면 completed phase 하나를 plan completion으로 취급하지 않습니다.
- `phase-status.yaml`, verifier JSON, QA report, scorecard, handoff, child chat output만으로 clean-finish authority를 만들지 않습니다. blocker, resume, run state, whole-plan completion authority는 `runtime-state.sqlite` DB read model과 `scripts/runtime-state.mjs assess-completion`의 accepted DB decision에서 옵니다.
- blocker state, resume reconstruction, run status, whole-plan completion decision은 `runtime-state.sqlite`를 authority로 봅니다. `phase-status.yaml`은 phase cursor projection일 뿐입니다.
- architecture package에서 파생된 phase plan은 선택된 ADR, traceability row, owner, verification signal이 phase metadata에 없으면 실행하지 않습니다.
- phase metadata에 `architecture.required=true`가 있는데 `ARCHITECTURE_HANDOFF.json`이 없거나 blocked 상태이거나 selected verification signals가 없으면 dispatch하지 않습니다.
- completed phase가 review finding, failed eval evidence, non-accepted completion decision을 만들었다는 이유만으로 whole plan을 멈추지 않습니다. blocker를 carry-forward evidence로 기록하고 final completion gate는 닫은 채 다음 independent actionable phase를 계속합니다.
- prose만 보고 phase가 parallelizable하다고 가정하지 않습니다. Parallel execution에는 dependencies satisfied와 non-overlapping write sets가 검증된 plan graph metadata가 필요합니다.
- staged redesign phase에서 live `.claude/**` 또는 `.codex/**` adoption target을 바로 쓰지 않습니다. controlled adoption phase가 소유해야 합니다.
- `agent-loop.mjs`, `moonshot-phase-dispatch.mjs`, delegated-terminal adapter를 기본 실행 경로로 사용하지 않습니다. legacy/headless compatibility adapter로만 취급합니다.
- in-session coordinator, fresh verifier evidence, scorecard, repository closeout evidence가 동의하기 전에는 final success를 반환하지 않습니다.

## Inputs

- 선택적 plan directory argument.
- plan directory 안의 선택적 master plan path.
- 선택적 run identity arguments: `--run-id`, `--goal-id`, `--workspace-id`.
- 같은 goal에 active run이 이미 있을 때만 명시적으로 허용하는 선택적 `--allow-parallel`.
- controlled lease window를 위한 선택적 `--lease-ttl-ms`; long phase는 stale active lease에 의존하지 말고 heartbeat해야 합니다.
- active status file: `.moonshot-relay/docs/phase-status.yaml`이며, phase cursor projection으로만 사용합니다.
- 실행 경로: 기본값은 `in-session-coordinator`입니다. `delegated-terminal`은 legacy compatibility 전용이며 명시적인 legacy 유지보수 사유가 필요합니다.
- execution artifacts: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, attempt manifest, verifier verdict.

## Flow

1. `phase-status.yaml` phase cursor projection에서 active plan directory와 active phase를 결정합니다.
2. master plan, root phase docs, execution root consistency를 검증합니다.
2.1. plan graph metadata가 있으면 dispatch 전에 검증합니다. 없으면 markdown-compatible sequential mode로 계속하고 parallelism을 추론하지 않습니다.
3. 명시적 `runId + goalId + workspaceId`로 run을 prepare/resume합니다. 없을 때만 고유 run ID를 생성합니다.
4. 같은 goal을 다른 active run이 이미 소유하면 `--allow-parallel` 없이는 block합니다.
5. expired lease는 stale로 취급하고 runtime-state로 recover하며, 오래된 active run은 숨기지 않고 `compactStatus.staleWarnings`로 phase handoff에 노출합니다.
6. long-running phase는 lease window가 끝나기 전에 `scripts/runtime-state.mjs heartbeat-run-lease`로 heartbeat합니다.
7. sandbox-sensitive tool call 전에는 protected paths와 approval-required operation을 `tools/sandbox/policy.mjs check --json`으로 확인합니다.
8. active phase contract에서 compact phase-attempt brief를 만듭니다.
8.1. declared read-only paths와 owned/write-set paths를 phase-attempt brief에 포함합니다. write set 밖의 변경 파일은 scope drift로 기록해야 합니다.
9. architecture-derived plan에서는 active phase에 필요한 selected ADR, traceability, owner, verification signal, architecture review path만 붙입니다.
10. phase metadata에 `architecture.handoff`가 있으면 `status=ready`를 요구하고 `ARCHITECTURE_HANDOFF.promptBlock`과 compact metadata만 붙이며 blocked handoff dispatch는 reject합니다.
11. interactive run에서는 현재 세션이 조정하고 각 phase attempt/review는 fresh forked agent에 위임합니다.
12. deterministic script는 runtime payload에 남아 있는 support check에만 사용합니다. legacy delegated-terminal adapter를 자동 시작하지 않습니다.
13. 각 phase 뒤 parent session이 diff/evidence를 수집하고 closeout gate를 실행합니다.
14. phase-local closeout evidence로 phase가 완료되면 status를 reconcile해서 다음 incomplete phase가 active가 되게 한 뒤 상태를 보고합니다.
15. closeout gate가 유용한 implementation evidence 이후 phase를 reject하면 `record-eval-result --regression-worsened true` 또는 blocking runtime event로 기록하고, finding을 carry-forward state에 남긴 뒤 다음 independent actionable phase를 계속합니다.
16. 전체 plan directory가 구현될 때까지 다음 actionable phase로 계속 진행합니다. 최종 whole-plan completion claim만 `assess-completion`의 `accepted`가 필요합니다.

## Required Evidence

- plan resolution과 active phase source.
- execution mode와 명시적 legacy fallback 사유.
- tool/fork/browser path가 없을 때 runtime capability evidence.
- code-changing phase의 review evidence.
- plan graph validation evidence 또는 명시적 markdown-compatible mode evidence.
- fresh verifier verdict와 scorecard agreement.
- coordinator closeout evidence와 phase closeout result.
- whole-plan success 전 Final Git Closeout evidence.

## References

- `references/control-plane.md`: state authority, phase discovery, parent evidence collection.
- `references/execution-modes.md`: forked-agent primary path와 legacy delegated-terminal boundary.
- `references/closeout-gates.md`: review, verification, finalizer, repository closeout rules.

## Project Knowledge Context Contract

phase attempt prompt를 만들기 전에 staged `knowledge-context-build.mjs` helper를 `stage=execute`로 호출하고, `projectKnowledgeContext.promptBlock`과 status-only metadata만 붙입니다.

필수 metadata surface:
- `status`, `strictness`, `stage`, `blocking`, `unavailableCount`, `knowledgeRevision`.
- raw MemoryGraph record, KG edge, ontology dump, log, transcript, secret-like string은 phase prompt, attempt manifest, workflow evidence, QA report, scorecard, handoff에 넣지 않습니다.
- advisory mode에서 helper가 불가하면 `status=degraded_read`로 degrade하고 계속합니다. strict memory mode에서 helper가 불가하면 dispatch 전에 blocking metadata로 표현합니다.
