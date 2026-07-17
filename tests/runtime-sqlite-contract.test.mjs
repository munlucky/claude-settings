import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { loadSqliteDatabaseClass } from '../scripts/lib/sqlite-driver.mjs';

test('node:sqlite compatibility driver parity and transaction contract', async () => {
  const Database = await loadSqliteDatabaseClass();
  const dbFile = path.join(os.tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbFile);
  
  try {
    // 1. exec and table creation
    db.exec(`
      CREATE TABLE test_parity (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    
    // 2. Pragmas
    db.pragma('journal_mode = WAL');
    assert.equal(db.pragma('journal_mode', { simple: true }).toLowerCase(), 'wal');
    
    // 3. Statement execution run/get/all
    const insert = db.prepare('INSERT INTO test_parity (id, name) VALUES (?, ?)');
    const res1 = insert.run(1, 'Alice');
    assert.equal(res1.changes, 1);
    assert.equal(res1.lastInsertRowid, 1);
    
    const selectOne = db.prepare('SELECT * FROM test_parity WHERE id = ?');
    const alice = selectOne.get(1);
    assert.equal(alice.name, 'Alice');
    
    const selectAll = db.prepare('SELECT * FROM test_parity');
    const all = selectAll.all();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, 'Alice');
    
    // 4. Transaction rollback atomicity
    const tx = db.transaction((id, name, fail) => {
      insert.run(id, name);
      if (fail) throw new Error('forced rollback');
    });
    
    // Transaction success
    tx(2, 'Bob', false);
    assert.equal(selectOne.get(2).name, 'Bob');
    
    // Transaction rollback
    assert.throws(() => {
      tx(3, 'Charlie', true);
    });
    // Charlie should NOT be in the DB
    assert.equal(selectOne.get(3), undefined);
    
    // 5. Backup/Snapshot
    const backupFile = `${dbFile}.snapshot`;
    await db.backup(backupFile);
    assert.ok(fs.existsSync(backupFile));
    
    const backupDb = new Database(backupFile);
    assert.equal(backupDb.prepare('SELECT * FROM test_parity WHERE id = ?').get(1).name, 'Alice');
    backupDb.close();
    fs.unlinkSync(backupFile);
    
  } finally {
    db.close();
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
    }
  }
});
