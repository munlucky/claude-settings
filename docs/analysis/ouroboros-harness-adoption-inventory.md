# Ouroboros Harness Adoption Inventory

Last reviewed: 2026-05-10
Source reviewed: `Q00/ouroboros` at `aa534cf` (`feat(auto): chain RUN->RALPH automatically with --complete-product (#791)`)
Local target: `C:\dev\claude-settings`

This document is an adoption inventory, not a priority list. It records every Ouroboros pattern that is worth considering for the local Moonshot harness, where it should land, and what should not be copied directly.

## Baseline Difference

Ouroboros is strongest before execution. It turns a vague goal into a scored, immutable Seed and an acceptance-criteria execution/evaluation contract.

Moonshot is strongest after execution starts. It drives phase plans through bounded execution, evidence capture, runtime parity, stale-state detection, and closeout verification.

The correct transfer model is therefore:

```text
Ouroboros front-end contract discipline
+ Moonshot back-end execution and closeout discipline
```

Do not replace the local public entrypoints. Per local harness policy, external patterns should usually update existing stage owners, scripts, templates, or reference guides instead of adding new public skills.

## Adoption Matrix

| Area | Ouroboros pattern | Local destination | Adopt shape | Direct-copy risk |
|---|---|---|---|---|
| Requirement intake | Socratic interview until clarity threshold | `product-orchestrator`, `moonshot-phase-runner`, `codex-validate-plan` | Add structured clarification gate | Too many user questions can stall execution |
| Requirement scoring | Ambiguity score with per-dimension clarity | `analysis-context.schema.yaml`, plan validation, phase prep | Add `clarityScore`, `ambiguityScore`, `unresolvedDimensions` | Score can become fake precision if not evidence-backed |
| Immutable spec | Frozen Seed with goal, constraints, AC, exit conditions | `SPRINT_CONTRACT`, new `GOAL_CONTRACT`, verifier fixtures | Add schema-backed contract snapshot | Full Pydantic model does not match Node/bash harness |
| Brownfield context | Existing patterns/dependencies/context references in Seed | `project-md-refresh`, phase plan prep | Add brownfield context section to contract | Auto-discovered context can become stale |
| Acceptance model | AC Tree with statuses and decomposition | `WORKSETS.yaml`, `REQUIREMENTS_TRACEABILITY.md`, `SCENARIO_MATRIX.md` | Add AC IDs and parent/child links to worksets | Replacing phase model would break current runner |
| Atomicity | Recursive AC decomposition with max depth | `task-slicer`, phase plan writer, workset renderer | Add split rules and max-depth warnings | Over-decomposition creates admin work |
| Mechanical evaluation | Lint/build/test/static/coverage first | `verification.contract.yaml`, `completion-verifier` | Keep deterministic checks as first gate | Ouroboros skip-as-pass default is too soft for strict runs |
| Semantic evaluation | LLM AC compliance, goal alignment, drift, uncertainty | `codex-review-code`, `completion-verifier`, optional evaluator | Add gated semantic review only for ambiguous/risky cases | Running on every task increases cost and false authority |
| Consensus evaluation | Multi-model review only when triggered | `plan-eng-review`, `codex-review-code`, future evaluator gate | Use only for contract drift or high-risk changes | Default consensus wastes budget |
| Drift measurement | Measure output deviation from Seed goal | `QA_REPORT`, `verification-verdict`, phase closeout | Add `goalDrift` and `scopeDrift` fields | Drift without hard evidence can be subjective |
| Event sourcing | Append-only EventStore and replay | runtime-state, workflow logs, AWTL traces | Add event ledger alongside read models | Full replay-only architecture is too disruptive |
| Event schema | Versioned event payloads | `workflow-enforcement` logs, `runtime-state.sqlite`, AWTL JSONL | Add `eventVersion` to durable event records | Existing artifacts need migration boundary |
| Control plane | `ControlContract` for directives | `phase-status.yaml`, dispatch records, workflow evidence | Add typed directive events | Extra abstraction can hide simple closeout states |
| IO journaling | Runtime input/output journal | session monitoring, AWTL capture | Capture compact IO summaries for replay | Raw transcript persistence can leak secrets/noise |
| MCP-first tools | Skills force MCP tool calls for run/evaluate/auto | Moonshot scripts and possible MCP wrapper | Add tool-backed execution contracts where useful | MCP-only blocks Codex/local fallback paths |
| Deferred tools | ToolSearch before declaring tool unavailable | skill instructions, runtime adapter policy | Add deferred-tool lookup rule | Not relevant for pure shell scripts |
| Auto pipeline | Goal -> interview -> Seed grade -> execution handoff | `moonshot-phase-runner` prepare path | Add optional `auto-contract` preflight | Full auto can over-question simple tasks |
| Resume pipeline | Auto session resume capability | phase resume, current-run/active-run state | Add session id and resume hints to contracts | Must not override stale-state guards |
| Seed review | A-grade Seed reviewer and repairer | plan review, contract gate | Add contract quality review before execution | LLM grade can become non-deterministic blocker |
| Provenance | Track generated Seed origin and repair path | `QA_REPORT`, `HANDOFF`, workflow evidence | Add provenance block for contract changes | Too much provenance can bloat reports |
| Safe defaults | Conservative default answers for auto interview | assumption-ledger, product gate | Convert into explicit assumptions | Silent defaults are dangerous in product work |
| Blocker attribution | Record authoring backend and blocker cause | failure-analyzer, phase closeout | Add `blockerAttribution` to verdicts | Attribution must distinguish env vs product failure |
| Runtime adapters | Claude, Codex, OpenCode, Gemini, Kiro, Copilot, Hermes | `moonshot-orchestrator` runtime adapter policy | Extend runtime capability matrix | Supporting too many runtimes early increases test burden |
| Runtime capability matrix | Explicit supported feature map | `.claude/verification.contract.yaml`, docs guidelines | Add per-runtime capability/degradation matrix | Static matrix drifts quickly |
| Permission policy | Runtime-specific permission profiles | `workspace-isolation-gate`, preflight, Codex/Claude policy | Add permission mode to workflow evidence | Blindly copying permissions can be unsafe |
| Worktree support | Isolated worktrees for execution | phase parallel coordinator | Keep and strengthen existing worktree invariant | Worktree cleanup failure can pollute repos |
| File lock | Locking primitives for concurrent state | phase lease store/status | Review for lease hardening patterns | Different language/runtime implementation |
| Retry utility | Central retry/backoff helpers | delegated-terminal failover, provider smoke boundary | Normalize retry taxonomy | Retrying semantic failures wastes time |
| Security utilities | Path and command safety helpers | verification command allowlist, preflight | Add allowlist around repo-declared commands | Over-restricting breaks project-native scripts |
| Mechanical overrides | `.ouroboros/mechanical.toml` project override | `verification.contract.yaml`, TEST_GUIDE detection | Consider `.claude/verification.local.yaml` | Local config must not silently weaken strict checks |
| Command allowlist | Block unknown executables in mechanical config | verification contract parser | Add explicit executable allowlist for untrusted overrides | Existing first-party commands must remain supported |
| Artifact collector | Collect changed files/output for evaluation | `QA_REPORT`, verifier artifacts | Add artifact inventory section | Artifact lists must not replace evidence |
| Verification artifacts | Dedicated models for verification evidence | `verification-verdict-*.json`, runtime verdict | Align verdict schema with evidence types | Schema churn can break existing closeout |
| Checklist evaluation | AC checklist path | `SCORECARD.md`, `REQUIREMENTS_TRACEABILITY.md` | Add AC checklist summaries | Checklist pass can be gamed without commands |
| Execution vs evaluation split | Worker task completion is not formal AC verdict | `WORKSETS.yaml`, `QA_REPORT`, phase status | Split `taskStatus` from `acVerdict` | Current fields may conflate completion and correctness |
| Stagnation detection | Spinning, oscillation, no drift, diminishing returns | failure-analyzer, recursive runner, phase loop | Add loop-pattern classifier | Persona-based response should remain secondary |
| Ralph loop | Bounded repeated evolve/execute/evaluate | retry loop, recursive-improvement runner | Add verified retry loop contract | Unbounded loop can waste time and hide blockers |
| Ralph stop reasons | Terminal stop actions and timeout distinction | phase status, current-run/active-run normalization | Add precise stop reason classes | Must not collapse raw failure and recovered success |
| Per-iteration timeout | Iteration deadline separate from total deadline | delegated-terminal and phase runner | Add total vs iteration timeout fields | Hard timeouts can kill valid long builds |
| Evolution loop | Evaluation feeds next-generation Seed | failure-analyzer, workflow-self-improver | Use only for harness improvement proposals | Auto-evolving product requirements is risky |
| Reflect/projector | Convert evaluation into next directive | session-logger, failure-analyzer | Add improvement proposal artifact | Do not auto-apply without verification |
| Ontology analysis | Domain ontology fields and evolution | glossary/project docs, product-orchestrator | Use as domain glossary enrichment | Full ontology convergence is too heavy |
| Ontology questions | Generate domain-specific clarifying questions | `codex-validate-plan`, assumption-ledger | Add question templates by missing dimension | Over-questioning slows practical implementation |
| Seed contract prompt | Prompt shape for strict contract generation | `SPRINT_CONTRACT` template/guideline | Extract contract-writing rubric | Do not paste foreign prompt wholesale |
| PM mode | PM document/interview/seed modules | `product-orchestrator`, `moonshot-plan-writer` | Add product-definition preflight | Must keep implementation path separate |
| Brownfield mode | Explore existing repo before Seed | `project-contract-gate`, project-md-refresh | Add brownfield readiness evidence | Exploration cannot replace direct code reading |
| Issue quality policy | Contribution issue quality rules | task-slicer, GitHub workflows | Reuse for issue export guidelines | Public OSS policy may not fit private project work |
| Findings registry | Registry for contributor findings | failure-analyzer, session-logger | Add durable findings format | Avoid logging every minor observation |
| Contract ledger RFC | Track contract changes | Harness Change Ledger, QA_REPORT | Add contract-change ledger fields | Ledger can become bureaucracy |
| Disposable memory RFC | Short-lived memory model | AWTL cache, memory promotion gate | Separate ephemeral recall from promoted memory | Do not mix with project MemoryGraph truth |
| User-level plugins | Plugin manifest/scopes | future plugin policy | Keep as deferred pilot | Premature plugin API expands support surface |
| Mesh RFC | Distributed/agent mesh ideas | phase-wave coordinator | Extract only coordination invariants | Multi-agent mesh is too broad for current harness |
| CLI commands | `ooo` command set | stable Moonshot entrypoints | Map concepts to existing commands | Adding many slash commands fragments UX |
| Command docs | Commands mirror skill contracts | skill docs and workflow README | Keep command/skill parity docs | Duplicated docs drift |
| Skill router | `ooo-skill-dispatch-router` guide | orchestrator dispatch policy | Add dispatch mapping table | Router should not become another public entrypoint |
| Help/tutorial | Guided onboarding | `workflow/README`, docs visuals | Add user workflow examples | Tutorial should not become runtime dependency |
| Status command | Session status and event query | phase status/report command | Add compact status summary format | Status must be freshness-checked |
| Cancel command | Cancel background job | phase-run lease cancellation | Add explicit cancel semantics | Cancel must clean leases and dispatch pointers |
| Unstuck command | Challenge assumptions when stuck | failure-analyzer, plan re-entry | Add unstuck route after repeated failure | Should not bypass deterministic failures |
| Publish command | Seed to GitHub issues | task-slicer, GitHub plugin | Optional issue export | Avoid forcing GitHub dependency |
| QA backends | Configurable QA providers | qa-flow, browser verifier | Add backend capability declaration | QA backend unavailability must be blocker/degraded evidence |
| MCP doctor | Diagnose MCP setup | preflight, runtime adapter checks | Add runtime doctor command/script | Doctor output must be actionable, not generic |
| MCP bridge | Bridge runtime tool inheritance | runtime adapter policy | Add inherited tools/capabilities checks | Tool inheritance differs across clients |
| Subagent bridge | Runtime-specific subagent bridge | forked review/verifier attempts | Add bridge contract fields | Subagent parity cannot be assumed |
| Agent roles | Seed architect, evaluator, QA judge, etc. | existing skills/agents | Map roles to stage owners | Do not import role sprawl |
| Consensus reviewer | Dedicated consensus role | codex-review-code/plan-eng-review | Use for exceptional high-risk reviews | Not a default review step |
| Contrarian | Assumption challenge role | plan-eng-review, failure-analyzer | Use in unstuck/replan paths | Contrarian without evidence becomes noise |
| Simplifier | Simplification role | code-simplifier | Already covered; add trigger refinement | Avoid stylistic refactors outside scope |
| Researcher | Research role | explorer/web docs as needed | Use for external-source tasks | Must cite and verify current sources |
| Code executor | Execution role | implementation-runner | Already covered by runner | Keep file ownership boundaries |
| QA judge | QA judgment role | completion-verifier, qa-flow | Strengthen UAT-ready distinction | Do not mark human UAT complete automatically |
| Seed closer | Finish interview into Seed | contract gate | Add contract close step | Should not close with unresolved blockers |
| Breadth keeper | Prevent narrow tunnel vision | plan-eng-review | Add coverage check for alternatives | Too much breadth delays execution |
| Advocate | Product/user value advocate | product-gate-reviewer | Add product-value check in plans | Should not overrule technical blockers |
| TUI dashboard | AC tree, lineage, logs, progress | moon-ai-workflow TUI, phase status visuals | Extract status model only | Full Rust TUI not useful in this repo |
| Lineage view | Show event/session lineage | AWTL traces, session monitor | Add lineage ids to runtime artifacts | Visual lineage without invariant checks is cosmetic |
| Logs view | Structured logs surface | workflow-enforcement logs | Add compact log index | Avoid dumping noisy logs into final reports |
| Dashboard metrics | Cost, drift, progress | scorecard/verdict | Add optional cost/drift fields | Cost may be unavailable per runtime |
| Auto progress events | Progress callback and phases | phase status updates | Add progress event names | Must avoid stale progress lines |
| Resume render | Render resume context | HANDOFF, current-run summary | Add resume brief generation | Brief must be evidence-backed |
| Initial context | Project initial context loading | project-md-refresh, context builder | Add context source inventory | Avoid assuming stale docs are current |
| Project paths | Resolve cwd/seed project path | preflight, execution cwd truth source | Strengthen cwd truth source checks | Wrong cwd is a recurring severe failure |
| Git workflow | Git helper logic | commit-moonshot, final closeout | Extract safe git preflight ideas | Do not alter commit policy silently |
| Version check | Update/version script | install/visibility diagnostics | Optional health check | Network-dependent checks should not block local work |
| Install/setup | Runtime setup automation | bootstrap docs | Extract setup diagnostics | Do not curl-install in harness runtime |
| Hooks | session-start and hook config | local hook policy | Consider hook inventory only | Hooks can create hidden behavior |
| Keyword detector | Detect command/intention keywords | orchestrator dispatch | Add robust intent mapping tests | Keyword-only routing misfires |
| Max-turn envelope | Bound autonomous runs | phase runner loop controls | Add turn/time/budget envelope fields | Too low budgets cause false blockers |
| Drift monitor script | Monitor contract drift | phase closeout/verdict | Add drift monitor as optional check | Must define ground truth first |
| TUI DB | Separate TUI DB state | moon-ai-workflow TUI | Use as reference for read models | Do not duplicate state sources |
| API docs | Public API documentation | workflow docs | Add internal API reference for harness scripts | Docs must track actual scripts |
| Runtime guides | Per-runtime docs | `.claude/docs/guidelines` | Add runtime-specific caveats | Docs can drift unless verifier checks anchors |
| Platform support | Runtime/platform matrix | verification contract/platform notes | Add Windows-specific behavior rows | Platform docs must not hide blockers |
| Config reference | Structured config docs | verification contract docs | Add local config reference | Avoid unsupported knobs |
| MCP API docs | Tool schema docs | future MCP wrapper | Keep as reference | Not needed until local MCP exists |
| Evolution guide | Loop semantics | recursive improvement docs | Extract stop/continue semantics | Do not imply infinite autonomy |
| Execution-vs-evaluation guide | TaskResult vs ACResult distinction | `WORKSETS`, `QA_REPORT` | Adopt explicitly | Requires schema changes |
| Agent lifecycle guide | Runtime lifecycle model | phase-run lease lifecycle | Extract lifecycle state machine | Must align with existing lease fields |
| QA backend guide | Testing backend abstraction | browser verifier/qa-flow | Add backend availability matrix | Avoid weak fallback passing |
| OpenCode/Codex guides | Runtime setup details | runtime adapter docs | Pull only Codex-relevant gaps | External runtime docs drift fast |

