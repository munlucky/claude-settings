# External Skill Pattern Transfer

Canonical source guideline for evaluating external harness or skill patterns without wholesale adoption.

Extract reusable mechanics, not files, prompts, or branding from an external harness.
Map each accepted pattern to an existing owner skill, script, template, or public guideline before adding a new surface.
Reject patterns that duplicate existing behavior, weaken verification, or depend on unavailable runtimes.
Record the source, accepted deltas, rejected deltas, and verification evidence in the task handoff.

## Accepted Patterns

- Testing discipline: convert observed harness failures into active regression tests before changing shared behavior.
- Ledger: record durable runtime decisions and evidence in a structured state plane instead of relying on chat memory.
- Local edit discipline: map each imported idea to an existing owner and keep changes scoped to that owner.
- Loop cap: bound retry and review loops with explicit blocker or handoff states.
- Sandbox and lifecycle control: record sandbox boundaries, approval-required operations, and recovery lifecycle evidence.
- Dynamic work decomposition: allow an orchestrator to draft a task-specific decomposition only as a reviewable run plan, not as authority to spawn workers by default.
- Managed agent shape: model provider, execution environment, session state, and event stream are separate contract fields. Map these to Moonshot runtime evidence without depending on one provider's managed infrastructure.
- Independent verification fan-in: accept parallel review, research, and verification only when every worker has isolated input, bounded tools, and a deterministic merge or challenge contract.

## Rejected Patterns

- Public skill sprawl: do not add a new public skill when an existing entrypoint can own the behavior.
- AGENTS.md knowledge hoarding: keep always-loaded profile context short and move durable detail to canonical docs.
- Default multi-agent fanout: use independent agents only where review or work partitioning has a concrete contract.
- Provider runtime coupling: do not require Claude-specific, Codex-specific, cloud-hosted, or self-hosted agent infrastructure in public Moonshot policy.
- Unbounded dynamic workflows: do not let a model-generated workflow expand scope, budget, write access, or worker count without an explicit local contract.

## Safe Agent Fanout Contract

Moonshot Relay defaults to single-coordinator execution. Agent fanout is opt-in and must be represented by an `agentFanoutContract` before `moonshot-teams-runner` or a workflow bundle can spawn or emulate multiple workers.

```yaml
agentFanoutContract:
  enabled: true
  source: "operator_request | accepted_plan_graph | reviewed_handoff"
  purpose: "research | review | verification | owned-path implementation"
  coordinator: "current_session | forked_leader | external_runner"
  environment: "local | sandbox | self_hosted | managed"
  maxWorkers: 3
  maxNestedDepth: 0
  budget:
    tokenClass: "bounded"
    timeoutSeconds: 300
  isolation:
    contextInput: "artifact_summary"
    outputShape: "teamReport"
    toolBoundary: "read_only | owned_paths | verifier_only"
  writeAccess:
    default: "deny"
    allowedOwnedPaths: []
  verification:
    required: true
    mergeStrategy: "severity_first | source_aware | debate_resolution | ownership_aware"
    freshChecks: []
  stopControls:
    interruptible: true
    noNestedFanout: true
    recordDegradedPath: true
```

Implementation fanout requires `purpose: "owned-path implementation"`, reviewed file ownership, `writeAccess.default: "deny"`, non-empty `allowedOwnedPaths`, and fresh verification commands. Research, review, and verification fanout should stay read-only unless a separately approved remediation task owns the edit.

## Matt Pocock Skills v1.1 Pattern Transfer

Matt Pocock `mattpocock/skills` v1.1 is treated as an external pattern source, not a prompt, file, or public skill source for Moonshot Relay. Reuse only the mechanics below, and route them through existing Moonshot owners.

### Accepted Mechanics

| External mechanic | Moonshot owner | Local adoption shape |
|---|---|---|
| Destination, fog, and frontier language before detailed planning | `product-orchestrator`, `moonshot-plan-writer` | Discovery Map contract that records what is known, unresolved, takeable, or out of scope before phase planning. |
| Facts vs decisions | `assumption-ledger`, `agent-operating-policy` | Intake classification where facts require evidence and human decisions require explicit decision authority. |
| Research ticket as a linked asset | `research-evidence-policy`, `moonshot-research` | Cited evidence note with source quality, recency, confidence, limits, and downstream claim or decision linkage. |
| Prototype as decision evidence | `artifact-routing-policy`, product and architecture templates | Throwaway prototype result captured as decision evidence, then deleted, absorbed, or explicitly retained as non-production evidence. |
| Vertical slice and blocker frontier language | `task-slicer`, plan graph metadata | Advisory frontier vocabulary for unblocked planning candidates without granting worker fanout or completion authority. |
| Test seam agreement | `specTestObligations` | Behavior-changing obligations record the highest useful public seam or explain why a lower seam is chosen. |
| Standards/spec review axes | review finding and review bundle contracts | Optional finding classification metadata only; review receipts and runtime closeout remain authoritative. |

### Rejected Mechanics

| External mechanic | Rejection reason |
|---|---|
| Importing Matt skills as profile-local public skills | Duplicates existing Moonshot entrypoints and expands public runtime surface without a lower-rung need. |
| Using GitHub Issues as canonical runtime state | Moonshot runtime-state remains the blocker, resume, and completion authority. |
| Letting a Discovery Map spawn workers by default | Violates deny-by-default fanout; execution fanout still requires an approved `agentFanoutContract`. |
| Replacing `moonshot-orchestrator` or `moonshot-phase-runner` with a thin implement skill | Would bypass review, verification, phase closeout, and runtime-state authority. |
| Copying external prompt text into durable policy | External pattern transfer captures reusable mechanics and local contracts, not external prompt bodies or branding. |

Discovery Map, frontier, research, prototype, seam rationale, and review axis metadata are planning or evidence aids only. They do not authorize execution, baseline promotion, package/runtime adoption, live profile mutation, or whole-plan completion.
