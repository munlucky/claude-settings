export async function loadSqliteDatabaseClass() {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    if (DatabaseSync) {
      const { NodeSqliteDatabase } = await import('./sqlite-drivers/node-sqlite.mjs');
      return NodeSqliteDatabase;
    }
  } catch {
    // Fallback to better-sqlite3
  }
  
  const betterSqlite3 = await import('better-sqlite3');
  return betterSqlite3.default;
}
