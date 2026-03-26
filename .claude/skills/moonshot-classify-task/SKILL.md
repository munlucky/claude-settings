---
name: moonshot-classify-task
description: Classifies a user request into task types (feature, modification, bugfix, refactor) and extracts intent keywords. Use at the start of PM analysis.
---

# PM Task Classification

## Visibility

This is an internal analysis micro-skill.
Prefer invoking `moonshot-orchestrator` or `moonshot-phase-runner`, not this skill directly.

## Inputs
- `analysisContext.request.userMessage`
- `context.md` (path: `analysisContext.artifacts.contextDocPath`, if exists)

## Procedure
1. Identify intent keywords from the user message.
2. Select one taskType: `feature | modification | bugfix | refactor`.
3. Detect whether the request is still in product-definition mode.
4. Set confidence: `high | medium | low`.

## Heuristics
- feature: "new", "add", "implement", "create", "build"
- modification: "change", "modify", "improve", "adjust", "remove"
- bugfix: "bug", "error", "broken", "fails"
- refactor: "refactor", "clean up", "restructure", "remove duplication"

## Product Definition Detection

Set `signals.productDefinitionRequest: true` when the request is primarily about:
- idea shaping
- product intent
- PRD
- solution modeling
- architecture definition before implementation
- execution planning before code changes

Example keywords:
- "idea", "intent", "prd", "solution", "spec", "scope", "out of scope", "plan", "task slice"

## Technology Stack Detection

React/Next.js 키워드 감지 시 시그널 설정:
- Keywords: "react", "next", "next.js", "nextjs", "jsx", "tsx", "useState", "useEffect"
- Output: `signals.reactProject: true`

## Output (patch)
```yaml
request.taskType: feature
request.keywords:
  - implement
  - react
signals:
  productDefinitionRequest: false
  reactProject: true  # Set when React/Next.js keywords detected
notes:
  - "taskType=feature, confidence=high"
  - "product-definition-request=false"
  - "tech-stack: react/next.js detected"  # Add when reactProject=true
```
