# Skill Architecture Rework Inventory

Last-Reviewed: 2026-04-24

## Purpose

Provide a pre-implementation classification of all current workflow assets.

## Tier Rules

Allowed call directions:
- Tier 1 -> Tier 2 or Tier 3
- Tier 2 -> Tier 3 or Tier 4
- Tier 3 -> Tier 4 only when execution tooling is required
- Tier 4 -> no orchestration decisions

User-facing tiers:
- Tier 1 by default
- explicit public utilities may exist outside Tier 1 when documented clearly

Internal-only tiers:
- Tier 2
- Tier 3
- Tier 4

## Skills

| Asset | Tier | Decision | Notes |
|---|---|---|---|
| `product-orchestrator` | Tier 1 | `keep` | Product-definition entrypoint. |
| `moonshot-phase-runner` | Tier 1 | `keep` | Large-work and phase-based entrypoint. |
| `moonshot-orchestrator` | Tier 1 | `keep` | Bounded implementation entrypoint. |
| `moonshot-phase-executor` | Tier 2 | `improve` | Keep as internal execution boundary; reduce user-facing visibility. |
| `moonshot-teams-runner` | Tier 2 | `keep` | Parallel composition surface for team workflows. |
| `moonshot-in-session-coordinator` | Tier 2 | `keep` | Required runtime coordination path for isolated in-session attempts. |
| `moonshot-plan-writer` | Tier 2 | `keep` | Phase-runner dependency for master-plan generation. |
| `assumption-ledger` | Tier 3 | `keep` | Clear single responsibility for ambiguity handling. |
| `audit` | Tier 3 | `improve` | Useful concept but boundary against review skills should be clarified. |
| `browser-session` | Tier 3 | `improve` | Treat as browser workflow helper, not a top-level workflow. |
| `browser-verifier` | Tier 3 | `improve` | Preserve, but position under verification composition. |
| `build-error-resolver` | Tier 3 | `keep` | Distinct recovery skill for compile/build failure loops. |
| `code-simplifier` | Tier 3 | `keep` | Local simplification pass restored into the implementation workflow. |
| `codex-review-code` | Tier 3 | `keep` | Semantic code review layer; not replaceable by deterministic gates. |
| `codex-validate-plan` | Tier 3 | `keep` | Valuable independent planning review stage. |
| `commit-moonshot` | Tier 3 | `keep` | Public utility entrypoint for explicit memory-update-plus-commit flow. |
| `completion-verifier` | Tier 3 | `keep` | Completion gate with contract-aware verification logic. |
| `context-readiness-gate` | Tier 3 | `keep` | Useful explicit readiness gate. |
| `design-approval-gate` | Tier 3 | `improve` | Keep if design approval is materially enforced; otherwise narrow its contract. |
| `design-asset-parser` | Tier 3 | `keep` | Concrete preprocessing utility with bounded input/output. |
| `doc-auto-sync` | Tier 3 | `merge_candidate` | Candidate for consolidation into a single doc-ops bundle. |
| `efficiency-tracker` | Tier 3 | `retire_candidate` | Low architectural value unless it drives actual decisions. |
| `failure-analyzer` | Tier 3 | `improve` | Keep as analytical helper, but clarify relation to build and QA failure loops. |
| `frontend-design` | Tier 3 | `keep` | Good public internal skill for UI work; should absorb weaker design helpers. |
| `implementation-runner` | Tier 3 | `keep` | Core execution micro-skill. |
| `karpathy-execution-gate` | Tier 3 | `improve` | Preserve as philosophy gate only if it remains concrete and enforceable. |
| `moonshot-classify-task` | Tier 3 | `merge_candidate` | Should likely live behind orchestrator analysis bundle. |
| `moonshot-decide-sequence` | Tier 3 | `merge_candidate` | Sequence selection belongs behind orchestrator boundary. |
| `moonshot-detect-uncertainty` | Tier 3 | `merge_candidate` | Keep logic, hide invocation behind planning/readiness composition. |
| `moonshot-evaluate-complexity` | Tier 3 | `merge_candidate` | Same as above; classification logic should not widen the public surface. |
| `normalize` | Tier 3 | `merge_candidate` | Candidate to fold under UI/document polish workflow. |
| `polish` | Tier 3 | `merge_candidate` | Candidate to fold under UI/document polish workflow. |
| `pre-flight-check` | Tier 3 | `keep` | Clear safety gate before edits. |
| `product-gate-reviewer` | Tier 3 | `keep` | Product-definition gate with explicit contract. |
| `project-contract-gate` | Tier 3 | `keep` | Important readiness gate for downstream projects. |
| `project-md-refresh` | Tier 3 | `improve` | Useful utility; should stay outside main runtime path unless needed. |
| `qa-flow` | Tier 3 | `merge_candidate` | Overlaps with verification/review flow and should be composed, not surfaced separately. |
| `security-reviewer` | Tier 3 | `keep` | Independent security perspective remains useful. |
| `session-logger` | Tier 3 | `keep` | Doc-ops helper that also remains directly invocable as a public utility. |
| `task-slicer` | Tier 3 | `keep` | Strong product-to-execution bridge skill. |
| `test-driven-development` | Tier 3 | `keep` | Internal Execute-stage owner for TDD-first evidence on behavior-changing work. |
| `teach-impeccable` | Tier 3 | `merge_candidate` | Candidate to fold into frontend or design guidance stack. |
| `vercel-react-best-practices` | Tier 3 | `keep` | Stack-specific rule pack with clear value. |
| `verification-contract-gate` | Tier 3 | `keep` | Strong policy boundary. |
| `verification-evidence-gate` | Tier 3 | `keep` | Strong strict-mode policy boundary. |
| `web-design-guidelines` | Tier 3 | `improve` | Keep as support reference, but align it under the UI stack. |
| `workflow-self-improver` | Tier 3 | `retire_candidate` | Keep only if it produces measurable workflow changes rather than generic reflection. |
| `workspace-isolation-gate` | Tier 3 | `keep` | Important execution-safety boundary. |

