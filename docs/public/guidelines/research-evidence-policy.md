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

## Linked Research And Prototype Evidence

Research tickets are evidence assets, not execution authority. A research note should record source quality, retrieval or observation date, confidence, limitations, conflicts, and the downstream requirement, claim, or decision it informs.

Prototype tickets are decision evidence, not production payload by default. A prototype note should record the prototype type, location or command when applicable, observed result, accepted decision, and disposition:

- `delete`: throwaway code or generated output is removed after evidence is captured.
- `absorb`: the useful behavior is reimplemented through production-owned source paths.
- `retain-as-evidence`: the prototype remains outside package/runtime payload as non-production evidence.

Do not copy raw transcripts, raw MemoryGraph records, browser artifacts, secrets, or external prompt bodies into research or prototype evidence. Store compact summaries and pointers that preserve source boundaries.
