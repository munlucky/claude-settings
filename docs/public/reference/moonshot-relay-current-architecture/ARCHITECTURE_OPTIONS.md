# Architecture Options

## Option A: Source-Owned Brownfield Package With No Runtime Mutation

- Decision: accepted.
- Summary: Add a tracked architecture package under `docs/public/reference/moonshot-relay-current-architecture` and validate it against the existing Brownfield artifact contract.
- Strengths: Preserves source/runtime boundary, gives current evidence, can be handed off to plan-writer, and is reviewable in Git.
- Weaknesses: Does not by itself update installed account-root runtime or generated package payloads.
- Requirement Links: REQ-001, REQ-003, REQ-004, REQ-005.

## Option B: Runtime Task Output Under `.moonshot-relay/docs/tasks`

- Decision: rejected for this request.
- Summary: Store architecture output as runtime/generated task evidence.
- Strengths: Matches runtime task-output defaults for one-off work.
- Weaknesses: `.moonshot-relay/**` is generated state and excluded from package payloads; the user asked from the repository profile context, and durable current-architecture evidence is useful as source.
- Requirement Links: REQ-001, REQ-005.

## Option C: Mutate Profile-Local `.codex`/`.claude` Guidance

- Decision: rejected.
- Summary: Update live profile-local runtime files directly.
- Strengths: Immediate local runtime effect.
- Weaknesses: Violates architecture-design hard stop, bypasses canonical source, and risks account-root/profile drift.
- Requirement Links: REQ-001, REQ-002, REQ-004.
