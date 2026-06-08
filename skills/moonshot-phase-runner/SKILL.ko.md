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

- `phase-status.yaml`에 actionable phase가 남아 있으면 completed phase 하나를 plan completion으로 취급하지 않습니다.
- `phase-status.yaml`, verifier JSON, QA report, scorecard, handoff, child chat output만으로 clean-finish authority를 만들지 않습니다. blocker, resume, run state, whole-plan completion authority는 `runtime-state.sqlite` DB read model과 `scripts/runtime-state.mjs assess-completion`의 accepted DB decision에서 옵니다.
- staged redesign phase에서 live `.claude/**` 또는 `.codex/**` adoption target을 바로 쓰지 않습니다. controlled adoption phase가 소유해야 합니다.
- `agent-loop.mjs`, `moonshot-phase-dispatch.mjs`, delegated-terminal adapter를 기본 실행 경로로 사용하지 않습니다. legacy/headless compatibility adapter로만 취급합니다.
- in-session coordinator, fresh verifier evidence, scorecard, repository closeout evidence가 동의하기 전에는 final success를 반환하지 않습니다.

## Inputs

- 선택적 plan directory argument.
- plan directory 안의 선택적 master plan path.
- active status file: `.moonshot-relay/docs/phase-status.yaml`이며, phase cursor projection으로만 사용합니다.
- 실행 경로: 기본값은 `in-session-coordinator`입니다. `delegated-terminal`은 legacy compatibility 전용이며 명시적인 legacy 유지보수 사유가 필요합니다.
- execution artifacts: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, attempt manifest, verifier verdict.

## Flow

1. `phase-status.yaml` phase cursor projection에서 active plan directory와 active phase를 결정합니다.
2. master plan, root phase docs, execution root consistency를 검증합니다.
3. active phase contract에서 compact phase-attempt brief를 만듭니다.
4. interactive run에서는 현재 세션이 조정하고 각 phase attempt/review는 fresh forked agent에 위임합니다.
5. deterministic script는 runtime payload에 남아 있는 support check에만 사용합니다. legacy delegated-terminal adapter를 자동 시작하지 않습니다.
6. 각 phase 뒤 parent session이 diff/evidence를 수집하고 closeout gate를 실행합니다.
7. 전체 plan directory가 완료될 때까지 다음 actionable phase로 계속 진행합니다.

## Required Evidence

- plan resolution과 active phase source.
- execution mode와 명시적 legacy fallback 사유.
- tool/fork/browser path가 없을 때 runtime capability evidence.
- code-changing phase의 review evidence.
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
