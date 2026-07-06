# Research Evidence Policy

Canonical source guideline for research and report evidence.

When a product, architecture, market, dependency, model, or policy claim depends on external facts, prefer primary or official sources, record recency, and call out conflicts. Repository facts should come from the current checkout.

## Evidence Shape

```yaml
researchEvidence:
  sourceQuality: official | primary | repository | secondary | unknown
  recencyChecked: true
  sourceCount: 0
  conflicts: []
  limitations: []
```

Quote only the minimum needed text. Summaries and reports should distinguish source-backed facts from inference.
