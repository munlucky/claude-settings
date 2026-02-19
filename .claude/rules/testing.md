# Testing Guidelines

## TDD Principles

1. **Define interfaces/types first**
2. **Write failing tests** (RED)
3. **Implement minimal code** (GREEN)
4. **Refactor** (REFACTOR)

## Test Environment Detection

> Before applying any testing rules, first detect if the project has a test environment.

### Detection Checklist

| Check | How |
|-------|-----|
| Config file | `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `pytest.ini`, etc. |
| Package.json | `scripts.test` exists and is not the default `echo "Error..."` |
| E2E script | `scripts["test:e2e:agent-browser"]` or `scripts["test:e2e"]` |
| Existing tests | `**/*.test.*`, `**/*.spec.*`, `__tests__/`, `tests/` |
| PROJECT.md | Testing Rules section has framework specified |

### When NOT Detected

```yaml
action:
  - Set signals.testEnvironmentDetected = false
  - Log: "⚠️ No test environment detected"
  - Skip test writing/running (but still do Self-Audit)
  - Note reason in commit message
```

> Do NOT fail or block implementation when test environment is absent.

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
| Integration | API endpoints, user flows | Supertest |
| E2E | Critical user flows | Agent Browser, Playwright, Cypress |

## E2E Workflow Recommendation

- Use `Agent Browser` for feature-flow/runtime validation (fast scenario checks).
- Keep deterministic regression gates in `Playwright` when strict reproducibility is required in CI.

## Acceptance Tests (완료 기준)

Define in context.md during planning:

### Naming Convention
- File: `{Component}.test.ts(x)` or `{feature}.integration.test.ts`
- Test ID: `T{N}` (for tracking in context.md)

### Minimum Coverage
| Type | Minimum Count |
|------|---------------|
| Unit (component) | 1 per feature |
| Unit (util/type) | 1 per function |
| Integration (API) | 1 per endpoint |

### Status Indicators
- 🔴 PENDING: Test not written
- 🔴 RED: Test written, FAIL
- 🟢 PASS: Test passed
- ⚪ SKIP: Skip Conditions apply (including no test env)

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

### Implementation Phase (`implementation-runner`)
- Detect test environment (Step 0)
- Write tests alongside code (Step 5, only when test env exists)

### Verification Phase (`completion-verifier`)
- Detect test environment (Step 0)
- Run acceptance tests (Step 1, only when test env exists)
- Self-Audit against requirements (Step 2, always runs)
- Retry loop: add unit test → fix → re-verify

### Chain Rules
- **simple**: `implementation-runner` → `verify-changes.sh`
- **medium**: ... → `completion-verifier` → `codex-review-code` → `efficiency-tracker`
- **complex**: ... → `completion-verifier` → `codex-review-code` → `efficiency-tracker` → `session-logger`

### Auto-trigger Conditions

| Condition | Action |
|-----------|--------|
| Test env detected + complexity ≥ medium | `completion-verifier` runs full test suite |
| Test env NOT detected | `completion-verifier` runs Self-Audit only |
| Coverage < 80% | Request additional tests |
| API changes included | Require integration tests |
