# Requirement Inventory

## Accepted Requirements

| ID | Requirement | Rationale |
|---|---|---|
| RETRO-REQ-001 | Define `retro.collect` source data schema. | The loop needs a stable per-task record that stores facts and evidence references without copying raw logs. |
| RETRO-REQ-002 | Define runtime outbox and account-root retro state layout. | Project workspaces should export records; Moonshot Relay should import and analyze them. |
| RETRO-REQ-003 | Add secret/raw-body rejection for retro imports and generated reports. | Retro data may be produced from task closeout context; the contract must prevent leakage into source or prompt-facing artifacts. |
| RETRO-REQ-004 | Add `retro import` command. | Import is needed to normalize external project outboxes into the account-root project namespace. |
| RETRO-REQ-005 | Add `retro daily` command. | Daily aggregation is the requested recurring retrospective step. |
| RETRO-REQ-006 | Add deterministic failure pattern extraction. | Improvement candidates must come from repeated patterns, not isolated project-specific anecdotes. |
| RETRO-REQ-007 | Add `retro propose` command. | Daily patterns should become actionable harness improvement candidates. |
| RETRO-REQ-008 | Add `retro issue-draft` command, dry-run only. | GitHub issue creation should start as a local draft surface with no remote writes. |
| RETRO-REQ-009 | Add `moonshot-relay retro ...` bin routing. | The feature should be available from the existing public CLI. |
| RETRO-REQ-010 | Add public docs and `moonshot-retro` skill docs. | Agents need clear routing rules for collect, daily, propose, and human approval boundaries. |
| RETRO-REQ-011 | Preserve `promotionAuthority: false` on every retro output. | Retro must not replace H0 lab, verification, score, or runtime DB authority. |
| RETRO-REQ-012 | Add tests for schema validity, redaction, duplicate handling, daily aggregation, proposals, issue drafts, and CLI routing. | This is a harness-level change and must be regression-protected. |

## Deferred Requirements

| ID | Requirement | Deferral Reason |
|---|---|---|
| RETRO-DEF-001 | Create GitHub issues through the GitHub API. | Remote writes need a later approval and duplication policy phase after issue drafts stabilize. |
| RETRO-DEF-002 | Merge retro and `harness-history` storage. | `harness-history` is lab-run centered; retro is task-closeout centered. Sharing helpers can come later. |
| RETRO-DEF-003 | Automatically generate implementation PRs from retro proposals. | The requested loop is a learning and proposal loop, not autonomous mutation. |
| RETRO-DEF-004 | Installed profile/account-root adoption. | Source implementation must be validated before runtime adoption. |

## Rejected Requirements

| ID | Requirement | Rejection Reason |
|---|---|---|
| RETRO-REJ-001 | Let daily retro change completion status. | Completion authority remains with verify/score/closeout and accepted runtime state, not retrospective analysis. |
| RETRO-REJ-002 | Commit `.moonshot-relay/retro/**` output. | Runtime retro data is generated state, not canonical source. |
| RETRO-REJ-003 | Copy raw logs or transcripts into collect records. | Retro records must store summaries and references only. |
| RETRO-REJ-004 | Treat one downstream project symptom as a harness defect. | Harness patch candidates require source/template evidence, explicit contract violation, cross-project recurrence, or a reproducible regression test. |

