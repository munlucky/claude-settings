# Testing Guidelines

## TDD Principles

1. **Define interfaces/types first**
2. **Write failing tests** (RED)
3. **Implement minimal code** (GREEN)
4. **Refactor** (REFACTOR)

## Coverage Requirements

- Minimum 80% coverage
- New code must include tests
- Bug fixes: write reproduction test first

## Skip Conditions (When to Exclude Testing)

Testing may be skipped when:
- **No test framework configured** (`jest.config`, `vitest.config`, etc. not found)
- **Prototype/POC projects** explicitly marked as such
- **Legacy codebase** without existing test infrastructure
- **Config/docs only changes** (no code logic changes)

> **Note**: When skipping tests, document the reason in commit message or PR description.

## Test Types

| Type | Target | Tools |
|------|--------|-------|
| Unit | Utilities, pure functions | Jest, Vitest |
| Integration | API endpoints | Supertest |
| E2E | Critical user flows | Playwright, Cypress |

## Test Naming Convention

```typescript
// describe-it pattern
describe('UserService', () => {
  it('should return user by id', () => { })
  it('should throw error when user not found', () => { })
})
```

## Moonshot Workflow Integration

Testing integrates into moonshot-orchestrator workflow:

- **simple**: `implementation-runner` → `verify-changes.sh`
- **medium**: ... → `codex-review-code` (includes test verification)
- **complex**: ... → `codex-review-code` → `codex-test-integration` (full test verification)

### Auto-trigger Conditions

| Condition | Skill Executed |
|-----------|----------------|
| complexity == complex | codex-test-integration |
| API changes included | codex-test-integration |
| Coverage < 80% | Request additional tests |
