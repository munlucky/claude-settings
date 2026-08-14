# Moon Relay Kernel Codex App 수정 가이드

Last-Reviewed: 2026-07-22

## 목적

Codex Desktop을 Relay 또는 Kernel로 선택 실행할 때 다음 계약을 만족시킨다.

- Relay 모드: 기존 Relay 계정 루트와 공개 스킬을 그대로 사용한다.
- Kernel 모드: Kernel runtime/profile과 선택한 Kernel 프로젝트를 사용하고 공개 스킬은 `moon-relay-kernel` 하나만 노출한다.
- Windows와 macOS가 같은 판정 규칙과 evidence schema를 사용한다.
- 앱 데이터 경로, 요청한 track, 저장된 switcher 상태만으로 Kernel 성공을 선언하지 않는다.

이 가이드는 세션 저장소 공유를 다루지 않는다. 세션 공유는 별도 opt-in 계약이며 Kernel discovery 성공의 대체 증거가 아니다.

## 현재 결함

1. `catalog/kernel-skills.yaml`은 공개 스킬 `moon-relay-kernel` 하나를 선언하지만 Codex discovery 경로에 materialize하는 구현이 없다.
2. `package/kernel/profiles/codex/`에는 `AGENTS.override.md`, `.codex/config.toml`, `.codex/hooks.json`만 있고 공개 스킬 payload가 없다.
3. `scripts/kernel/profile-install.mjs`의 별도 skill projection은 Antigravity에만 존재한다.
4. 설계가 요구하는 account-root project/worktree track registry와 `.agents/skills` hydration이 switcher launch 경로에 연결되지 않았다.
5. switcher는 요청한 root로 프로세스를 시작한 직후 실제 app-server, workspace, skill discovery를 확인하지 않고 `effectiveTrack`을 commit한다.
6. Kernel runtime/package가 제거되었거나 부분 설치된 상태도 `kernel_not_installed`로 차단하지 않는다.

관측 결과는 다음처럼 해석한다.

| 관측 | 판정 |
|---|---|
| Kernel app-data + Kernel 공개 스킬 0개 | project hydration 또는 discovery 실패 |
| Kernel app-data + Relay 공개 스킬 | app-server/provider home 또는 workspace 전환 실패 |
| switcher state만 `kernel` | 요청 상태일 뿐, effective 증거 아님 |
| Kernel 공개 스킬 1개 + Relay 공개 스킬 0개 + effective-root proof | Kernel 후보 성공 |

## 목표 파일 배치

Kernel 프로젝트 또는 전용 worktree에는 다음 manifest-owned static surface가 있을 수 있다. Track binding 자체는 프로젝트에 쓰지 않고 계정 루트에 둔다.

```text
<kernel-project>/
├─ .moon-relay/
│  └─ kernel-profile-manifest.json       # legacy hydration 소유권/checksum
├─ .agents/
│  └─ skills/
│     └─ moon-relay-kernel/
│        └─ SKILL.md                     # 유일한 공개 Kernel skill
├─ .codex/
│  ├─ config.toml
│  └─ hooks.json
└─ AGENTS.override.md

<kernel-runtime-home>/state/track-scopes/
└─ <scope-key>.json                       # canonical root + Git worktree별 track binding
```

원본은 canonical source의 다음 경로에서 온다.

- `skills/moon-relay-kernel/**`
- `package/kernel/profiles/codex/**`
- `catalog/kernel-skills.yaml`

내부 `skills/kernel-*`는 runtime capability이며 `.agents/skills`에 직접 공개하지 않는다.

## 1. Kernel 프로젝트 Hydration 구현

### 구현 소유자

새 모듈 `scripts/kernel/project-hydrate.mjs`를 단일 소유자로 둔다. `profile-install.mjs`와 switcher가 각자 파일을 복사하지 말고 이 모듈을 호출한다.

권장 public API:

```js
hydrateKernelProject({
  projectRoot,
  sourceRoot,
  runtimeHome,
  dryRun,
})

inspectKernelProject({ projectRoot })
unhydrateKernelProject({ projectRoot })
```

### 처리 순서

