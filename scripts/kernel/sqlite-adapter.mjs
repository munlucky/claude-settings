export const openSqliteDb = async (dbPath) => {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    return db;
  } catch {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath);
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const stmt = db.prepare(sql);
        return {
          run: (...params) => stmt.run(...params),
          get: (...params) => stmt.get(...params),
        };
      },
      close: () => db.close(),
    };
  }
};
