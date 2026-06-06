# Phase 01 - README Installer Runtime Docs v1

## Goal

Make user-facing install/runtime documentation match the current account-root contract: Node/npx account-root install is primary, `install-claude.sh` is macOS/Git Bash compatibility, memorygraph durable state is account-root project knowledge, and templates are resolved through shared runtime home.

## Owned Paths

- `README.md`
- `install-claude.ps1`
- `package/profile-templates/codex/.codex/README.md`
- `docs/public/installer-usage.md` only if README changes require a source-of-truth clarification
- `docs/public/repository-layout.md` only if README changes require repository-layout consistency
- `tests/active-contracts.test.mjs` only for drift guards that directly target these docs

## Read-Only Paths

- `%USERPROFILE%\.moonshot-relay/**`
- `%USERPROFILE%\.claude/**`
- `%USERPROFILE%\.codex/**`
- root `.claude/**` and `.codex/**` runtime profiles

## Required Changes

1. Replace `README.md` project-local memory wording with account-root project knowledge namespace wording. Project-local `.moonshot-relay/cache/memorygraph/**` may remain only as seed/cache input.
2. Replace `.claude/templates/...` canonical template references with `<MOONSHOT_RELAY_HOME>/templates/...` or root `templates/...` source references, depending on the sentence.
3. Reframe the quick install section so `npx -y github:munlucky/moonshot-relay install` or `node bin/moonshot-relay.mjs install --runtime all` is the primary cross-platform path.
4. Mark `curl ... install-claude.sh | bash` and `bash install-claude.sh --project` as macOS/Git Bash compatibility paths, not WSL/Linux guidance.
5. Replace direct copy into `/your-project/.claude/skills/` with supported source checkout, package materialization, or explicit project-local compatibility installer guidance.
6. Fix `install-claude.ps1 -Project` error text so it says macOS/Git Bash compatibility shell, not WSL.
7. Fix the Codex profile template README title and wording so it identifies Codex, not Claude.
8. Add a README/install drift contract table to `tests/active-contracts.test.mjs` with one assertion per stale pattern below.

## Drift Guard Matrix

| Issue | Stale Pattern To Reject | Required Replacement Class | Test Evidence |
|-------|-------------------------|----------------------------|---------------|
| R-01 | `프로젝트 로컬 메모리` with default `.moonshot-relay/memorygraph/` storage | account-root project knowledge namespace; project-local cache only as seed/cache | exact regex in `tests/active-contracts.test.mjs` |
| R-02 | template bullets resolving canonical paths to `.claude/templates/...` | `<MOONSHOT_RELAY_HOME>/templates/...` for installed runtime or `templates/...` for source | exact stale bullet regex |
| R-03 | `curl ... install-claude.sh | bash` presented as recommended one-line primary install | Node/npx primary install; shell installer explicitly macOS/Git Bash compatibility | heading/context assertion, not raw `install-claude.sh` ban |
| R-04 | `cp -r moonshot-relay/skills/... /your-project/.claude/skills/` | supported project compatibility installer or package materialization path | exact copy-command regex |
| R-05 | `Git Bash/WSL` in `install-claude.ps1` project-mode error | `macOS/Git Bash compatibility shell`, with WSL/Linux routed to Node installer | exact string ban |
| R-06 | Codex profile README title saying `.claude Development Profile` | `.codex Development Profile` or Codex profile wording | exact title assertion |

## Acceptance Criteria

- Exact stale-pattern scan returns no hits:
  - `프로젝트 로컬 메모리.*\\.moonshot-relay/memorygraph`
  - `제품 정의 템플릿: \\.claude/templates/`
  - `실행 브리지 템플릿: \\.claude/templates/`
  - `출력 템플릿: \\.claude/templates/`
  - headings or labels that present `curl ... install-claude.sh | bash` as the recommended primary install
  - `/your-project/.claude/skills`
  - `Git Bash/WSL`
  - `.claude Development Profile`
- README still documents `install-claude.sh` compatibility usage where appropriate.
- Public docs and README do not contradict each other on WSL/Linux support.
- Added/updated active contract tests fail on the stale strings above.
- R-03 is closed by a dedicated assertion that rejects `curl ... install-claude.sh | bash` when the surrounding heading or label says primary, recommended, or one-line install without compatibility qualification.
- Temp-home account-root installer dry-run proves command guidance without mutating the real account root.

## Verification Commands

```powershell
rg -n "프로젝트 로컬 메모리.*\\.moonshot-relay/memorygraph|제품 정의 템플릿: `?\\.claude/templates|실행 브리지 템플릿: `?\\.claude/templates|출력 템플릿: `?\\.claude/templates|/your-project/\\.claude/skills|Git Bash/WSL|\\.claude Development Profile" README.md install-claude.ps1 package/profile-templates/codex/.codex/README.md
node --test --test-name-pattern "README install guidance rejects stale runtime paths" tests/active-contracts.test.mjs
$tmp = Join-Path $env:TEMP ("moonshot-relay-plan-dryrun-" + [guid]::NewGuid())
$oldMoonshot = $env:MOONSHOT_RELAY_HOME
$oldUserProfile = $env:USERPROFILE
$oldHome = $env:HOME
try {
  New-Item -ItemType Directory -Force $tmp | Out-Null
  $env:MOONSHOT_RELAY_HOME = Join-Path $tmp ".moonshot-relay"
  $env:USERPROFILE = $tmp
  $env:HOME = $tmp
  node bin/moonshot-relay.mjs install --runtime all --dry-run --moonshot-home (Join-Path $tmp ".moonshot-relay") --claude-home (Join-Path $tmp ".claude") --codex-home (Join-Path $tmp ".codex")
} finally {
  $env:MOONSHOT_RELAY_HOME = $oldMoonshot
  $env:USERPROFILE = $oldUserProfile
  $env:HOME = $oldHome
}
```

## Non-Goals

- Do not install into account roots.
- Do not rewrite the whole README structure unless required to remove contradiction.
