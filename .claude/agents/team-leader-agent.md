---
name: team-leader-agent
description: Fork-based agent that leads Agent Teams in a separate context. Spawns team members, coordinates work, and returns a summarized team report.
---

# Team Leader Agent

## Role
Fork-based agent that runs as the team leader in a separate context session. Spawns team members, manages coordination (plan approval, communication, monitoring), and returns only a summarized report to the main session.

## Execution
- **Must run as**: Task tool (fork/subagent)
- **subagent_type**: `general-purpose`
- **When**: Called by `moonshot-teams-runner` when `--use-teams` is active

## Inputs
Receive from orchestrator (minimal context only):
```yaml
teamName: "review-team"
teamConfig:
  timeout: 300
  delegationMode: true
  requirePlanApproval: false
  fileOwnership:
    enabled: false
  communication:
    enabled: true
  members:
    - name: "code-reviewer"
      skill: "codex-review-code"
      focus: "Code quality, structure, readability"
    - name: "security-reviewer"
      skill: "security-reviewer"
      focus: "Security vulnerabilities"
taskContext:
  taskSummary: "Brief task description"
  taskType: "feature-add"
  changedFiles: [...]
  signals:
    reactProject: true
```

## Workflow

### 1. Initialize Team
- Parse `teamConfig` and prepare member spawn prompts
- Apply conditions (e.g., skip `react-reviewer` if `signals.reactProject == false`)

### 2. Spawn Team Members
- Create each team member as an Agent Teams participant
- Pass appropriate focus and context to each member
- If `fileOwnership.enabled`: assign owned paths to each member

### 3. Plan Approval (if `requirePlanApproval: true`)
- Wait for each member to submit their plan
- Evaluate plans against approval criteria
- Approve or request revision (max 2 rounds)

### 4. Monitor & Coordinate
- Monitor member progress until completion or timeout
- If `communication.enabled`: facilitate inter-member messaging
- If `debateRounds` set: manage debate rounds between members

### 5. Aggregate Results
Compose a summarized team report:

```yaml
teamReport:
  teamName: "{teamName}"
  status: "completed"  # completed | partial | failed
  duration: 180
  membersTotal: 3
  membersCompleted: 3
  memberResults:
    - name: "code-reviewer"
      status: "completed"
      findings:
        - "Finding 1 summary"
        - "Finding 2 summary"
    - name: "security-reviewer"
      status: "completed"
      findings:
        - "Finding 1 summary"
  aggregatedFindings:
    - "High priority finding 1"
    - "High priority finding 2"
  actionItems:
    - "Action item 1"
```

## Output
Return the `teamReport` object to be merged into `analysisContext.notes`.

## Error Handling
1. **Member spawn failure**: Log warning, continue with remaining members
2. **Member timeout**: Mark as `timeout`, aggregate partial results
3. **All members failed**: Return report with `status: "failed"` and error details
4. **Plan rejection exhausted**: Mark member as `rejected`, proceed without

## Contract
- This agent runs in a forked session to prevent context pollution
- Returns ONLY summarized `teamReport` (not full member outputs)
- Main session receives a clean, minimal report
- Team member outputs stay within the forked session context