1. `projectRoot`를 명시적으로 받고 현재 shell CWD를 암묵적 권한으로 사용하지 않는다.
2. canonical/final path, parent reparse/symlink, owner, write boundary를 검사한다.
3. account-root registry에서 현재 canonical root + Git common/worktree scope를 조회한다. 기존 repository `.moon-relay/track.yaml`이 `relay`이면 legacy compatibility boundary로 중단한다.
4. 기존 `.agents/skills/moon-relay-kernel`이 foreign/unmanaged이면 중단한다.
5. `catalog/kernel-skills.yaml`의 `public` 목록이 정확히 `moon-relay-kernel` 하나인지 검사한다.
6. 같은 volume의 임시 디렉터리에 profile과 public skill을 stage한다. Track registry는 account root에 atomic write한다.
7. checksum manifest를 먼저 준비하고 manifest-owned static 파일만 atomic replace한다.
8. hydration 후 파일 존재·checksum·account-root scope binding을 다시 검사한다.

### 소유권과 제거

- symlink/junction 대신 manifest-owned copy를 기본값으로 사용한다.
- uninstall은 manifest에 기록된 정적 파일만 제거한다.
- 사용자 파일, sessions, auth, SQLite, logs, caches는 읽거나 제거하지 않는다.
- 수정된 owned 파일이 발견되면 자동 덮어쓰기/제거를 중단하고 `target_collision`을 반환한다.

### 완료 조건

- `<project>/.agents/skills/moon-relay-kernel/SKILL.md`가 존재한다.
- `.agents/skills` 아래 공개 Kernel skill 디렉터리 수가 정확히 1이다.
- `<kernel-runtime-home>/state/track-scopes/<scope-key>.json`이 현재 project/worktree와 일치한다.
- `inspectKernelProject()`가 `ready`를 반환한다.
- Relay 프로젝트는 변경되지 않는다.

## 2. Codex 앱을 정확한 Kernel 프로젝트로 실행

`CODEX_HOME`과 `--user-data-dir`만으로는 project skill discovery를 보장할 수 없다. launch contract에 `workspaceRoot`를 추가하고 앱이 hydration된 Kernel project/worktree를 실제로 열었다는 증거를 요구한다.

### launch contract

```json
{
  "surface": "codex_desktop",
  "track": "kernel",
  "runtimeHome": "<kernel-runtime-home>",
  "providerHome": "<kernel-codex-home>",
  "appDataRoot": "<kernel-app-data>",
  "workspaceRoot": "<bound-kernel-project-worktree>",
  "expectedPublicSkills": ["moon-relay-kernel"]
}
```

### 공통 규칙

1. `launch --track kernel`에는 `--project-root <absolute-path>`를 필수로 한다.
2. launch 전에 account-root track scope와 `inspectKernelProject(projectRoot)`를 검사한다.
3. `buildLaunchSpec()`에 `cwd/workspaceRoot`를 포함한다. `sourceRoot`를 기록만 하고 실제 spawn CWD에서 누락하지 않는다.
4. 이미 같은 project/track 앱이 열려 있으면 기존 창을 활성화한다.
5. 다른 project/track 앱이 열려 있으면 승인된 graceful close와 quiescence 확인 후 실행한다.
6. 앱이 지원하는 workspace open mechanism이 불명확하면 실행 성공으로 commit하지 않고 `workspace_effective_unknown`을 반환한다.

### macOS

- app bundle executable을 직접 실행하더라도 `cwd`만으로 workspace 선택을 가정하지 않는다.
- 현재 버전이 지원하는 workspace open mechanism을 characterization test로 고정한다.
- 실제 열린 workspace가 `workspaceRoot`와 일치하는지 app/server evidence로 확인한다.

### Windows MSIX

- `shell:AppsFolder` 실행 성공이나 `--user-data-dir` process argument는 workspace/provider-home 성공 증거가 아니다.
- shell broker가 전달하지 못하는 환경과 workspace 정보는 별도 supported activation path가 증명되기 전까지 `unknown`으로 둔다.
- direct executable이 `EPERM`이면 우회 성공으로 간주하지 말고 resolver 결과에 원인을 보존한다.

### 완료 조건

- macOS와 Windows 모두 app receipt의 `workspaceRoot`가 hydration된 Kernel project와 일치한다.
- 열린 프로젝트의 account-root track scope가 `kernel`이고 canonical root/worktree proof와 일치한다.
- 다른 project나 기본 recent workspace가 열리면 Kernel commit을 거부한다.

## 3. Launch 전 Kernel 설치 완전성 검사

현재 `assertSafeTarget()`은 경로가 안전한지만 검사한다. 다음 별도 preflight를 추가한다.

