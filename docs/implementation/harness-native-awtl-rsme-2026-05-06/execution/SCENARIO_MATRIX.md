# Phase 01 Scenario Matrix

## Critical Scenarios

| SCN ID | Scenario | Evidence | Result |
|---|---|---|---|
| SCN-P01-1 | Maintainer can read one guideline and understand that raw AWTL never goes to MemoryGraph | `awtl-rsme.md` and `awtl-rsme.ko.md` state the provenance boundary and raw-trace prohibition | pass |
| SCN-P01-2 | Secret-like payload is dropped or hashed, never excerpted | `node --test .claude/scripts/lib/awtl-redaction.test.mjs` | pass |
| SCN-P01-3 | Trace artifacts are ignored by git | `git check-ignore .claude/traces/example/agent_work_trace.jsonl` | pass |

## Verification Notes

- Each critical scenario has fresh passing evidence in this attempt.
- The matrix is bounded to phase 01 and does not claim downstream replay or promotion behavior.

