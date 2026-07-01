# C4 Context

## System Boundary

Moonshot Relay is the workflow harness that supplies product definition, architecture design, planning, execution, verification, and closeout workflows to Claude and Codex profiles.

| External Actor/System | Relationship | Requirement Links |
|---|---|---|
| Contributor/Agent | Edits canonical source and runs verification gates. | REQ-001, REQ-006 |
| Claude/Codex Runtime Profiles | Consume profile-local public skills, agents, rules, and verification contracts. | REQ-002 |
| Account-root Moonshot Runtime Home | Stores shared runtime payload, state, and project execution/knowledge namespaces. | REQ-001, REQ-003 |
| Git Repository | Holds durable source and source-owned documentation. | REQ-001 |
| Harness Lab / Eval Fixtures | Provide quantitative behavior and regression evidence. | REQ-006 |

## Architecture Context

The system boundary excludes generated state, logs, caches, browser artifacts, sqlite state, and live account-root profile mutation from architecture design packages.