```js
inspectKernelLaunchReadiness({
  runtimeHome,
  providerHome,
  projectRoot,
  appDataRoot,
})
```

### 필수 검사

#### Runtime package

- Kernel product manifest가 존재하고 product ID가 `moon-relay-kernel`이다.
- `bin/moon-relay-kernel.mjs`가 존재하고 manifest checksum과 일치한다.
- canonical `skills/moon-relay-kernel/SKILL.md`가 존재한다.
- `catalog/kernel-skills.yaml|json`이 public skill 하나를 선언한다.
- runtime resolver/managed Node 계약이 필요한 설치라면 해당 runtime manifest도 유효하다.

#### Codex provider profile

- profile marker와 trusted manifest가 존재한다.
- `AGENTS.override.md`, config, hooks가 manifest checksum과 일치한다.
- provider root가 Relay `~/.codex`와 같거나 중첩/alias되지 않는다.

#### Project hydration

- account-root track registry entry가 `kernel`이고 canonical root/Git worktree proof와 일치한다.
- legacy project hydration manifest를 사용하는 경우에만 그 manifest가 유효하다.
- 공개 skill은 `moon-relay-kernel` 하나다.
- Relay public skill 이름이 Kernel project `.agents/skills`에 없다.

#### App data

- track-specific path이며 Relay app-data와 동일/중첩/alias되지 않는다.
- unknown pre-existing directory이면 자동 채택하지 않는다.

### 상태 판정

| 조건 | 상태 | 동작 |
|---|---|---|
| runtime/entrypoint/public skill 누락 | `kernel_not_installed` | launch 금지 |
| provider manifest 누락/불일치 | `kernel_profile_not_ready` | launch 금지 |
| account-root project/worktree binding 또는 required skill 누락 | `kernel_project_not_bound` | launch 금지, account-root binding/hydration 안내 |
| Relay/Kernel root alias | `unsafe_target` | launch 금지 |
| 모든 정적 계약 통과 | `launch_candidate` | 앱 실행은 허용하되 아직 effective 아님 |

### 완료 조건

- 부분 설치 상태에서 switcher가 앱을 실행하지 않는다.
- shortcut이 남아 있어도 `kernel_not_installed`를 정확히 표시한다.
- 요청 상태와 설치 준비 상태를 혼합하지 않는다.

## 4. 실제 Discovery 증거 후에만 Kernel Commit

현재 구현처럼 spawn 직후 `effective_verified`로 진행하지 않는다. 상태 머신을 다음처럼 바꾼다.

```text
prepared
→ old_app_stopped
→ launch_requested
→ process_observed
→ provider_home_verified
→ workspace_verified
→ skill_discovery_verified
→ committed
```

### 필수 runtime evidence

1. 실행 중인 main app과 실제 `codex app-server` child identity
2. app-server의 effective `CODEX_HOME`
3. effective Kernel runtime home/track
4. 실제 열린 `workspaceRoot`
5. 발견된 공개 skill 이름 목록
6. `moon-relay-kernel` 존재
7. Relay 공개 skill 부재
8. account-root project/worktree binding과 app/server workspace의 일치

민감한 auth/session 내용은 증거로 읽거나 기록하지 않는다.

### 판정 규칙

| runtime 관측 | effective 상태 |
|---|---|
| Kernel skill 1개, Relay skill 0개, roots/workspace 일치 | `kernel` |
| Kernel skill 0개 | `skill_discovery_missing` |
| Relay skill이 하나라도 발견됨 | `shared_mutable_surface` |
| child environment 또는 workspace를 확인할 수 없음 | `unknown` |
| requested와 observed가 다름 | `effective_track_mismatch` |

`unknown`, `shared_mutable_surface`, `skill_discovery_missing`은 절대 `effectiveTrack=kernel`로 저장하지 않는다. `doctor`는 저장된 요청값이 아니라 현재 child/root/workspace/discovery evidence를 재검증한다.

### 완료 조건

- Kernel 앱의 skill selector에 `moon-relay-kernel` 하나만 나타난다.
- Windows에서 Relay 개인 스킬이 나타나면 실패한다.
- macOS에서 0개가 나타나면 실패한다.
- app-server 재시작 및 Relay → Kernel → Relay round trip 후에도 같은 판정이 재현된다.

## 구현 파일 맵

