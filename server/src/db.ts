import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDb(): Pool {
  if (!pool) {
    const isLocal = /@(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL || '');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS genshape3d_users (
      id           TEXT PRIMARY KEY,
      email        TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL DEFAULT '',
      picture      TEXT NOT NULL DEFAULT '',
      role         TEXT NOT NULL DEFAULT 'free',
      approved     BOOLEAN NOT NULL DEFAULT true,
      credits      INTEGER NOT NULL DEFAULT 10,
      "createdAt"  TEXT NOT NULL,
      "lastLoginAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS genshape3d_login_events (
      id        TEXT PRIMARY KEY,
      email     TEXT NOT NULL,
      name      TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS genshape3d_generations (
      id          TEXT PRIMARY KEY,
      "userEmail" TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      style       TEXT NOT NULL DEFAULT 'Realistic',
      status      TEXT NOT NULL DEFAULT 'pending',
      "polyCount" INTEGER NOT NULL DEFAULT 0,
      "fileUrl"   TEXT NOT NULL DEFAULT '',
      "createdAt" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS genshape3d_jobs (
      id              TEXT PRIMARY KEY,
      "userEmail"     TEXT NOT NULL,
      "imageUrl"      TEXT NOT NULL DEFAULT '',
      prompt          TEXT NOT NULL DEFAULT '',
      style           TEXT NOT NULL DEFAULT 'Realistic',
      status          TEXT NOT NULL DEFAULT 'pending',
      "resultUrl"     TEXT NOT NULL DEFAULT '',
      "createdAt"     TEXT NOT NULL,
      "updatedAt"     TEXT NOT NULL,
      "startedAt"     TIMESTAMPTZ DEFAULT NULL,
      "completedAt"   TIMESTAMPTZ DEFAULT NULL,
      "polygonBudget" TEXT NOT NULL DEFAULT 'Medium (50k-200k)',
      "textureRes"    TEXT NOT NULL DEFAULT '1K',
      "exportFormat"  TEXT NOT NULL DEFAULT 'GLB',
      "detailLevel"   TEXT NOT NULL DEFAULT 'Standard',
      "doTexture"     BOOLEAN NOT NULL DEFAULT false,
      "progressPct"        INTEGER NOT NULL DEFAULT 0,
      "progressPhase"      TEXT NOT NULL DEFAULT '',
      "progressStep"       INTEGER NOT NULL DEFAULT 0,
      "progressTotal"      INTEGER NOT NULL DEFAULT 0,
      "requestCancel"      BOOLEAN NOT NULL DEFAULT false,
      "octreeResolution"   INTEGER NOT NULL DEFAULT 0,
      "targetFaceCount"    INTEGER NOT NULL DEFAULT 0,
      "inferenceSteps"     INTEGER NOT NULL DEFAULT 0,
      "guidanceScale"      REAL NOT NULL DEFAULT 0,
      "numChunks"          INTEGER NOT NULL DEFAULT 0,
      seed                 INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Add new columns to existing tables if they don't exist yet
  const alterCols = [
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "octreeResolution" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "targetFaceCount"  INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "inferenceSteps"   INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "guidanceScale"    REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "numChunks"        INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS seed               INTEGER NOT NULL DEFAULT 0`,
  ];
  for (const sql of alterCols) await db.query(sql);

  console.log('PostgreSQL tables ready');
}
