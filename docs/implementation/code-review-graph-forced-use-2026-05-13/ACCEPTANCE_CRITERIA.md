# Acceptance Criteria

| AC ID | Criterion | Evidence Target |
|---|---|---|
| AC-01 | Code suffix detection uses only `.claude/config/code-suffixes.json`. | Node/Python helper tests |
| AC-02 | Code-changing strict work fails when `execute/review/finish` CRG coverage is missing. | Validator and closeout fixtures |
| AC-03 | String-only `stageCoverage` fails without adapter-origin metadata and artifact cross-check. | Shared validator fixtures |
| AC-04 | graph empty, corrupt, rebuild failure, and corrupt rebuild failure are distinct states. | Adapter tests |
| AC-05 | Node and Python validators return identical decisions for shared fixtures. | Node test + Python stdlib test |
| AC-06 | QA parser blocks duplicate marker, malformed JSON, and legacy-only evidence. | Parser fixtures |
| AC-07 | Runtime parity and `verify-phase-closeout` fail strict profiles without structured CRG evidence. | Parity and closeout tests |
| AC-08 | Docs-only package creation does not modify active phase status or runtime state. | `git status --short` |
| AC-09 | CRG marker block uses JSON parser strategy, not YAML dependency or manual YAML parsing. | Parser implementation review |
| AC-10 | Schema/policy docs reflect profile-aware blocker semantics. | Docs diff and workflow verify |
| AC-11 | Adapter artifact and carrier writes use temp file plus atomic rename. | Adapter tests |
| AC-12 | `evidenceArtifactPath` realpath must stay inside allowed roots. | Validator path traversal fixture |
| AC-13 | Workflow Execution rewrites preserve exactly one CRG marker block. | `agent-loop-phase-artifacts` tests |
| AC-14 | Evidence digest mismatch is a blocker. | Validator fixture |

