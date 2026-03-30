---
name: moonshot-in-session-coordinator
description: Coordinates phase-by-phase execution inside the current session while delegating each round to a fresh forked attempt agent.
triggers:
  - "in-session coordinator"
  - "phase coordinator"
  - "fresh attempt loop"
---

# Moonshot In-Session Coordinator

## Role

Run the phase loop in the current session without letting implementation chatter accumulate here.
The current session stays as a thin coordinator. Each implementation/verification round is delegated to a fresh forked `phase-attempt-agent`.

Use this only when:
- `moonshot-phase-runner` returned `executionMode: in-session-coordinator`
- execution artifacts already exist for the active phase

Do not use this for:
- simple one-shot implementation
- delegated terminal runs that already use `agent-loop.sh`

## Execution

- Main session responsibility:
  - select the next actionable phase
  - build minimal `attemptInput`
  - spawn fresh forked attempts
  - merge summaries only
  - update `phase-status.yaml`
- Attempt responsibility:
  - run `moonshot-orchestrator` in `phaseAttemptMode`
  - update `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`
  - return summarized `attemptResult`

## Inputs

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "in-session-coordinator"
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  coordinatorPolicy: "fresh-fork-per-attempt"

options:
  maxAttemptsPerPhase: 3
  stopOnFailure: true
```

## Workflow

### 1. Load phase state

Read `phase-status.yaml` and select the next actionable phase:
- `status == pending`
- or `status == in_progress`
- or `status == failed` with remaining attempts

Skip phases that are:
- already `completed`
- not `planConfirmed`

### 2. Build minimal attempt input

Construct the attempt from artifact-backed state only:

```yaml
attemptInput:
  phaseAttemptMode: true
  phaseNumber: 2
  phaseTitle: "Core Implementation"
  planDir: "docs/implementation/"
  phaseDocPath: "docs/implementation/02-core-implementation.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  sprintContractPath: "docs/implementation/execution/02-core-implementation/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/02-core-implementation/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/02-core-implementation/HANDOFF.md"
  scorecardPath: "docs/implementation/execution/02-core-implementation/SCORECARD.md"
  worksetPath: "docs/implementation/execution/02-core-implementation/WORKSET.md"
  executionRoot: "docs/implementation/execution"
  priorAttemptSummary: "E2E login flow failed after API refactor"
```

Rules:
- Do not inline long phase documents into the main session.
- Do not pass previous implementation chatter.
- Use `QA_REPORT.md` and `HANDOFF.md` as the only retry memory.
- Use `SCORECARD.md` as the objective completion state for the phase.
- Treat `SPRINT_CONTRACT.md` policy anchors and required verification commands as mandatory attempt input.
- Keep `WORKSET.md` updated with current goal, required reads, produced artifacts, and unresolved risks.

### 3. Spawn fresh attempt

Run `phase-attempt-agent` as a fresh fork/sub-agent:

```yaml
Task tool:
  agent: phase-attempt-agent
  subagent_type: general-purpose
  input: attemptInput
```

Runtime guidance:
- `claude-code`: use `Task` tool in a forked session
- `codex`: use a fresh isolated agent/session and merge summary only

### 4. Merge summarized result only

Expected return:

```yaml
attemptResult:
  status: "completed"  # completed | partial | failed
  verification:
    verdict: "passed"  # passed | failed | indeterminate
    evidenceFresh: true
    requiredChecks:
      missing: []
    failedChecks: []
  score:
    current: 100
    target: 100
    unmetChecklistItems: 0
    blockingDefects: 0
    verdict: "done"     # done | retry | blocked
  changedFiles:
    - "src/api/auth.ts"
  summary: "Phase goal met and verification passed"
  handoffRequired: false
```

Main-session merge rule:
- keep `status`, `summary`, `changedFiles`, `handoffRequired`, and the minimum verifier metadata needed for state transitions:
  - `verification.verdict`
  - `verification.evidenceFresh`
  - `verification.contractApplicable`
  - `verification.mode`
  - `verification.requiredChecks.missing`
  - `verification.failedChecks`
  - `score.current`
  - `score.target`
  - `score.unmetChecklistItems`
  - `score.blockingDefects`
  - `score.verdict`
- never merge raw logs or full verifier output
- Treat `status: completed` as valid only when the underlying verifier result also had `evidenceFresh == true` and no missing required checks.
- Treat `status: completed` as valid only when the score verdict is also `done`.

### 5. Update phase-status.yaml

After each attempt:
- increment `attempts.total`
- update `attempts.lastOutcome`
- update `attempts.lastUpdatedAt`
- set phase `status`
  - `completed` only when verification passed with `evidenceFresh == true`, no missing required checks, and score verdict `done`
  - `failed` when retry cap reached
  - `in_progress` when another retry is allowed

Example:

```yaml
phases:
  - number: 2
    title: "Core Implementation"
    status: in_progress
    attempts:
      total: 2
      lastOutcome: partial
      lastUpdatedAt: "2026-03-25T13:15:00Z"
```

### State Transition Table

| Attempt result | Coordinator action |
|---|---|
| `completed` + fresh evidence + no missing required checks + `score.verdict=done` | mark phase `completed` |
| `partial` | keep phase `in_progress` |
| `failed` with retries remaining | keep phase `in_progress` and retry |
| `failed` with no retries remaining | mark phase `failed` |
| nominal `completed` without fresh evidence or without score `done` | downgrade to `in_progress` or `failed` |

### 6. Loop or stop

- If the phase passed, advance to the next actionable phase.
- Do not advance on a nominal pass if fresh evidence is missing or score verdict is not `done`; keep the phase in `in_progress` or `failed`.
- If the phase failed but retries remain, spawn a brand-new `phase-attempt-agent`.
- If the phase failed and retries are exhausted:
  - stop when `stopOnFailure == true`
  - leave `HANDOFF.md` updated
- If all phases complete, return success summary.

## Output

```yaml
coordinatorResult:
  status: "partial"  # completed | partial | failed
  completedPhases:
    - 1
  stoppedAtPhase: 2
  attemptsRun: 3
  retryCapReached: false
  handoffRequired: true
  summary:
    - "phase 1 completed"
    - "phase 2 retry pending: browserFlows.login"
```

## Contract

- This skill is a coordinator only; it must not become the implementation worker.
- Every retry must use a fresh `phase-attempt-agent`.
- The coordinator session remains summary-only between rounds.
- Retries must be driven by `QA_REPORT.md` / `HANDOFF.md`, not by accumulated chat context.
- Retries must also respect `SCORECARD.md`; `retry` and `blocked` keep the phase open.
- Attempt agents must run `moonshot-orchestrator` in `phaseAttemptMode=true` to avoid recursive `moonshot-phase-runner` insertion.
- Do not spawn a new attempt for strict/meta-harness work until the active `SPRINT_CONTRACT.md` contains policy anchors.
- Do not translate `attemptResult.status=completed` into a completed phase unless the verifier evidence for that attempt is fresh, contract-complete, and score-complete.

## References

- `.claude/agents/phase-attempt-agent.md`
- `/moonshot-phase-runner`
- `/moonshot-orchestrator`
