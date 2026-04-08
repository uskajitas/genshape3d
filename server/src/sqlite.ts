import Database from 'better-sqlite3';
import path from 'node:path';

let db: Database.Database | null = null;

export function getSqliteDb(): Database.Database {
  if (!db) {
    const file = process.env.SQLITE_PATH || path.join(process.cwd(), 'genshape3d.sqlite');
    db = new Database(file);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initSqlite() {
  const d = getSqliteDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL DEFAULT '',
      picture     TEXT NOT NULL DEFAULT '',
      role        TEXT NOT NULL DEFAULT 'free',
      approved    INTEGER NOT NULL DEFAULT 1,
      credits     INTEGER NOT NULL DEFAULT 10,
      createdAt   TEXT NOT NULL,
      lastLoginAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id        TEXT PRIMARY KEY,
      email     TEXT NOT NULL,
      name      TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id         TEXT PRIMARY KEY,
      userEmail  TEXT NOT NULL,
      prompt     TEXT NOT NULL,
      style      TEXT NOT NULL DEFAULT 'Realistic',
      status     TEXT NOT NULL DEFAULT 'pending',
      polyCount  INTEGER NOT NULL DEFAULT 0,
      fileUrl    TEXT NOT NULL DEFAULT '',
      createdAt  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS genshape3d_jobs (
      id         TEXT PRIMARY KEY,
      userEmail  TEXT NOT NULL,
      imageUrl   TEXT NOT NULL DEFAULT '',
      prompt     TEXT NOT NULL DEFAULT '',
      style      TEXT NOT NULL DEFAULT 'Realistic',
      status     TEXT NOT NULL DEFAULT 'pending',
      resultUrl  TEXT NOT NULL DEFAULT '',
      createdAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL
    );
  `);
}
