import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { initDb } from './db';
import {
  upsertOnLogin, recordLoginEvent, getAppUser,
  listAppUsers, setUserRole, deductCredit,
  isAdminEmail, UserRole,
} from './usersRepo';
import { uploadToR2, getR2Stream } from './r2';
import { createJob, getJobsByUser, listAllJobs, listPendingJobs, listCancelledJobs, updateJobStatus, cancelJob, renameJob, deleteJob, countUserJobsSince } from './jobsRepo';
import { listPacks, createCheckout, stripeWebhook } from './billing';

const app = express();
const port = process.env.PORT || 8110;
const clientOrigin = process.env.CLIENT_ORIGIN_URL || 'http://localhost:3110';

app.use(cors({ origin: clientOrigin, credentials: true }));

// Stripe webhook needs the raw body for signature verification — register it
// BEFORE the JSON body parser kicks in.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook,
);

app.use(express.json());

// Other billing routes (after express.json is set up).
app.get('/api/billing/packs', listPacks);
app.post('/api/billing/checkout', createCheckout);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Image proxy from R2 ───────────────────────────────────────────────────────

app.get('/api/image', async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const obj = await getR2Stream(key);
    res.setHeader('Content-Type', (obj.ContentType as string) || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    (obj.Body as any).pipe(res);
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

app.get('/api/mesh', async (req, res) => {
  let key = req.query.key as string;
  if (!key) return res.status(400).json({ error: 'key required' });
  // If a full URL was passed, extract just the key (everything after /<bucket>/)
  if (key.startsWith('http')) {
    const bucket = process.env.R2_BUCKET || 'genshape3d';
    const marker = `/${bucket}/`;
    const idx = key.indexOf(marker);
    if (idx !== -1) key = key.slice(idx + marker.length);
  }
  try {
    const obj = await getR2Stream(key);
    res.setHeader('Content-Type', (obj.ContentType as string) || 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    (obj.Body as any).pipe(res);
  } catch (e: any) {
    res.status(404).json({ error: 'not found', detail: e.message });
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email, name, picture } = req.body as { email?: string; name?: string; picture?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const user = await upsertOnLogin(email, name || '', picture || '');
    await recordLoginEvent(email, name || '');
    res.json({ user });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await getAppUser(email);
  if (!user) return res.json({ approved: false, role: 'free', exists: false, credits: 0 });
  res.json({
    approved: Boolean(user.approved),
    role: user.role,
    exists: true,
    credits: user.credits,
    name: user.name,
    picture: user.picture,
  });
});

// ── Upload → R2 → job ─────────────────────────────────────────────────────────

// ── Rate limit (free tier) ───────────────────────────────────────────────────
// Free users get FREE_LIMIT_PER_24H jobs in any rolling 24 h window. Admins
// are exempt. The cap is intentionally low while we run on a single home GPU
// so wait times stay reasonable for everyone.

const FREE_LIMIT_PER_24H = parseInt(process.env.FREE_LIMIT_PER_24H || '3', 10);

const checkRateLimit = async (email: string): Promise<{ ok: boolean; used: number; limit: number }> => {
  if (isAdminEmail(email)) return { ok: true, used: 0, limit: Infinity as any };
  const used = await countUserJobsSince(email, 24);
  return { ok: used < FREE_LIMIT_PER_24H, used, limit: FREE_LIMIT_PER_24H };
};

app.get('/api/limits', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const lim = await checkRateLimit(email);
  res.json({
    used24h: lim.used,
    limit24h: lim.limit === Infinity ? null : lim.limit,
    isAdmin: isAdminEmail(email),
  });
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!req.file) return res.status(400).json({ error: 'image required' });

  // Enforce free-tier rate limit before paying for R2 upload
  const lim = await checkRateLimit(email);
  if (!lim.ok) {
    return res.status(429).json({
      error: 'rate_limited',
      detail: `Free tier limit reached (${lim.used}/${lim.limit} in last 24 h). Try again later.`,
      used24h: lim.used,
      limit24h: lim.limit,
    });
  }

  try {
    const { url } = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    const job = await createJob({
      userEmail:     email,
      imageUrl:      url,
      name:          req.body.name          || '',
      prompt:        req.body.prompt        || '',
      style:         req.body.style         || 'Realistic',
      polygonBudget:    req.body.polygonBudget || 'Medium (50k-200k)',
      textureRes:       req.body.textureRes    || '1K',
      exportFormat:     req.body.exportFormat  || 'GLB',
      detailLevel:      req.body.detailLevel   || 'Standard',
      doTexture:        req.body.doTexture === 'true' || req.body.doTexture === true,
      octreeResolution: parseInt(req.body.octreeResolution) || 0,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || 0,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || 0,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || 0,
      numChunks:        parseInt(req.body.numChunks)        || 0,
      seed:             parseInt(req.body.seed)             || 0,
    });
    res.json({ job });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  res.json({ jobs: await getJobsByUser(email) });
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await deleteJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/jobs/:id/name', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    await renameJob(req.params.id, name.trim());
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/jobs/:id/cancel', async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await cancelJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Generate ──────────────────────────────────────────────────────────────────

app.post('/api/generate', async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const ok = await deductCredit(email);
  if (!ok) return res.status(402).json({ error: 'Insufficient credits' });
  res.json({ ok: true, status: 'queued' });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/api/mgmt/users', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ users: await listAppUsers() });
});

app.patch('/api/mgmt/users/:id/role', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.body as { role: UserRole };
  const validRoles: UserRole[] = ['free', 'pro', 'admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await setUserRole(req.params.id, role);
  res.json({ ok: true });
});

app.get('/api/admin/jobs', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const filter = req.query.filter as string;
  const jobs = filter === 'pending' ? await listPendingJobs()
    : filter === 'cancelled' ? await listCancelledJobs()
    : await listAllJobs();
  res.json({ jobs });
});

app.patch('/api/admin/jobs/:id/status', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { status, resultUrl } = req.body as { status: string; resultUrl?: string };
  await updateJobStatus(req.params.id as any, status as any, resultUrl);
  res.json({ ok: true });
});

// ── Stats (admin) ────────────────────────────────────────────────────────────
// Aggregate usage data for the admin dashboard. Read-only, single round-trip.

app.get('/api/admin/stats', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { getDb } = require('./db');
    const db = getDb();

    // Totals + status breakdown
    const totals = await db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM genshape3d_jobs
      GROUP BY status
    `);

    // Per-day counts for the last 14 days
    const byDay = await db.query(`
      SELECT
        DATE("createdAt"::timestamptz AT TIME ZONE 'UTC') AS day,
        COUNT(*)::int AS submitted,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
      FROM genshape3d_jobs
      WHERE "createdAt"::timestamptz > NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day DESC
    `);

    // Avg / median / p95 run-time (seconds) over last 30 days
    const timing = await db.query(`
      WITH t AS (
        SELECT EXTRACT(EPOCH FROM ("completedAt"::timestamptz - "startedAt"::timestamptz)) AS run_s,
               "doTexture" AS tex,
               "inferenceSteps" AS steps
        FROM genshape3d_jobs
        WHERE status = 'done'
          AND "completedAt" IS NOT NULL
          AND "startedAt" IS NOT NULL
          AND "completedAt" > NOW() - INTERVAL '30 days'
      )
      SELECT
        COUNT(*)::int AS n,
        ROUND(AVG(run_s))::int AS avg_s,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY run_s))::int AS p50_s,
        ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY run_s))::int AS p95_s,
        tex,
        CASE WHEN steps > 10 THEN 'high' ELSE 'standard' END AS quality
      FROM t
      GROUP BY tex, quality
      ORDER BY quality, tex
    `);

    // Users + signups
    const users = await db.query(`
      SELECT
        COUNT(*)::int AS total_users,
        SUM(CASE WHEN "createdAt"::timestamptz > NOW() - INTERVAL '7 days'  THEN 1 ELSE 0 END)::int AS new_7d,
        SUM(CASE WHEN "createdAt"::timestamptz > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int AS new_24h
      FROM genshape3d_users
    `);

    // Active users (submitted at least one job in last 7 / 24h)
    const active = await db.query(`
      SELECT
        COUNT(DISTINCT "userEmail") FILTER (WHERE "createdAt"::timestamptz > NOW() - INTERVAL '7 days')::int  AS active_7d,
        COUNT(DISTINCT "userEmail") FILTER (WHERE "createdAt"::timestamptz > NOW() - INTERVAL '24 hours')::int AS active_24h
      FROM genshape3d_jobs
    `);

    // Current queue depth (jobs not yet finished)
    const queue = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int    AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
      FROM genshape3d_jobs
    `);

    // Recent generations — who, when, what (last 30 days, up to 500 rows).
    // Client filters by time range / status / quality; we send everything once.
    const recent = await db.query(`
      SELECT
        id,
        "userEmail"     AS email,
        status,
        "createdAt"     AS submitted_at,
        "startedAt"     AS started_at,
        "completedAt"   AS completed_at,
        "inferenceSteps" AS steps,
        "octreeResolution" AS octree,
        "doTexture"     AS tex
      FROM genshape3d_jobs
      WHERE "createdAt"::timestamptz > NOW() - INTERVAL '30 days'
      ORDER BY "createdAt" DESC
      LIMIT 500
    `);

    res.json({
      generatedAt: new Date().toISOString(),
      byStatus: totals.rows,
      byDay: byDay.rows,
      timing: timing.rows,
      users: users.rows[0],
      active: active.rows[0],
      queue: queue.rows[0],
      recent: recent.rows,
    });
  } catch (e: any) {
    console.error('[admin/stats]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initDb().then(() => {
  app.listen(port, () => console.log(`GenShape3D API listening on http://localhost:${port}`));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
