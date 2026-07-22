export const openSqliteDb = async (dbPath) => {
  let DatabaseSync = null;
  try {
    const mod = await import('node:sqlite');
    DatabaseSync = mod.DatabaseSync;
  } catch (err) {
    if (err.code !== 'ERR_UNKNOWN_BUILTIN_MODULE' && !err.message?.includes('node:sqlite')) {
      throw err;
    }
  }

  if (DatabaseSync) {
    return new DatabaseSync(dbPath);
  }

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
};
