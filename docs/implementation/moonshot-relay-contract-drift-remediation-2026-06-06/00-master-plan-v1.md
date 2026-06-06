# Moonshot Relay Contract Drift Remediation Master Plan v1

## Objective

Close the remaining Moonshot Relay contract drift found by independent issue audits. The work fixes installed-runtime path breakage, account-root knowledge path drift, active test blind spots, package/materialization boundary drift, installer/runtime behavior gaps, and skill/docs/shell platform inconsistencies.

## Source Baseline

- User issue list from 2026-06-06 contract drift audit.
- Six independent planning agents covering install paths, memory/knowledge, test guards, packaging, installer/runtime, and skill/docs/shell cleanup.
- Current repository verification state: `npm test` passed 51/51 and `git diff --check` passed before plan writing, but those gates do not cover all drift classes.

## Plan Quality Loop

```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 2
  isolationMode: forked
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.86
  ambiguityScore: 0.18
  decision: pass
  reviewerSessions:
    - install-broken-paths
    - memory-knowledge-drift
    - contract-test-drift
    - packaging-boundary
    - installer-runtime-platform
    - skill-docs-shell-cleanup
  artifactRoot: docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/planning-loop
  latestReview: docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/planning-loop/plan-quality-review-iter-02.yaml
  blockingFindings: []
  remainingImprovementDirectives:
    - Confirm whether existing installed Codex config migration is opt-in only or should emit a dry-run warning.
    - Decide whether docs/public/guidelines should be deepened in this package or split into a later documentation-quality package.
  remainingOpenDecisions:
    - Downstream installed profile adoption is out of scope unless explicitly requested.
```

## Plan Package Readiness

```yaml
planPackageReadiness:
  mode: prepared_now
  selectedMasterPlan: docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/01-installed-runtime-path-contract-v1.md
    - docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/02-account-root-memory-knowledge-v1.md
    - docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/03-contract-test-drift-guards-v1.md
    - docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/04-packaging-materialization-boundary-v1.md
    - docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/05-installer-runtime-platform-v1.md
    - docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/06-skill-docs-shell-cleanup-v1.md
  dirtyWorktreeAction: classify_before_edit
  readinessDecision: runnable
```

## Phase Index

| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Installed Runtime Path Contract | `01-installed-runtime-path-contract-v1.md` | - |
| 02 | Account-Root Memory Knowledge | `02-account-root-memory-knowledge-v1.md` | 01 |
| 03 | Contract Test Drift Guards | `03-contract-test-drift-guards-v1.md` | 01 |
| 04 | Packaging Materialization Boundary | `04-packaging-materialization-boundary-v1.md` | 01 |
| 05 | Installer Runtime Platform | `05-installer-runtime-platform-v1.md` | 01, 04 |
| 06 | Skill Docs Shell Cleanup | `06-skill-docs-shell-cleanup-v1.md` | 01, 02, 03, 05 |

## Parallel Execution Plan

| Wave | Phases | Eligibility | Notes |
|------|--------|-------------|-------|
| wave-1 | 01 | sequential | Fixes installed-runtime path breakage used by later phases. |
| wave-2 | 02, 03, 04 | parallel | Disjoint primary write sets after phase 01 path contract lands. |
| wave-3 | 05 | sequential | Depends on packaging and active path contract. |
| wave-4 | 06 | sequential | Consolidates skill/docs/shell cleanup and final guard coverage. |

## Source Traceability Matrix

| Req ID | Requirement Summary | Phase | Status |
|--------|---------------------|-------|--------|
| REQ-01 | Replace active `.claude/scripts` commands with installed common runtime paths. | 01 | mapped |
| REQ-02 | Align Codex MCP config with materialized/installed runtime assets. | 01 | mapped |
| REQ-03 | Remove legacy `.claude/scripts` testing rules from active Claude template. | 01 | mapped |
| REQ-04 | Move memory/knowledge contracts to account-root namespace. | 02 | mapped |
| REQ-05 | Add guards for guidelineRoot, archive specimen, and documentPaths drift. | 03 | mapped |
| REQ-06 | Reconcile plugin metadata, support script allowlist, and generated payload exclusion. | 04 | mapped |
| REQ-07 | Repair PS1 installer, runtime state precedence, browser runtime resolver, and install guidance. | 05 | mapped |
| REQ-08 | Fix skill/docs references, public reference links, PS1 LF policy, shell false-fail, and setup guidance. | 06 | mapped |

## Adoption Strategy

- Source edits only: root `skills/`, `agents/`, `scripts/`, `schemas/`, `package/`, `docs/public/`, `tests/`, and root install files.
- Do not directly mutate `%USERPROFILE%\.claude`, `%USERPROFILE%\.codex`, `%USERPROFILE%\.moonshot-relay\state`, MemoryGraph DBs, runtime logs, caches, verdict JSON, or generated profile outputs.
- Generated `package/claude/profile/` and `package/codex/profile/` may be materialized for verification but must remain untracked.

## Phase Completion Checklist

- [ ] Phase 01 - Installed Runtime Path Contract
- [ ] Phase 02 - Account-Root Memory Knowledge
- [ ] Phase 03 - Contract Test Drift Guards
- [ ] Phase 04 - Packaging Materialization Boundary
- [ ] Phase 05 - Installer Runtime Platform
- [ ] Phase 06 - Skill Docs Shell Cleanup

## Completion Rule

The package is complete only when every phase has fresh targeted evidence and the final gate passes:

- `npm test`
- `npm run test:package`
- `git diff --check`
- `node package/build-package.mjs --runtime all --dry-run --json`
- Account-root installer dry-run through both script and bin wrapper with temp homes
- Targeted `rg` scans for stale `.claude/scripts`, `.claude/docs/guidelines`, missing `docs/public/reference`, project-local memorygraph default, and PS1 CRLF drift
