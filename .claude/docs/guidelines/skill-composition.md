# Skill Composition Guide

> Use composition bundles to keep sequence logic short and readable.

## When to Consider Skill Composition

- Same skill combination repeated in 3+ places
- Total skill count exceeds 30
- Onboarding new team members becomes difficult

## Active Composition Bundles

The orchestrator and sequence planner should prefer bundle selection over long flat step lists.

## Stage Model

Use the following stage order for non-trivial implementation work:

1. Intake
2. Plan
3. Ready / Isolate
4. Execute
5. Review
6. Verify
7. Finish / Handoff

Default expectation:
- medium, complex, and phase-based work should visibly pass through these stages
- small bounded work may compress stages, but should still preserve review/verification discipline when risk warrants it

## Public Entrypoints

Primary public workflow entrypoints:

- `product-orchestrator`: raw idea to bounded product package
- `moonshot-phase-runner`: large, phase-based, or long-running implementation work
- `moonshot-orchestrator`: bounded implementation work outside the phase harness

Supplemental public utility entrypoints:

- `session-logger`: explicit session or handoff logging on demand
- `commit-moonshot`: explicit project-memory update plus commit flow

Do not present the following as primary user entrypoints:

- `moonshot-phase-executor`
- analysis micro-skills
- readiness gates
- document operation helpers

## Composition Ownership

- analysis micro-skills exist to support orchestrators, not to widen direct user invocation
- ready/isolate helpers should run as a named pre-execution stage, not only as hidden gates
- review helpers should run behind a dedicated review stage
- verification helpers should run behind a dedicated verify stage
- documentation and session helpers should run behind a finish-stage bundle
- stack-specific UI helpers should sit under `frontend-design`
- `session-logger` may still be invoked directly as a public utility
- `commit-moonshot` may still be invoked directly as a public utility

### analysis-bundle
```yaml
steps:
  - moonshot-classify-task
  - moonshot-evaluate-complexity
  - moonshot-detect-uncertainty
  - moonshot-decide-sequence
```

### planning-bundle
```yaml
steps:
  - requirements-analyzer
  - context-builder
  - moonshot-plan-writer (if no safe phase plan exists)
  - task-slicer (if plan output must be decomposed into slices)
  - codex-validate-plan
```

### ready-isolate-bundle
```yaml
steps:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate
  - workspace-isolation-gate (if strict or implementation is about to start)
```

### implementation-bundle
```yaml
steps:
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - code-simplifier
```

### review-bundle
```yaml
steps:
  - codex-review-code
  - security-reviewer (if hasSecurityChanges)
  - audit (if uiQualityAuditRequested)
  - web-design-guidelines (if explicit UI/UX review is requested)
```

### verification-bundle
```yaml
steps:
  - browser-verifier (if webRuntimeCheckNeeded)
  - qa-flow (if guided runtime QA is requested)
  - completion-verifier
  - verification-evidence-gate (if strict)
```

### finish-bundle
```yaml
steps:
  - doc-auto-sync
  - session-logger
  - commit-moonshot (if the user explicitly requests memory update plus commit)
```

### verification-suite
```yaml
steps:
  - review-bundle
  - verification-bundle
```

`verification-suite` is a compatibility alias for older compositions that still think in review-plus-verify as one block.

### doc-ops-bundle
```yaml
steps:
  - doc-auto-sync
  - session-logger
  - documentation-agent
```

Use `finish-bundle` as the default closeout stage for implementation runs that changed meaningful files.
Use `doc-ops-bundle` when the work is primarily documentation/session finalization rather than full finish-stage closure.

### logging-bundle
```yaml
steps:
  - session-logger
```

`logging-bundle` is a legacy alias kept for migration safety.

### implementation-with-recovery
```yaml
steps:
  - implementation-runner
  - on_error:
      - build-error-resolver
      - retry: implementation-runner (max: 2)
```

### meta-harness-bundle
```yaml
steps:
  - pre-flight-check
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - completion-verifier
```

## Rules

- Tier 1 entrypoints choose bundles; bundles should not widen the public invocation surface.
- `product_project` work may use `ready-isolate-bundle`.
- Large or phase-based work should enter through `moonshot-phase-runner`, not `moonshot-orchestrator`.
- Medium/complex implementation should pass through `ready-isolate-bundle -> implementation-bundle -> review-bundle -> verification-bundle -> finish-bundle`.
- Use `review-bundle` before `verification-bundle` for non-trivial code changes.
- Prefer `finish-bundle` for implementation closeout and `doc-ops-bundle` for documentation/session-only work.
- `commit-moonshot` remains an explicit user-triggered utility and should not be assumed automatically.
- `meta_harness` work must skip downstream bootstrap gates.
- Strict profile overlays are applied after bundle expansion, not inside individual bundles.
- When a bundle expands to no-op for the current plane, record that explicitly in notes.

## References

- `.claude/skills/moonshot-decide-sequence/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
