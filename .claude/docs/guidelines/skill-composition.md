# Skill Composition Guide

> Use composition bundles to keep sequence logic short and readable.

## When to Consider Skill Composition

- Same skill combination repeated in 3+ places
- Total skill count exceeds 30
- Onboarding new team members becomes difficult

## Active Composition Bundles

The orchestrator and sequence planner should prefer bundle selection over long flat step lists.

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
    - codex-review-code
    - verify-changes.sh
  then:
    - security-reviewer (if hasSecurityChanges)
    - completion-verifier (if complexity == complex)
```

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

- `product_project` work may use `readiness-bundle`.
- `meta_harness` work must skip downstream bootstrap gates.
- Strict profile overlays are applied after bundle expansion, not inside individual bundles.
- When a bundle expands to no-op for the current plane, record that explicitly in notes.

## References

- `.claude/skills/moonshot-decide-sequence/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
