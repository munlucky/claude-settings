# Context Relevance Policy

Canonical source guideline for memory and project knowledge relevance.

Use memory, project-local knowledge anchors, and agreement packages only when they match the current scope, stage, and `mustConsultFor` conditions. Load the smallest referenced document set that can answer the task.

Never inject raw MemoryGraph records, KG edges, ontology dumps, runtime logs, transcripts, or secret-like strings into prompts, manifests, QA reports, scorecards, or handoffs.

## Application Shape

```yaml
knowledgeApplicationPolicy:
  applyOnlyWhen:
    - scopeMatches
    - mustConsultForMatches
    - currentStageNeedsIt
  neverInject:
    - rawKG
    - rawMemoryGraph
    - unrelated personal/contextual preference
    - sensitive historical context
  outputBehavior:
    mentionSourceOnlyWhenUserAsks: true
    citeDocumentsWhenUsedAsEvidence: true
```

Memory and knowledge context are advisory. They cannot satisfy runtime-state completion authority.
