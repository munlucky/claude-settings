# Phase 06 - Recursive Improvement Lifecycle

## Phase Execution Metadata
```yaml
phase: 06
title: "Recursive Improvement Lifecycle"
dependsOn: [02, 03, 05]
conflicts: []
ownedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/schemas/improvement-proposal.schema.json"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/scripts/knowledge-improvement-lifecycle.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/scripts/knowledge-improvement-lifecycle.test.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/docs/guidelines/project-knowledge-plane.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/skills/harness-memory-promoter/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.codex/skills/harness-memory-promoter/SKILL.md"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/**"
adoptionTargets:
  - "Phase 07 controlled adoption only"
readOnlyPaths:
  - ".claude/schemas/**"
  - ".claude/scripts/**"
  - ".claude/docs/guidelines/**"
  - ".claude/skills/**"
  - ".codex/skills/**"
  - ".claude/memorygraph/**"
  - ".claude/cache/memorygraph/**"
sharedMutablePaths:
  - ".claude/workflow.registry.yaml"
mergePolicy: "project-local write by default; global/harness promotion requires review manifest"
liveMutationPolicy: "staged only"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-007 | AC-007 | Project and harness recursive improvement lifecycle. | lifecycle tests |

## Goal
Define and validate recursive improvement for both project knowledge and the harness meta-project without letting one project automatically rewrite global or harness policy.

## Scope
- Implement lifecycle states: `observe`, `stage`, `verify`, `promote`, `supersede`, `archive`.
- Support `project-local`, `global-candidate`, and `harness-meta-project` targets.
- Require review/replay evidence for global or harness promotion.
- Record denial reasons for unsafe promotion.

## Harness Meta-Project Contract
- Harness project id: `moonshot-harness-core`.
- Harness knowledge root: `%USERPROFILE%/.codex/state/projects/moonshot-harness-core/knowledge`.
- Harness improvement root: `%USERPROFILE%/.codex/state/projects/moonshot-harness-core/improvement`.
- Candidate release root: `%USERPROFILE%/.codex/harness/releases/candidate`.
- Stable release root: `%USERPROFILE%/.codex/harness/releases/stable`.
- Required promotion artifacts:
  - `improvement/proposals/<proposalId>.yaml`
  - `improvement/reviews/<proposalId>-review.yaml`
  - `improvement/replay/<proposalId>-replay.json`
  - `improvement/rollback/<proposalId>-rollback.json`
  - `improvement/releases/<proposalId>-release-manifest.json`
- Candidate promotion requires proposal + review + targeted self-test. Stable promotion requires candidate evidence + affected-project replay + rollback manifest + release manifest.

## Non-Scope
- Do not auto-promote global or harness facts.
- Do not change existing MemoryGraph backend.

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Add improvement proposal schema. | schema + tests | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/scripts/knowledge-improvement-lifecycle.test.mjs` | proposal target/state validated | ambiguous target accepted |
| T02 | Add promotion security rules. | lifecycle helper | same test | transcript-only/untrusted candidate rejected | poisoning candidate promotes |
| T03 | Add harness meta-project contract. | guideline + skill docs | same test | `moonshot-harness-core` target requires replay/review | harness self-change promotes without gate |
| T04 | Update promoter skill contract to consume proposal/review manifest. | skill docs + mirrors | `node .claude/scripts/harness-propagation-parity.mjs --json --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06` | mirror parity passes | project-local fact promoted by default |

## Acceptance Criteria
- AC-007: Project-local observation can become semantic fact only after verification.
- AC-012: Global/harness promotion requires independent review and replay evidence.
- AC-013: Unsafe promotion records denial reason and does not block unrelated workflow.
- AC-018: Harness stable promotion is impossible without review, replay, rollback, and release manifest evidence.

## Verification Plan
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/scripts/knowledge-improvement-lifecycle.test.mjs`
- `node .claude/scripts/harness-propagation-parity.mjs --json --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06`
- `git diff --check -- .claude .codex docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Lifecycle state machine tests pass.
- [ ] Harness meta-project promotion gate is documented.
- [ ] Unsafe candidates are rejected with durable reasons.
