import { getDb } from './db';
import { randomUUID } from 'node:crypto';

export interface Job {
  id: string;
  userEmail: string;
  imageUrl: string;
  name: string;
  prompt: string;
  style: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';
  resultUrl: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  polygonBudget: string;
  textureRes: string;
  exportFormat: string;
  detailLevel: string;
  doTexture: boolean;
  useMultiView: boolean;
  auxImageUrls?: string[];
  progressPct: number;
  progressPhase: string;
  progressStep: number;
  progressTotal: number;
  requestCancel: boolean;
  octreeResolution: number;
  targetFaceCount: number;
  inferenceSteps: number;
  guidanceScale: number;
  numChunks: number;
  seed: number;
  model: string;
  assignedWorkerId: string;
  preferredWorkerId: string;
  groupId: string | null;
}

// Count how many jobs a user has submitted in the last `hours`. Used by
// /api/upload to enforce the free-tier rate limit. Counts every status
// (pending, processing, done, failed, cancelled) so retry-storms still hit
// the cap — people don't get to spam by cancelling.
export async function countUserJobsSince(email: string, hours: number): Promise<number> {
  const r = await getDb().query(
    `SELECT COUNT(*)::int AS n
     FROM genshape3d_jobs
     WHERE "userEmail" = $1
       AND "createdAt"::timestamptz > NOW() - ($2 || ' hours')::INTERVAL`,
    [email, String(hours)],
  );
  return r.rows[0]?.n ?? 0;
}

// Soft-delete: marks the row hidden but never drops it. GPU time is
// expensive — hard deletion is never allowed at this layer.
export async function deleteJob(id: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET deleted = true, "updatedAt" = $1 WHERE id = $2`,
    [new Date().toISOString(), id],
  );
}

export async function renameJob(id: string, name: string): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET name=$1, "updatedAt"=$2 WHERE id=$3`,
    [name, new Date().toISOString(), id]
  );
}

export async function cancelJob(id: string): Promise<void> {
  // Pending jobs are cancelled immediately (worker hasn't touched them yet).
  // Processing jobs get requestCancel=true so the worker shuts down cleanly.
  await getDb().query(
    `UPDATE genshape3d_jobs
     SET "requestCancel" = true,
         status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
         "updatedAt" = $1
     WHERE id = $2`,
    [new Date().toISOString(), id]
  );
}

export async function createJob(data: {
  userEmail: string;
  imageUrl: string;
  name?: string;
  prompt?: string;
  style?: string;
  polygonBudget?: string;
  textureRes?: string;
  exportFormat?: string;
  detailLevel?: string;
  doTexture?: boolean;
  octreeResolution?: number;
  targetFaceCount?: number;
  inferenceSteps?: number;
  guidanceScale?: number;
  numChunks?: number;
  seed?: number;
  model?: string;
  preferredWorkerId?: string;
  /** Optional jsonb array of additional view URLs (side/back/three_q).
   *  Worker downloads them and feeds them to Hunyuan3D-2-mv for multi-
   *  view conditioning. Empty list = single-view path. */
  auxImageUrls?: string[];
  /** When true, the worker generates aux views with Zero123++ locally
   *  before the 3D step (if the subject is upright). When false, the
   *  worker skips auto-mv even if it otherwise would. */
  useMultiView?: boolean;
  /** Asset group this job belongs to (null = ungrouped). Used to organize
   *  stylistically-related batches like spaceship fleets / chess sets. */
  groupId?: string | null;
  /** When true the job is a benchmark job and must not appear in the
   *  normal user job list. */
  isBenchmark?: boolean;
}): Promise<Job> {
  const now = new Date().toISOString();
  const { rows } = await getDb().query(
    `INSERT INTO genshape3d_jobs
      (id, "userEmail", "imageUrl", name, prompt, style, status, "resultUrl", "createdAt", "updatedAt",
       "polygonBudget", "textureRes", "exportFormat", "detailLevel", "doTexture",
       "octreeResolution", "targetFaceCount", "inferenceSteps", "guidanceScale", "numChunks", seed,
       model, "preferredWorkerId", "auxImageUrls", "useMultiView", "groupId", "isBenchmark")
     VALUES ($1,$2,$3,$4,$5,$6,'pending','',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25) RETURNING *`,
    [
      randomUUID(), data.userEmail, data.imageUrl,
      data.name || '',
      data.prompt || '', data.style || 'Realistic', now, now,
      data.polygonBudget || 'Medium (50k-200k)',
      data.textureRes    || '1K',
      data.exportFormat  || 'GLB',
      data.detailLevel   || 'Standard',
      data.doTexture     ?? false,
      data.octreeResolution ?? 0,
      data.targetFaceCount  ?? 0,
      data.inferenceSteps   ?? 0,
      data.guidanceScale    ?? 0,
      data.numChunks        ?? 0,
      data.seed             ?? 0,
      data.model            || 'hunyuan3d',
      data.preferredWorkerId || routeWorker(data.model || 'hunyuan3d'),
      JSON.stringify(data.auxImageUrls || []),
      data.useMultiView ?? false,
      data.groupId       ?? null,
      data.isBenchmark   ?? false,
    ]
  );
  return rows[0];
}