## Adoption Effects by Area

| Area | Expected effect if adopted | Observable success signal |
|---|---|---|
| Requirement intake | Reduces rework caused by vague user goals before phase execution starts. | Fewer phase retries caused by missing scope, hidden constraints, or undefined success criteria. |
| Requirement scoring | Converts "unclear" into a reviewable contract field instead of a subjective judgment. | Phase prep records clarity dimensions and blocks or constrains execution when ambiguity is high. |
| Immutable spec | Gives review, execution, and verification one stable ground truth. | QA reports and verifier verdicts reference a contract snapshot id instead of relying on chat history. |
| Brownfield context | Prevents agents from ignoring existing architecture, dependencies, and local conventions. | Contracts record existing patterns and affected project boundaries before code changes begin. |
| Acceptance model | Moves progress tracking from task completion to requirement satisfaction. | Completed worksets can be traced to AC/REQ/SCN evidence without manual interpretation. |
| Atomicity | Keeps work units small enough for reliable implementation and verification. | Phase plans split broad work before execution, and retry scope is limited to a failing child item. |
| Mechanical evaluation | Stops expensive or subjective review when deterministic checks already fail. | Lint/build/test failures short-circuit semantic review and produce direct retry instructions. |
| Semantic evaluation | Catches cases where tests pass but the implementation misses the intended behavior. | High-risk changes receive AC compliance, goal alignment, drift, and uncertainty fields. |
| Consensus evaluation | Adds a higher-cost tie-breaker only when contract interpretation is risky. | Consensus appears only on drift, security, architecture, or repeated-failure triggers. |
| Drift measurement | Makes scope creep and goal reinterpretation visible before closeout. | QA reports show `goalDrift` or `scopeDrift` and route to review when thresholds are exceeded. |
| Event sourcing | Improves replay, audit, and postmortem analysis without trusting mutable status alone. | Runtime incidents can be reconstructed from append-only events and compared with read models. |
| Event schema | Makes event consumers safer across future harness changes. | Event readers reject unsupported versions explicitly instead of silently misparsing payloads. |
| Control plane | Separates directive decisions from ad hoc status strings. | Dispatch, cancel, pause, retry, and complete decisions share typed directive fields. |
| IO journaling | Preserves enough execution context for resume and failure analysis. | Handoff and postmortem can cite compact IO summaries without replaying raw transcripts. |
| MCP-first tools | Turns prompt instructions into schema-backed execution contracts where tool support exists. | Tool-backed paths return job ids, session ids, status, and typed errors instead of prose-only results. |
| Deferred tools | Avoids false fallback when a runtime hides tools until discovery. | Skills search/load tools before declaring MCP or plugin functionality unavailable. |
| Auto pipeline | Gives vague goal-to-contract flows a controlled path before phase execution. | "Build X" requests can produce a contract snapshot before implementation starts. |
| Resume pipeline | Makes interrupted runs recoverable with less manual reconstruction. | Resume uses a session id, latest contract snapshot, and current verdict instead of stale chat context. |
| Seed review | Catches weak contracts before they become expensive implementation loops. | Contract review fails on missing AC, unverifiable outcomes, or unresolved blockers. |
| Provenance | Explains where a contract came from and how it changed. | QA/HANDOFF reports show whether a contract was user-authored, generated, repaired, or superseded. |
| Safe defaults | Keeps automation moving while making assumptions explicit. | Defaults are promoted to assumption ledger entries, not silently embedded in implementation. |
| Blocker attribution | Distinguishes product blockers from runtime/environment/tooling blockers. | Verdicts identify whether failure came from requirements, implementation, environment, provider, or verification setup. |
| Runtime adapters | Reduces runtime-specific surprises across Claude, Codex, and other agents. | The same phase contract records runtime capabilities and degradation paths. |
| Runtime capability matrix | Makes unsupported features explicit before execution. | Preflight can explain missing fork, MCP, browser, shell, or worktree capability. |
| Permission policy | Aligns action safety with runtime-specific permission models. | Workflow evidence records permission posture and any degraded approval/fallback mode. |
| Worktree support | Enables safer parallel work without concurrent writes to shared state. | Parallel phases use isolated worktrees and serialized status updates. |
| File lock | Prevents race conditions in status, lease, and dispatch files. | Concurrent runners cannot corrupt active-run leases or phase status. |
| Retry utility | Normalizes retry behavior and avoids one-off retry loops. | Retry attempts share backoff, max attempts, failure class, and final stop reason. |
| Security utilities | Reduces risk from repo-declared commands, paths, and generated config. | Untrusted command overrides are allowlisted and path traversal is rejected. |
| Mechanical overrides | Lets projects customize verification without editing shared harness code. | Project-local verification overrides are visible, parsed, and cannot silently weaken strict checks. |
| Command allowlist | Prevents arbitrary executable invocation from configuration. | Unknown commands are blocked or require explicit trusted configuration. |
| Artifact collector | Makes evaluation inputs explicit and reproducible. | Verifier reports list changed files, logs, screenshots, and generated outputs used for judgment. |
| Verification artifacts | Gives downstream tools stable evidence objects to parse. | Runtime verdicts and QA reports reference typed evidence records instead of free-form notes. |
| Checklist evaluation | Helps track AC coverage across multi-part requirements. | Scorecards show which ACs passed, failed, or remain unverified. |
| Execution vs evaluation split | Prevents "worker finished" from being mistaken for "requirement satisfied." | `taskStatus=completed` can coexist with `acVerdict=failed` or `unknown`. |
| Stagnation detection | Stops repeated non-progress earlier and with a named failure mode. | Runs classify spinning, oscillation, no-drift, or diminishing-return loops before exhausting budget. |
| Ralph loop | Creates a bounded improve-and-verify loop for recoverable failures. | Retry loops produce per-iteration evidence and stop cleanly on success, exhaustion, or stagnation. |
| Ralph stop reasons | Improves postmortem accuracy by separating raw runtime exits from final normalized outcomes. | Reports preserve `rawStopReason`, `recoveryAction`, and `normalizedRunVerdict` separately. |
| Per-iteration timeout | Prevents one step from consuming the whole automation budget. | Total deadline and per-step deadline are recorded independently. |
| Evolution loop | Turns verified failures into future harness improvements. | Failure analysis produces proposed harness changes instead of ad hoc prompt tweaks. |
| Reflect/projector | Converts evaluation findings into explicit next actions. | Reports route to retry, replan, contract change, handoff, or clean finish with reasons. |
| Ontology analysis | Improves domain-language consistency in product and brownfield work. | Contracts and docs use canonical domain terms and record ambiguous aliases. |
| Ontology questions | Asks better targeted clarification questions. | Questions map to missing goal, constraint, AC, or context dimensions. |
| Seed contract prompt | Improves contract authoring quality without changing runtime architecture. | Generated contracts consistently include objective, constraints, ACs, verification, and exit conditions. |
| PM mode | Strengthens product-definition work before implementation. | Product requests produce PRD/SPEC/contract artifacts before code execution when needed. |
| Brownfield mode | Forces repository reality into planning. | Phase prep records current architecture, dependencies, and repo-native verification commands. |
| Issue quality policy | Produces better exported issues and task slices. | GitHub issues contain behavior, repro, AC, dependencies, and AFK/HITL classification. |
| Findings registry | Keeps repeated findings discoverable without polluting memory. | Durable findings are searchable and linked to evidence or affected contracts. |
| Contract ledger RFC | Makes contract changes auditable. | Scope or AC changes appear in a contract-change ledger before execution continues. |
| Disposable memory RFC | Separates temporary recall from promoted project knowledge. | Ephemeral run context expires unless explicitly promoted through a gate. |
| User-level plugins | Provides a future extension boundary for third-party workflows. | Plugin candidates have manifest, scope, trust, and audit requirements before installation. |
| Mesh RFC | Informs safer multi-agent coordination design. | Phase waves declare ownership, dependencies, merge rules, and state-write authority. |
| CLI commands | Gives users memorable handles for repeated workflows. | Any new command maps to an existing stable entrypoint and does not duplicate policy. |
| Command docs | Reduces drift between command surface and skill behavior. | Command docs and skill docs share the same inputs, outputs, and blocking conditions. |
| Skill router | Makes dispatch decisions inspectable. | Orchestrator can explain why a request went to product, phase, bounded, verify, or failure path. |
| Help/tutorial | Improves onboarding and reduces operator mistakes. | Users can follow a short workflow example without reading internal scripts. |
| Status command | Gives fast, freshness-checked run visibility. | Status output shows active phase, latest verdict, stale pointers, blockers, and next action. |
| Cancel command | Provides safe interruption semantics for long-running work. | Cancel closes leases, marks dispatch state, and records resumability. |
| Unstuck command | Provides a controlled replan path when retries stop helping. | Repeated failures trigger assumption review instead of another blind implementation attempt. |
| Publish command | Converts contracts into external planning artifacts when needed. | Exported issues preserve ACs and verification expectations. |
| QA backends | Makes test capability and gaps explicit per environment. | Browser/visual/a11y/perf evidence is required only when the backend is declared available or required. |
| MCP doctor | Reduces time lost to broken tool registration or runtime setup. | Preflight can identify missing MCP server, stale config, path issue, or unavailable tool. |
| MCP bridge | Improves runtime tool inheritance and remote tool execution. | Delegated runs know which tools are inherited, missing, or degraded. |
| Subagent bridge | Makes forked review/verifier semantics portable. | Review and verification attempts record isolation mode and fallback when fork semantics are unavailable. |
| Agent roles | Clarifies responsibility boundaries without expanding user-facing commands. | Existing stage owners can map to evaluator, QA judge, simplifier, researcher, or executor roles. |
| Consensus reviewer | Adds stronger review for rare high-risk decisions. | Consensus appears as an explicit exception with trigger reason and decision outcome. |
| Contrarian | Challenges assumptions at the right time. | Replan/unstuck reports include assumption challenges tied to evidence. |
| Simplifier | Reduces post-implementation complexity. | Non-trivial changes get a simplification pass or a recorded skip reason. |
| Researcher | Improves external-reference handling. | Research tasks cite primary/current sources and separate source facts from inference. |
| Code executor | Keeps implementation ownership clear. | Execution reports list files owned, changed, and verified by the implementation owner. |
| QA judge | Separates automated readiness from human acceptance. | Reports distinguish `uat_ready` from `uat_complete`. |
| Seed closer | Stops contract creation from ending with unresolved blockers. | Contract closeout requires AC, constraints, assumptions, and verification plan to be complete enough. |
| Breadth keeper | Prevents premature narrowing on architecture-heavy work. | Plans record considered alternatives or a justified single-path decision. |
| Advocate | Keeps product value visible during technical planning. | Product gate checks user value, non-goals, and business constraints before execution. |
| TUI dashboard | Improves operator visibility for long-running work. | TUI/status surfaces show AC progress, events, blockers, and latest evidence. |
| Lineage view | Helps explain how a run reached its final state. | Session, contract, phase, event, and verdict ids can be navigated together. |
| Logs view | Reduces raw-log overload. | Operators can inspect indexed log summaries before opening raw files. |
| Dashboard metrics | Adds operational signals for cost and progress. | Scorecards show cost, drift, progress, retry count, and evidence depth when available. |
| Auto progress events | Improves live feedback during long runs. | Progress lines are event-backed and cannot remain stale after closeout. |
| Resume render | Makes handoff more reliable. | Resume briefs contain latest state, blockers, next action, and evidence references. |
| Initial context | Reduces bad starts from missing project knowledge. | Context builder records which docs, contracts, and code surfaces were loaded. |
| Project paths | Prevents wrong-directory execution. | Preflight records execution cwd, project root, git root, and target paths. |
| Git workflow | Makes closeout safer and repeatable. | Git preflight catches dirty scope, safe.directory, ignored evidence, and staged-file mistakes. |
| Version check | Helps diagnose stale local installations. | Health check reports tool/runtime versions without blocking offline work. |
| Install/setup | Improves bootstrap reliability. | Setup docs and diagnostics identify missing dependencies and platform caveats. |
| Hooks | Captures important lifecycle moments automatically. | Session start or compaction hooks record minimal state without hidden side effects. |
| Keyword detector | Improves natural-language routing. | Dispatch tests cover common user phrases for execute, continue, verify, cancel, and status. |
| Max-turn envelope | Bounds autonomous work and makes budget exhaustion explicit. | Runs stop with `budget_exhausted` instead of silently drifting or looping. |
| Drift monitor script | Watches contract/runtime divergence over time. | Monitor reports contract, status, verdict, and artifact drift as separate findings. |
| TUI DB | Gives UI a read-optimized state surface. | TUI reads from a dedicated model while verifiers still check canonical artifacts. |
| API docs | Improves maintainability for harness scripts and adapters. | Internal script APIs have documented inputs, outputs, and error classes. |
| Runtime guides | Reduces runtime-specific troubleshooting time. | Runtime docs state supported features, known gaps, and verification commands. |
| Platform support | Makes Windows/macOS/Linux differences explicit. | Platform-specific blockers are classified instead of misreported as product failures. |
| Config reference | Prevents unsupported or dangerous configuration drift. | Operators know which knobs are supported, local-only, strict, or deprecated. |
| MCP API docs | Prepares for future tool-backed local harness execution. | MCP wrapper design has schema docs before implementation starts. |
| Evolution guide | Defines when improvement loops continue or stop. | Recursive improvement work has explicit stop, retry, and promotion rules. |
| Execution-vs-evaluation guide | Aligns terminology across runner, QA, and verifier. | Teams stop using "done" ambiguously across task execution and AC satisfaction. |
| Agent lifecycle guide | Stabilizes phase-run lease and session transitions. | Lifecycle states have allowed transitions and cleanup rules. |
| QA backend guide | Prevents weak fallback evidence from being treated as full QA. | Missing QA backend is recorded as blocker/degraded evidence, not clean pass. |
| OpenCode/Codex guides | Captures runtime-specific operational gaps. | Codex-relevant caveats are available without importing unrelated runtime policy. |

