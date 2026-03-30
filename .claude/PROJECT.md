# PROJECT.md

> Operating contract for the Claude Settings meta-harness repository. Keep downstream template guidance explicit, but do not treat this file as an unfilled template inside this repo.

Last-Reviewed: 2026-03-30

## Project Overview

- **Service**: Claude Settings meta-harness repository for reusable rules, skills, agents, scripts, templates, and workflow documentation
- **Stack**: Markdown + YAML + Bash + Python 3 + Node.js helper tooling under `.claude/tools/browserd`
- **Response Language**: Match the user request; default to Korean for collaboration in this repository

### Tech Stack Details

- **Runtime**: Bash, Python 3, Node.js, Git
- **Primary assets**: `.md`, `.yaml`, `.sh`, `.py`, `.cjs`, `.mjs`
- **Build model**: no compiled application build; verification is script- and document-driven
- **Core libraries/tools**:
  - shell verification scripts in `.claude/scripts/`
  - verifier scripts in `.claude/agents/verification/`
  - browser helper tooling in `.claude/tools/browserd/`

## Core Rules

1. **Planning boundary**: Human approval may be used at planning closeout only. After execution starts, implementation, review, verification, and retry loops should remain autonomous unless a true blocker or external dependency appears.
2. **Source of truth**: Durable policy belongs in `.claude/rules/`, `.claude/docs/guidelines/`, and this file, not in `AGENTS.md` or `.claude/CLAUDE.md`.
3. **Doc parity**: Maintain matching `.ko.md` documents when changing English `.md` files that already have Korean pairs.
4. **Security boundary**: Respect `.claudeignore`, protected paths, and the deny-by-default stance for new tool or directory access.
5. **Verification discipline**: Do not close meaningful changes on “checkpoint reached”. Use the required verification commands and evidence artifacts.
6. **Scope discipline**: Prefer scope reduction over speculative expansion when planning value is weak or unclear.

## Testing Rules

- **Test framework**: repository-local script verification, shell syntax checks, knowledge audit, workflow enforcement, and verifier contracts
- **Test file location**:
  - `.claude/scripts/*.sh`
  - `.claude/agents/verification/*.sh`
  - supporting docs in `.claude/docs/guidelines/`
- **Coverage expectation**:
  - doc-only changes: audit and link/freshness integrity
  - local policy changes: audit plus relevant syntax/policy checks
  - behavior-changing harness logic: deterministic verifier evidence when the environment supports it
- **Commands**:
  - Knowledge audit: `bash .claude/scripts/knowledge-repo-audit.sh`
  - Code policy: `bash .claude/scripts/verify-code-policy.sh`
  - Workflow enforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
  - Shell syntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
  - Runtime parity: `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`

### Test Writing Rules

- New behavior-changing logic should add or strengthen deterministic verification when practical.
- Bug fixes should include a regression test or equivalent verifier evidence.
- Never delete existing checks or tests without an explicit reason and replacement path.

## Git Workflow

### Branch Naming Convention

```text
codex/{task}            # Default Codex work branch
feature/{feature-name}  # New reusable workflow capability
fix/{issue-number}      # Bug fixes
chore/{task}            # Docs, policy, maintenance
```

### Commit Message Format

```text
[type]: concise description

Examples:
feat: add planning value rubric
fix: tighten workflow enforcement wording
chore: refresh harness project contract
```

**Rules:**
- No emojis or special characters
- Keep one language per commit message
- Prefer concise messages under 50 characters when possible

### PR Requirements

- CI or required local checks must pass
- Review is required for logic changes to shared skills or rules
- Link the relevant task package or implementation doc when one exists

## Directory/Structure

```text
[project root]/
|-- .claude/
|   |-- rules/
|   |-- skills/
|   |-- agents/
|   |-- docs/guidelines/
|   |-- docs/reference-downstream/
|   |-- docs/runtime-parity-reference-plan/
|   |-- scripts/
|   |-- templates/
|   `-- verification.contract.yaml
|-- .claudeignore
`-- AGENTS.md
```

### Key Patterns

```text
.claude/rules/*.md                 # Always-loaded or path-scoped policy
.claude/skills/*/SKILL*.md         # Skill contracts
.claude/agents/**/*.md             # Agent contracts
.claude/scripts/*.sh               # Mechanical checks and orchestration helpers
.claude/docs/reference-downstream/** # Installed downstream bootstrap reference
.claude/docs/runtime-parity-reference-plan/** # Stable fixture for parity verification
```

## API/Data Communication Patterns

