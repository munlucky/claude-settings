# Phase 05 - Ontology and Verifier Constraints

## Phase Execution Metadata
```yaml
phase: 05
title: "Ontology and Verifier Constraints"
dependsOn: [02, 03]
conflicts: []
ownedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/schemas/ontology-constraint.schema.json"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/ontology-constraint-validate.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/ontology-constraint-validate.test.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/verification.contract.yaml"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/docs/guidelines/project-knowledge-plane.md"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/**"
adoptionTargets:
  - "Phase 07 controlled adoption only"
readOnlyPaths:
  - ".claude/schemas/**"
  - ".claude/scripts/**"
  - ".claude/verification.contract.yaml"
  - ".claude/docs/guidelines/**"
  - ".claude/rules/**"
  - "AGENTS.md"
sharedMutablePaths:
  - ".claude/verification.contract.yaml"
mergePolicy: "verifier consumes constraints; prompt only receives summaries"
liveMutationPolicy: "staged only"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-006 | AC-006 | Ontology constraints must be executable verifier inputs. | validator tests |

## Goal
Make ontology useful as a small executable constraint layer instead of a large prompt dump.

## Scope
- Define `ontology_constraint` schema with `id`, `scope`, `appliesTo`, `severity`, `enforcedBy`, `sourceRef`, `supersedes`.
- Implement validator CLI for project-local and global constraints.
- Add verification contract hook for workflow-core validation.
- Ensure project-local ontology overrides global defaults only by explicit precedence.

## Verification Contract Insertion
```yaml
commands:
  ontologyConstraints: "node .claude/scripts/ontology-constraint-validate.mjs --project-root . --json"
checkPolicies:
  ontologyConstraints:
    conflictBehavior: "project_override_requires_supersedes"
    severityMapping:
      error: "blocking"
      warn: "degraded"
      info: "advisory"
validationProfiles:
  workflow_core:
    checks: [..., ontologyConstraints]
  runtime_adapter:
    checks: [..., ontologyConstraints]
```

CLI output shape:
```json
{
  "ok": true,
  "projectId": "example",
  "checked": 0,
  "violations": [],
  "warnings": [],
  "degradedEvidence": []
}
```

If a project-local constraint conflicts with a global constraint, it must either declare `supersedes: <globalConstraintId>` with equal-or-higher specificity or the CLI returns `ontology_override_conflict`.

Exit behavior:
- Exit `0` when `ok: true` and no blocking `error` severity violation exists.
- Exit `1` when any `error` severity violation, `ontology_override_conflict`, invalid schema, or unreadable required constraint file exists.
- Exit `0` with `degradedEvidence[]` when only `warn` severity or stale optional ontology index is present.
- Closeout evidence records warning-only output under `degradedEvidence`; workflow-core and runtime-adapter profiles block only on nonzero exit or `ok: false`.

## Non-Scope
- Do not implement full OWL/RDF reasoning.
- Do not import external ontology packages.

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Add constraint schema and fixtures. | schema + tests | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/ontology-constraint-validate.test.mjs` | valid constraints pass | unconstrained dump accepted |
| T02 | Add validator CLI. | validator | same test | invalid precedence/source fails | project override silently shadows global |
| T03 | Wire validation profile entry. | verification contract | `node .claude/scripts/workflow-enforcement.mjs status --json` | status can surface ontology health | contract cannot represent check |
| T04 | Ensure prompt builder includes summaries only. | builder tests | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/knowledge-context-build.test.mjs` | prompt has constraint labels, not raw files | raw ontology dump leaks |

## Acceptance Criteria
- AC-006: Ontology constraints are checked by deterministic CLI and verification contract.
- AC-010: Project-local constraint override precedence is explicit and test-covered.
- AC-011: Prompt receives only applicable constraint summaries.

## Verification Plan
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/ontology-constraint-validate.test.mjs`
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/knowledge-context-build.test.mjs`
- `node .claude/scripts/workflow-enforcement.mjs status --json --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05`
- `git diff --check -- .claude docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Constraint schema and validator pass.
- [ ] Verification contract includes ontology health check.
- [ ] Prompt summary stays compact and non-raw.
