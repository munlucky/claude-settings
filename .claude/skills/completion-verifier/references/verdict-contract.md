# Verdict Contract

- Authoritative verdicts need run identity, phase/task identity, plan/status paths, command evidence, score state, and freshness.
- Required checks must be listed as expected, passed, or missing.
- Stale evidence fails completion unless the user explicitly accepts degraded evidence.
- Environment blockers can pass only as expected blockers when the product implementation is not contradicted.
- A verdict cannot supersede a later verdict unless supersession is explicit in metadata.
