# Requirement Inventory

## Accepted Requirements

| ID | Requirement | Acceptance Signal |
|---|---|---|
| REQ-001 | Add a generated, source-excluded experience index over lab runs, compares, baselines, and closeout receipts. | Index schema test proves only generated paths are read/written and existing artifact hashes are preserved. |
| REQ-002 | Add a read-only history query surface for prior harness runs. | CLI can list runs, filter failure classes, show consulted artifact paths, and output JSON without mutating state. |
| REQ-003 | Extend `lab:evolve` with proposal artifacts that record consulted runs, hypothesis, expected metric impact, risk, and verification plan. | `evolve` test proves parent spec is unchanged and child proposal is hash-linked to consulted evidence. |
| REQ-004 | Add failure-rich search fixtures distinct from promotion gates. | New fixture suite contains known failing and passing cases for score drop, stale artifacts, fixture identity, and mutation safety. |
| REQ-005 | Record a fail-soft environment snapshot before candidate execution or proposal generation. | Snapshot exists in run output, omits secrets, and never blocks unless schema validation or redaction fails. |
| REQ-006 | Expose advisory frontier metrics without replacing H0 promotion authority. | Frontier output labels itself non-authoritative and `lab:closeout` still depends on compare/promote evidence. |

## Rejected Or Deferred Requirements

| ID | Requirement | Decision | Rationale |
|---|---|---|---|
| REJ-001 | Import the upstream Meta-Harness framework directly. | rejected | Different runtime assumptions, Python examples, and upstream README testing caveat. |
| REJ-002 | Let an autonomous proposer mutate source during normal lab runs. | rejected for this phase | Violates current source-control and H0 promotion discipline unless wrapped in a later controlled adoption phase. |
| REJ-003 | Treat proposal score or frontier membership as promotion authority. | rejected | H0 `external-bootstrap-lab` remains the authority. |
| REJ-004 | Store raw model transcripts in canonical source. | rejected | Prompt-safety and package-boundary risk; raw traces stay generated and redacted/indexed. |