| 파일/영역 | 변경 책임 |
|---|---|
| `scripts/kernel/project-hydrate.mjs` | 명시적으로 호출된 legacy project marker/profile/public skill hydration과 manifest lifecycle |
| `scripts/kernel/installer.mjs` | public skill/runtime payload 포함 및 project hydration과의 책임 분리 |
| `scripts/kernel/profile-install.mjs` | provider profile만 소유; project skill을 암묵적으로 처리하지 않음 |
| `scripts/switcher/operations.mjs` | readiness → launch → live verification → commit 순서 강제 |
| `scripts/switcher/launch-adapter.mjs` | `workspaceRoot`, 실제 spawn CWD/activation contract 전달 |
| `scripts/switcher/providers/codex.mjs` | app-server home, workspace, discovered skills 검증 |
| `scripts/switcher/state-store.mjs` | requested/candidate/effective 분리 |
| `scripts/switcher/receipt.mjs` | 비민감 live evidence와 typed failure 기록 |
| `package/kernel/manifest.json` | public skill과 hydration support payload 포함 |
| `tests/**` | filesystem materialization, negative discovery, OS별 live probe 계약 |

## 필수 테스트

### RED 먼저 추가

1. Codex Kernel project hydration 결과에 `moon-relay-kernel`이 없으면 실패
2. 공개 skill이 0개 또는 2개 이상이면 실패
3. Relay skill이 Kernel project에 섞이면 실패
4. Kernel runtime/entrypoint/manifest 누락 시 `kernel_not_installed`
5. spawn 직후 child proof 없이 commit하면 실패
6. wrong workspace가 열리면 `workspace_effective_unknown|mismatch`
7. 실제 app-server home이 Relay이면 `shared_mutable_surface`

### Disposable matrix

| OS | Track | Expected public skills | Expected result |
|---|---|---|---|
| Windows | Relay | existing Relay set | Relay unchanged |
| Windows | Kernel | `moon-relay-kernel` only | Kernel verified |
| macOS | Relay | existing Relay set | Relay unchanged |
| macOS | Kernel | `moon-relay-kernel` only | Kernel verified |

### Live UAT

1. Relay 창에서 기존 Relay skill 목록을 기록한다.
2. 승인 후 앱을 종료하고 Kernel project로 실행한다.
3. app-server effective home/workspace를 기록한다.
4. skill selector에서 `moon-relay-kernel` 하나와 Relay skill 0개를 확인한다.
5. 새 Kernel task에서 active track canary를 확인한다.
6. Relay로 복귀하여 기존 Relay 목록과 account-root manifest non-mutation을 확인한다.

## 금지 사항

- Relay와 Kernel 전체 skill catalog를 전역 user skill root에 함께 설치하지 않는다.
- 요청한 track, app-data argument, switcher JSON만으로 성공을 선언하지 않는다.
- 기존 `.codex`, `.agents`, `.moon-relay`을 junction/pointer로 전환하지 않는다.
- auth/session/cookie/token/SQLite 내용을 복사·해시·백업·로그하지 않는다.
- 실행 중인 GUI를 승인 없이 강제 종료하지 않는다.
- source test pass를 live app discovery evidence 대신 사용하지 않는다.

## 구현 순서

1. 위 negative test를 RED로 추가한다.
2. project hydration과 manifest lifecycle을 구현한다.
3. Kernel runtime/package readiness 검사와 `kernel_not_installed` guard를 추가한다.
4. workspace-aware launcher contract를 구현한다.
5. app-server home/workspace/skill discovery verifier를 추가한다.
6. commit/doctor를 live evidence 기반으로 바꾼다.
7. disposable Windows/macOS matrix를 통과시킨다.
8. 각 OS에서 별도 승인으로 Relay → Kernel → Relay live UAT를 수행한다.
9. source/package/installed-profile parity와 rollback을 확인한 후에만 완료 처리한다.

## 최종 완료 기준

- Kernel 모드의 Codex Desktop에서 공개 skill은 `moon-relay-kernel` 정확히 1개다.
- Relay 공개 skill은 Kernel 모드에서 0개다.
- Relay 모드의 기존 skill과 account-root는 변경되지 않는다.
- macOS/Windows 모두 actual app-server, workspace, discovery evidence가 있다.
- 부분 설치, wrong workspace, child-root unknown은 fail closed한다.
- switcher `effectiveTrack`과 실제 runtime 관측이 일치한다.
