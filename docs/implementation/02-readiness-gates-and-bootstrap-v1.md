# Phase 02: Readiness Gates and Bootstrap (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2 | user-request discussion | Downstream projects should be able to bootstrap `PROJECT.md` and `context.md` effectively | Add gate skills that auto-inject existing generators |
| SRC-8 | `pre-flight-check` checklist | Readiness is currently advisory | Upgrade to structured readiness signals |
| SRC-9 | `project-md-refresh` workflow | Existing project bootstrap exists | Reuse it behind a gate instead of duplicating it |
| SRC-10 | `context-builder` workflow | Existing context generation exists | Reuse it behind a context gate with minimum schema |

## Goal
- Ensure downstream product-project work has enough context before implementation begins, without bloating the harness repository itself.

## Expected Outcome
- `pre-flight-check` emits machine-readable readiness signals.
- Missing project contract or context readiness triggers gate skills that inject the right bootstrap skill or agent.
- `meta_harness` work skips downstream bootstrap gates automatically.

## Scope
- In scope:
  - `.claude/skills/pre-flight-check/SKILL.md`
  - `.claude/skills/project-md-refresh/SKILL.md`
  - `.claude/agents/context-builder.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/rules/workflow.md`
  - New gate skill docs under `.claude/skills/`
  - New guideline doc for readiness schema
- Out of scope:
  - Changing downstream project templates themselves
  - Verification contract file format

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/00-master-plan-v1.md`
  - `docs/implementation/01-execution-plane-and-routing-v1.md`
- Required code/data:
  - Existing pre-flight, project bootstrap, and context builder specs

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Emit structured readiness signals | 1) Define `projectContractReady`, `contextReady`, `verificationContractReady`, `shouldEscalateStrict`. 2) Update `pre-flight-check` output examples to emit those values. 3) Define plane-aware skip behavior. | `pre-flight-check` documents structured readiness output instead of warning-only prose. |
| P02-2 | Add `project-contract-gate` | 1) Create a new gate skill. 2) It checks readiness signal only. 3) If missing, it routes to `project-md-refresh`; if present, it passes through. | New gate exists and is explicitly lightweight. |
| P02-3 | Add `context-readiness-gate` | 1) Create a new gate skill. 2) Define minimum sections: goal, constraints, acceptance criteria, out-of-scope, target files, verification plan. 3) Route to `context-builder` when missing. | New gate exists and documents the minimum context schema. |
| P02-4 | Wire gates into the orchestrator | 1) Inject gates only for `product_project` work. 2) Skip for `meta_harness` and read-only tasks. 3) Keep direct-skill flows from being unexpectedly blocked unless the invoked skill is implementation-oriented. | Orchestrator gating behavior is predictable and scoped. |

## Validation Plan
- [ ] Build/type checks: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Behavior checks: verify one example each for `product_project`, `meta_harness`, and direct-skill invocation.
- [ ] Regression checks: confirm medium/complex flows still reach implementation after gates pass.

## Evidence to Mark Done
- New gate skill docs
- Updated `pre-flight-check` examples with structured patches
- Orchestrator injection rules showing plane-aware behavior

## Deliverables
- Updated `.claude/skills/pre-flight-check/SKILL.md`
- Updated `.claude/skills/moonshot-orchestrator/SKILL.md`
- Updated `.claude/skills/project-md-refresh/SKILL.md`
- Updated `.claude/agents/context-builder.md`
- New `.claude/skills/project-contract-gate/SKILL.md`
- New `.claude/skills/context-readiness-gate/SKILL.md`
- New `.claude/docs/guidelines/context-readiness-schema.md`

## File-Level Change Draft
- `.claude/skills/pre-flight-check/SKILL.md`
  - Add a structured patch example with readiness booleans and `executionPlane` awareness.
  - Tighten anti-pattern output into fields the orchestrator can branch on.
- `.claude/skills/project-md-refresh/SKILL.md`
  - Clarify that it is a bootstrap generator, not a mandatory gate by itself.
- `.claude/agents/context-builder.md`
  - Add an explicit minimum schema section so `context-readiness-gate` has a concrete contract.
- `.claude/skills/moonshot-orchestrator/SKILL.md`
  - Inject readiness gates only for `product_project`.
- `.claude/skills/project-contract-gate/SKILL.md`
  - New lightweight gate definition.
- `.claude/skills/context-readiness-gate/SKILL.md`
  - New lightweight gate definition.
- `.claude/docs/guidelines/context-readiness-schema.md`
  - New guideline that defines the minimal context structure and examples.

## Phase Completion Checklist
- [x] Gate responsibilities are separated from generator responsibilities.
- [x] Machine-readable readiness signals are defined.
- [x] Downstream-only bootstrap behavior is explicit.

## Implementation Exit Criteria
- [ ] Downstream project flows cannot enter implementation without minimum context.
- [ ] Harness-repository work does not get blocked by downstream bootstrap gates.
- [ ] Direct-skill invocation still behaves predictably for non-implementation tasks.

## Handoff Notes
- Phase 03 should consume `verificationContractReady` from this phase rather than inventing its own readiness probe.
