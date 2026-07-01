# Quality Attribute Scenarios

| Scenario ID | Quality Attribute | Stimulus | Environment | Response | Measure | Requirement IDs |
|---|---|---|---|---|---|---|
| QAS-001 | Modifiability | A contributor changes a workflow skill, schema, support script, or package rule. | Source checkout with local runtime profiles present or absent. | Durable changes occur in canonical root source and package/materialization gates catch boundary drift. | Package/layout tests and artifact validation pass without editing `.claude/**` or `.codex/**`. | REQ-001, REQ-002 |
| QAS-002 | Safety | An agent produces architecture context from project knowledge. | Project knowledge namespace is missing, stale, or advisory. | The context records degraded metadata and omits raw graph/log/secret payloads. | Context builder returns non-blocking degraded status with prompt-safe output. | REQ-004 |
| QAS-003 | Reliability | A phase-based harness change claims completion. | Runtime state, phase status, and evidence may diverge. | Completion is assessed from runtime-state decisions and evidence, not markdown alone. | Runtime-state completion assessment and active tests agree before closeout. | REQ-003, REQ-005 |
| QAS-004 | Observability | A harness candidate is compared to a baseline. | Local source or Docker-backed lab run. | Lab result captures source fingerprint, suite outcomes, metric status, and promotion eligibility. | Harness lab JSON includes pass/fail suites and quantitative promotion decision. | REQ-006 |
