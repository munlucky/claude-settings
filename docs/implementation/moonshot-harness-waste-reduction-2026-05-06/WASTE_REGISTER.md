# Waste Register

This register converts the 2026-05-06 waste analysis into source requirements for `00-master-plan-v1.md`.

## Source Evidence

- User-provided Moonshot Harness Waste Reduction Plan in the Codex thread.
- `.claude/logs/agent-loop/debug.jsonl` window `2026-05-06T02:38:49Z` to `2026-05-06T06:11:38Z`.
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md`.
- `docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md`.
- `.claude/verification.contract.yaml`.

## Requirements

| Req ID | Waste Class | Observed Count | Requirement |
|---|---:|---:|---|
| MWR-001 | path authority | 16 | `master-plan-missing` and related path authority failures must fail fast before worker launch. |
| MWR-002 | path authority | 1+ | Completion closeout must not fall back to default `docs/implementation/00-master-plan-v1.md` when a phase-local master plan is supplied or required. |
| MWR-003 | stale verdict | 1 | Stale, superseded, imported, or phase-mismatched verdicts must not block clean completion. |
| MWR-004 | verdict scope | 7 | Non-runtime/content-precondition verdicts must be classified separately from implementation failures. |
| MWR-005 | evidence contract | 5 | Missing verification evidence must stop as a contract failure, not spawn micro-retries. |
| MWR-006 | coordinator lifecycle | 27 | In-session coordinator restart-cap loops must be prevented by preflight routing or fail-fast. |
| MWR-007 | delegated terminal lifecycle | 8 | Signal-like no-closeout/restart loops must not keep relaunching without progress evidence. |
| MWR-008 | stale worker cleanup | 24 | Stale worker cleanup must be scoped to the active run lease and command signature. |
| MWR-009 | worktree fallback | 14 | Worktree coordinator fallback must be surfaced as operational evidence, not silent normal flow. |
| MWR-010 | dirty worktree | 1 | Final git closeout preconditions must be checked before expensive dispatch starts. |
| MWR-011 | closeout artifact | 1+ | QA/SCORECARD/HANDOFF closeout fields must be synchronized through a structured writer. |
| MWR-012 | patch churn | 76 mentions | Artifact-only patch failures must be reduced by idempotent artifact writers. |
| MWR-013 | log hygiene | 21,504 mentions | Repeated plugin/skill/deprecation warnings must be summarized instead of repeated in phase logs. |
| MWR-014 | deprecated CLI | 49 mentions | Codex exec command construction must stop using deprecated `--full-auto`. |
| MWR-015 | MemoryGraph noise | 33 mentions | MemoryGraph transport failures must be recorded once per run as a backend availability signal. |
| MWR-016 | observability | all | Abnormal retries must be recorded in a machine-readable waste ledger. |
| MWR-017 | regression coverage | all | The 2026-05-06 failure pattern must become a regression fixture. |
| MWR-018 | documentation | all | Related reliability documents must be indexed so future work does not reopen completed plans. |

