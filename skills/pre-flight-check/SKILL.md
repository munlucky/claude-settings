---
name: pre-flight-check
description: Checks essential information and project status before starting work and emits readiness signals for orchestration.
---

# Pre-Flight Check Skill

**Role**: Check essential info and project status before starting work to reduce omissions and emit machine-readable readiness signals.

## Inputs
- `analysisContext.*` (structured state, if exists)
- Feature name/branch name (optional)
- Required doc paths: `CLAUDE.md`, `PROJECT.md`, `context.md`, verification contract, etc.
- Project reference docs when present: `workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, `docs/analysis/README.md`

## Checklist
- execution plane (`read_only`, `product_project`, `meta_harness`)
- UI spec version/design assets availability
- API spec availability
- Similar feature references
- git status/branch, build status
- context.md freshness, unresolved items in pending-questions.md
- downstream project contract readiness (`PROJECT.md`)
- project reference docs readiness (workflow/design/glossary/daily/test/analysis)
- downstream verification contract readiness (`.claude/verification.contract.yaml` or equivalent policy)
- local policy-set and ignore strategy readiness (`policySets`, `.claudeignore`, or documented equivalent)
- **Document Memory Policy check**:
  - context.md token usage (warn if > 6,000 tokens, ~80% of limit)
  - specification.md exists and is summarized (if large spec)
  - archives/ directory structure in place
- **Doc Freshness Check**:
  - Check `ARCHITECTURE.md` last modified vs code change
  - Check `docs/generated/*` vs related source code

## Structured Output Contract

Return machine-readable readiness signals first, then optional human summary.

```yaml
signals:
  executionPlane: product_project
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
  shouldEscalateStrict: true
  docStale: false
notes:
  - "pre-flight: executionPlane=product_project"
  - "pre-flight: project contract missing required command/test sections"
  - "pre-flight: project reference docs missing workflow/design/test guidance"
  - "pre-flight: ignore or protected-path policy missing"
recommendedActions:
  - "run project-contract-gate"
  - "run context-readiness-gate"
  - "refresh security and ignore policy docs"
```

Optional human-readable example:

```markdown
# Pre-flight Check Results

## Plane
product_project

## Readiness
WARN PROJECT.md incomplete
WARN context.md missing minimum sections
WARN verification contract missing

## Recommended Actions
1. [HIGH] Run `project-contract-gate`
2. [HIGH] Run `context-readiness-gate`
3. [MEDIUM] Add `.claude/verification.contract.yaml`
```

## Anti-Pattern Check

> Detect common mistakes based on "How to write a good spec for AI agents" guide

### Checklist

| Anti-Pattern | Detection Method | Status |
|--------------|-----------------|--------|
| **Vague prompts** | "Make something cool", "Make it work better" | ⚠️ |
| **Large context without summary** | specification.md > 3,000 tokens + no summary | ⚠️ |
| **Missing 6 core areas** | PROJECT.md lacks commands/tests/structure/style/Git/boundaries | ⚠️ |
| **Vibe coding ↔ Production confusion** | Attempting production deploy without tests | ⚠️ |
| **Ignoring deadly trinity** | Proceeding without verification for speed/non-determinism/cost | ⚠️ |

### Recommended Actions on Detection

| Detected Anti-Pattern | Recommended Action |
|----------------------|-------------------|
| Vague request | Invoke `requirements-analyzer` to clarify |
| Large document | Follow `document-memory-policy.md` to summarize |
| Missing areas | Set `projectContractReady=false`, recommend `project-contract-gate` or `project-md-refresh` |
| No tests | Recommend writing tests before `completion-verifier` |
| No ignore/protected-path policy | Refresh security docs and add `.claudeignore` or equivalent |

## References
- `docs/public/guidelines/document-memory-policy.md`
- `docs/public/guidelines/context-readiness-schema.md`
- `docs/public/guidelines/verification-contract.md`
