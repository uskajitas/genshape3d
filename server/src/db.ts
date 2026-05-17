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
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "useMultiView" BOOLEAN NOT NULL DEFAULT false`,
    // Multi-model + multi-worker routing. `model` selects which image-to-3d
    // pipeline to run (hunyuan3d, triposr, sf3d, hi3dgen). `assignedWorkerId`
    // is set by the server when a worker claims the job via /api/workers/:id/claim
    // — empty string means unassigned.
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS model              TEXT NOT NULL DEFAULT 'hunyuan3d'`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "assignedWorkerId" TEXT NOT NULL DEFAULT ''`,
    // Admin can pin a job to a specific worker. Empty string = any worker.
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "preferredWorkerId" TEXT NOT NULL DEFAULT ''`,
    // Speed up the worker claim query: WHERE status='pending' AND model = ANY($1)
    `CREATE INDEX IF NOT EXISTS idx_jobs_pending_model ON genshape3d_jobs (status, model) WHERE deleted = false`,
    // Workers write the failure stack/message here so the admin page can show
    // WHY a job failed without needing to SSH into the box that ran it.
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "errorMessage" TEXT NOT NULL DEFAULT ''`,
    // Asset groups: a "pack" of stylistically-related jobs (spaceship fleet,
    // chess set, etc.). The defensible product angle vs Meshy/Tripo —
    // they generate isolated meshes; we organize coherent batches.
    `CREATE TABLE IF NOT EXISTS genshape3d_asset_groups (
       id              UUID PRIMARY KEY,
       "userEmail"     TEXT NOT NULL,
       name            TEXT NOT NULL,
       "styleAnchorUrl" TEXT NOT NULL DEFAULT '',
       notes           TEXT NOT NULL DEFAULT '',
       "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted         BOOLEAN NOT NULL DEFAULT false
     )`,
    `CREATE INDEX IF NOT EXISTS idx_groups_user ON genshape3d_asset_groups ("userEmail", "createdAt" DESC) WHERE deleted = false`,
    // Each job optionally belongs to one asset group. Null = ungrouped.
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "groupId" UUID`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_group ON genshape3d_jobs ("groupId") WHERE "groupId" IS NOT NULL AND deleted = false`,

    // ── Benchmark system ────────────────────────────────────────────────────
    // benchmark_rating_dimensions: defines which axes you can rate a generation
    // on. Adding a new dimension = one INSERT, no schema change needed.
    `CREATE TABLE IF NOT EXISTS benchmark_rating_dimensions (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       key         TEXT NOT NULL UNIQUE,
       label       TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       sort_order  INTEGER NOT NULL DEFAULT 0,
       active      BOOLEAN NOT NULL DEFAULT true
     )`,

    // Seed the four initial dimensions (INSERT ... ON CONFLICT DO NOTHING so
    // re-running initDb never clobbers user edits).
    `INSERT INTO benchmark_rating_dimensions (key, label, description, sort_order) VALUES
       ('geometry', 'Geometry',
        'Does the overall shape match the input? Correct proportions and silhouette — a sword should look like a sword, not a blob.',
        1),
       ('surface', 'Surface',
        'Are surfaces clean? Hard surfaces should be flat; organic shapes should be smooth. No random bumps, pinching, or mushy rounded-off edges.',
        2),
       ('topology', 'Topology',
        'Is the mesh structure sound? No holes, no disconnected floating pieces, no non-manifold edges. Can you import it into Blender without fixing it?',
        3),
       ('texture', 'Texture',
        'Does the texture match the original image? Correct colors, no obvious seams, no blurry patches, no UV stretching. Only relevant when texture was enabled.',
        4)
     ON CONFLICT (key) DO NOTHING`,

    // benchmark_categories: two-level tree (parentId NULL = top level).
    `CREATE TABLE IF NOT EXISTS benchmark_categories (
       id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name       TEXT NOT NULL,
       "parentId" UUID REFERENCES benchmark_categories(id),
       sort_order INTEGER NOT NULL DEFAULT 0
     )`,

    // Seed category tree
    `INSERT INTO benchmark_categories (id, name, "parentId", sort_order) VALUES
       ('10000000-0000-0000-0000-000000000001', 'Hard Surface',  NULL, 1),
       ('10000000-0000-0000-0000-000000000002', 'Organic',       NULL, 2),
       ('10000000-0000-0000-0000-000000000003', 'Props',         NULL, 3),
       ('10000000-0000-0000-0000-000000000004', 'Stylized',      NULL, 4),
       -- Hard Surface children
       ('20000000-0000-0000-0000-000000000001', 'Weapons',       '10000000-0000-0000-0000-000000000001', 1),
       ('20000000-0000-0000-0000-000000000002', 'Vehicles',      '10000000-0000-0000-0000-000000000001', 2),
       ('20000000-0000-0000-0000-000000000003', 'Architecture',  '10000000-0000-0000-0000-000000000001', 3),
       ('20000000-0000-0000-0000-000000000004', 'Machinery',     '10000000-0000-0000-0000-000000000001', 4),
       ('20000000-0000-0000-0000-000000000005', 'Electronics',   '10000000-0000-0000-0000-000000000001', 5),
       -- Organic children
       ('20000000-0000-0000-0000-000000000006', 'Characters',    '10000000-0000-0000-0000-000000000002', 1),
       ('20000000-0000-0000-0000-000000000007', 'Creatures',     '10000000-0000-0000-0000-000000000002', 2),
       ('20000000-0000-0000-0000-000000000008', 'Plants',        '10000000-0000-0000-0000-000000000002', 3),
       ('20000000-0000-0000-0000-000000000009', 'Natural',       '10000000-0000-0000-0000-000000000002', 4),
       -- Props children
       ('20000000-0000-0000-0000-000000000010', 'Furniture',     '10000000-0000-0000-0000-000000000003', 1),
       ('20000000-0000-0000-0000-000000000011', 'Household',     '10000000-0000-0000-0000-000000000003', 2),
       ('20000000-0000-0000-0000-000000000012', 'Accessories',   '10000000-0000-0000-0000-000000000003', 3),
       -- Stylized children
       ('20000000-0000-0000-0000-000000000013', 'Magic Items',   '10000000-0000-0000-0000-000000000004', 1),
       ('20000000-0000-0000-0000-000000000014', 'Sci-Fi',        '10000000-0000-0000-0000-000000000004', 2)
     ON CONFLICT (id) DO NOTHING`,

    // benchmark_subjects: the fixed test-image pool. One approved image per
    // subject — generated once, reused across every run for apples-to-apples
    // comparison.
    `CREATE TABLE IF NOT EXISTS benchmark_subjects (
       id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       "categoryId"       UUID NOT NULL REFERENCES benchmark_categories(id),
       name               TEXT NOT NULL,
       "generationPrompt" TEXT NOT NULL DEFAULT '',
       "imageUrl"         TEXT NOT NULL DEFAULT '',
       notes              TEXT NOT NULL DEFAULT '',
       "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted            BOOLEAN NOT NULL DEFAULT false
     )`,
    `CREATE INDEX IF NOT EXISTS idx_bench_subjects_cat ON benchmark_subjects ("categoryId") WHERE deleted = false`,

    // benchmark_runs: one record per batch of jobs submitted together.
    // config_snapshot captures exactly what was tested so runs are
    // reproducible months later.
    `CREATE TABLE IF NOT EXISTS benchmark_runs (
       id                TEXT PRIMARY KEY,
       name              TEXT NOT NULL,
       "configSnapshot"  JSONB NOT NULL DEFAULT '{}'::jsonb,
       "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       "completedAt"     TIMESTAMPTZ
     )`,

    // benchmark_run_items: one row per (subject × model/preset combo).
    // ratings jsonb stores { overall: 8, geometry: 7, ... } — new dimensions
    // just add a key, no migration needed.
    `CREATE TABLE IF NOT EXISTS benchmark_run_items (
       id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       "runId"       TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
       "subjectId"   UUID NOT NULL REFERENCES benchmark_subjects(id),
       "jobId"       TEXT REFERENCES genshape3d_jobs(id),
       model         TEXT NOT NULL,
       preset        TEXT NOT NULL DEFAULT '',
       octree        INTEGER NOT NULL DEFAULT 0,
       steps         INTEGER NOT NULL DEFAULT 0,
       guidance      REAL NOT NULL DEFAULT 0,
       faces         INTEGER NOT NULL DEFAULT 0,
       chunks        INTEGER NOT NULL DEFAULT 0,
       seed          INTEGER NOT NULL DEFAULT 0,
       ratings       JSONB,
       "ratingNotes" TEXT NOT NULL DEFAULT '',
       "ratedAt"     TIMESTAMPTZ,
       "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_bench_items_run ON benchmark_run_items ("runId")`,
    `CREATE INDEX IF NOT EXISTS idx_bench_items_job ON benchmark_run_items ("jobId")`,
  ];
  for (const sql of alterCols) await db.query(sql);

  console.log('PostgreSQL tables ready');
}
