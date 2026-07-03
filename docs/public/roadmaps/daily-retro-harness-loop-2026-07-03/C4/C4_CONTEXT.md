# C4 Context

```text
Operator / Agent
  -> target project closeout evidence
  -> moonshot-relay retro collect
  -> project retro outbox collect record
  -> moonshot-relay retro import
  -> account-root retro state
  -> daily retro / propose / issue-draft
  -> human-approved implementation PR
```

## External Systems

- Target project workspaces produce collect records.
- GitHub is not written by the initial implementation; only issue drafts are rendered.
- Account-root runtime state stores generated retro reports.

## Trust Boundary

Collect records cross from a target project into the Moonshot Relay control-plane. They must be validated, redacted, and treated as untrusted input.
