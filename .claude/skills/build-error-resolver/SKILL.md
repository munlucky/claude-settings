---
name: build-error-resolver
description: Resolves build and compilation errors. Use when build fails or type errors occur.
context: fork
surfaceStatus: internal_stage_owner
---

# Build Error Resolver Skill

## When to Use

- `npm run build` / `tsc` fails
- TypeScript compilation errors
- Lint errors blocking build
- Module resolution issues

## Procedure

1. Capture build error output
2. Categorize error type
3. Identify root-cause evidence before patching
4. Locate affected files and lines
5. Apply the smallest appropriate fix
6. Verify build passes

## Systematic Debugging Contract

- Do not patch based only on the first visible error if upstream evidence is missing.
- Record `failureClass`, root-cause evidence, and attempted fixes.
- If the same failure class repeats twice, change tactic before retry.
- If three attempts fail, stop local patching and escalate to design/contract review.

## Error Categories

### TypeScript Errors

| Error Code | Description | Common Fix |
|------------|-------------|------------|
| TS2304 | Cannot find name | Add import or declare type |
| TS2339 | Property does not exist | Add to interface or use optional chaining |
| TS2345 | Argument type mismatch | Cast or fix type definition |
| TS2322 | Type not assignable | Check type compatibility |
| TS7006 | Parameter implicit any | Add explicit type annotation |

### Module Errors

| Error | Common Fix |
|-------|------------|
| Cannot find module | Install package or fix path |
| Module not found | Check tsconfig paths |
| Circular dependency | Restructure imports |

### Lint Errors

| Category | Action |
|----------|--------|
| Formatting | Run `prettier --write` |
| Unused vars | Remove or prefix with `_` |
| Missing deps | Add to dependency array |

## Output Format

```markdown
## Build Error Resolution

### Error Summary
- Total errors: N
- Fixed: N
- Remaining: N

### Fixed Issues

1. **TS2339**: Property 'foo' does not exist
   - File: src/utils.ts:42
   - Fix: Added optional chaining `obj?.foo`

2. **TS2304**: Cannot find name 'UserType'
   - File: src/types.ts:15
   - Fix: Added import from '@/types'

### Verification
✅ `npm run build` passed
✅ `tsc --noEmit` passed
```

## Delegation Format (for Codex)

```
TASK: Resolve build errors in [project path].

EXPECTED OUTCOME: All build errors fixed, build passes.

CONTEXT:
- Error output: [paste error log]
- Build command: [npm run build / tsc]
- Files affected: [list]

MUST DO:
- Fix all TypeScript errors
- Preserve existing functionality
- Identify root cause before patching
- Run verification after each fix

MUST NOT DO:
- Add @ts-ignore unless absolutely necessary
- Change unrelated code
- Skip verification step
- Repeat the same failed tactic after the same failure class appears twice
```
