---
name: moonshot-teams-runner
description: "Runs parallel Agent Teams for review, research, verification, and implementation workflows."
triggers:
  - "teams run"
  - "parallel team"
  - "팀 실행"
---

# Moonshot Teams Runner

## Role

Run independent workstreams in parallel teams using runtime-adaptive coordination.
Use Claude Code Agent Teams in Claude runtime, and preserve equivalent isolated coordination semantics in Codex runtime.

## Runtime Execution Modes

- `claude-code` mode:
  - Uses Claude Code Agent Teams with forked `team-leader-agent`
  - Requires Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- `codex` mode:
  - Prefer fresh forked `team-leader-agent` and isolated member attempts, especially for read-only review and verification work
  - Keep the current Codex session as coordinator only and merge back structured summaries
  - If a member cannot preserve isolation, degrade explicitly and record the degraded path in notes or workflow evidence
  - Does not require Claude Agent Teams flags or `mcp__codex__codex`

## Team Leader Agent Policy (Bias for Action)

Always include the following instructions when prompting `team-leader-agent`.

1. **Execute right after planning**: once a minimally viable plan exists, start implementation/verification immediately.
2. **Limit planning loops**: allow at most one plan rewrite; force execution from the second round.
3. **Handle blocking strictly**: ask the user only once for truly blocking issues; otherwise proceed with reasonable defaults.
4. **Make work units explicit**: each member assignment must include file scope, execution command, and verification command.
5. **Keep reviewer context clean**: review and verification assignments should use artifact-backed inputs, not full session history.

## Usage

```bash
# Run review team
/moonshot-teams-runner review-team

# Or let the orchestrator select by pattern first
/moonshot-teams-runner --pattern fanout-fanin

# Run research team
/moonshot-teams-runner research-team

# Run verification team
/moonshot-teams-runner verify-team

# Run planning validation team
/moonshot-teams-runner planning-team

# Run quality validation team
/moonshot-teams-runner quality-team

# Run PM analysis team
/moonshot-teams-runner analysis-team

# Run fix team
/moonshot-teams-runner fix-team

# Run parallel implementation team
/moonshot-teams-runner impl-team

# Run cross-layer team
/moonshot-teams-runner cross-layer-team

# Run debugging team
/moonshot-teams-runner debug-team

# List available teams
/moonshot-teams-runner --list
```

Pattern-first selection is preferred for orchestrated runs.
Direct team names remain available for manual override and debugging.

## Available Teams

### 1. review-team (parallel review)

Pattern: `fanout-fanin`

Run parallel code review:

```yaml
members:
  - code-reviewer: code quality and architecture review
  - security-reviewer: security risk review
  - react-reviewer: React/Next.js optimization (conditional)
timeout: 300s
delegationMode: true
communication: enabled
```

**When to use**: after implementation, during review.

### 2. research-team (parallel research)

Pattern: `fanout-fanin`

Run parallel analysis and research:

```yaml
members:
  - requirements-analyst: requirement analysis
  - context-builder: existing codebase analysis
timeout: 180s
delegationMode: true
communication: enabled
```

**When to use**: before implementing complex features.

### 3. verify-team (challenge-based verification)

Pattern: `producer-reviewer`

Verify implementation from multiple perspectives:

```yaml
members:
  - implementer: explain implementation
  - critic: challenge potential issues
  - resolver: synthesize and propose fixes
timeout: 240s
communication: enabled (debateRounds: 2)
```

**When to use**: after critical feature completion.

### 4. planning-team (plan validation)

Pattern: `fanout-fanin`

Run parallel validation during planning:

```yaml
members:
  - requirements-analyzer: extract and validate requirements
  - context-builder: analyze existing codebase
  - plan-validator: validate plan logic and dependencies
timeout: 240s
delegationMode: true
communication: enabled
```

**When to use**: after `/moonshot-plan-writer` or when planning validation is required in orchestrator planning phase.

### 5. quality-team (quality validation)

Pattern: `fanout-fanin`

Validate quality after implementation:

```yaml
members:
  - completion-verifier: test-based completion verification
  - memory-reviewer: project rule/spec compliance verification
  - build-checker: pre-detect build failures
timeout: 300s
delegationMode: true
communication: enabled
```

**When to use**: after tests finish.

### 6. analysis-team (PM analysis parallelization)

Pattern: `fanout-fanin`

Parallelize early orchestrator analysis:

```yaml
members:
  - classifier: classify task type
  - complexity-analyzer: evaluate complexity and workload
  - uncertainty-detector: detect uncertainties and derive questions
timeout: 180s
delegationMode: true
communication: enabled
```

**When to use**: orchestrator stages 2.1~2.3.

### 7. fix-team (issue remediation)

