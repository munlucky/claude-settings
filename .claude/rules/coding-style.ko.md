# 코딩 스타일 가이드라인

## 파일 구조

- 파일당 200-400줄 (최대 800줄)
- 함수당 50줄 미만
- 중첩 4단계 미만

## 불변성 패턴 (CRITICAL)

```typescript
// ❌ Bad - mutation
user.name = "New Name"
items.push(newItem)

// ✅ Good - immutability
const updatedUser = { ...user, name: "New Name" }
const newItems = [...items, newItem]
```

## 금지 사항

- 프로덕션 코드에 `console.log`
- 코드/주석에 이모지
- 설명 없는 하드코딩된 매직 넘버

## 감지해야 할 코드 스멜

- 긴 함수 (>50줄)
- 깊은 중첩 (>4단계)
- 중복 코드
- 누락된 에러 처리 (try/catch)
- 티켓 없는 TODO/FIXME
- 부적절한 변수명 (x, tmp, data)
