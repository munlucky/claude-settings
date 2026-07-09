# Prototype Decision

artifactId: PROTOTYPE_DECISION

## Question Answered

State the decision or risk the prototype was meant to resolve.

## Prototype

```yaml
prototypeType: "logic | state | ui | integration"
location: ""
runCommand: ""
observedResult: ""
```

## Decision

- acceptedDecision:
- rejectedAlternatives:
- linkedArtifact: "ADR | SPEC | Discovery Map ticket | PLAN"

## Disposition

Choose one:

- `delete`: throwaway code or generated output is removed after evidence is captured.
- `absorb`: useful behavior is reimplemented through production-owned source paths with tests.
- `retain_as_nonproduction_evidence`: prototype remains outside package/runtime payload as evidence only.

## Cleanup Or Retention Owner

Name the owner and expected cleanup or retention path.

## Boundaries

Prototype code is not production payload by default. Do not copy raw MemoryGraph records, runtime logs, browser artifacts, secrets, or external prompt bodies into this note.
