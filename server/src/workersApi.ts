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
  // Returns the in-memory registry — gives the user real-time visibility
  // into "which machines are alive and what they're doing right now."
  app.get('/api/workers', async (req, res) => {
    const email = (req.query.email as string) || '';
    if (!email || !(await isAdmin(email))) {
      return res.status(403).json({ error: 'admin only' });
    }
    res.json({
      generatedAt: new Date().toISOString(),
      workers: listWorkers().map(workerToJson),
    });
  });
}
