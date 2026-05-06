# AWTL / RSME Taxonomy, Privacy, and Provenance Contract

Last-Reviewed: 2026-05-06

This contract freezes the phase-01 boundary language before any sink, runner, or MemoryGraph promotion work starts.

## Terms

| Term | Definition |
|---|---|
| `AWTL` | Raw observation stream from the active workflow layer. It may include transient execution detail and must be treated as sensitive until redacted. |
| `RSME` | Repository-scoped compact fact envelope. Phase 01 keeps the expansion intentionally open and records the boundary as an ADR-style decision instead of inventing a hard meaning. |
| `event` | A discrete occurrence observed during execution or verification. Events are traceable but not automatically promotable. |
| `span` | A bounded interval that groups related events without implying promotion eligibility. |
| `action` | An intent-bearing step that can produce observation data and compact facts. |
| `memory candidate` | A compact fact or pattern that may be eligible for promotion after provenance validation. |
| `promotion` | The approval-based move from compact fact to reusable MemoryGraph knowledge. Raw AWTL never bypasses this gate. |
| `failed_turn_case` | A compact, redacted case derived from the failing turn only. It is used for next-run prevention and is not a raw transcript excerpt. |
| `failure_prevention_brief` | A short prompt section built from matching failed turn cases before a new phase attempt starts. |
| `replay_scorecard` | Append-only promotion/replay evidence that records whether a candidate was verified, denied, stale, risky, or skipped. |

## Failure Taxonomy V1

Phase 01 records a bounded taxonomy with 12 leaves. The leaf count is intentionally below the 15-item conflict ceiling from the source plan.

- `capture_missing`
- `capture_partial`
- `trace_not_ignored`
- `trace_path_leaked`
- `redaction_uncertain`
- `redaction_drop`
- `redaction_hash`
- `provenance_missing`
- `provenance_invalid`
- `promotion_denied`
- `memory_lookup_raw`
- `taxonomy_mismatch`

## Privacy Policy

- Fail closed when a value is secret-like, uncertain, or not confidently classifiable.
- Never excerpt tokens, passwords, cookies, bearer strings, or API keys into human-visible summaries.
- Prefer `drop` when the safest outcome is to omit the value entirely.
- Use `hash` only when linkability is required for repeat detection or provenance correlation.
- `uncertain` means the helper cannot prove the value is safe, so the downstream caller must not treat it as safe.

### Forbidden stored items

- Raw trace payloads
- Secret-like strings
- Authorization headers
- Session cookies
- Passwords and recovery codes
- Unredacted bearer tokens

### Allowed stored items

- Compact facts
- Counts
- Timestamps
- Provenance tags
- Hashes of sensitive values when explicitly required

## Provenance Boundary

MemoryGraph promotion is permitted only for compact facts that carry provenance and validation tags.

### Required promotion tags

- `source:moonshot`
- `project:claude-settings`
- `origin:awtl`
- `validated_by:redaction-helper`
- `validated_by:provenance-boundary`
- `origin_turn:{turnId}`

## Turn Failure Loop

- Runner capture must assign a stable `turn_id` before attempt events are written.
- Failed turn cases must carry `failure_turn_id`, a compact failure summary, redacted evidence refs, and prevention hints.
- `awtl-failure-analyzer` may write failed turn cases next to memory candidates, but neither output may contain prompt bodies, raw stdout/stderr, cookies, tokens, or unredacted transcript text.
- Phase prompt construction may inject a `Failure Prevention Brief` only from matching cases. Missing cache is a no-op.
- Replay scorecard entries marked stale, risky, denied, or not verified must not be used as prevention hints.

### Phase 05 replay gate

- Promote only when the candidate has replay evidence or human approval.
- Reject transcript-only or imported-only candidates.
- Keep environment, flaky, and harness blockers intact.
- Direct MemoryGraph writes are allowed only when `--write-memorygraph` is explicit and `--auto-promote verified-only` is active.
- Promotion output must include compact provenance: `origin_turn`, `applies_to`, `does_not_apply_to`, `validated_by`, and `last_validated_at`.

### Non-goals

- `project-memory-agent` must not query raw AWTL trace files directly.
- Raw trace data must not be written into MemoryGraph as reusable knowledge.
- Promotion must not happen without explicit approval evidence.

## Trace Policy

- `.claude/traces/` is an ignored artifact path.
- `.claude/.claude/traces/` is forbidden; nested trace roots indicate repository-root resolution drift.
- The path may exist locally for transient runtime output, but it stays out of version control.
- Any trace artifact that escapes the ignore boundary is a policy defect.
- `agent_work_trace.jsonl` is the canonical append-only source of truth for AWTL events.
- `judge_result.jsonl` is a materialized view built from the canonical log, not an independent source.
- Partial or corrupt JSONL lines must be quarantined before the canonical file is rewritten.
- Every captured event in a phase attempt should carry the current `turn_id`; retry attempts must start a new turn id.

## Runtime Importers

- `awtl-runtime-importers.mjs` and `awtl-import-trace.mjs` may backfill Codex rollout/session and Claude transcript data into canonical AWTL events.
- Imported records must keep `source_runtime_schema`, `import_confidence`, and `imported_at` in `payload`.
- Imported-only or transcript-only candidates remain blocked from MemoryGraph promotion.

## Open Decision Record

| Item | Status | Decision |
|---|---|---|
| RSME acronym expansion | open | Keep the expansion deferred until maintainer approval or a later ADR. |