/**
 * SERVER decides which worker runs which job. No racing. No mixing.
 *
 *   hunyuan3d                  -> i7-1080  (dedicated; 8GB GTX 1080)
 *   triposr / sf3d / hi3dgen   -> win-3090 (24GB RTX 3090, only one with those runners)
 *
 * Admin can override per-job via the worker-picker dropdown in the UI
 * (sets `preferredWorkerId` explicitly).
 */
function routeWorker(model: string): string {
  switch (model.toLowerCase()) {
    case 'hunyuan3d':       return 'i7-1080';
    case 'hunyuan3d-2-1':   return 'win-3090';  // PBR paint pipeline only built on the 3090
    case 'triposr':
    case 'sf3d':
    case 'hi3dgen':         return 'win-3090';
    default:                return 'i7-1080';
  }
}

export async function getJobsByUser(userEmail: string): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs
     WHERE "userEmail"=$1 AND deleted = false AND "isBenchmark" = false AND archived = false
     ORDER BY "createdAt" DESC`,
    [userEmail]
  );
  return rows;
}

export async function archiveJob(id: string): Promise<void> {
  await getDb().query(`UPDATE genshape3d_jobs SET archived = true, "updatedAt" = NOW() WHERE id = $1`, [id]);
}

export async function unarchiveJob(id: string): Promise<void> {
  await getDb().query(`UPDATE genshape3d_jobs SET archived = false, "updatedAt" = NOW() WHERE id = $1`, [id]);
}

export async function archiveAllJobs(userEmail: string): Promise<number> {
  const r = await getDb().query(
    `UPDATE genshape3d_jobs SET archived = true, "updatedAt" = NOW()
     WHERE "userEmail" = $1 AND deleted = false AND "isBenchmark" = false AND archived = false`,
    [userEmail],
  );
  return r.rowCount ?? 0;
}

export async function listArchivedJobs(userEmail: string): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs
     WHERE "userEmail" = $1 AND deleted = false AND "isBenchmark" = false AND archived = true
     ORDER BY "createdAt" DESC`,
    [userEmail],
  );
  return rows;
}

export async function getJobById(id: string): Promise<Job | null> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs WHERE id = $1 AND deleted = false LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listAllJobs(): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs WHERE deleted = false AND "isBenchmark" = false ORDER BY "createdAt" DESC`
  );
  return rows;
}

export async function listPendingJobs(): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs
     WHERE status='pending' AND deleted = false AND "isBenchmark" = false
     ORDER BY "createdAt" ASC`
  );
  return rows;
}

export async function listCancelledJobs(): Promise<Job[]> {
  const { rows } = await getDb().query(
    `SELECT * FROM genshape3d_jobs
     WHERE status='cancelled' AND deleted = false AND "isBenchmark" = false
     ORDER BY "completedAt" DESC`
  );
  return rows;
}

