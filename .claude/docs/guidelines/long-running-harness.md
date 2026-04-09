# Long-Running Harness Lessons

> Practical guidance adapted from Anthropic's Mar 24, 2026 article, "Harness design for long-running application development."

## One-Line Summary

For multi-hour application work, model quality alone is not enough. Output quality depends heavily on how planning, implementation, evaluation, and handoff are structured.

## Core Claims

### 1. Harness quality is a real performance lever

Anthropic's result was not "the model got smarter," but "the system around the model made the work more reliable."

What mattered:
- separate roles instead of one agent doing everything
- explicit iteration loops
- testable acceptance criteria
- structured handoff artifacts between long-running phases

### 2. Self-evaluation is weak

A generator usually overestimates its own quality.

Practical rule:
- the agent that builds should not be the final authority on completion
- use a separate evaluator path for QA, browser checks, and completion claims

### 3. Vague quality language must become gradable criteria

"Looks good" and "works fine" are not useful harness inputs.

Convert them into criteria that can fail:
- users can complete the flow without guessing
- the drag interaction updates the target region, not only start/end points
- API route ordering does not shadow a specific endpoint
- UI reflects the intended visual direction and avoids generic defaults

### 4. High-level specs need a bridge before implementation

Anthropic used a sprint contract between the high-level product spec and the code-writing phase.

That bridge exists to answer:
- what exactly will be built in this round
- what is out of scope for this round
- how completion will be verified
- which failures should block the round

### 5. Long tasks need explicit handoff state

Compaction is helpful, but it does not always remove drift. Long work benefits from a clean handoff artifact that states:
- current goal
- completed work
- failed attempts and why they failed
- open risks
- next steps

### 6. Harness complexity should be re-validated when models improve

Each harness component encodes an assumption about what the model cannot do alone.

Do not keep old complexity forever:
- keep the planner when the raw prompt under-scopes the build
- keep the evaluator when the task is still beyond reliable solo performance
- remove per-sprint scaffolding when the model can stay coherent without it

## Recommended Moonshot Adoption

### Minimum load-bearing structure

For medium or complex `product_project` work:
1. planner artifacts: `PRODUCT_INTENT -> PRD -> SOLUTION -> SPEC -> PLAN`
2. contract artifact per slice: `SPRINT_CONTRACT.md`
3. implementation run
4. evaluator artifact: `QA_REPORT.md`
5. session/state transfer artifact when needed: `HANDOFF.md`

### Role mapping

Use the current workflow like this:
- Planner: `product-orchestrator`, `requirements-analyzer`, `context-builder`
- Generator: `implementation-runner`
- Evaluator: `completion-verifier`, `browser-verifier`, `verify-changes.sh`, `verify-runtime.sh`, `codex-review-code`

### Artifact responsibilities

`SPRINT_CONTRACT.md`
- defines the slice goal in testable language
- declares non-goals for the current round
- lists hard pass/fail checks

`QA_REPORT.md`
- records failed criteria, reproduction notes, and verdict
- feeds the next implementation round

`HANDOFF.md`
- makes context reset safe when the session is long or interrupted

## Operational Rules

### When to require a sprint contract

Require `SPRINT_CONTRACT.md` when any of the following is true:
- the task is medium or complex
- the work spans UI plus API plus data flow
- the feature has multiple user-visible behaviors
- the verification path is non-trivial

Simple, localized fixes can skip it.

### When to require evaluator separation

Require a separate evaluator when:
- the feature is user-facing and runtime behavior matters
- the task includes browser flows or visual quality
- the change has hidden failure modes that static review will miss
- the model has previously shipped stubs or half-working flows in similar tasks

### Review cadence by work size

Use review as a recurring stage, not a one-time ritual.

Simple work:
- one focused review after implementation is usually enough
- skip only when the change is tightly local and deterministic

Medium work:
- run one review after the first meaningful implementation batch
- rerun focused review after fix-forward changes if review feedback changed code

Complex or long-running work:
- review the plan before implementation begins
- review each meaningful implementation batch before advancing the verifier state
- rerun review after any remediation round that changes behavior, contracts, or user-visible flows

Practical review owners:
- `codex-review-code` for default semantic/regression review
- `security-reviewer` when security-sensitive files or flows changed
- `audit` or `web-design-guidelines` when UI/UX quality is part of the acceptance bar

### When to use handoff artifacts

Write `HANDOFF.md` when:
- the session is nearing context limits
- the work will continue in another session
- there are unresolved failures or blocked criteria
- multiple agents or reviewers need the same state summary

When repeated resume or retry cost becomes material, add the runtime contract from `resumable-session-layer.md` instead of expanding `HANDOFF.md` into an ad-hoc state log.

### Finish / handoff decision flow

Before choosing a closeout path, ask one gate question:

- Does any in-scope requirement, scenario, or planned downstream phase still remain, and can the run continue safely in this session?
- If yes, continue execution. Do not stop just because a checkpoint produced good evidence or the docs are up to date.

After verification, choose exactly one closeout path:

1. Clean finish
   - verification passed with fresh evidence
   - in-scope work for the requested run is complete
   - run doc/session closeout
   - no resumable handoff is required; if a `HANDOFF.md` file exists, it should be rewritten as a clean-finish marker instead of a resume artifact
2. Resume-later handoff
   - verification is incomplete, blocked, intentionally deferred, or the session is interrupted by context/runtime/user pause
   - update `QA_REPORT.md`
   - write `HANDOFF.md`
3. Retry loop
   - verification failed with actionable findings
   - update `QA_REPORT.md`
   - return to implementation with contract-linked remediation input

Invalid handoff reasons:
- "checkpoint reached"
- "docs updated"
- "QA recorded"
- any equivalent milestone-only phrasing without a real stop condition

Default finish-stage responsibilities:
- `doc-auto-sync` for meaningful documentation drift
- `session-logger` for resumable state or decision history
- `resumable-session-layer.md` when the harness needs interruption-safe runtime state plus bounded improvement telemetry
- `.claude/scripts/write-verification-verdict.py` for structured repository-root `.claude/verification-verdict-*.json` output instead of handwritten verdict JSON
  Record the exact verdict file path in `QA_REPORT.md` so the completion gate can verify the same artifact.
- `commit-moonshot` only when the user explicitly wants memory update plus commit
  Use `AGENT_LOOP_RUN_COMMIT_PROMPT=true` only for that explicit opt-in path.
  Closeout logs should say commit prompting is disabled by policy unless that opt-in is active.

## Anti-Patterns

Avoid:
- jumping from PRD directly into code for a multi-slice task
- letting the generator declare "done" without external checks
- using only vague acceptance language
- keeping evaluator steps for every task without checking cost/value
- preserving a complex harness after the model no longer needs that scaffold

## Review Questions

Before changing the workflow, ask:
1. Which component is load-bearing for the current model and task?
2. Which completion criteria can actually fail in a reproducible way?
3. Is the evaluator seeing the real runtime behavior or only static outputs?
4. If the session stops now, can the next agent resume from artifacts alone?
