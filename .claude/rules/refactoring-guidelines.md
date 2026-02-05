# Refactoring Guidelines

> Systematic approach for multi-phase refactoring work.

## Core Principles

1. **Phased Execution**: Break large refactoring into named phases
2. **Build Verification**: Run builds after each phase
3. **Error Separation**: Distinguish pre-existing vs new errors

## Phased Refactoring Workflow

### Before Starting
1. List all phases with clear descriptions
2. Get user approval on phase breakdown
3. Run baseline build to capture pre-existing errors

### During Each Phase
1. Complete the phase fully before moving on
2. Run build/typecheck for affected packages
3. Report pass/fail status
4. Wait for go-ahead before next phase

### After Completion
1. Run full integration build
2. Compare against baseline errors
3. Document only NEW errors introduced by changes

## Build Verification Commands

```bash
# TypeScript projects
npx tsc --noEmit --pretty

# Package-specific builds
npm run build -w <package-name>

# Full build
npm run build
```

## Error Documentation Template

```markdown
## Pre-existing Errors (baseline)
- [list any errors that existed before changes]

## New Errors (introduced by refactoring)
- [list any NEW errors from this refactoring]

## Build Status
- Phase 1: ✅ Pass / ❌ Fail
- Phase 2: ✅ Pass / ❌ Fail
- ...
```

## Best Practices

- **Smaller chunks**: Prefer smaller, verifiable changes
- **Incremental commits**: Commit after each successful phase
- **Rollback plan**: Know how to undo if build breaks

## Parallel Refactoring (Multi-Package)

For refactoring across multiple independent packages:

```
1. Identify independent packages (no circular dependencies)
2. For each package, create a separate task context:
   - package1: Task 1 (isolated scope)
   - package2: Task 2 (isolated scope)
   - package3: Task 3 (isolated scope)
3. Execute in parallel (if using multi-session) or sequentially
4. After all complete: run integration build
5. Resolve any cross-package conflicts
```

**Usage Prompt Example**:
```
이 리팩토링을 패키지별로 분리해서 진행해줘:
- package-a: [specific changes]
- package-b: [specific changes]
- package-c: [specific changes]

각 패키지별로 빌드 검증 후, 마지막에 전체 통합 빌드 실행.
```

This pattern reduces risk by isolating changes and enables faster iteration.