export async function updateJobStatus(id: string, status: Job['status'], resultUrl = ''): Promise<void> {
  await getDb().query(
    `UPDATE genshape3d_jobs SET status=$1, "resultUrl"=$2, "updatedAt"=$3 WHERE id=$4`,
    [status, resultUrl, new Date().toISOString(), id]
  );
}

// ── Worker-facing helpers ────────────────────────────────────────────────────
// These power /api/workers/* — the new HTTP control plane. Workers no longer
// poll Postgres directly; they call /claim and the server makes the routing
// decision based on which models the worker declared at registration.

// Atomically claim the oldest pending job whose model is in `models`. Uses
// FOR UPDATE SKIP LOCKED so concurrent workers never race on the same row.
// Returns null if no eligible job is currently pending.
export async function claimNextPendingJob(workerId: string, models: string[]): Promise<Job | null> {
  if (models.length === 0) return null;
  const now = new Date().toISOString();
  // Prefer jobs pinned to this worker first, then any unpinned job.
  // Jobs pinned to a *different* worker are never claimed here.
  const { rows } = await getDb().query(
    `UPDATE genshape3d_jobs SET
       status = 'processing',
       "assignedWorkerId" = $1,
       "startedAt" = NOW(),
       "updatedAt" = $2
     WHERE id = (
       SELECT id FROM genshape3d_jobs
       WHERE status = 'pending'
         AND deleted = false
         AND model = ANY($3::text[])
         AND ("preferredWorkerId" = '' OR "preferredWorkerId" = $1)
       ORDER BY
         CASE WHEN "preferredWorkerId" = $1 THEN 0 ELSE 1 END,
         "createdAt" ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [workerId, now, models],
  );
  return rows[0] ?? null;
}

// Mark a job done/failed/cancelled — but ONLY if the calling worker owns it.
// Returns false (and changes nothing) if the worker doesn't match — protects
// against a buggy or malicious worker mutating a job assigned elsewhere.
export async function completeJobByWorker(
  id: string,
  workerId: string,
  status: 'done' | 'failed' | 'cancelled',
  resultUrl = '',
): Promise<boolean> {
  const now = new Date().toISOString();
  const r = await getDb().query(
    `UPDATE genshape3d_jobs
     SET status = $1,
         "resultUrl" = $2,
         "completedAt" = NOW(),
         "updatedAt" = $3
     WHERE id = $4 AND "assignedWorkerId" = $5`,
    [status, resultUrl, now, id, workerId],
  );
  return (r.rowCount ?? 0) > 0;
}

// Push progress from a worker. Same ownership guard as complete.
export async function updateJobProgressByWorker(
  id: string,
  workerId: string,
  progress: { pct?: number; phase?: string; step?: number; total?: number },
): Promise<boolean> {
  const r = await getDb().query(
    `UPDATE genshape3d_jobs
     SET "progressPct"   = COALESCE($1, "progressPct"),
         "progressPhase" = COALESCE($2, "progressPhase"),
         "progressStep"  = COALESCE($3, "progressStep"),
         "progressTotal" = COALESCE($4, "progressTotal"),
         "updatedAt"     = $5
     WHERE id = $6 AND "assignedWorkerId" = $7`,
    [
      progress.pct   ?? null,
      progress.phase ?? null,
      progress.step  ?? null,
      progress.total ?? null,
      new Date().toISOString(),
      id,
      workerId,
    ],
  );
  return (r.rowCount ?? 0) > 0;
}

// Look up which of the given jobIds have been flagged for cancellation.
// Workers call this on heartbeat so they can stop the in-flight subprocess
// without each one needing direct DB access.
export async function getCancelRequests(jobIds: string[]): Promise<string[]> {
  if (jobIds.length === 0) return [];
  const { rows } = await getDb().query(
    `SELECT id FROM genshape3d_jobs WHERE id = ANY($1::text[]) AND "requestCancel" = true`,
    [jobIds],
  );
  return rows.map(r => r.id);
}
