# Phase 01 - Current Truth Baseline and Source Preservation v2

## Goal

Freeze the full source scope, current repository truth, generated-state boundaries, and implementation drift before further execution.

## Execution Metadata

- Dependencies: none.
- Owned paths: `docs/public/roadmaps/harness-control-plane-modernization/**`, `README.md`, `docs/public/repository-layout.md`.
- Read-only paths: `.claude/**`, `.codex/**`, `.moonshot-relay/**`, `.moonshot-state/**`, generated DB/log/trace/cache/verdict artifacts, live account-root homes.
- Adoption targets: tracked source docs only.
- Live mutation policy: no live profile, account-root, package output, or downstream mutation.
- Required evidence: phase inventory, source-scope gap analysis, review artifact, `git status --short`, `git diff --check`.
- Conflicts: any new untracked plan root outside this roadmap, source docs that claim v1 is final, generated-state promotion.
- Staged paths: roadmap docs and planning-loop review artifacts only.
- Closure traceability: `gap-analysis-v1-vs-source-reports.md`, `implementation-wave-map-v2.md`, `planning-loop/plan-quality-review-iter-03.yaml`.

## Required Work

- Record the two downloaded reports and the full-spec pasted plan as the source-scope authority.
- Mark `v1` as a Wave 1 foundation candidate, not final modernization completion.
- Keep current implementation evidence mapped to Wave 1 without claiming later phases complete.
- Confirm canonical source boundaries from root `AGENTS.md` and public repository layout.
- Capture baseline commands: `npm test`, `npm run test:package`, package dry-run, installer dry-run, and `git diff --check`.
- Record dirty/staged files before phase execution so user work is not reverted.

## Acceptance Criteria

- `gap-analysis-v1-vs-source-reports.md` exists.
- `planning-loop/plan-quality-review-iter-02.yaml` rejects v1 scope shrink.
- `implementation-wave-map-v2.md` maps current changes without overstating completion.
- Later phases can be executed independently from this phase document.

## Regression Contract

- v1 remains labeled as foundation/partial only.
- v2 remains the execution authority for full-source scope.
- Plan Artifact Closure Gate verifies expected files exist.
- `rg` finds runtime, context, tool registry, sandbox, eval, memory, CI/security, packaging, and observability scope in v2.

## Completion Evidence

- `rg --files docs/public/roadmaps/harness-control-plane-modernization`
- `rg -n "full-source-scope|foundation-candidate|Context State Engine|Tool Registry|Sandbox Compute|AWTL|Observability" docs/public/roadmaps/harness-control-plane-modernization`
- `git diff --check`
