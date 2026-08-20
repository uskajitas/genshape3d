import { Pool } from 'pg';

let pool: Pool | null = null;
let resetPending = false;

function scheduleReset() {
  if (resetPending) return;
  resetPending = true;
  setTimeout(() => {
    const old = pool;
    pool = null;
    resetPending = false;
    if (old) old.end().catch(() => {});
    console.log('[db] Pool destroyed — will reconnect on next query');
  }, 2000);
}

function isConnErr(err: any): boolean {
  return (
    err.code === 'ECONNRESET' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    (typeof err.message === 'string' &&
      (err.message.includes('Connection terminated') ||
       err.message.includes('socket hang up')))
  );
}

export function getDb(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL || '';
    const isLocal = /@(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)/.test(url);
    pool = new Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      max: 5,
    });
    pool.on('error', (err: any) => {
      console.error('[db] Pool error:', err.code || err.message);
      if (isConnErr(err)) scheduleReset();
    });
  }
  return pool;
}

// Drop-in replacement for getDb().query() with generic type support and one
// retry on connection errors. Resets the pool synchronously before the retry
// so the second attempt always gets a fresh connection with a re-resolved
// WSL2 IP — not the same broken pool.
export async function dbQuery<T extends import('pg').QueryResultRow = any>(text: string, params?: any[]): Promise<import('pg').QueryResult<T>> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      return await getDb().query<T>(text, params as any);
    } catch (err: any) {
      if (attempt === 0 && isConnErr(err)) {
        console.warn(`[db] Connection error on query, resetting pool: ${err.code || err.message}`);
        // Reset synchronously — scheduleReset has a 2s delay which is longer
        // than the retry wait, so the retry would hit the same broken pool.
        const old = pool;
        pool = null;
        resetPending = false;
        if (old) old.end().catch(() => {});
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  throw new Error('[db] unreachable');
}

export async function initDb(): Promise<void> {
  const db = getDb();
  // Retry up to 10 times with 3s delay — handles WSL2 Postgres not yet
  // accepting connections after a network hiccup or host resume.
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await db.query('SELECT 1');
      break;
    } catch (err: any) {
      if (attempt === 10) throw err;
      console.warn(`DB not ready (attempt ${attempt}/10): ${err.code || err.message} — retrying in 3s`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  await dbQuery(`
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
  await dbQuery(`
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

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS genshape3d_texture_jobs (
      id                   TEXT PRIMARY KEY,
      "userEmail"          TEXT NOT NULL,
      "sourceJobId"        TEXT NOT NULL REFERENCES genshape3d_jobs(id),
      "sourceModelUrl"     TEXT NOT NULL,
      prompt               TEXT NOT NULL DEFAULT '',
      "materialPreset"     TEXT NOT NULL DEFAULT 'Auto',
      "referenceImageKey"  TEXT NOT NULL DEFAULT '',
      "textureRes"         TEXT NOT NULL DEFAULT '2K',
      maps                 JSONB NOT NULL DEFAULT '["baseColor","roughness","normal"]'::jsonb,
      variants             INTEGER NOT NULL DEFAULT 1,
      seed                 INTEGER NOT NULL DEFAULT 0,
      strength             INTEGER NOT NULL DEFAULT 65,
      "keepShape"          BOOLEAN NOT NULL DEFAULT true,
      status               TEXT NOT NULL DEFAULT 'pending',
      "resultUrl"          TEXT NOT NULL DEFAULT '',
      "errorMessage"       TEXT NOT NULL DEFAULT '',
      "progressPct"        INTEGER NOT NULL DEFAULT 0,
      "progressPhase"      TEXT NOT NULL DEFAULT '',
      "assignedWorkerId"   TEXT NOT NULL DEFAULT '',
      "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "startedAt"          TIMESTAMPTZ DEFAULT NULL,
      "completedAt"        TIMESTAMPTZ DEFAULT NULL,
      deleted              BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS idx_texture_jobs_user
      ON genshape3d_texture_jobs ("userEmail", "createdAt" DESC) WHERE deleted = false;
    CREATE INDEX IF NOT EXISTS idx_texture_jobs_source
      ON genshape3d_texture_jobs ("sourceJobId", "createdAt" DESC) WHERE deleted = false;
    CREATE INDEX IF NOT EXISTS idx_texture_jobs_pending
      ON genshape3d_texture_jobs (status, "createdAt") WHERE deleted = false;
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
    // Smart Mesh: worker auto-queues a rebuild+bake refine when the
    // generation completes (ugen3d's Smart Mesh tab sets this).
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "autoRefine" BOOLEAN NOT NULL DEFAULT false`,
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

    // Seed category tree — ON CONFLICT DO UPDATE so renames/reorders apply on next restart
    `INSERT INTO benchmark_categories (id, name, "parentId", sort_order) VALUES
       -- ── Legacy tops (kept for backward compat) ───────────────────────────────
       ('10000000-0000-0000-0000-000000000001', 'Hard Surface',  NULL, 101),
       ('10000000-0000-0000-0000-000000000002', 'Organic',       NULL, 102),
       ('10000000-0000-0000-0000-000000000003', 'Props',         NULL, 103),
       ('10000000-0000-0000-0000-000000000004', 'Stylized',      NULL, 104),
       -- Legacy subs
       ('20000000-0000-0000-0000-000000000001', 'Weapons',       '10000000-0000-0000-0000-000000000001', 1),
       ('20000000-0000-0000-0000-000000000002', 'Vehicles',      '10000000-0000-0000-0000-000000000001', 2),
       ('20000000-0000-0000-0000-000000000003', 'Architecture',  '10000000-0000-0000-0000-000000000001', 3),
       ('20000000-0000-0000-0000-000000000004', 'Machinery',     '10000000-0000-0000-0000-000000000001', 4),
       ('20000000-0000-0000-0000-000000000005', 'Electronics',   '10000000-0000-0000-0000-000000000001', 5),
       ('20000000-0000-0000-0000-000000000006', 'Characters',    '10000000-0000-0000-0000-000000000002', 1),
       ('20000000-0000-0000-0000-000000000007', 'Creatures',     '10000000-0000-0000-0000-000000000002', 2),
       ('20000000-0000-0000-0000-000000000008', 'Plants',        '10000000-0000-0000-0000-000000000002', 3),
       ('20000000-0000-0000-0000-000000000009', 'Natural',       '10000000-0000-0000-0000-000000000002', 4),
       ('20000000-0000-0000-0000-000000000010', 'Furniture',     '10000000-0000-0000-0000-000000000003', 1),
       ('20000000-0000-0000-0000-000000000011', 'Household',     '10000000-0000-0000-0000-000000000003', 2),
       ('20000000-0000-0000-0000-000000000012', 'Accessories',   '10000000-0000-0000-0000-000000000003', 3),
       ('20000000-0000-0000-0000-000000000013', 'Magic Items',   '10000000-0000-0000-0000-000000000004', 1),
       ('20000000-0000-0000-0000-000000000014', 'Sci-Fi',        '10000000-0000-0000-0000-000000000004', 2),
       -- ── Characters & Avatars ─────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000001', 'Characters & Avatars',      NULL,  1),
       ('40000000-0000-0000-0000-000000000001', 'Hero / Protagonist',        '30000000-0000-0000-0000-000000000001', 1),
       ('40000000-0000-0000-0000-000000000002', 'Villain / Antagonist',      '30000000-0000-0000-0000-000000000001', 2),
       ('40000000-0000-0000-0000-000000000003', 'NPC / Civilian',            '30000000-0000-0000-0000-000000000001', 3),
       ('40000000-0000-0000-0000-000000000004', 'Game Avatar / Player',      '30000000-0000-0000-0000-000000000001', 4),
       ('40000000-0000-0000-0000-000000000005', 'Fantasy Character',         '30000000-0000-0000-0000-000000000001', 5),
       ('40000000-0000-0000-0000-000000000006', 'Sci-Fi Character',          '30000000-0000-0000-0000-000000000001', 6),
       ('40000000-0000-0000-0000-000000000007', 'Anime / Manga',             '30000000-0000-0000-0000-000000000001', 7),
       ('40000000-0000-0000-0000-000000000008', 'Historical / Period',       '30000000-0000-0000-0000-000000000001', 8),
       -- ── Creatures & Animals ──────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000002', 'Creatures & Animals',       NULL,  2),
       ('40000000-0000-0000-0000-000000000011', 'Fantasy Creature',          '30000000-0000-0000-0000-000000000002', 1),
       ('40000000-0000-0000-0000-000000000012', 'Alien / Extraterrestrial',  '30000000-0000-0000-0000-000000000002', 2),
       ('40000000-0000-0000-0000-000000000013', 'Wildlife / Animal',         '30000000-0000-0000-0000-000000000002', 3),
       ('40000000-0000-0000-0000-000000000014', 'Undead / Horror',           '30000000-0000-0000-0000-000000000002', 4),
       ('40000000-0000-0000-0000-000000000015', 'Mythological',              '30000000-0000-0000-0000-000000000002', 5),
       ('40000000-0000-0000-0000-000000000016', 'Companion / Familiar',      '30000000-0000-0000-0000-000000000002', 6),
       ('40000000-0000-0000-0000-000000000017', 'Boss / Giant Monster',      '30000000-0000-0000-0000-000000000002', 7),
       ('40000000-0000-0000-0000-000000000018', 'Insect / Arthropod',        '30000000-0000-0000-0000-000000000002', 8),
       -- ── Vehicles & Mechs ─────────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000003', 'Vehicles & Mechs',          NULL,  3),
       ('40000000-0000-0000-0000-000000000021', 'Car / Ground Vehicle',      '30000000-0000-0000-0000-000000000003', 1),
       ('40000000-0000-0000-0000-000000000022', 'Military / Tank',           '30000000-0000-0000-0000-000000000003', 2),
       ('40000000-0000-0000-0000-000000000023', 'Aircraft / Plane',          '30000000-0000-0000-0000-000000000003', 3),
       ('40000000-0000-0000-0000-000000000024', 'Spaceship / Starship',      '30000000-0000-0000-0000-000000000003', 4),
       ('40000000-0000-0000-0000-000000000025', 'Boat / Ship',               '30000000-0000-0000-0000-000000000003', 5),
       ('40000000-0000-0000-0000-000000000026', 'Mech / Walker',             '30000000-0000-0000-0000-000000000003', 6),
       ('40000000-0000-0000-0000-000000000027', 'Motorcycle / Bike',         '30000000-0000-0000-0000-000000000003', 7),
       ('40000000-0000-0000-0000-000000000028', 'Fantasy Transport',         '30000000-0000-0000-0000-000000000003', 8),
       -- ── Architecture & Environments ──────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000004', 'Architecture & Environments', NULL, 4),
       ('40000000-0000-0000-0000-000000000031', 'House / Building',          '30000000-0000-0000-0000-000000000004', 1),
       ('40000000-0000-0000-0000-000000000032', 'Castle / Fortress',         '30000000-0000-0000-0000-000000000004', 2),
       ('40000000-0000-0000-0000-000000000033', 'Interior / Room',           '30000000-0000-0000-0000-000000000004', 3),
       ('40000000-0000-0000-0000-000000000034', 'Ruins / Ancient',           '30000000-0000-0000-0000-000000000004', 4),
       ('40000000-0000-0000-0000-000000000035', 'Dungeon / Cave',            '30000000-0000-0000-0000-000000000004', 5),
       ('40000000-0000-0000-0000-000000000036', 'Sci-Fi Structure',          '30000000-0000-0000-0000-000000000004', 6),
       ('40000000-0000-0000-0000-000000000037', 'Modular Kit Piece',         '30000000-0000-0000-0000-000000000004', 7),
       ('40000000-0000-0000-0000-000000000038', 'Bridge / Infrastructure',   '30000000-0000-0000-0000-000000000004', 8),
       -- ── Weapons & Armor ──────────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000005', 'Weapons & Armor',           NULL,  5),
       ('40000000-0000-0000-0000-000000000041', 'Sword / Blade',             '30000000-0000-0000-0000-000000000005', 1),
       ('40000000-0000-0000-0000-000000000042', 'Axe / Hammer',              '30000000-0000-0000-0000-000000000005', 2),
       ('40000000-0000-0000-0000-000000000043', 'Bow / Crossbow',            '30000000-0000-0000-0000-000000000005', 3),
       ('40000000-0000-0000-0000-000000000044', 'Firearm / Gun',             '30000000-0000-0000-0000-000000000005', 4),
       ('40000000-0000-0000-0000-000000000045', 'Polearm / Spear',           '30000000-0000-0000-0000-000000000005', 5),
       ('40000000-0000-0000-0000-000000000046', 'Shield',                    '30000000-0000-0000-0000-000000000005', 6),
       ('40000000-0000-0000-0000-000000000047', 'Armor Piece / Helmet',      '30000000-0000-0000-0000-000000000005', 7),
       ('40000000-0000-0000-0000-000000000048', 'Throwable / Explosive',     '30000000-0000-0000-0000-000000000005', 8),
       -- ── Props & Items ─────────────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000006', 'Props & Items',             NULL,  6),
       ('40000000-0000-0000-0000-000000000051', 'Furniture',                 '30000000-0000-0000-0000-000000000006', 1),
       ('40000000-0000-0000-0000-000000000052', 'Household / Kitchen',       '30000000-0000-0000-0000-000000000006', 2),
       ('40000000-0000-0000-0000-000000000053', 'Electronics / Tech',        '30000000-0000-0000-0000-000000000006', 3),
       ('40000000-0000-0000-0000-000000000054', 'Food & Drink',              '30000000-0000-0000-0000-000000000006', 4),
       ('40000000-0000-0000-0000-000000000055', 'Clothing / Wearable',       '30000000-0000-0000-0000-000000000006', 5),
       ('40000000-0000-0000-0000-000000000056', 'Container / Chest',         '30000000-0000-0000-0000-000000000006', 6),
       ('40000000-0000-0000-0000-000000000057', 'Tool / Utility',            '30000000-0000-0000-0000-000000000006', 7),
       ('40000000-0000-0000-0000-000000000058', 'Collectible / Trophy',      '30000000-0000-0000-0000-000000000006', 8),
       -- ── Nature & Terrain ─────────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000007', 'Nature & Terrain',          NULL,  7),
       ('40000000-0000-0000-0000-000000000061', 'Tree / Large Plant',        '30000000-0000-0000-0000-000000000007', 1),
       ('40000000-0000-0000-0000-000000000062', 'Bush / Shrub',              '30000000-0000-0000-0000-000000000007', 2),
       ('40000000-0000-0000-0000-000000000063', 'Flower / Foliage',          '30000000-0000-0000-0000-000000000007', 3),
       ('40000000-0000-0000-0000-000000000064', 'Rock / Boulder',            '30000000-0000-0000-0000-000000000007', 4),
       ('40000000-0000-0000-0000-000000000065', 'Terrain Feature',           '30000000-0000-0000-0000-000000000007', 5),
       ('40000000-0000-0000-0000-000000000066', 'Mushroom / Fungi',          '30000000-0000-0000-0000-000000000007', 6),
       ('40000000-0000-0000-0000-000000000067', 'Water Feature',             '30000000-0000-0000-0000-000000000007', 7),
       ('40000000-0000-0000-0000-000000000068', 'Crystal / Mineral',         '30000000-0000-0000-0000-000000000007', 8),
       -- ── Sci-Fi & Futuristic ──────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000008', 'Sci-Fi & Futuristic',       NULL,  8),
       ('40000000-0000-0000-0000-000000000071', 'Robot / Android',           '30000000-0000-0000-0000-000000000008', 1),
       ('40000000-0000-0000-0000-000000000072', 'Cyberpunk Prop',            '30000000-0000-0000-0000-000000000008', 2),
       ('40000000-0000-0000-0000-000000000073', 'Space Station Part',        '30000000-0000-0000-0000-000000000008', 3),
       ('40000000-0000-0000-0000-000000000074', 'Drone / Probe',             '30000000-0000-0000-0000-000000000008', 4),
       ('40000000-0000-0000-0000-000000000075', 'Alien Artifact',            '30000000-0000-0000-0000-000000000008', 5),
       ('40000000-0000-0000-0000-000000000076', 'Energy Weapon',             '30000000-0000-0000-0000-000000000008', 6),
       ('40000000-0000-0000-0000-000000000077', 'Hologram / UI Element',     '30000000-0000-0000-0000-000000000008', 7),
       ('40000000-0000-0000-0000-000000000078', 'Power Armor / Exo-Suit',    '30000000-0000-0000-0000-000000000008', 8),
       -- ── Fantasy & Magic ──────────────────────────────────────────────────────
       ('30000000-0000-0000-0000-000000000009', 'Fantasy & Magic',           NULL,  9),
       ('40000000-0000-0000-0000-000000000081', 'Magic Weapon / Staff',      '30000000-0000-0000-0000-000000000009', 1),
       ('40000000-0000-0000-0000-000000000082', 'Potion / Flask',            '30000000-0000-0000-0000-000000000009', 2),
       ('40000000-0000-0000-0000-000000000083', 'Spell Effect / Rune',       '30000000-0000-0000-0000-000000000009', 3),
       ('40000000-0000-0000-0000-000000000084', 'Ancient Artifact',          '30000000-0000-0000-0000-000000000009', 4),
       ('40000000-0000-0000-0000-000000000085', 'Treasure / Chest',          '30000000-0000-0000-0000-000000000009', 5),
       ('40000000-0000-0000-0000-000000000086', 'Crystal / Gem',             '30000000-0000-0000-0000-000000000009', 6),
       ('40000000-0000-0000-0000-000000000087', 'Summoning Circle',          '30000000-0000-0000-0000-000000000009', 7),
       ('40000000-0000-0000-0000-000000000088', 'Scroll / Tome',             '30000000-0000-0000-0000-000000000009', 8),
       -- ── Cartoon & Animation ──────────────────────────────────────────────────
       ('30000000-0000-0000-0000-00000000000a', 'Cartoon & Animation',       NULL, 10),
       ('40000000-0000-0000-0000-000000000091', 'Cartoon Character',         '30000000-0000-0000-0000-00000000000a', 1),
       ('40000000-0000-0000-0000-000000000092', 'Chibi / Cute',              '30000000-0000-0000-0000-00000000000a', 2),
       ('40000000-0000-0000-0000-000000000093', 'Anime Character',           '30000000-0000-0000-0000-00000000000a', 3),
       ('40000000-0000-0000-0000-000000000094', 'Low-Poly / Stylized',       '30000000-0000-0000-0000-00000000000a', 4),
       ('40000000-0000-0000-0000-000000000095', 'Toon Prop',                 '30000000-0000-0000-0000-00000000000a', 5),
       ('40000000-0000-0000-0000-000000000096', 'Mascot / Logo 3D',          '30000000-0000-0000-0000-00000000000a', 6),
       ('40000000-0000-0000-0000-000000000097', 'Storybook / Fairy Tale',    '30000000-0000-0000-0000-00000000000a', 7),
       ('40000000-0000-0000-0000-000000000098', 'Game Icon / Badge',         '30000000-0000-0000-0000-00000000000a', 8)
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
    `ALTER TABLE benchmark_run_items ADD COLUMN IF NOT EXISTS "doTexture" BOOLEAN NOT NULL DEFAULT false`,
    // Sweeper bookkeeping: how many times a silent 'processing' job was
    // requeued. After 2 requeues the sweeper fails it instead (poison guard).
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "requeueCount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_texture_jobs ADD COLUMN IF NOT EXISTS "sourceImageUrl" TEXT NOT NULL DEFAULT ''`,
    // Benchmark jobs must not appear in the normal user job list
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "isBenchmark" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false`,
    // GPU telemetry written by the worker at job completion
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "gpuMemPeakMB" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "gpuUtilAvg"   REAL    NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "gpuUtilPeak"  REAL    NOT NULL DEFAULT 0`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "gpuSamples"   INTEGER NOT NULL DEFAULT 0`,
    // Credit ledger — append-only log of every credit grant/spend/refund.
    // ref is UNIQUE so double-inserts (retry after crash) are safe.
    `CREATE TABLE IF NOT EXISTS genshape3d_credit_ledger (
       id         SERIAL PRIMARY KEY,
       email      TEXT NOT NULL,
       delta      INTEGER NOT NULL,
       kind       TEXT NOT NULL,
       ref        TEXT NOT NULL UNIQUE,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_credit_ledger_email ON genshape3d_credit_ledger (email, created_at DESC)`,

    // Scenes: a composition of existing GLB assets (job results) placed,
    // lit, and framed together for a presentation render. Never references
    // or duplicates the underlying GLB bytes — sceneData just stores each
    // node's jobId/resultUrl + transform, so re-texturing or deleting the
    // source job never corrupts a saved scene's own record of what it used.
    `CREATE TABLE IF NOT EXISTS genshape3d_scenes (
       id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       "userEmail"    TEXT NOT NULL,
       name           TEXT NOT NULL DEFAULT 'Untitled scene',
       "sceneData"    JSONB NOT NULL DEFAULT '{}'::jsonb,
       "thumbnailUrl" TEXT NOT NULL DEFAULT '',
       "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted        BOOLEAN NOT NULL DEFAULT false
     )`,
    `CREATE INDEX IF NOT EXISTS idx_scenes_user ON genshape3d_scenes ("userEmail", "updatedAt" DESC) WHERE deleted = false`,

    // Mesh refine jobs: repair (weld/floaters/holes/normals) + optional
    // decimation of a generated mesh. On completion the worker inserts a
    // NEW genshape3d_jobs row (the refined mesh becomes a first-class
    // derivative asset, model='refine') and links it via "resultJobId".
    // The source job is never modified.
    `CREATE TABLE IF NOT EXISTS genshape3d_refine_jobs (
       id                 TEXT PRIMARY KEY,
       "userEmail"        TEXT NOT NULL,
       "sourceJobId"      TEXT NOT NULL REFERENCES genshape3d_jobs(id),
       "sourceModelUrl"   TEXT NOT NULL,
       operations         JSONB NOT NULL DEFAULT '{}'::jsonb,
       status             TEXT NOT NULL DEFAULT 'pending',
       "resultUrl"        TEXT NOT NULL DEFAULT '',
       "resultJobId"      TEXT NOT NULL DEFAULT '',
       "errorMessage"     TEXT NOT NULL DEFAULT '',
       "progressPct"      INTEGER NOT NULL DEFAULT 0,
       "progressPhase"    TEXT NOT NULL DEFAULT '',
       "assignedWorkerId" TEXT NOT NULL DEFAULT '',
       stats              JSONB NOT NULL DEFAULT '{}'::jsonb,
       "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       "startedAt"        TIMESTAMPTZ DEFAULT NULL,
       "completedAt"      TIMESTAMPTZ DEFAULT NULL,
       deleted            BOOLEAN NOT NULL DEFAULT false
     )`,
    `CREATE INDEX IF NOT EXISTS idx_refine_jobs_pending ON genshape3d_refine_jobs (status, "createdAt") WHERE deleted = false`,
    `CREATE INDEX IF NOT EXISTS idx_refine_jobs_source ON genshape3d_refine_jobs ("sourceJobId", "createdAt" DESC) WHERE deleted = false`,

    // Asset lineage: derivatives (refine/rebuild outputs) are VERSIONS of the
    // same asset identity, not new assets. rootJobId groups a lineage (a
    // fresh generation is its own root), version orders it, versionLabel
    // describes what changed ("refined 20k", "rebuilt"). The UI shows one
    // card per lineage. All versions remain immutable rows.
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "rootJobId" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE genshape3d_jobs ADD COLUMN IF NOT EXISTS "versionLabel" TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_root ON genshape3d_jobs ("rootJobId") WHERE deleted = false`,
    // Backfill: every pre-lineage job is its own root.
    `UPDATE genshape3d_jobs SET "rootJobId" = id WHERE "rootJobId" = ''`,
  ];
  for (const sql of alterCols) await dbQuery(sql);

  // Backfill: any job created by a benchmark run has name starting with '[BM]'
  // but was inserted before the isBenchmark column existed, so it got DEFAULT false.
  await dbQuery(`UPDATE genshape3d_jobs SET "isBenchmark" = true WHERE name LIKE '[BM]%' AND "isBenchmark" = false`);

  console.log('PostgreSQL tables ready');
}
