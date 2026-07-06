# Artifact Routing Policy

Canonical source guideline for deciding where outputs belong.

Use inline answers for strategy, explanation, short analysis, and brainstorming. Use source artifacts for durable project policy, docs, schemas, tests, templates, skills, agents, scripts, and public roadmaps. Use runtime artifacts for generated state, logs, QA reports, scorecards, handoffs, phase readiness, browser traces, sqlite state, and verification evidence.

## Routing Shape

```yaml
artifactRouting:
  responseMode: inline | task_artifact | runtime_artifact | downloadable_file
  reason: "strategy read in chat"
  outputRoot:
    sourceOwned: "docs/public/..."
    runtimeOwned: "${MOONSHOT_RELAY_HOME}/state/..."
  forbidden:
    - ".claude/** durable source"
    - ".codex/** durable source"
```

Do not put durable source in root `.claude/` or `.codex/`. Do not put generated state in package payloads.
