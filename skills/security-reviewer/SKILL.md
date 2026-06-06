---
name: security-reviewer
description: Reviews code for security vulnerabilities. Use when security concerns are detected or before deploying critical changes.
context: fork
---

# Security Reviewer Skill

## Visibility

This is a review sub-skill.
Prefer invoking it from review or verification composition, not as a primary workflow entrypoint.

## When to Use

- Security concerns detected during code review
- API key or credential exposure suspected
- Before deploying authentication/authorization changes
- When handling user input or external data

## Codex Rule References

Codex-native security review should explicitly apply:
- `.claude/rules/security.md`
- `.claude/rules/quality.md`
- `.claude/rules/communication.md`

## Procedure

1. Scan changed files for security patterns
2. Check against security checklist (`.claude/rules/security.md`)
3. Consume machine security status when available: CodeQL, dependency review, Dependabot, and secret scanning.
4. Record release-gate evidence with `scripts/verification-plane.mjs assess-security --run-id <runId> --goal-id <goalId> --scans-json <json> --json`.
5. Report findings with severity levels
6. Suggest fixes for each issue

## Release Gate Policy

- Missing CodeQL, dependency review, Dependabot, or secret scanning status is a blocker for release/accepted completion.
- Stale scan status is a blocker until refreshed.
- High or critical CodeQL findings, vulnerable dependency review findings, and secret scanning findings block release/accepted completion.
- An exception must include `approvalId`, `owner`, and `reason`; otherwise it is not an approved exception.
- Approved exceptions stay visible in the evidence and do not erase the finding.

## Security Checklist

### CRITICAL (Must Fix Before Merge)
- [ ] Hardcoded secrets (API keys, passwords, tokens)
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities (unescaped user input)
- [ ] Authentication bypass risks

### HIGH (Should Fix)
- [ ] Missing input validation
- [ ] Insecure dependencies (outdated packages)
- [ ] Path traversal risks
- [ ] CSRF vulnerabilities

### MEDIUM (Recommended)
- [ ] Missing rate limiting
- [ ] Verbose error messages leaking info
- [ ] Missing HTTPS enforcement
- [ ] Weak password policies

## Output Format

```markdown
## Security Review Results

### Summary
- Files scanned: N
- Critical: N | High: N | Medium: N

### Findings

#### [CRITICAL] Hardcoded API Key
- **File**: src/api/client.ts:42
- **Issue**: API key exposed in source code
- **Fix**: Move to environment variable

#### [HIGH] Missing Input Validation
- **File**: src/routes/user.ts:15
- **Issue**: User input passed directly to query
- **Fix**: Add Zod validation schema

### Verdict
❌ BLOCK / ⚠️ WARNING / ✅ PASS
```

## Auto-trigger Conditions

| Signal | Action |
|--------|--------|
| `*.env` file modified | Trigger review |
| Auth-related files changed | Trigger review |
| New dependency added | Check vulnerability |
| API endpoint added | Validate input handling |