## Candidate Local Contract Additions

These fields are worth adding to local contracts or schemas when implementation begins.

```yaml
goalContract:
  goalId: ""
  objective: ""
  scope: []
  nonGoals: []
  constraints: []
  acceptanceCriteria: []
  exitConditions: []
  brownfieldContext:
    projectType: "brownfield"
    existingPatterns: []
    existingDependencies: []
    contextReferences: []
  ambiguity:
    score: null
    threshold: 0.2
    dimensions:
      goalClarity: null
      constraintClarity: null
      successCriteriaClarity: null
      contextClarity: null
    unresolvedQuestions: []
    assumptions: []
```

```yaml
worksets:
  - id: "AT-01"
    acceptanceCriterionId: "AC-001"
    parentAcceptanceCriterionId: null
    title: ""
    taskStatus: "pending"
    acVerdict: "unknown"
    ownedPaths: []
    verificationCommands: []
    evidence: []
    semanticEvaluation:
      required: false
      acCompliance: null
      goalAlignment: null
      driftScore: null
      uncertainty: null
```

```yaml
workflowEvidence:
  contractSnapshotId: ""
  contractVersion: 1
  goalDrift: null
  scopeDrift: null
  blockerAttribution:
    class: null
    source: null
    recoveredBy: null
  eventLedger:
    path: ""
    latestEventVersion: 1
```

