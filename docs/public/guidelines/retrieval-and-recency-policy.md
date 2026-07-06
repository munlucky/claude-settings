# Retrieval And Recency Policy

Canonical source guideline for current or volatile fact handling.

Use retrieval evidence when a claim depends on facts that can change: product availability, model names, pricing, laws, dependency versions, security policy, public office holders, schedules, or live service behavior.

## Evidence Shape

```yaml
retrievalPolicy:
  currentOrVolatile: true
  requiredSources:
    - repository
    - official_web
    - internal_connector
  searchBudget:
    class: small
  evidenceRequiredFor:
    - product facts
    - dependency versions
    - model availability
    - pricing
    - legal/security/current policy
```

Prefer repository truth for local behavior and official sources for external facts. If retrieval is unavailable, record the gap as an assumption or blocker instead of presenting stale training knowledge as current truth.
