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
