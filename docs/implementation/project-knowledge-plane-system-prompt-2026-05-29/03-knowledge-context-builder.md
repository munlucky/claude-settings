# Phase 03 - Knowledge Context Builder

## Phase Execution Metadata
```yaml
phase: 03
title: "Knowledge Context Builder"
dependsOn: [01, 02]
conflicts: []
ownedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/scripts/knowledge-context-build.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/scripts/knowledge-context-build.test.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/docs/guidelines/project-knowledge-plane.md"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/**"
adoptionTargets:
  - "Phase 07 controlled adoption only"
readOnlyPaths:
  - ".claude/scripts/**"
  - ".claude/docs/guidelines/**"
  - ".claude/scripts/memorygraph-direct.mjs"
  - ".claude/scripts/memorygraph-project-index.mjs"
sharedMutablePaths:
  - ".claude/workflow.registry.yaml"
mergePolicy: "deterministic helper, no orchestrator callsite changes until Phase 04"
liveMutationPolicy: "staged only"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-004 | AC-004 | Summary-only prompt injection. | prompt purity tests |

## Goal
Build a deterministic helper that converts project memory, KG, ontology, and project prompt sources into a compact `projectKnowledgeContext` block safe for system/attempt prompt injection.

## Scope
- Add CLI: `node .claude/scripts/knowledge-context-build.mjs --cwd <path> --stage <intake|plan|execute|verify|finish> --json`.
- Input sources: project identity resolver, knowledge contract, account-root knowledge store, repo project prompt docs, optional changed files/plan path.
- Output statuses: `ready`, `degraded_read`, `degraded_write`, `not_configured`, `stale`.
- Enforce max prompt budget by line/token approximation.
- Project prompt sources `AGENTS.md`, `.claude/CLAUDE.md`, and `.claude/PROJECT.md` can contribute short `policy_anchor` summaries only. Duplicated system/developer/rules text must be omitted and recorded in `omittedByPolicy`.

## Non-Scope
- Do not write new memory facts.
- Do not call LLM summarization.
- Do not change orchestrator prompts yet.

## Output Contract
```yaml
projectKnowledgeContext:
  schemaVersion: 1
  projectId: "<immutable-id>"
  namespace: "account-root/project-knowledge"
  knowledgeRevision: "<rev-or-empty>"
  status: "ready | degraded_read | degraded_write | stale | not_configured"
  strictness: "advisory | required"
  policyAnchors: []
  semanticFacts: []
  graphSynopsis: []
  ontologyConstraints: []
  staleOrUnavailable: []
  omittedByPolicy: []
  promptBlock: "<rendered markdown block>"
```

Included item shapes:
```yaml
policyAnchors:
  - id: "policy:<id>"
    text: "<one sentence>"
    trustTier: "authoritative | verified"
    sourceRef: "<repo-relative-or-account-root-ref>"
    provenanceRef: "<prov-id-or-empty>"
semanticFacts:
  - id: "fact:<id>"
    text: "<one sentence>"
    trustTier: "verified | derived"
    sourceRef: "<ref>"
    provenanceRef: "<prov-id>"
    stale: false
graphSynopsis:
  - id: "kg:<id>"
    text: "<one sentence relation summary>"
    trustTier: "derived | verified"
    sourceRef: "<ref>"
    provenanceRef: "<prov-id-or-empty>"
ontologyConstraints:
  - id: "ontology:<id>"
    text: "<one sentence applicable constraint>"
    severity: "error | warn | info"
    enforcedBy: "ontologyConstraints"
    sourceRef: "<ref>"
```

## Forbidden Prompt Payload Fixtures
The test fixture set must include and reject these exact classes:
- raw MemoryGraph JSON object with `nodes`, `relationships`, or MCP tool output envelope
- raw KG relation dump with unbounded edge list
- raw ontology file or constraint dump larger than selected constraint summaries
- raw runtime log lines, stdout/stderr transcript, or browser scrape body
- failed-turn transcript excerpt or prompt archive body
- secret-like strings such as `sk-...`, `ghp_...`, `BEGIN PRIVATE KEY`, `password=`, `apiKey=`

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Implement source loading and budgeted render path. | builder + tests | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/scripts/knowledge-context-build.test.mjs` | compact block emitted | raw JSON emitted |
| T02 | Add prompt purity redaction for raw graph, logs, transcript, secrets, prompt body. | tests | same test | forbidden payload absent | secret-like string leaks |
| T03 | Add status matrix for unavailable/stale/not configured. | tests | same test | strict vs advisory differs | degraded memory blocks non-strict workflow |
| T04 | Add stage-aware selection weights. | tests + guideline | same test | plan/execute/verify differ predictably | same noisy facts every stage |

## Acceptance Criteria
- AC-004: Prompt block includes compact facts and constraints only; raw MemoryGraph/KG/ontology/log/transcript payloads are absent.
- AC-006: Builder reports degraded memory without blocking non-strict workflows.
- AC-007: Builder output includes provenance/trust metadata for each included fact.
- AC-016: Builder tests run from staged overlay and live `.claude/.codex` targets are untouched before Phase 07.

## Verification Plan
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/scripts/knowledge-context-build.test.mjs`
- `node docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/scripts/knowledge-context-build.mjs --cwd . --stage plan --json`
- `git diff --check -- .claude docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Builder emits stable schema.
- [ ] Prompt purity and status matrix tests pass.
- [ ] Stage-aware budget behavior is documented.