## Agents

| Asset | Tier | Decision | Notes |
|---|---|---|---|
| `context-builder` | Tier 3 | `keep` | Still useful as focused context assembly worker. |
| `design-spec-extractor` | Tier 3 | `improve` | Keep, but clarify relationship to design-asset-parser. |
| `documentation-agent` | Tier 3 | `merge_candidate` | Candidate to merge into doc-ops composition with session/doc sync skills. |
| `phase-attempt-agent` | Tier 2 | `keep` | Core isolated attempt worker for phase execution. |
| `project-memory-agent` | Tier 3 | `keep` | Strong repo-specific asset. |
| `project-memory-check` | Tier 3 | `keep` | Useful pre-execution boundary check. |
| `project-memory-reviewer` | Tier 3 | `keep` | Useful post-change compliance perspective. |
| `requirements-analyzer` | Tier 3 | `keep` | Strong front-end planning worker. |
| `team-leader-agent` | Tier 2 | `keep` | Required team coordination boundary. |
| `verification-agent` | Tier 3 | `merge_candidate` | Candidate to hide behind completion/QA verification composition. |

## Known Drift

- Public entrypoint policy is now declared in `skill-composition.md`, `README.md`, `.claude/README.md`, and `.claude/README.ko.md`.
- Documentation and verification helpers remain split across multiple adjacent skills and agents, but they are now positioned behind stage bundles rather than advertised as standalone workflow entrypoints.
- Deprecated assets still exist on disk for compatibility, but `efficiency-tracker` and `workflow-self-improver` are explicitly excluded from the default flow.

## Surface Status Model

The current diet pass uses the following public-surface statuses:

| Status | Intended Use |
|---|---|
| `public_entrypoint` | User-selectable workflow start. |
| `public_utility` | Directly callable utility with a narrow purpose. |
| `internal_stage_owner` | Stage or orchestrator owned; not a user entrypoint. |
| `optional_bundle_member` | Loaded only when a task profile requires the bundle. |
| `deprecated` | Retained for compatibility/history, excluded from default flow. |

Current assignments:

| Status | Assets |
|---|---|
| `public_entrypoint` | `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` |
| `public_utility` | `session-logger`, `commit-moonshot` |
| `internal_stage_owner` | `moonshot-phase-executor`, `moonshot-in-session-coordinator`, analysis micro-skills, readiness gates, `test-driven-development`, execution helpers, review/verification gates |
| `optional_bundle_member` | `doc-auto-sync`, `browser-verifier`, `qa-flow`, `web-design-guidelines`, `normalize`, `polish`, `teach-impeccable`, selected UI/browser/doc helpers |
| `deprecated` | `efficiency-tracker`, `workflow-self-improver` |

## Invocation Policy Draft

Use:
- `product-orchestrator` for idea-to-plan work
- `moonshot-phase-runner` for large, multi-phase, or long-running work
- `moonshot-orchestrator` for bounded implementation work that does not need the phase harness

Avoid direct user invocation of:
- analysis micro-skills
- most gates
- phase executor
- most document operation helpers except explicit public utilities such as `session-logger`

## Decision Summary

Counts:
- `keep`: 32
- `improve`: 9
- `merge_candidate`: 9
- `retire_candidate`: 2

Pre-implementation conclusion:
- the repo has enough good structure to preserve
- the main need is entrypoint hardening and composition cleanup
- the first implementation pass should target metadata, documentation, and bundle reconciliation before deeper behavioral changes

## 2026-04-24 Diet Pass Notes

This pass intentionally did not delete skills, rename files, or rewrite runtime dispatch.

Actions taken:
- added `surfaceStatus` metadata to targeted internal, optional, and deprecated skills
- clarified that analysis micro-skills are orchestrator-internal
- demoted `moonshot-in-session-coordinator` to an advanced fallback path rather than a default public route
- positioned UI/design, doc-ops, browser, and guided QA helpers as optional bundle members
- retained deprecated assets only for explicit reporting, historical analysis, or maintenance review

Deferred:
- installer filtering for deprecated skills
- automated verification-contract enforcement of surface-status drift
- physical archival/removal of deprecated skill directories

## 2026-04-24 Wave 2 Notes

Wave 2 strengthened weak operating procedures without replacing the runtime core.

Actions taken:
- added local `test-driven-development` skill as an internal Execute-stage owner
- added TDD evidence fields to sprint, task, and QA templates
- strengthened `failure-analyzer` and `build-error-resolver` with root-cause-first debugging rules
- strengthened `workspace-isolation-gate` with concrete prepare/baseline evidence requirements
- strengthened plan validation and plan templates with exact files, commands, fail/pass signals, blockers, review checkpoints, and evidence paths
- added task-level `FULL / PARTIAL / NO` vocabulary to scorecard templates and renderer
- added `external-harness-adoption` pilot registry and review template

Still deferred:
- external benchmark runtime integration
- production installation of external skills
