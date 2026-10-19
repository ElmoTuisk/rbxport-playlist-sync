import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS documents (bucket TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(bucket,id));
      PRAGMA user_version=1;`);
  }
  get(bucket, id) { const row = this.db.prepare('SELECT value FROM documents WHERE bucket=? AND id=?').get(bucket, id); return row ? JSON.parse(row.value) : null; }
  all(bucket) { return this.db.prepare('SELECT value FROM documents WHERE bucket=? ORDER BY rowid').all(bucket).map(r => JSON.parse(r.value)); }
  put(bucket, id, value) { this.db.prepare('INSERT INTO documents VALUES(?,?,?) ON CONFLICT(bucket,id) DO UPDATE SET value=excluded.value').run(bucket, id, JSON.stringify(value)); return value; }
  delete(bucket, id) { this.db.prepare('DELETE FROM documents WHERE bucket=? AND id=?').run(bucket, id); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  close() { this.db.close(); }
}
