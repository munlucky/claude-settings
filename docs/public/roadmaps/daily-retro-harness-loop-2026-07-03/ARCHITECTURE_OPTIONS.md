# Architecture Options

## Option A: Extend Harness History

Add task retro records directly into `tools/harness-lab/harness-history.mjs`.

Pros:

- reuses an existing advisory read model
- fewer new commands

Cons:

- lab history and task closeout retros have different inputs and semantics
- risks mixing candidate promotion analysis with workflow retrospective analysis
- makes the current history contract harder to reason about

Verdict: rejected for initial implementation.

## Option B: New `tools/retro` Advisory Plane

Add `tools/retro/**`, `schemas/retro.*.schema.json`, `templates/retro/**`, and `moonshot-relay retro ...` commands.

Pros:

- clean source/runtime boundary
- can use `promotionAuthority: false` consistently without changing H0 lab authority
- easier to test with task fixtures
- keeps future GitHub issue support behind a separate command and approval policy

Cons:

- creates another command surface
- may duplicate small helper logic until a later shared utility extraction

Verdict: accepted.

## Option C: Documentation-Only Retro Process

Define a public guideline and ask agents to write manual retro notes.

Pros:

- lowest implementation cost
- no new CLI or schemas

Cons:

- does not create machine-readable records
- cannot aggregate repeated patterns reliably
- does not meet the requested "records based retrospective and improvement candidate command" objective

Verdict: rejected.

## Option D: Direct GitHub Issue Automation

Collect, aggregate, propose, and create GitHub issues in one flow.

Pros:

- complete automation
- direct workflow integration

Cons:

- remote write risk
- duplicates and noisy issues before pattern quality stabilizes
- violates the plan's advisory-first safety boundary

Verdict: deferred. Start with local issue drafts only.

