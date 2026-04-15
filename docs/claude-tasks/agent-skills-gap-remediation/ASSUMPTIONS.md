# Assumptions

| Stage | Assumption | Reason | Owner | Status |
| --- | --- | --- | --- | --- |
| Planning | Public entrypoints should remain limited to `product-orchestrator`, `moonshot-phase-runner`, and `moonshot-orchestrator` | The current public surface is already understandable; the problem is internal drift | Maintainer | Open |
| Planning | Behavior-preserving refactors are preferred before workflow-policy changes | Contract extraction should reduce drift before semantics change | Maintainer | Open |
| Planning | Markdown artifacts should stay for human review even if machine-readable workflow state is added | Existing operator workflow depends on QA and handoff docs | Maintainer | Open |
| Planning | `analysisContext` should become canonical outside skill prose | The current duplicated schema is the clearest workflow-maintenance hotspot | Maintainer | Open |
| Planning | Meta-harness optimization should stay inside harness-owned files only | Self-optimization must not mutate downstream user project code | Maintainer | Open |
| Planning | Trace capture needs both raw logs and trimmed diagnosis views | Raw logs help replay while trimmed views help proposer analysis | Maintainer | Open |
| Planning | Benchmark scoring should reuse existing observability fields where possible | The repository already tracks retry count and verifier failure categories | Maintainer | Open |
