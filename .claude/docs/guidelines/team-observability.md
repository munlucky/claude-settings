# Team Observability Guide

Use this document to define the minimum metrics recorded for team-based harness execution.

## Goal

Make team topology decisions measurable instead of purely qualitative.

## Minimum Team Metrics

Record at least:

- `selectedPattern`
- `selectedTeam`
- `selectionReason`
- `retryCount`
- `handoffCount`
- `indeterminateRatio`
- `verifierFailureCategories`
- `completionLeadTimeSeconds`

## Storage

Recommended artifact path:

- `.claude/team-metrics-<runId>.json`

## Rules

- metrics should summarize the run, not copy raw logs
- the selected pattern and selected team should be recorded together
- retries and handoffs should be counted per active slice or bounded run
- failure categories should be normalized enough for comparison between runs

## Suggested Shape

```yaml
teamMetrics:
  selectedPattern: "fanout-fanin"
  selectedTeam: "review-team"
  selectionReason: "parallel review after medium+ implementation batch"
  retryCount: 1
  handoffCount: 0
  indeterminateRatio: 0.0
  verifierFailureCategories: []
  completionLeadTimeSeconds: 420
```