## Candidate Verifier Additions

These are the concrete verifier checks that would turn the inventory into enforceable behavior.

| Verifier check | Meaning |
|---|---|
| `goal-contract-present` | Non-trivial phase work has a goal/seed-lite contract |
| `ambiguity-gate-resolved` | Ambiguity is below threshold or blockers/assumptions are explicit |
| `ac-workset-linked` | Every workset maps to an AC or records why it is operational-only |
| `task-status-ac-verdict-split` | Task completion cannot imply AC pass automatically |
| `contract-snapshot-fresh` | QA report/verdict refers to the active contract snapshot |
| `drift-reviewed-when-triggered` | Drift or scope changes trigger semantic/evaluator review |
| `event-ledger-versioned` | Durable event entries include event version and source |
| `resume-brief-fresh` | Resume/handoff brief matches latest run ids and verdict ids |
| `raw-stop-vs-recovered-verdict-split` | Raw runtime failure and recovered success remain separate |
| `mechanical-skip-explicit` | Skipped mechanical checks are explicit warnings, not silent pass |

## Direct Rejections

These should not be adopted as-is.

| Pattern | Reason |
|---|---|
| Full Ouroboros Python runtime | Local harness is Node/bash/Codex/Claude policy oriented |
| Full ontology convergence loop | Too heavy for implementation throughput |
| Multi-model consensus by default | Expensive and not deterministic enough |
| MCP-only execution | Local fallback and delegated terminal are necessary in this environment |
| New `ooo` command surface | Would fragment stable Moonshot entrypoints |
| Full Rust TUI | Belongs to `moon-ai-workflow` style product surface, not this shared config repo |
| Silent mechanical skip-as-pass | Conflicts with strict evidence policy |
| Automatic requirement evolution | Product scope changes need explicit contract update |

