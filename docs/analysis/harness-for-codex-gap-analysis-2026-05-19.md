# Harness-for-codex Gap Analysis

Date: 2026-05-19
Source reviewed: `ganimjeong/Harness-for-codex` at `45e7ac0`
Local target: `C:\dev\claude-settings`

This is a pattern-transfer review, not a replacement plan. The external repository is a small baseline repository harness. The local Moonshot harness is a long-running execution, verification, and closeout system.

## Evidence

External repository inspected from a temporary clone:

- `README.md`: minimal goal, quick start, command list, `harness.yml` as metadata.
- `AGENTS.md`: short root instructions, command surface, task loop, completion criteria.
- `harness.yml`: machine-readable command/document/task-loop registry.
- `scripts/bootstrap`, `scripts/check`, `scripts/test`, `scripts/eval`, `scripts/doctor`, `scripts/hooks`: stable shell entrypoints.
- `tasks/TEMPLATE.md`: lightweight task brief.
- `docs/decisions.md`: durable decision log.
- `.github/workflows/check.yml`: CI runs `scripts/eval`.
- `.pre-commit-config.yaml`: optional `scripts/check` pre-push hook.
- `.devcontainer/devcontainer.json`: optional bootstrap-on-create environment.

Verification:

- Default Windows checkout with `core.autocrlf=true`: `bash scripts/eval` fails with `set: pipefail\r: invalid option name`.
- LF checkout with `git -c core.autocrlf=false clone`: `bash scripts/eval` passes.

Local repository surfaces checked:

