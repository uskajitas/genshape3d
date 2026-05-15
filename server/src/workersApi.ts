// ─────────────────────────────────────────────────────────────────────────────
// Workers API — HTTP control plane for the multi-worker system.
//
// Workers no longer poll Postgres directly. The flow is:
//   1. POST /api/workers/register    — declare {id, models, capacity}
//   2. POST /api/workers/:id/claim   — long-poll for a matching pending job
//   3. POST /api/workers/:id/progress — optional progress pings during work
//   4. POST /api/workers/:id/complete — final status (done/failed/cancelled)
//   5. POST /api/workers/:id/heartbeat — idle keep-alive + cancel-flag lookup
//
// Auth: every /api/workers/* call must carry `Authorization: Bearer <token>`
// matching WORKER_AUTH_TOKEN. /api/workers (admin GET) uses email-based
// admin auth instead so the dashboard can read it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response, NextFunction } from 'express';
import {
  registerWorker,
  getWorker,
  listWorkers,
  touchWorker,
  markBusy,
  markFree,
  workerToJson,
} from './workerRegistry';
import {
  claimNextPendingJob,
  completeJobByWorker,
  updateJobProgressByWorker,
  getCancelRequests,
} from './jobsRepo';
import { isAdmin } from './usersRepo';
import { getDb } from './db';

// Short-poll: check the DB once and return immediately. Cloudflare tunnels
// drop idle POST connections well before even a 10s hold, so long-polling
// is not viable. Workers sleep client-side between calls instead.

// Bearer-token middleware. Returns 401 if WORKER_AUTH_TOKEN is unset on the
// server (fail closed) or if the header doesn't match.
function workerAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.WORKER_AUTH_TOKEN;
  if (!expected) {
    res.status(401).json({ error: 'WORKER_AUTH_TOKEN not configured on server' });
    return;
  }
  const header = req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    res.status(401).json({ error: 'invalid worker token' });
    return;
  }
  next();
}

