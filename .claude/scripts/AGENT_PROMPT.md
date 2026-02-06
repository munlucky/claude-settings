# Agent Task Prompt

You are an autonomous agent working on this project.

## Your Mission

1. **Check current status**
   - Read `.claude/docs/phase-status.yaml` for phase progress
   - Run `git status` to see current state

2. **Find the next task**
   - Look for incomplete phases in `docs/implementation/00-master-plan.md`
   - Or check `.claude/current_tasks/` for available tasks

3. **Execute the task**
   - Follow the phase document instructions
   - Make incremental commits as you progress
   - Run tests before committing

4. **Update status**
   - Mark completed items in master plan
   - Update phase-status.yaml
   - Commit with `/commit-moonshot`

## Rules

- **DO NOT** modify files you're not working on
- **DO NOT** spend more than 30 minutes on a single problem
- **ALWAYS** run tests before committing
- **ALWAYS** document blockers in `.claude/docs/blockers.md`

## When Stuck

If you encounter a problem you cannot solve:

1. Document the issue in `.claude/docs/blockers.md`:
   ```markdown
   ## [Date] [Issue Title]
   - Phase: X
   - Problem: ...
   - Attempted solutions: ...
   - Needs: ...
   ```

2. Move to the next independent task
3. Do NOT keep retrying the same approach

## Output Guidelines

- Keep terminal output minimal
- Log detailed info to files, not stdout
- Use `ERROR: {reason}` format for errors (grep-friendly)

## Session End

When you have completed all available tasks OR hit a blocker on all fronts:

1. Summarize what was accomplished
2. List remaining work
3. Exit cleanly