- **API endpoints**: none; this repository is not an application service
- **Helper functions**: shell scripts and Python helpers under `.claude/scripts/` and `.claude/agents/verification/`
- **Contract exchange**: structured state is passed through Markdown, YAML, and JSON artifacts such as `PROJECT.md`, `context.md`, `SPRINT_CONTRACT.md`, verdict JSON, and scorecards

## Type/Domain Patterns

- **Type definition location**: no central TS domain model; structured contracts live in Markdown/YAML/JSON
- **Domain models**:
  - execution planes: `read_only`, `product_project`, `meta_harness`
  - workflow profiles: `standard`, `strict`
  - execution artifacts: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`

## Auth/Authorization

- **Auth method**: none inside the repository itself
- **Authorization model**: inherited from the active runtime, local filesystem permissions, and tool approval policies
- **Sensitive-path policy**: use `.claudeignore`, `.gitignore`, and security rules to keep protected paths out of routine agent context

## Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

### Path Templates

| Document | Path Pattern |
|----------|-------------|
| Agreement | `{agreementsRoot}/{feature-name}-agreement.md` |
| Product intent | `{tasksRoot}/{feature-name}/product/PRODUCT_INTENT.md` |
| Product requirements | `{tasksRoot}/{feature-name}/product/PRD.md` |
| Product behavior model | `{tasksRoot}/{feature-name}/product/SOLUTION.md` |
| Architecture spec | `{tasksRoot}/{feature-name}/product/SPEC.md` |
| Architecture decisions | `{tasksRoot}/{feature-name}/product/ADR/*.md` |
| Execution plan | `{tasksRoot}/{feature-name}/product/PLAN.md` |
| Execution tasks | `{tasksRoot}/{feature-name}/product/tasks/*.md` |
| Assumptions ledger | `{tasksRoot}/{feature-name}/product/ASSUMPTIONS.md` |
| Hard blockers | `{tasksRoot}/{feature-name}/product/BLOCKERS.md` |
| Implementation plan | `{tasksRoot}/{feature-name}/context.md` |
| Specification | `{tasksRoot}/{feature-name}/specification.md` |
| Archives | `{tasksRoot}/{feature-name}/archives/` |
| Session logs | `{tasksRoot}/{feature-name}/session-logs/day-{YYYY-MM-DD}.md` |
| Pending questions | `{tasksRoot}/{feature-name}/pending-questions.md` |
| Traceability artifacts | `{tasksRoot}/{feature-name}/execution/{REQUIREMENTS_TRACEABILITY,SCENARIO_MATRIX,UAT_CHECKLIST}.md` |

### Downstream Reference Documents

For installed downstream projects, bootstrap and maintain:

- `workflow/README.md`
- `docs/design/README.md`
- `docs/glossary/README.md`
- `docs/daily/README.md`
- `TEST_GUIDE.md`
- `docs/analysis/README.md`

See `.claude/docs/reference-downstream/README.md` for a concrete reference package.

## Knowledge Repository (Agent-First)

- Keep top-level `AGENTS.md` short and map-like.
- Store durable policy in source-of-truth paths:
  - `PROJECT.md`
  - `docs/guidelines/` or `.claude/docs/guidelines/`
  - `.claude/rules/`
- Add `Last-Reviewed: YYYY-MM-DD` to core map/contract docs and refresh it during doc maintenance.
- Run `.claude/scripts/knowledge-repo-audit.sh` after structural doc updates.

## Verification/Commands

- `bash .claude/scripts/knowledge-repo-audit.sh`
- `bash .claude/scripts/verify-code-policy.sh`
- `bash .claude/scripts/workflow-enforcement.sh verify`
- `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`

## Environment Variables

```text
KNOWLEDGE_REVIEW_MAX_DAYS="Override review freshness window for knowledge audit"
KNOWLEDGE_REQUIRE_PROJECT_FILLED="Require filled PROJECT docs during audit"
KNOWLEDGE_ALWAYS_LOADED_RULE_LINE_MAX="Override rules line-budget threshold"
KNOWLEDGE_ALWAYS_LOADED_TOTAL_LINE_MAX="Override total always-loaded line budget"
KNOWLEDGE_ALWAYS_LOADED_TOKEN_MAX="Override always-loaded token budget"
HARNESS_KNOWLEDGE_AUDIT_FILE="Explicit output path for knowledge-audit JSON"
VERIFY_CODE_POLICY_MAX_FILE_LINES="Per-file line limit for code-policy check"
VERIFY_CODE_POLICY_BASELINE_FILE="Baseline exceptions for code-policy check"
PHASE_RUNTIME_PARITY_KEEP_TMP="Keep temp workspace for runtime parity debugging"
```
