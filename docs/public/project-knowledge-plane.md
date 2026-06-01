# Project Knowledge Plane

This staged guideline extends the typed record, compact prompt, and executable ontology contracts with the Phase 06 recursive improvement lifecycle. Phase 07 owns controlled adoption into live `.claude` and `.codex` targets.

## Recursive Improvement Lifecycle

Lifecycle states are deliberately small:

| State | Meaning |
|-------|---------|
| `observe` | Capture an episodic observation or candidate without treating it as truth. |
| `stage` | Normalize the candidate into a proposal and attach source references. |
| `verify` | Check evidence, provenance, sensitivity, and policy duplication before semantic use. |
| `promote` | Move an already verified proposal to a wider scope only when evidence gates pass. |
| `supersede` | Replace an older fact or rule through explicit supersession metadata. |
| `archive` | Retire stale or rejected material without deleting provenance. |

Allowed targets:

- `project-local`: project namespace only. This is the default.
- `global-candidate`: reusable candidate for account-root/global harness knowledge.
- `harness-meta-project`: self-improvement for the harness project id `moonshot-relay`.

Project-local observations can become semantic facts only after verification evidence. Project-local facts are not promoted by default.

## Promotion Gates

Global and harness promotion requires:

- proposal manifest
- independent review manifest
- replay evidence
- durable decision record

Harness candidate promotion additionally requires targeted self-test evidence.

Harness stable promotion requires all candidate evidence plus:

- affected-project replay evidence
- rollback manifest
- release manifest

Transcript-only, imported-only, secret-like, or untrusted external candidates must be denied with a durable reason. That denial is not a blocker for unrelated workflow; it only blocks the unsafe promotion.

## Harness Meta-Project Contract

The harness manages its own recursive improvement lifecycle as a project:

```yaml
projectId: moonshot-relay
knowledgeRoot: "%USERPROFILE%/.moonshot-relay/state/projects/moonshot-relay/knowledge"
improvementRoot: "%USERPROFILE%/.moonshot-relay/state/projects/moonshot-relay/improvement"
candidateReleaseRoot: "%USERPROFILE%/.moonshot-relay/state/harness/releases/candidate"
stableReleaseRoot: "%USERPROFILE%/.moonshot-relay/state/harness/releases/stable"
```

Required promotion artifacts:

- `improvement/proposals/<proposalId>.yaml`
- `improvement/reviews/<proposalId>-review.yaml`
- `improvement/replay/<proposalId>-replay.json`
- `improvement/rollback/<proposalId>-rollback.json`
- `improvement/releases/<proposalId>-release-manifest.json`

## Helper Contract

`knowledge-improvement-lifecycle.mjs` is a deterministic helper. It validates proposal shape, lifecycle state, target, promotion evidence, and unsafe candidate denial.

It does not write live MemoryGraph state by itself. Promoter skills consume its decision output and write only when the target gate explicitly approves promotion.