- `README.md`
- `AGENTS.md`
- `.gitattributes`
- `package/package-contract.yaml`
- `scripts/`
- `templates/execution/`
- `skills/moonshot-orchestrator/SKILL.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `docs/claude-tasks/external-harness-adoption/README.md`
- `.claude/docs/guidelines/external-skill-pattern-transfer.md`

## Baseline Difference

`Harness-for-codex` optimizes for first contact:

- one root instruction file
- one bootstrap command
- one check command
- one test command
- one eval command
- one doctor command
- one lightweight task-note template
- one durable decision log
- one small machine-readable registry

`claude-settings` optimizes for controlled execution:

- product definition chain
- phase runner
- delegated/in-session execution modes
- sprint contract
- QA report
- scorecard
- handoff
- verification verdicts
- runtime parity tests
- state leases and closeout guards
- package/profile materialization
- MemoryGraph and code-review-graph boundaries

The external harness is easier to install and explain. The local harness is safer for long-running, high-risk, multi-phase work.

## External Strengths We Should Learn

| Pattern | Why it matters | Local status | Recommended destination |
|---|---|---|---|
| Tiny root `AGENTS.md` | Agents see commands and loop immediately without reading a large policy tree. | Partial. Local root `AGENTS.md` is only a bridge. | Root `AGENTS.md` or generated downstream `AGENTS.md` summary. |
| `harness.yml` command registry | Gives tools a single machine-readable map of commands, docs, and task loop. | Partial. `package/package-contract.yaml` covers packaging, not operator commands. | New `harness.yml` or `harness.manifest.yaml` generated from local contracts. |
| Stable command facade | `scripts/bootstrap/check/test/eval/doctor/hooks` is easy for humans and agents. | Partial. Local has many validators but no small standard facade. | Add thin wrapper commands or documented aliases. |
| `doctor` readiness command | Separates environment readiness from product verification. | Partial. Local has specific diagnostics, not one concise readiness entrypoint. | `scripts/doctor` wrapper over selected existing checks. |
| `eval` handoff gate | CI and humans share a single completion command. | Partial. Local gates exist but are scattered by scope/profile. | `scripts/eval --profile quick/full/harness`. |
| Lightweight task template | Simple tasks do not need full phase machinery. | Partial. Product/phase templates exist but are heavy for small work. | `templates/task/TEMPLATE.md` or downstream `tasks/TEMPLATE.md`. |
| Durable decisions log | Future agents can inspect architectural choices quickly. | Partial. Decisions are often in phase docs or QA artifacts. | Add `docs/decisions.md` template for downstream projects. |
| Optional devcontainer and pre-commit | Provides low-friction reproducibility and local checks. | Mostly missing as a standard downstream scaffold. | Defer; add only as optional package surface. |

## External Gaps Relative to Local Harness

| Area | External gap | Why we should not copy directly |
|---|---|---|
| Completion evidence | `scripts/check` can pass with "No known checks found." | Acceptable for a starter harness, too weak for local strict/phase work. |
| Spec conformance | No source-plan snapshot, deviation ledger, or conformance verifier. | Would regress current `SPRINT_CONTRACT` and `verify-plan-conformance` guarantees. |
| Long-running state | No phase status, leases, dispatch records, resume/handoff state, or stale-pointer guards. | Cannot replace `moonshot-phase-runner`. |
| Review loop | No mandatory code review, finding disposition, or retry contract. | Local completion verifier depends on review/QA closeout evidence. |
| Runtime parity | No Claude/Codex/runtime adapter parity model. | Local cross-runtime behavior would become less explicit. |
| Packaging | No canonical source vs generated profile split. | Local source ownership is already protected by `package/package-contract.yaml`. |
| Windows shell portability | No `.gitattributes`; Windows checkout converted scripts to CRLF and broke Bash execution. | Local `.gitattributes` already fixes this class. |
| Security | Optional hooks and shell commands are simple but not reviewed as trust boundaries. | Local adoption rules require hook/script security review. |
| License clarity | No license file was visible in the inspected repo. | Transfer patterns only; do not vendor code wholesale. |

## Local Gaps Exposed

| Gap | Current local symptom | Effect |
|---|---|---|
| Operator command surface is too fragmented | There are many scripts and validators, but no small `bootstrap/check/test/eval/doctor` facade. | New agents/users need repo-specific knowledge before safe operation. |
| Root `AGENTS.md` is too opaque | It only points to `.claude/CLAUDE.md`. | AGENTS-aware tools get less immediate guidance than they could. |
| No root operator manifest | `package/package-contract.yaml` is source/package-focused, not command/task-loop-focused. | Tooling cannot cheaply discover "what command should I run now?" |
| Simple task path is heavy | Product/phase templates are strong but overkill for tiny work. | Agents may either skip notes entirely or overuse phase machinery. |
| Decision log is not first-class for small work | Decisions often live in phase artifacts. | Cross-session recall requires more document traversal. |
| Downstream scaffold lacks universal boring commands | Installed projects get rich `.claude`/`.codex` assets, but not necessarily project-native `scripts/check` style commands. | Downstream repos may still need ad hoc verification command discovery. |

## Adoption Inventory

| Candidate | Verdict | Local destination | Adopt shape | Direct-copy risk |
|---|---|---|---|---|
| Root command facade | adapt | `scripts/` and docs/public | Add thin `bootstrap`, `check`, `test`, `eval`, `doctor` wrappers mapped to existing validators. | Must not weaken strict phase gates. |
| `harness.yml` registry | adapt | root manifest or `schemas/` + generated file | Record canonical command names, docs, task loop, verification profiles. | Duplicates `package/package-contract.yaml` if scope is not separated. |
| Concise root `AGENTS.md` summary | adapt | `AGENTS.md` and package templates | Keep bridge but include top-level commands, entrypoints, completion rule, and pointer to deep policy. | Long root instructions can drift from skill policy. |
| Lightweight `tasks/TEMPLATE.md` | adopt | `templates/task/` or downstream package | Add a simple task brief for non-phase work. | Could compete with product-definition docs if not scoped. |
| `docs/decisions.md` | adopt | downstream template and repo docs | Use for durable architecture/workflow decisions outside phase artifacts. | Must not replace ADRs or QA evidence. |
| `scripts/doctor` | adapt | new wrapper over existing diagnostics | Print git root, line ending policy, required harness files, key tools, MCP/MemoryGraph status. | Generic "ok/missing" can hide strict blockers unless profile-aware. |
| `scripts/eval` | adapt | new wrapper over `knowledge-repo-audit`, `verify-code-policy`, `workflow-enforcement`, targeted tests | Provide `quick`, `harness`, `full` profiles. | A single command must not imply all project-specific verification passed. |
| Optional pre-commit hook | defer | package optional assets | Provide opt-in hook that calls quick checks only. | Hidden hooks can surprise users and slow normal work. |
| Devcontainer scaffold | defer | docs/public or optional package | Keep as optional downstream sample. | Docker dependency is unnecessary for many repos. |
| Stack-aware bootstrap/check scripts | adapt | downstream project bootstrap templates | Generate project-local wrappers only when project contract lacks verification commands. | Auto-detection can produce false confidence. |
| GitHub Actions `scripts/eval` workflow | defer | downstream optional CI template | Useful for simple repos after command facade exists. | CI policy varies per project; do not install by default. |

## Recommended Absorption Plan

### Phase A: Manifest and Facade, No Behavior Relaxation

Add a local operator manifest and command facade that only routes to existing authoritative checks.

Candidate outputs:

- `harness.yml` or `harness.manifest.yaml`
- `scripts/doctor`
- `scripts/eval`
- README section: "Human and agent command facade"

Acceptance criteria:

- Existing strict completion gates remain authoritative.
- `scripts/eval --profile harness` runs current harness validators, not a weaker external-style check.
- Windows LF policy remains enforced through `.gitattributes`.

### Phase B: Lightweight Downstream Scaffold

Add optional downstream templates for simple projects:

- `tasks/TEMPLATE.md`
- `docs/decisions.md`
- `scripts/bootstrap`
- `scripts/check`
- `scripts/test`
- `scripts/eval`
- `scripts/doctor`

Acceptance criteria:

- Scaffold is opt-in or generated only when target repo lacks equivalent commands.
- Generated scripts are LF-pinned.
- "No known checks found" is a warning, not a strict success, when the target project has a verification contract.

### Phase C: Root Instruction Improvement

Refresh generated `AGENTS.md` so AGENTS-aware tools see the practical path immediately:

- standard commands
- public entrypoints
- simple vs phase work routing
- completion evidence rule
- deep policy pointer

Acceptance criteria:

- Root file stays short.
- `.claude/CLAUDE.md` remains the detailed policy source.
- Package materialization tests verify root and profile outputs stay aligned.

## Non-Adoption Decisions

- Do not replace `moonshot-phase-runner`.
- Do not copy external scripts verbatim.
- Do not treat "No known checks found" as clean completion in strict or phase runs.
- Do not install hooks by default.
- Do not add a new public skill for this; update existing package/docs/script owners.

## Priority

1. Add a profile-aware `doctor` and `eval` facade.
2. Add a command/task-loop manifest separate from package-contract ownership.
3. Add lightweight downstream task and decision-log templates.
4. Refresh root/generated `AGENTS.md` summary after the facade exists.
5. Defer pre-commit, devcontainer, and CI templates until command facade behavior is stable.
