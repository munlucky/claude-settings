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

## Project Verification Contract (`required_verification`)

`required_verification` is the project-owned executable quality contract. The Kernel does not interpret what a check means; it only decides whether the changed scope matches, whether the `commandRef` is valid and bound to the obligation, whether the evidence is fresh, and whether completion may proceed.

Machine-verifiable quality conditions belong here rather than in Kernel capability guidance. The model receives only the judgment guidance it needs for the current work unit.

### Command indirection

Never place a raw command string in a task contract or a knowledge record.

```text
❌ "./gradlew test --tests ArchitectureTest"
✅ commandRef: architecture:test
```

The project command catalog resolves `architecture:test` to the real command. Kernel command classification and obligation binding are applied unchanged, so an unbound command cannot satisfy an obligation.

### Architecture fitness

Architecture decisions are not executable by themselves. Link the decision to a verification record explicitly; the Kernel never derives one from the other.

```json
{ "type": "architecture_decision", "statement": "Domain layer must not depend on web layer." }
```

```json
{
  "type": "required_verification",
  "statement": "Domain dependency boundary must remain valid.",
  "scope": ["src/domain/**"],
  "verification": { "commandRefs": ["architecture:test"] }
}
```

The underlying tool (dependency-cruiser, an ESLint boundary rule, ArchUnit, a custom AST check) stays a project concern.

### Mutation quality

Mutation testing is a project `commandRef`, not a Kernel concept. Register it for critical pure logic (payment calculation, permission decisions, state transitions, parsers, critical validation), not for docs, CSS, static config, mechanical renames, or generated code.

```json
{
  "type": "required_verification",
  "scope": ["src/domain/payment/**"],
  "verification": { "commandRefs": ["test:payment-mutation"] }
}
```

### User-visible acceptance

User-visible QA is a command contract, not a separate reviewer role: `e2e:login` for a frontend scope, `smoke:cli-auth` for a CLI, `test:auth-contract` for an API, `migration:upgrade-downgrade-smoke` for a migration. The Kernel proof pipeline executes the command and records the evidence.

### Linking a `known_failure_pattern`

A repeated defect is managed as a pair: the pattern records what keeps regressing, and a `required_verification` in the same scope makes it executable.

```text
known_failure_pattern: "Refresh flow regresses whenever JWT expiry changes."
required_verification: scope = src/auth/**, commandRef = test:refresh-regression
```

### When to create a record

Create a `required_verification` for a repeated regression class, an architecture invariant, continuous acceptance of a critical feature, a security boundary, or any contract that must keep holding across runs. Do not create one for a single-run reproduction, a temporary debugging command, a commit-specific script, a plain full-suite `test` command, or a check the existing proof policy already covers.

Records are authored by the model, the user, or the project and pass through knowledge review before commit. The Kernel does not infer verification records from architecture decisions or failure patterns.

## Helper Contract

`knowledge-improvement-lifecycle.mjs` is a deterministic helper. It validates proposal shape, lifecycle state, target, promotion evidence, and unsafe candidate denial.

It does not write live MemoryGraph state by itself. Promoter skills consume its decision output and write only when the target gate explicitly approves promotion.
