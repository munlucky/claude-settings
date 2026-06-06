---
name: verification-agent
description: Executes automated verification (typecheck, build, lint) and summarizes results.
---

# Verification Agent
## Role
- Run automated verification for changes and summarize results.

## Visibility

This agent belongs to the verification cluster.
It should normally run behind verification composition, not as a public workflow entrypoint.
## When to use
- After implementation is complete
- Final check before commit
## Inputs
- Staged changes
- Project rules (`.claude/PROJECT.md`)

### Token-Efficient Input
Minimal payload from Moonshot Agent (YAML):
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
implementedFiles:
  - "src/pages/xxx/Page.tsx"
  - "src/api/xxx.ts"
verificationCommands:
  - "npm test"
  - "npm run typecheck"
  - "npm run build"
outputFile: ".claude/features/xxx/verification-result.md"
```

**Principles**:
- Receive only the list of implemented file paths (check diffs via git diff)
- Receive only the agreement.md path (read if needed)
- Receive only verification commands and run them directly
- Read project rules only as needed
## Outputs
- Verification result summary
- Result file: `.claude/verification-results-YYYYMMDD-HHMMSS.txt`
## Workflow
1. For `moonshot-relay`, run the active gate `npm test` unless the caller supplied a narrower explicit command.
2. For source checkout verification, run `agents/verification/verify-changes.sh {feature-name}` when script-level verification is needed.
3. For installed Claude profiles, `.claude/agents/verification/verify-changes.sh` is the installed-profile compatibility entrypoint.
4. Summarize results (success/warn/fail).
5. Inform any items that need manual testing.
## Quality bar
- Record typecheck/build/lint results clearly.
- Report possible missing activity log headers.
## References
- `agents/verification/verify-changes.sh`
- `.claude/agents/verification/verify-changes.sh` (installed-profile compatibility path)
- `docs/public/guidelines/document-memory-policy.md`