export function mountWorkersApi(app: Express): void {
  // ── Registration ─────────────────────────────────────────────────────────
  app.post('/api/workers/register', workerAuth, (req, res) => {
    const { id, models, capacity } = req.body as {
      id?: string;
      models?: unknown;
      capacity?: number;
    };
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id required' });
    }
    if (!Array.isArray(models) || models.some(m => typeof m !== 'string')) {
      return res.status(400).json({ error: 'models must be string[]' });
    }
    if (models.length === 0) {
      return res.status(400).json({ error: 'models must be non-empty' });
    }
    const cap = typeof capacity === 'number' && capacity > 0 ? Math.floor(capacity) : 1;
    const state = registerWorker({ id, models: models as string[], capacity: cap });
    res.json({ ok: true, worker: workerToJson(state) });
  });

  // ── Short-poll claim ─────────────────────────────────────────────────────
  // Single DB check, immediate response. Worker sleeps client-side.
  app.post('/api/workers/:id/claim', workerAuth, async (req, res) => {
    const id = req.params.id;
    const w = getWorker(id);
    if (!w) return res.status(404).json({ error: 'worker not registered' });
    if (w.busy >= w.capacity) {
      return res.status(409).json({ error: 'worker at capacity', busy: w.busy, capacity: w.capacity });
    }

    touchWorker(id);

    try {
      const job = await claimNextPendingJob(id, w.models);
      if (job) {
        markBusy(id, job.id);
        return res.json({ job });
      }
    } catch (e: any) {
      console.error('[workers] claim error', id, e?.message || e);
      return res.status(500).json({ error: 'claim failed', detail: e?.message });
    }
    res.status(204).end();
  });

  // ── Progress ─────────────────────────────────────────────────────────────
  app.post('/api/workers/:id/progress', workerAuth, async (req, res) => {
    const id = req.params.id;
    const w = getWorker(id);
    if (!w) return res.status(404).json({ error: 'worker not registered' });
    touchWorker(id);

    const { jobId, pct, phase, step, total } = req.body as {
      jobId?: string;
      pct?: number;
      phase?: string;
      step?: number;
      total?: number;
    };
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    try {
      const ok = await updateJobProgressByWorker(jobId, id, { pct, phase, step, total });
      if (!ok) return res.status(404).json({ error: 'job not assigned to this worker' });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  // ── Complete ─────────────────────────────────────────────────────────────
  app.post('/api/workers/:id/complete', workerAuth, async (req, res) => {
    const id = req.params.id;
    const w = getWorker(id);
    if (!w) return res.status(404).json({ error: 'worker not registered' });
    touchWorker(id);

    const { jobId, status, resultUrl } = req.body as {
      jobId?: string;
      status?: 'done' | 'failed' | 'cancelled';
      resultUrl?: string;
    };
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    if (status !== 'done' && status !== 'failed' && status !== 'cancelled') {
      return res.status(400).json({ error: 'status must be done|failed|cancelled' });
    }

    try {
      const ok = await completeJobByWorker(jobId, id, status, resultUrl || '');
      if (!ok) return res.status(404).json({ error: 'job not assigned to this worker' });
      // Free the slot regardless of terminal status — the worker is done with it.
      markFree(id, jobId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  // ── Heartbeat ────────────────────────────────────────────────────────────
  // Idle workers call this to stay alive in the registry and to discover
  // which of their active jobs have been flagged for cancellation by the
  // user (so they can stop the in-flight subprocess gracefully).
  app.post('/api/workers/:id/heartbeat', workerAuth, async (req, res) => {
    const id = req.params.id;
    const w = getWorker(id);
    if (!w) return res.status(404).json({ error: 'worker not registered' });
    touchWorker(id);

    const { jobIds } = req.body as { jobIds?: string[] };
    let cancelled: string[] = [];
    if (Array.isArray(jobIds) && jobIds.length > 0) {
      try {
        cancelled = await getCancelRequests(jobIds);
      } catch (e: any) {
        return res.status(500).json({ error: e?.message });
      }
    }
    res.json({ ok: true, cancelled });
  });

  // ── Admin: list workers ──────────────────────────────────────────────────
  // Email-gated (matches /api/admin/* style elsewhere in the codebase).
  // Returns the known workers in this setup with live busy counts from
  // Postgres. The in-memory registry is used as a hint; static workers
  // are listed even if they haven't called the HTTP control plane.
  app.get('/api/workers', async (req, res) => {
    const email = (req.query.email as string) || '';
    if (!email || !(await isAdmin(email))) {
      return res.status(403).json({ error: 'admin only' });
    }

    // Static config of workers in this setup. Keep in sync with the
    // routing in jobsRepo.ts -> routeWorker(). Adding a new physical
    // worker box? Add it here AND wire it into routeWorker().
    const KNOWN: Array<{ id: string; models: string[]; capacity: number }> = [
      { id: 'i7-1080', models: ['hunyuan3d'],                                 capacity: 1 },
      { id: 'win-3090', models: ['hunyuan3d', 'hunyuan3d-2-1', 'triposr', 'sf3d', 'hi3dgen'],  capacity: 1 },
    ];

    // Live busy counts + last activity from Postgres.
    const { rows: busyRows } = await getDb().query<{
      assignedWorkerId: string; n: string;
    }>(
      `SELECT "assignedWorkerId", COUNT(*)::text AS n
         FROM genshape3d_jobs
        WHERE status = 'processing'
        GROUP BY "assignedWorkerId"`,
    );
    const busyMap: Record<string, number> = {};
    for (const r of busyRows) busyMap[r.assignedWorkerId] = parseInt(r.n, 10) || 0;

    // Last time each worker claimed or completed a job — best proxy for "online".
    const { rows: activityRows } = await getDb().query<{
      assignedWorkerId: string; lastActivity: string;
    }>(
      `SELECT "assignedWorkerId", MAX("updatedAt")::text AS "lastActivity"
         FROM genshape3d_jobs
        WHERE "assignedWorkerId" != '' AND "assignedWorkerId" IS NOT NULL
        GROUP BY "assignedWorkerId"`,
    );
    const activityMap: Record<string, string> = {};
    for (const r of activityRows) activityMap[r.assignedWorkerId] = r.lastActivity;

    const now = Date.now();
    const workers = KNOWN.map(k => {
      const lastActivity = activityMap[k.id] || null;
      // Online = had activity in the last 5 minutes OR currently busy
      const online = (busyMap[k.id] || 0) > 0 ||
        (lastActivity ? (now - new Date(lastActivity).getTime()) < 5 * 60 * 1000 : false);
      return {
        id:           k.id,
        models:       k.models,
        capacity:     k.capacity,
        busy:         busyMap[k.id] || 0,
        lastActivity,
        online,
      };
    });

    res.json({ generatedAt: new Date().toISOString(), workers });
  });
}