Pattern: `supervisor`

Resolve failures in parallel:

```yaml
members:
  - build-resolver: resolve build/compile errors
  - security-fixer: patch security issues
timeout: 300s
condition: buildFailed || securityConcern
delegationMode: true
communication: enabled
```

**When to use**: build failures or security concerns.

### 8. impl-team (parallel implementation) 🆕

Pattern: `hierarchical-delegation`

Implement new modules/features in parallel:

```yaml
members:
  - feature-dev-1: primary feature development
  - feature-dev-2: secondary feature development (when 5+ files)
  - test-writer: test implementation
timeout: 600s
requirePlanApproval: true  # implement after plan approval
delegationMode: true
fileOwnership: exclusive   # prevent file conflicts
communication: enabled
```

**When to use**: complex implementations requiring work split.

**Key points**:
- `requirePlanApproval`: members propose plans, leader approves, then implementation starts.
- `fileOwnership`: members own different files to avoid conflicts.

### 9. cross-layer-team (cross-layer) 🆕

Pattern: `hierarchical-delegation`

Parallel implementation across frontend/backend/test:

```yaml
members:
  - frontend-dev: UI components and pages
    ownedPaths: [src/components/, src/pages/, src/app/]
  - backend-dev: API and service logic
    ownedPaths: [src/api/, src/services/, server/]
  - test-dev: unit/integration tests
    ownedPaths: [tests/, **/*.test.ts]
timeout: 600s
requirePlanApproval: true
delegationMode: true
fileOwnership: exclusive
communication: enabled
```

**When to use**: full-stack feature implementation.

**Key points**:
- Each member owns files by layer.
- Members can coordinate API contracts directly.

### 10. debug-team (debugging) 🆕

Pattern: `producer-reviewer`

Investigate bugs with competing hypotheses:

```yaml
members:
  - investigator-1: investigate hypothesis A
  - investigator-2: investigate hypothesis B
  - investigator-3: investigate hypothesis C (for high+ complexity)
timeout: 300s
delegationMode: true
communication: enabled (debateRounds: 3)
```

**When to use**: bugs with unclear root cause.

**Key points**:
- Investigators challenge and rebut each other's hypotheses.
- Derive the most plausible root cause through structured debate.

## Key Features

### 🎯 Plan Approval (requirePlanApproval)

For complex tasks, members write plans before coding:

```
1. Members start in read-only planning mode.
2. Members request leader approval after drafting plans.
3. Leader approves or rejects based on criteria.
4. Implementation starts only after approval.
```

### 🎭 Delegation Mode (delegationMode)

Leader focuses on coordination instead of direct implementation:
- spawn/message/terminate members
- task management and assignment
- aggregate outcomes

### 💬 Member Communication (communication)

Direct messaging between members:
- `message`: send to a specific member
- `broadcast`: send to all members

### 📁 File Ownership (fileOwnership)

Prevent file conflicts in implementation teams:
- `exclusive`: each member edits only owned paths
- `ownedPaths`: per-member path ownership

## Workflow

```
/moonshot-teams-runner <team-name>
    │
    ├─ 1. Prepare Team Context
    │      ├─ Validate team configuration
    │      └─ Extract minimal context for team leader
    │
    ├─ 2. Execute Team Coordination
    │      ├─ Claude runtime: Task tool (fork) → team-leader-agent
    │      │   (Leader spawns members, coordinates, aggregates)
    │      └─ Codex runtime: native coordinator path in current session
    │          (same team config, same report schema)
    │
    └─ 3. Merge Results
           └─ Read teamReport from leader → merge into analysisContext.notes
```

## Leader/Coordinator Execution (Runtime-adaptive Pattern)

> **CRITICAL**: Keep main-session context clean in both runtimes.

Claude runtime follows the same fork pattern as `project-memory-agent`.
Codex runtime must emulate the same isolation contract (minimal input, summarized output only):

```yaml
# Main session sends minimal input:
teamInput:
  teamName: "{team-name}"
  teamConfig: { ... }      # from agent-teams-config.yaml
  taskContext:
    taskSummary: "..."     # brief summary
    taskType: "..."        # feature/bugfix/refactor
    changedFiles: [...]    # relevant files
    signals: { ... }       # needed signals only

# Forked leader returns summarized output:
teamReport:
  teamName: "{team-name}"
  status: "completed"      # completed | partial | failed
  duration: 180
  memberResults: [...]     # per-member findings summary
  aggregatedFindings: [...] # high priority items
  actionItems: [...]       # required actions
```

**Runtime mapping:**
- `claude-code`: `team-leader-agent` → `subagent_type: "general-purpose"` + prompt **(fork)**
- `codex`: execute an equivalent coordinator flow in-session and produce the same `teamReport` contract
- See: `.claude/agents/team-leader-agent.md`

