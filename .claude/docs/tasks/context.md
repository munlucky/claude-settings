# Admin Permission Type Expansion (MIGRATION_MANAGEMENT, BATCH_MANAGEMENT)

## Work Date
2025-12-19

## Overview
- **Goal**: Add two new menus (`MIGRATION_MANAGEMENT`, `BATCH_MANAGEMENT`) to permission types/screens so they can be viewed, granted, and saved consistently.
- **Assumption**: Backend responds/accepts the same `Menu` keys, and the category is under "Service Management > CS Management".

## Target Files
1. `src/app/_entities/admin/types.ts` - Menu union types
2. `src/app/users/admins/list/[id]/permissions/_constants/permissionData.ts` - initialPermissions, MENU_MAPPING
3. `src/app/users/admins/logs/permission/page.tsx` - getMenuLabel label mapping (Codex validation result)
4. `src/app/users/admins/list/[id]/permissions/page.tsx` - convertApiToScreenFormat (review only, no change)

## Current State Analysis

### 1. Menu types (types.ts:7-23)
- 18 menus currently defined
- CS management menus include `NOTICE_MANAGEMENT`, `REPORT_MANAGEMENT`

### 2. initialPermissions (permissionData.ts:118-132)
- "Service Management / CS Management" block:
  - Notice Management: read/write/delete all false
  - Report Management: read/write false, **delete is null** (delete not allowed)

### 3. MENU_MAPPING (permissionData.ts:136-159)
- All 18 menus mapped
- `Record<Menu, { permissionId: string; featureName: string }>` type
- `NOTICE_MANAGEMENT`, `REPORT_MANAGEMENT` map to `service-cs` permissionId

### 4. convertApiToScreenFormat (page.tsx:56-62)
- Only `ADMIN_LOG` and `NICKNAME_DICTIONARY` are special-cased as read-only (write/delete forced to null)
- New menus are not read-only, so no changes needed

## Implementation Plan

### Step 1: Extend Menu types
**File**: `src/app/_entities/admin/types.ts`
- Add to the `Menu` union:
  ```typescript
  | "MIGRATION_MANAGEMENT"
  | "BATCH_MANAGEMENT"
  ```
- Insert after the last menu (`CHALLENGE_MANAGEMENT`)

### Step 2: Extend initialPermissions
**File**: `src/app/users/admins/list/[id]/permissions/_constants/permissionData.ts`
- Add to the "Service Management / CS Management" features array (after line 130):
  ```typescript
  {
    name: "Migration Management",
    permissions: { read: false, write: false, delete: false },
  },
  {
    name: "Batch Management",
    permissions: { read: false, write: false, delete: false },
  },
  ```
- **Default permissions**:
  - Set read/write/delete to false (same as Notice Management)
  - Allow delete (not null like Report Management)

### Step 3: Extend MENU_MAPPING
**File**: `src/app/users/admins/list/[id]/permissions/_constants/permissionData.ts`
- Add to MENU_MAPPING (after line 158):
  ```typescript
  MIGRATION_MANAGEMENT: { permissionId: "service-cs", featureName: "Migration Management" },
  BATCH_MANAGEMENT: { permissionId: "service-cs", featureName: "Batch Management" },
  ```

### Step 4: Typecheck and verify
- Run `npm run typecheck` to confirm TypeScript errors
- Ensure MENU_MAPPING includes all Menu keys (Record type enforcement)

## Constraints and Notes

### Hard Rules (CLAUDE.md)
1. **TypeScript consistency**: MENU_MAPPING is `Record<Menu, ...>` so all Menu keys must be included
2. **Backend contract**: confirm backend responds/accepts `MIGRATION_MANAGEMENT`, `BATCH_MANAGEMENT`
3. **Default permissions**: initialize all permissions to false
4. **UI behavior**: manually test toggle/save/cancel flows

### Scope Limits
- **Do not change**: `convertApiToScreenFormat` (page.tsx) - new menus are not read-only
- **Do not change**: `menu-mapping.ts` - permission page only, no global mapping
- **Do not change**: API routes - assume backend already supports new menus

## Verification Checklist
- [ ] Add 2 items to Menu types
- [ ] Add 2 features to initialPermissions (service-cs block)
- [ ] Add 2 mappings to MENU_MAPPING
- [ ] `npm run typecheck` passes (Record<Menu> consistency)
- [ ] Permission page loads
- [ ] Permission toggles work
- [ ] Permission save/cancel works
- [ ] Confirm no impact on admin-management hide logic in GENERAL group

## Risks and Alternatives

### Risk 1: MENU_MAPPING mismatch
- **Symptom**: TypeScript error if `MENU_MAPPING` does not match `Menu` type
- **Cause**: `Record<Menu, ...>` requires all keys
- **Alternative**: add missing Menu keys to MENU_MAPPING

### Risk 2: Backend not supported
- **Symptom**: save may fail if backend does not support new menus
- **Cause**: backend API spec not confirmed
- **Alternative**: align with backend team in advance (stated in assumptions)

### Risk 3: UI initialization missing
- **Symptom**: new menus do not appear on permission page
- **Cause**: missing in `initialPermissions`
- **Alternative**: add base structure to initialPermissions

## Output Format
- Follow TypeScript strict mode
- Maintain `Record<Menu, ...>` consistency
- Follow existing code style (indentation, naming)
- Minimal changes only (no unnecessary refactors)

## Next Steps
1. OK context.md created
2. Pending: Codex plan validation (optional, on request)
3. Pending: Step 1 - extend Menu types
4. Pending: Step 2 - extend initialPermissions
5. Pending: Step 3 - extend MENU_MAPPING
6. Pending: Step 4 - typecheck (`npm run typecheck`)
7. Pending: Codex implementation review
8. Pending: Manual tests (permission page load, toggle, save)
