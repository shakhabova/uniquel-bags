import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let db: DatabaseSync | undefined;

export function getDb() {
  if (!db) {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });

    db = new DatabaseSync(path.join(dataDir, 'catalog.sqlite'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  return db;
}