## Implementation Packaging Options

When this inventory is converted to implementation work, use one of these package shapes.

| Package | Scope |
|---|---|
| Contract package | `GOAL_CONTRACT` schema, template, phase prep generation |
| Workset package | AC-linked `WORKSETS.yaml`, parser, closeout enforcement |
| Evaluation package | mechanical/semantic/consensus trigger fields, verifier wiring |
| Event package | versioned event ledger and read-model reconciliation |
| Runtime package | capability matrix, MCP/deferred-tool policy, resume/cancel semantics |
| Resilience package | stagnation classifier, stop reason taxonomy, retry budget |
| UI/status package | compact status, lineage id, progress freshness, TUI read model |
| Documentation package | external-pattern transfer guide update and runtime guide anchors |

## Source Surfaces Reviewed

- `src/ouroboros/core/seed.py`
- `src/ouroboros/core/ac_tree.py`
- `src/ouroboros/bigbang/ambiguity.py`
- `src/ouroboros/auto/*`
- `src/ouroboros/evaluation/*`
- `src/ouroboros/persistence/event_store.py`
- `src/ouroboros/core/control_contract.py`
- `src/ouroboros/resilience/stagnation.py`
- `src/ouroboros/ralph_loop.py`
- `src/ouroboros/mcp/tools/*`
- `src/ouroboros/orchestrator/*`
- `src/ouroboros/providers/*`
- `docs/guides/*`
- `docs/rfc/*`
- `skills/*`
- `commands/*`
- `crates/ouroboros-tui/*`