## Output

Report generated after team execution:

```markdown
# Team Report: impl-team

## Summary
- Members: 3
- Duration: 180s
- Status: ✅ All completed

## Plan Approvals
- feature-dev-1: ✅ Approved
- feature-dev-2: ✅ Approved
- test-writer: ✅ Approved

## Findings

### feature-dev-1
- Implemented: UserProfile component
- Files: src/components/UserProfile.tsx
- ...

### feature-dev-2
- Implemented: ProfileSettings component
- Files: src/components/ProfileSettings.tsx
- ...

### test-writer
- Tests added: 12
- Coverage: 85%
- ...

## Aggregated Results
1. ...
2. ...
```

## Integration with Orchestrator

Automatically invoked by `moonshot-orchestrator`:

```yaml
# analysisContext.signals
useAgentTeams: true          # enabled by --use-teams

# analysisContext.decisions
skillChain:
  - ...                      # from moonshot-decide-sequence
  - team-leader-agent        # fork execution when team mode is enabled
notes:
  - "pattern=fanout-fanin, team=review-team, trigger=after:implementation-runner"
```

Team trigger guide (aligned with orchestrator schema):
1. `analysis-team`/`research-team`/`planning-team`: use in PM analysis stages (2.1~2.5).
2. `impl-team`/`cross-layer-team`: use for complex implementation stages.
3. `review-team`/`quality-team`/`verify-team`/`fix-team`: use after implementation or on failure events.

Pattern selection guide:
1. choose `fanout-fanin` for parallel analysis, review, and validation
2. choose `producer-reviewer` for adversarial verification and competing-hypothesis debugging
3. choose `supervisor` for recovery orchestration after failures
4. choose `hierarchical-delegation` for parallel implementation with clear ownership boundaries
5. if a concrete team is explicitly passed, treat that as a manual override and still record its inferred pattern

## Token Usage Warning

> [!CAUTION]
> Token profile depends on runtime.
> - `claude-code`: each member runs as a separate Claude instance.
>   - 2-member team: ~13,000 tokens (~29% of typical context budget)
>   - 3-member team: ~20,000 tokens
> - `codex`: runs in one Codex session, but parallel workstream summaries still increase context usage.
> - Recommended only for important/complex scenarios.

## Best Practices

1. **Provide enough context**: include concrete task details in member prompts.
2. **Right-size the workload**: too small causes overhead, too large increases waste.
3. **Avoid file conflicts**: split ownership so members edit different files.
4. **Start with analysis/review**: begin with non-coding team tasks when first adopting Agent Teams.

## Progress Status Output Rules

Output clear progress status during team execution.

### Team Initialization
```
🚀 Agent Teams Starting: {team-name}
═══════════════════════════════════════════════════════════════
  Members: {member-count}
  Timeout: {timeout}s
  Mode: {delegationMode ? 'Delegation' : 'Direct'}
═══════════════════════════════════════════════════════════════
```

### Member Progress Status
```
👥 Team Member Progress
├─ [feature-dev-1] 🔄 Implementing... (plan approved)
├─ [feature-dev-2] ⏳ Awaiting plan approval
├─ [test-writer]   ✅ Done (12 tests written)
└─ Overall: 33% (1/3)
```

### Status Icons
- ✅ Completed
- 🔄 Running
- ⏳ Pending
- 📝 Writing plan
- ✔️ Plan approved
- ❌ Failed
- ⏱️ Timeout

### Plan Approval Phase (when requirePlanApproval enabled)
```
📋 Plan Approval Status
├─ [feature-dev-1] ✔️ Approved ─ UserProfile impl
├─ [feature-dev-2] 📝 Under review ─ ProfileSettings impl
└─ [test-writer]   ⏳ Pending
```

### Team Completion
```
═══════════════════════════════════════════════════════════════
  ✅ {team-name} Complete
═══════════════════════════════════════════════════════════════
  Duration: {duration}s
  Success: {success-count} / Failed: {fail-count}
───────────────────────────────────────────────────────────────
```

## Limitations

- One team per session only
- No nested teams (members cannot spawn sub-teams)
- Claude runtime split panes may require `tmux` or `iTerm2`
- Claude runtime uses forked leader session; Codex runtime must still preserve the same `teamInput`/`teamReport` isolation contract

## References

- `/moonshot-orchestrator`: orchestrator integration
- `.claude/agents/team-leader-agent.md`: forked team-leader agent definition
- `.claude/templates/agent-teams-config.yaml`: team configuration template
- [Claude Code Agent Teams docs](https://code.claude.com/docs/ko/agent-teams) (Claude runtime)
