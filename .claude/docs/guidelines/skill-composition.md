# Skill Composition Guide

> Use composition bundles to keep sequence logic short and readable.

## When to Consider Skill Composition

- Same skill combination repeated in 3+ places
- Total skill count exceeds 30
- Onboarding new team members becomes difficult

## Active Composition Bundles

The orchestrator and sequence planner should prefer bundle selection over long flat step lists.

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
- verification helpers should run behind verification or review bundles
- documentation and session helpers should run behind a doc-ops bundle
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
  - codex-validate-plan
```

### readiness-bundle
```yaml
steps:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate
```

### implementation-bundle
```yaml
steps:
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - code-simplifier
```

### verification-suite
```yaml
steps:
  parallel:
    - verification-agent
    - codex-review-code
  then:
    - security-reviewer (if hasSecurityChanges)
    - browser-verifier (if webRuntimeCheckNeeded)
    - completion-verifier
```

### doc-ops-bundle
```yaml
steps:
  - doc-auto-sync
  - session-logger
  - documentation-agent
```

Use `doc-ops-bundle` as a required finalization stage for implementation runs that changed meaningful files.

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
- `product_project` work may use `readiness-bundle`.
- Large or phase-based work should enter through `moonshot-phase-runner`, not `moonshot-orchestrator`.
- Prefer `doc-ops-bundle` for documentation/session work; keep `logging-bundle` only as a compatibility alias.
- `meta_harness` work must skip downstream bootstrap gates.
- Strict profile overlays are applied after bundle expansion, not inside individual bundles.
- When a bundle expands to no-op for the current plane, record that explicitly in notes.

## References

- `.claude/skills/moonshot-decide-sequence/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
