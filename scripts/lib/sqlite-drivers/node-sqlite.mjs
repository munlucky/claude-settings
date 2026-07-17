import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

export class NodeSqliteDatabase {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    const nativeOptions = {};
    if (options.readonly) {
      nativeOptions.readOnly = true;
    }
    if (options.fileMustExist && !fs.existsSync(dbPath)) {
      const error = new Error(`Failed to open database file: ${dbPath}`);
      error.code = 'SQLITE_CANTOPEN';
      throw error;
    }
    this.db = new DatabaseSync(dbPath, nativeOptions);
    this.inTransaction = false;
  }

  pragma(sql, options = {}) {
    const isSimple = options.simple;
    if (sql.includes('=')) {
      this.db.exec(`PRAGMA ${sql}`);
      return;
    }
    const stmt = this.db.prepare(`PRAGMA ${sql}`);
    const rows = stmt.all();
    if (isSimple) {
      return rows[0] ? Object.values(rows[0])[0] : undefined;
    }
    return rows;
  }

  exec(sql) {
    this.db.exec(sql);
    return this;
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => {
        const result = stmt.run(...params);
        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        };
      },
      get: (...params) => {
        return stmt.get(...params);
      },
      all: (...params) => {
        return stmt.all(...params);
      }
    };
  }

  transaction(fn) {
    return (...args) => {
      if (this.inTransaction) {
        return fn(...args);
      }
      this.inTransaction = true;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      } finally {
        this.inTransaction = false;
      }
    };
  }

  async backup(destinationPath) {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // ignore
    }
    await fs.promises.copyFile(this.dbPath, destinationPath);
  }

  close() {
    this.db.close();
  }
}
