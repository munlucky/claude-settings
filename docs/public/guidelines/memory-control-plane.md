# Memory Control Plane

Canonical source guideline for memory as a harness-controlled state surface.

Memory is not completion authority and not a raw prompt dump. The harness may read memory as advisory context, write candidate or verified records through typed gates, validate graph/ontology relationships, and score memory quality from verifier evidence. Runtime-state completion authority remains separate.

## Baseline Layers

| Layer | Purpose | Storage Boundary | Prompt Boundary |
|---|---|---|---|
| working | current run context, recent command output, active files | run-scoped generated state | compact current-task summary only |
| episode | append-only observations, command/test/review events | generated state or runtime DB with redaction | not prompt-facing by default |
| semantic | verified reusable facts | project knowledge state or source-safe fixtures | compact facts with provenance only |
| procedural | verified "next time do this" rules | guideline, rule, hook, skill, or regression fixture after promotion gates | only after review/replay/rollback/scope owner |
| graph_ontology | relationships, constraints, stale/supersession rules | typed JSON/JSONL/schema records | synopsis and diagnostics only |

## Stage Policy

| Stage | Read Policy | Write Policy | Verify Policy |
|---|---|---|---|
| init | policy anchors and compact similar-task synopsis | task episode candidate | no prior solution injection |
| requirements | domain constraints, non-goals, verified acceptance patterns | requirement candidates and blockers | no design conclusion as requirement |
| design | ADR synopsis, verified failures, rollback patterns | decision candidates and alternatives | source/ref required for best-practice claims |
| plan | verified commands, test patterns, phase metadata | plan chunks and expected signals | no success claim before execution |
| validate-plan | ontology constraints and spec-test obligations | plan validation result | incomplete plan blocks |
| prepare | baseline setup issue and worktree policy | environment snapshot reference | dirty-worktree exception requires owner |
| execute | active chunk, verified failure memory, code pattern synopsis | command/test/patch episode records | no procedural promotion |
| review | prior blocking findings and security policy | review findings with severity/status | blocking findings need evidence |
| verify | acceptance criteria, evidence refs, ontology constraints | verify.json or verification-plane record | memory cannot close completion |
| score | verifier result and measured memory quality | score.json or score receipt | no subjective memory score |
| replan | failure class, previous attempts, delta history | delta plan and changed approach | repeated failure class needs rationale |
| close | final evidence and promotion candidates | promotion candidate only | durable promotion needs gates |

## Promotion And Claim Rules

- Durable memory claims require provenance, scope, stage, confidence, sensitivity, validity, and evidence.
- Verified memory must derive from command, test, artifact, review, or accepted verifier evidence.
- Candidate, rejected, superseded, rolled-back, raw, stale, or secret-like records cannot render as verified semantic facts.
- Promotion to reusable procedural memory requires evidence, independent review, replay, rollback plan, and scope owner.
- Rollback supersedes promoted memory without deleting audit history.

## Graph And Ontology Rules

- `Requirement` links to at least one `AcceptanceCriterion` unless an explicit blocker records why it cannot.
- `TestResult` derives from `CommandRun` or equivalent evidence.
- `MemoryFact(status=verified)` derives from evidence and a verification result.
- Stale or superseded facts carry `valid_to`, `supersedes`, or stale warning metadata.
- Score memory quality consumes verification/eval outputs only.

## Generated-State Boundary

Do not copy raw MemoryGraph records, KG edges, ontology dumps, sqlite state, logs, transcripts, browser artifacts, prompt archives, or secret-like strings into source docs, prompts, QA reports, scorecards, or handoffs. Store compact summaries and references instead.
