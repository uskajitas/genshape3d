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

  // Text-to-image assets — persisted images generated via /api/text2image.
  // Survives reloads so the gallery is yours.
  await db.query(`
    CREATE TABLE IF NOT EXISTS genshape3d_text2image_assets (
      id           UUID PRIMARY KEY,
      user_email   TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      prompt       TEXT NOT NULL,
      final_prompt TEXT NOT NULL DEFAULT '',
      params       JSONB NOT NULL DEFAULT '{}'::jsonb,
      provider     TEXT NOT NULL DEFAULT '',
      image_key    TEXT NOT NULL,
      seed         BIGINT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_t2i_user
      ON genshape3d_text2image_assets (user_email, created_at DESC);
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
    // Soft-delete: never drop a row that took GPU time. Hide from listings
    // when "deleted" = true.
    `ALTER TABLE genshape3d_jobs                ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE genshape3d_text2image_assets   ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false`,
    // Content hash of the input image. Used by /api/upload to dedupe — if
    // the same user submits the same image bytes with the same params, we
    // return the existing finished job instead of queueing a duplicate.
    `ALTER TABLE genshape3d_jobs                ADD COLUMN IF NOT EXISTS "imageHash" TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_user_hash ON genshape3d_jobs ("userEmail", "imageHash")`,
    // Multi-view extensions to text-to-image assets:
    //   parentAssetId — when set, this row is an "alt view" generated from
    //     the asset whose id matches. NULL = primary / front view.
    //   viewLabel     — human label for the angle ("front", "three_q", "side", "back").
    `ALTER TABLE genshape3d_text2image_assets ADD COLUMN IF NOT EXISTS "parentAssetId" UUID`,
    `ALTER TABLE genshape3d_text2image_assets ADD COLUMN IF NOT EXISTS "viewLabel"     TEXT NOT NULL DEFAULT ''`,
    // readyFor3D — when false, the image is excluded from the Workspace
    // filmstrip (the picker the user uses to choose an image to convert
    // into a 3D mesh). Lets the user mark "this came out badly, don't
    // accidentally pick it" without having to delete the image.
    `ALTER TABLE genshape3d_text2image_assets ADD COLUMN IF NOT EXISTS "readyFor3D"   BOOLEAN NOT NULL DEFAULT true`,
    // originalImageKey — when NULL, the asset's image_key IS the original.
    // When set, image_key is an EDITED version (e.g. background removed)
    // and originalImageKey points back to the original file in R2 so the
    // user can re-edit from scratch or revert.
    `ALTER TABLE genshape3d_text2image_assets ADD COLUMN IF NOT EXISTS "originalImageKey" TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_t2i_parent ON genshape3d_text2image_assets ("parentAssetId")`,
    // Job-side extension for multi-view 3D submissions. Empty array = single-image
    // (legacy) job. Worker reads this to decide between v2.0 and v2.0-MV pipelines.
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "auxImageUrls" JSONB NOT NULL DEFAULT '[]'::jsonb`,
  ];
  for (const sql of alterCols) await db.query(sql);

  console.log('PostgreSQL tables ready');
}
