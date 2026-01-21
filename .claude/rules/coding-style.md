# Coding Style Guidelines

## File Structure

- 200-400 lines per file (max 800)
- Functions under 50 lines
- Nesting under 4 levels

## Immutability Pattern (CRITICAL)

```typescript
// ❌ Bad - mutation
user.name = "New Name"
items.push(newItem)

// ✅ Good - immutability
const updatedUser = { ...user, name: "New Name" }
const newItems = [...items, newItem]
```

## Prohibited

- `console.log` in production code
- Emojis in code/comments
- Hardcoded magic numbers without explanation

## Code Smells to Detect

- Long functions (>50 lines)
- Deep nesting (>4 levels)
- Duplicated code
- Missing error handling (try/catch)
- TODO/FIXME without tickets
- Poor variable naming (x, tmp, data)
