# Skill Architecture Rework Inventory

Last-Reviewed: 2026-03-27

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

- Public entrypoint policy is declared in `skill-composition.md` and `README.md`, but legacy docs are not fully mirrored yet.
- Documentation and verification helpers are split across multiple adjacent skills and agents.

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
- `keep`: 31
- `improve`: 9
- `merge_candidate`: 9
- `retire_candidate`: 2

Pre-implementation conclusion:
- the repo has enough good structure to preserve
- the main need is entrypoint hardening and composition cleanup
- the first implementation pass should target metadata, documentation, and bundle reconciliation before deeper behavioral changes
