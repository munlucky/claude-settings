# 어드민 권한 타입 확장 작업 (MIGRATION_MANAGEMENT, BATCH_MANAGEMENT)

## 작업 일시
2025-12-19

## 작업 개요
- **목적**: 권한 타입/화면에 신규 메뉴 2개(`MIGRATION_MANAGEMENT`, `BATCH_MANAGEMENT`)를 추가하여 조회·부여·저장 가능하도록 정합성 확보
- **전제**: 백엔드도 동일한 `Menu` 키로 응답/수신, 카테고리는 "서비스 관리 > CS 관리"에 포함

## 변경 대상 파일
1. `src/app/_entities/admin/types.ts` - Menu 유니온 타입
2. `src/app/users/admins/list/[id]/permissions/_constants/permissionData.ts` - initialPermissions, MENU_MAPPING
3. `src/app/users/admins/logs/permission/page.tsx` - getMenuLabel 메뉴 라벨 매핑 (Codex 검증 결과)
4. `src/app/users/admins/list/[id]/permissions/page.tsx` - convertApiToScreenFormat (검토만, 수정 불필요)

## 현재 상태 분석

### 1. Menu 타입 (types.ts:7-23)
- 현재 18개 메뉴 정의됨
- `NOTICE_MANAGEMENT`, `REPORT_MANAGEMENT` 등 CS 관리 메뉴 포함

### 2. initialPermissions (permissionData.ts:118-132)
- "서비스 관리 / CS 관리" 블록:
  - 공지사항 관리: read/write/delete 모두 false
  - 신고 관리: read/write는 false, **delete는 null** (삭제 불가)

### 3. MENU_MAPPING (permissionData.ts:136-159)
- 18개 메뉴 모두 매핑
- `Record<Menu, { permissionId: string; featureName: string }>` 타입
- `NOTICE_MANAGEMENT`, `REPORT_MANAGEMENT`는 `service-cs` permissionId에 매핑

### 4. convertApiToScreenFormat (page.tsx:56-62)
- `ADMIN_LOG`, `NICKNAME_DICTIONARY`만 read-only 특수 처리 (write/delete를 null로 강제)
- 신규 메뉴는 read-only가 아니므로 수정 불필요

## 구현 계획

### 1단계: Menu 타입 확장
**파일**: `src/app/_entities/admin/types.ts`
- `Menu` 유니온에 추가:
  ```typescript
  | "MIGRATION_MANAGEMENT"
  | "BATCH_MANAGEMENT"
  ```
- 위치: 마지막 메뉴(`CHALLENGE_MANAGEMENT`) 뒤에 추가

### 2단계: initialPermissions 확장
**파일**: `src/app/users/admins/list/[id]/permissions/_constants/permissionData.ts`
- "서비스 관리 / CS 관리" features 배열에 추가 (라인 130 다음):
  ```typescript
  {
    name: "마이그레이션 관리",
    permissions: { read: false, write: false, delete: false },
  },
  {
    name: "배치 관리",
    permissions: { read: false, write: false, delete: false },
  },
  ```
- **권한 기본값 결정**:
  - read/write/delete 모두 false로 설정 (공지사항 관리와 동일)
  - 삭제 권한도 허용 (신고 관리처럼 delete: null이 아님)

### 3단계: MENU_MAPPING 확장
**파일**: `src/app/users/admins/list/[id]/permissions/_constants/permissionData.ts`
- MENU_MAPPING 객체에 추가 (라인 158 다음):
  ```typescript
  MIGRATION_MANAGEMENT: { permissionId: "service-cs", featureName: "마이그레이션 관리" },
  BATCH_MANAGEMENT: { permissionId: "service-cs", featureName: "배치 관리" },
  ```

### 4단계: 타입 체크 및 검증
- `npm run typecheck` 실행하여 TypeScript 에러 확인
- MENU_MAPPING이 Menu 타입의 모든 키를 포함하는지 확인 (Record 타입 강제)

## 제약 및 주의사항

### 절대 규칙 (CLAUDE.md)
1. **TypeScript 정합성**: MENU_MAPPING은 `Record<Menu, ...>` 타입이므로 모든 Menu 키를 포함해야 함
2. **백엔드 계약**: 백엔드가 동일한 Menu 키(`MIGRATION_MANAGEMENT`, `BATCH_MANAGEMENT`)로 응답/수신하는지 확인 필요
3. **권한 기본값**: 다른 기능들과 동일하게 모든 권한을 false로 초기화
4. **UI 동작**: 토글/저장/취소 기능이 정상 동작하는지 수동 테스트 필요

### 변경 범위 제한
- **변경 금지**: `convertApiToScreenFormat` (page.tsx) - 신규 메뉴는 read-only가 아님
- **변경 금지**: `menu-mapping.ts` - 권한 화면 전용이므로 글로벌 메뉴 매핑 불필요
- **변경 금지**: API 라우트 - 백엔드가 이미 신규 메뉴를 지원한다고 가정

## 검증 체크리스트
- [ ] Menu 타입에 2개 추가
- [ ] initialPermissions에 2개 기능 추가 (service-cs 블록)
- [ ] MENU_MAPPING에 2개 매핑 추가
- [ ] `npm run typecheck` 통과 (Record<Menu> 타입 정합성)
- [ ] 권한 페이지 로딩 확인
- [ ] 권한 토글 동작 확인
- [ ] 권한 저장/취소 동작 확인
- [ ] GENERAL 그룹에서 admin-management 숨김 로직 영향 없음 확인

## 위험 및 대안

### 위험 1: MENU_MAPPING 불일치
- **증상**: `MENU_MAPPING`이 `Menu` 타입과 불일치하면 TypeScript 에러 발생
- **원인**: `Record<Menu, ...>` 타입은 모든 Menu 키를 요구함
- **대안**: 모든 Menu 키를 MENU_MAPPING에 추가하여 정합성 유지

### 위험 2: 백엔드 미지원
- **증상**: 백엔드가 신규 메뉴를 지원하지 않으면 저장 실패 가능
- **원인**: 백엔드 API 스펙 미확인
- **대안**: 백엔드 팀과 사전 합의 필요 (전제 조건에 명시됨)

### 위험 3: UI 초기화 누락
- **증상**: 신규 메뉴가 권한 화면에 표시되지 않음
- **원인**: `initialPermissions`에 추가하지 않으면 화면 구조 누락
- **대안**: initialPermissions에 기본 구조 추가

## 산출물 포맷
- TypeScript strict mode 준수
- `Record<Menu, ...>` 타입 정합성 유지
- 기존 코드 스타일 준수 (들여쓰기, 네이밍)
- 최소 변경 원칙 (불필요한 리팩터링 금지)

## 다음 단계
1. ✅ context.md 작성
2. ⏳ Codex 계획 검증 (옵션, 사용자 요청 시)
3. ⏳ 1단계: Menu 타입 확장
4. ⏳ 2단계: initialPermissions 확장
5. ⏳ 3단계: MENU_MAPPING 확장
6. ⏳ 4단계: 타입 체크 (`npm run typecheck`)
7. ⏳ Codex 구현 리뷰
8. ⏳ 수동 테스트 (권한 페이지 로딩, 토글, 저장)
