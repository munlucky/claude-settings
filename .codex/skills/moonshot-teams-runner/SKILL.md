---
name: moonshot-teams-runner
description: Runs parallel Agent Teams for review, research, verification, and implementation workflows.
triggers:
  - "agent team"
  - "teams runner"
  - "parallel agents"
deepReferences:
  - references/team-topologies.md
  - references/agent-review-loop.md
---

# Moonshot Teams Runner

## Role

Coordinate bounded parallel agent teams when the work can be split into independent roles or disjoint write scopes. The parent session remains the control plane and integrates results.

## Hard Stops

- Do not spawn agents unless the user requested delegation, sub-agents, or parallel agent work.
- Do not assign overlapping write scopes without an explicit integration plan.
- Do not let reviewer agents mutate canonical plan artifacts directly.
- Do not treat a sub-agent final message as verified completion without parent evidence collection.

## Team Modes

- Review team: independent critique of a plan, staged overlay, or implementation.
- Research team: read-only answers to distinct codebase questions.
- Worker team: disjoint implementation slices with explicit ownership.
- Verification team: sidecar checks that can run while parent continues non-overlapping work.

## Flow

1. State the parent-owned immediate task and the sidecar tasks.
2. Spawn only concrete, self-contained agents.
3. Keep each agent scoped to files, questions, or evidence outputs.
4. Continue non-overlapping parent work while agents run.
5. Integrate results, record accepted changes, and close agents when finished.

## Required Evidence

- Agent id, role, and assigned scope.
- Findings or changed files from each agent.
- Parent integration decision.
- Rerun checks when accepted findings change behavior or contracts.

## References

- `references/team-topologies.md`: safe team shapes and write-scope rules.
- `references/agent-review-loop.md`: independent review loop and closeout evidence.
